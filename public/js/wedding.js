/* ================================================================
   LILIAN & JAMES ROYAL SEND-OFF JAVASCRIPT (WEDDING.JS)
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  loadWishes();
  setupPinModalEvents();
  setupLookupForm();
  initWeddingAudio();
  setupAudioFirstTouch();
  initPhotoGallery();
});

// -------------------------------------------------------------
// 1. LIVE COUNTDOWN TIMER (13 OKTOBA 2026)
// -------------------------------------------------------------
function initCountdown() {
  const targetDate = new Date('2026-10-13T18:00:00').getTime();

  function update() {
    const now = new Date().getTime();
    const diff = targetDate - now;

    if (diff <= 0) {
      document.getElementById('cd-days').textContent = '00';
      document.getElementById('cd-hours').textContent = '00';
      document.getElementById('cd-mins').textContent = '00';
      document.getElementById('cd-secs').textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const dEl = document.getElementById('cd-days');
    const hEl = document.getElementById('cd-hours');
    const mEl = document.getElementById('cd-mins');
    const sEl = document.getElementById('cd-secs');

    if (dEl) dEl.textContent = String(days).padStart(2, '0');
    if (hEl) hEl.textContent = String(hours).padStart(2, '0');
    if (mEl) mEl.textContent = String(mins).padStart(2, '0');
    if (sEl) sEl.textContent = String(secs).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// -------------------------------------------------------------
// 2. VIP COMMITTEE PIN LOCK (PASSWORD: 2030)
// -------------------------------------------------------------
function openKamatiPinModal() {
  const modal = document.getElementById('kamati-pin-modal');
  const input = document.getElementById('kamati-pin-input');
  const err = document.getElementById('pin-error-msg');
  if (err) err.textContent = '';
  if (input) input.value = '';
  if (modal) modal.classList.add('active');
  if (input) setTimeout(() => input.focus(), 200);
}

function closeKamatiPinModal() {
  const modal = document.getElementById('kamati-pin-modal');
  if (modal) modal.classList.remove('active');
}

function appendPinDigit(digit) {
  const input = document.getElementById('kamati-pin-input');
  if (!input) return;
  if (input.value.length < 8) {
    input.value += digit;
    if (input.value.length === 4) {
      verifyKamatiPin();
    }
  }
}

function clearPinDigit() {
  const input = document.getElementById('kamati-pin-input');
  if (input && input.value.length > 0) {
    input.value = input.value.slice(0, -1);
  }
}

function verifyKamatiPin() {
  const input = document.getElementById('kamati-pin-input');
  const err = document.getElementById('pin-error-msg');
  const box = document.getElementById('pin-modal-box');
  const enteredPin = input ? input.value.trim() : '';

  if (enteredPin === '2030') {
    if (err) {
      err.style.color = '#2ecc71';
      err.textContent = '🎉 Nenosiri Sahihi! Inafungua Dashibodi Kuu...';
    }
    sessionStorage.setItem('kamati_auth', '2030');
    setTimeout(() => {
      window.location.href = '/admin';
    }, 450);
  } else {
    if (box) {
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
    }
    if (err) {
      err.style.color = '#e74c3c';
      err.textContent = '❌ Nenosiri sio sahihi. Tafadhali jaribu tena!';
    }
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

function setupPinModalEvents() {
  const input = document.getElementById('kamati-pin-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        verifyKamatiPin();
      }
    });
  }
}

// -------------------------------------------------------------
// 3. GUEST CARD LOOKUP
// -------------------------------------------------------------
function setupLookupForm() {
  const form = document.getElementById('guest-lookup-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = document.getElementById('lookup-query-input')?.value.trim().toLowerCase();
    const statusEl = document.getElementById('lookup-status');
    if (!query) return;

    if (statusEl) statusEl.innerHTML = '<span style="color: var(--gold-light);">Inatafuta kadi yako...</span>';

    try {
      const res = await fetch('/api/guests');
      const guests = await res.json();
      
      const found = guests.find(g => 
        (g.code && g.code.toLowerCase() === query) ||
        (g.phone && g.phone.includes(query)) ||
        (g.name && g.name.toLowerCase().includes(query)) ||
        (String(g.id) === query)
      );

      if (found) {
        if (statusEl) statusEl.innerHTML = `<span style="color: #2ecc71;">✅ Kadi ya <strong>${found.name}</strong> imepatikana! Inafungua...</span>`;
        setTimeout(() => {
          window.location.href = `/invite/${found.id}`;
        }, 600);
      } else {
        if (statusEl) statusEl.innerHTML = '<span style="color: #e74c3c;">❌ Samahani, hatukupata mualikwa kwa taarifa hizo. Tafadhali hakiki jina au namba ya simu.</span>';
      }
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.innerHTML = '<span style="color: #e74c3c;">Hitilafu ya mtandao</span>';
    }
  });
}

// -------------------------------------------------------------
// 4. GUEST WISHES STREAM & SUBMISSION
// -------------------------------------------------------------
async function loadWishes() {
  const stream = document.getElementById('wishes-stream');
  if (!stream) return;

  try {
    const res = await fetch('/api/wishes');
    const wishes = await res.json();

    if (!Array.isArray(wishes) || wishes.length === 0) {
      stream.innerHTML = `
        <div class="wish-bubble" style="text-align: center; color: var(--text-muted);">
          ✨ Kuwa wa kwanza kutoa pongezi kwa Lilian & James!
        </div>
      `;
      return;
    }

    stream.innerHTML = wishes.map(w => `
      <div class="wish-bubble">
        <div class="wish-author">💌 ${escapeHtml(w.name)}</div>
        <div class="wish-text">"${escapeHtml(w.message)}"</div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 6px;">
          ${w.timestamp ? new Date(w.timestamp).toLocaleDateString('sw-TZ', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Hivi Karibuni'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading wishes:', err);
  }
}

async function submitWish(e) {
  e.preventDefault();
  const nameInput = document.getElementById('wish-name-input');
  const msgInput = document.getElementById('wish-msg-input');
  const btn = document.getElementById('wish-submit-btn');

  const name = nameInput ? nameInput.value.trim() : '';
  const message = msgInput ? msgInput.value.trim() : '';
  if (!name || !message) return;

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Inatuma...';

  try {
    const res = await fetch('/api/wishes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, message })
    });

    if (res.ok) {
      nameInput.value = '';
      msgInput.value = '';
      alert('🎉 Ahsante sana! Ujumbe wako wa pongezi umepokelewa na umetumwa kwa Maharusi.');
      loadWishes();
    } else {
      alert('Hitilafu katika kutuma ujumbe');
    }
  } catch (err) {
    console.error(err);
    alert('Hitilafu ya mtandao');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// -------------------------------------------------------------
// 5. REAL WEDDING VOCAL AUDIO PLAYER
// -------------------------------------------------------------
let weddingAudio = null;
let isPlaying = false;
let weddingMusicUrl = '/music/harusi_song.mp3';

function initWeddingAudio() {
  if (!weddingAudio) {
    weddingAudio = new Audio(weddingMusicUrl);
    weddingAudio.loop = true;
    weddingAudio.volume = 0.8;
    weddingAudio.preload = 'auto';

    weddingAudio.addEventListener('play', () => {
      isPlaying = true;
      updateWeddingMusicUI(true);
    });
    weddingAudio.addEventListener('pause', () => {
      isPlaying = false;
      updateWeddingMusicUI(false);
    });
    weddingAudio.addEventListener('ended', () => {
      isPlaying = false;
      updateWeddingMusicUI(false);
    });
  }
}

function updateWeddingMusicUI(playing) {
  const btn = document.getElementById('music-toggle-btn');
  const floatingBtn = document.getElementById('floating-music-btn');
  if (btn) {
    if (playing) {
      btn.classList.add('playing');
      btn.innerHTML = '🎶 Muziki Unaimba (Sitisha)';
    } else {
      btn.classList.remove('playing');
      btn.innerHTML = '🎵 Muziki wa Harusi';
    }
  }
  if (floatingBtn) {
    if (playing) {
      floatingBtn.classList.add('playing');
      floatingBtn.innerHTML = '🎶';
      floatingBtn.title = 'Sitisha Muziki';
    } else {
      floatingBtn.classList.remove('playing');
      floatingBtn.innerHTML = '🎵';
      floatingBtn.title = 'Washa Muziki wa Harusi';
    }
  }
}

function toggleWeddingMusic() {
  initWeddingAudio();
  if (!isPlaying) {
    weddingAudio.play().then(() => {
      isPlaying = true;
      updateWeddingMusicUI(true);
    }).catch(err => {
      console.warn('Audio playback error:', err);
    });
  } else {
    weddingAudio.pause();
    isPlaying = false;
    updateWeddingMusicUI(false);
  }
}

function attemptImmediateAutoplay() {
  initWeddingAudio();
  if (!isPlaying && weddingAudio) {
    weddingAudio.play().then(() => {
      isPlaying = true;
      updateWeddingMusicUI(true);
    }).catch(() => {
      // Browser policy requires user gesture; interaction listeners below handle it
    });
  }
}

function setupAudioFirstTouch() {
  attemptImmediateAutoplay();
  const playOnInteraction = () => {
    initWeddingAudio();
    if (!isPlaying && weddingAudio) {
      weddingAudio.play().then(() => {
        isPlaying = true;
        updateWeddingMusicUI(true);
      }).catch(() => {});
    }
  };
  ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'].forEach(evt => {
    window.addEventListener(evt, playOnInteraction, { once: true, passive: true });
  });
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function copyHexCode(hex, btn) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hex).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ Imenakiliwa!';
      btn.style.color = '#2ecc71';
      btn.style.borderColor = '#2ecc71';
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.style.color = '';
        btn.style.borderColor = '';
      }, 2000);
    }).catch(() => {
      prompt('Kodi ya Rangi (Hex):', hex);
    });
  } else {
    prompt('Kodi ya Rangi (Hex):', hex);
  }
}

// -------------------------------------------------------------
// 7. ROYAL PHOTO GALLERY & INTERACTIVE LIGHTBOX
// -------------------------------------------------------------
let allGalleryPhotos = [];
let filteredGalleryPhotos = [];
let currentCategory = 'all';
let isGalleryExpanded = false;
let currentLightboxIndex = 0;
const INITIAL_GALLERY_LIMIT = 12;

async function initPhotoGallery() {
  const grid = document.getElementById('wedding-gallery-grid');
  if (!grid) return;

  try {
    const res = await fetch('/data/gallery.json');
    if (!res.ok) throw new Error('Failed to load gallery.json');
    allGalleryPhotos = await res.json();
  } catch (err) {
    console.warn('Could not fetch gallery.json, trying /api/gallery fallback:', err);
    try {
      const apiRes = await fetch('/api/gallery');
      const apiData = await apiRes.json();
      allGalleryPhotos = (apiData.images || []).map((img, idx) => ({
        id: idx + 1,
        filename: img.filename,
        src: img.url,
        category: 'couple',
        categoryName: 'Lilian & James',
        title: 'Lilian & James',
        desc: img.role || 'Kumbukumbu ya safari ya mapenzi.',
        featured: idx < 12
      }));
    } catch (e) {
      console.error('Gallery fallback failed:', e);
      return;
    }
  }

  updateCategoryCounts();
  applyGalleryFilter('all');
  setupLightboxKeyboardAndTouch();
}

function updateCategoryCounts() {
  // Counts removed per request - clean tab buttons without numbers
}

function filterGallery(category) {
  currentCategory = category;
  isGalleryExpanded = false;

  document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    if (btn.getAttribute('data-category') === category) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  applyGalleryFilter(category);
}

function applyGalleryFilter(category) {
  if (category === 'all') {
    filteredGalleryPhotos = [...allGalleryPhotos];
  } else {
    filteredGalleryPhotos = allGalleryPhotos.filter(p => p.category === category);
  }

  renderGalleryGrid();
}

function renderGalleryGrid() {
  const grid = document.getElementById('wedding-gallery-grid');
  const toggleBox = document.getElementById('gallery-toggle-box');
  const toggleText = document.getElementById('btn-gallery-text');
  if (!grid) return;

  grid.innerHTML = '';

  const total = filteredGalleryPhotos.length;
  const showAll = isGalleryExpanded || total <= INITIAL_GALLERY_LIMIT;
  const displayPhotos = showAll ? filteredGalleryPhotos : filteredGalleryPhotos.slice(0, INITIAL_GALLERY_LIMIT);

  displayPhotos.forEach((photo, idx) => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${photo.title}: ${photo.desc}`);
    card.onclick = () => openLightbox(idx);
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(idx);
      }
    };

    card.innerHTML = `
      <div class="gallery-card-zoom-icon" title="Kuza Picha">🔍</div>
      <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" loading="lazy" decoding="async">
      <div class="gallery-card-overlay">
        <div class="gallery-card-title">${escapeHtml(photo.title)}</div>
        <div class="gallery-card-desc">${escapeHtml(photo.desc)}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  if (toggleBox && toggleText) {
    if (total <= INITIAL_GALLERY_LIMIT) {
      toggleBox.style.display = 'none';
    } else {
      toggleBox.style.display = 'block';
      if (isGalleryExpanded) {
        toggleText.textContent = 'Onyesha Chache 🔼';
      } else {
        toggleText.textContent = 'Tazama Picha Zote 📸';
      }
    }
  }
}

function toggleGalleryExpand() {
  isGalleryExpanded = !isGalleryExpanded;
  renderGalleryGrid();
  if (!isGalleryExpanded) {
    const galSection = document.getElementById('gallery');
    if (galSection) galSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// Lightbox Controls
function openLightbox(index) {
  if (index < 0 || index >= filteredGalleryPhotos.length) return;
  currentLightboxIndex = index;
  const photo = filteredGalleryPhotos[currentLightboxIndex];
  if (!photo) return;

  const lightbox = document.getElementById('gallery-lightbox');
  const img = document.getElementById('lightbox-img');
  const counter = document.getElementById('lightbox-counter');
  const title = document.getElementById('lightbox-title');
  const desc = document.getElementById('lightbox-desc');

  if (img) img.src = photo.src;
  if (counter) counter.textContent = `Picha ${currentLightboxIndex + 1} kati ya ${filteredGalleryPhotos.length} • ${photo.categoryName || ''}`;
  if (title) title.textContent = photo.title;
  if (desc) desc.textContent = photo.desc;

  if (lightbox) {
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('gallery-lightbox');
  if (lightbox) {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function nextLightboxImage() {
  if (!filteredGalleryPhotos.length) return;
  currentLightboxIndex = (currentLightboxIndex + 1) % filteredGalleryPhotos.length;
  openLightbox(currentLightboxIndex);
}

function prevLightboxImage() {
  if (!filteredGalleryPhotos.length) return;
  currentLightboxIndex = (currentLightboxIndex - 1 + filteredGalleryPhotos.length) % filteredGalleryPhotos.length;
  openLightbox(currentLightboxIndex);
}

function setupLightboxKeyboardAndTouch() {
  window.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox || !lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowRight') nextLightboxImage();
    else if (e.key === 'ArrowLeft') prevLightboxImage();
  });

  const lightbox = document.getElementById('gallery-lightbox');
  if (!lightbox) return;

  let touchStartX = 0;
  let touchEndX = 0;

  lightbox.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  lightbox.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 50) {
      if (diff < 0) nextLightboxImage();
      else prevLightboxImage();
    }
  }, { passive: true });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });
}


