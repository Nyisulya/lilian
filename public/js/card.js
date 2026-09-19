/* ================================================================
   NYAHENDE SMART DIGITAL INVITATION CARD LOGIC (CARD.JS)
   ================================================================ */

let currentGuest = null;
let currentEvent = null;
let audioPlayer = null;
let isAudioPlaying = false;

// Determine Guest ID from URL path (e.g., /invite/1) or query param (?id=1)
function getGuestIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  const lastPart = pathParts[pathParts.length - 1];
  if (lastPart && lastPart.toLowerCase() !== 'invite.html' && lastPart.toLowerCase() !== 'invite') {
    return decodeURIComponent(lastPart);
  }
  const params = new URLSearchParams(window.location.search);
  return params.get('id') || '1'; // Default demo guest
}

document.addEventListener('DOMContentLoaded', async () => {
  const guestId = getGuestIdFromUrl();
  await loadGuestCard(guestId);
  setupMusicPlayer();
  setupWishesForm();
});

// Load Guest & Event Data
async function loadGuestCard(guestId) {
  try {
    const res = await fetch(`/api/guests/${encodeURIComponent(guestId)}`);
    if (!res.ok) {
      document.getElementById('card-viewport').innerHTML = `
        <div class="glass-card text-center" style="margin-top: 50px;">
          <h2 class="font-serif gold-text">Mualikwa Hakupatikana</h2>
          <p style="margin: 15px 0;">Msimbo wa kadi <strong>${guestId}</strong> haukutambuliwa kwenye mfumo.</p>
          <a href="/" class="btn btn-gold btn-sm">Rudi Mwanzo</a>
        </div>
      `;
      return;
    }

    const data = await res.json();
    currentGuest = data.guest;
    currentEvent = data.event;

    renderCardHeader(data);
    renderGuestDetails(data);
    renderCountdown(data.event.weddingDate, data.event.weddingTime);
    renderQRPass(data.guest);
    renderEventDetails(data);
    renderTimeline(data.timeline);
    renderWishes();
  } catch (err) {
    console.error('Error loading card:', err);
  }
}

// Render Couple & Header
function renderCardHeader(data) {
  const { event, guest } = data;
  document.title = `Kadi ya Mwaliko: Harusi ya ${event.groomName} & ${event.brideName} - ${guest.name}`;

  // Monogram letters
  const gLetter = (event.groomName || 'K')[0];
  const bLetter = (event.brideName || 'L')[0];
  const monoEl = document.getElementById('monogram-letters');
  if (monoEl) monoEl.textContent = `${gLetter}&${bLetter}`;

  // Names
  const coupleEl = document.getElementById('couple-names-display');
  if (coupleEl) {
    coupleEl.innerHTML = `${event.groomName} <span class="couple-ampersand">&</span> ${event.brideName}`;
  }

  const envelopeCouple = document.getElementById('envelope-couple-names');
  if (envelopeCouple) {
    envelopeCouple.textContent = `${event.groomName} & ${event.brideName}`;
  }

  const fullNamesEl = document.getElementById('couple-fullnames');
  if (fullNamesEl) {
    fullNamesEl.textContent = `${event.groomFullName} & ${event.brideFullName}`;
  }
}

// Render Guest Honor Box
function renderGuestDetails(data) {
  const { guest, table } = data;
  
  const nameEl = document.getElementById('guest-honor-name');
  if (nameEl) nameEl.textContent = guest.name;

  const envGuestName = document.getElementById('envelope-guest-name');
  if (envGuestName) envGuestName.textContent = guest.name;

  const tableEl = document.getElementById('guest-table-badge');
  if (tableEl) tableEl.textContent = `📍 ${table.name || 'Meza Imepangwa'}`;

  const seatsEl = document.getElementById('guest-seats-badge');
  if (seatsEl) {
    const seatType = Number(guest.seats) === 2 ? 'Double (Wewe & Mwenza)' : (Number(guest.seats) === 1 ? 'Single (Mtu 1)' : `Watu ${guest.seats}`);
    seatsEl.textContent = `🎟️ Mwaliko: ${seatType}`;
  }

  const codeEl = document.getElementById('guest-code-badge');
  if (codeEl) codeEl.textContent = `Namba #${guest.id} • Kodi: ${guest.code || '4829'}`;
}

// Render Live Countdown
function renderCountdown(dateStr, timeStr) {
  const weddingDateTime = new Date(`${dateStr}T${timeStr || '18:00:00'}`).getTime();

  function update() {
    const now = new Date().getTime();
    const distance = weddingDateTime - now;

    if (distance < 0) {
      document.getElementById('countdown-title').textContent = '🎉 LEO NI SIKU YA HARUSI YETU! KARIBUNI SANA!';
      document.getElementById('cd-days').textContent = '00';
      document.getElementById('cd-hours').textContent = '00';
      document.getElementById('cd-mins').textContent = '00';
      document.getElementById('cd-secs').textContent = '00';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(minutes).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(seconds).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// Render QR Gate Pass
function renderQRPass(guest) {
  const qrImg = document.getElementById('qr-pass-img');
  if (qrImg) {
    qrImg.src = `/api/qr/${guest.id}`;
    qrImg.alt = `QR Pass ya ${guest.name}`;
  }

  const codeEl = document.getElementById('qr-pass-code');
  if (codeEl) codeEl.innerHTML = `<span style="color: var(--gold-light); font-weight: 700;">KODI YA MLANGONI: ${guest.code || '4829'}</span> (Namba #${guest.id})`;
}

// Render Church, Reception & Map Info
function renderEventDetails(data) {
  const { event } = data;

  const dateDisplay = new Date(event.weddingDate).toLocaleDateString('sw-TZ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const dateEl = document.getElementById('wedding-date-display');
  if (dateEl) dateEl.textContent = dateDisplay;

  const churchEl = document.getElementById('church-venue-display');
  if (churchEl) churchEl.textContent = `${event.churchVenue} (${event.churchTime})`;

  const receptionEl = document.getElementById('reception-venue-display');
  if (receptionEl) receptionEl.textContent = `${event.receptionVenue} (${event.receptionTime})`;

  const dressEl = document.getElementById('dress-code-display');
  if (dressEl) dressEl.textContent = event.dressCode;

  // Google Maps buttons
  const mapBtn = document.getElementById('google-map-btn');
  if (mapBtn) mapBtn.href = event.googleMapsUrl;

  const mapEmbed = document.getElementById('map-embed-iframe');
  if (mapEmbed && event.googleMapsEmbed) {
    mapEmbed.src = event.googleMapsEmbed;
  }

  // Media buttons
  const liveBtn = document.getElementById('youtube-live-btn');
  if (liveBtn) liveBtn.href = event.youtubeLiveUrl || '#';

  const galleryBtn = document.getElementById('picture-gallery-btn');
  if (galleryBtn) galleryBtn.href = event.pictureGalleryUrl || '#';
}

// Render Timetable (Ratiba)
function renderTimeline(timeline) {
  const container = document.getElementById('timeline-container');
  if (!container || !timeline) return;

  container.innerHTML = timeline.map(item => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-time">${item.time}</div>
      <div class="timeline-title">${item.icon || '✨'} ${item.title}</div>
      <div class="timeline-venue">${item.venue}</div>
    </div>
  `).join('');
}

// Render Wishes Guestbook
async function renderWishes() {
  const listEl = document.getElementById('wishes-list');
  if (!listEl) return;

  try {
    const res = await fetch('/api/wishes');
    const wishes = await res.json();

    if (wishes.length === 0) {
      listEl.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 0.88rem;">Kuwa wa kwanza kuacha ujumbe wa pongezi kwa maharusi!</p>`;
      return;
    }

    listEl.innerHTML = wishes.map(w => `
      <div class="wish-bubble">
        <div class="wish-author">💌 ${escapeHtml(w.guestName)}</div>
        <div class="wish-text">"${escapeHtml(w.message)}"</div>
        <div class="wish-time">${new Date(w.time).toLocaleDateString('sw-TZ')}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading wishes:', err);
  }
}

// Setup Wishes Submission Form
function setupWishesForm() {
  const wishesForm = document.getElementById('wishes-form');
  if (!wishesForm) return;

  wishesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('wishes-input-text');
    const wishesText = inputEl ? inputEl.value.trim() : '';
    if (!wishesText) return;

    const submitBtn = document.getElementById('wishes-submit-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = `Inatuma...`;

    try {
      const res = await fetch('/api/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: currentGuest ? currentGuest.name : 'Mualikwa',
          message: wishesText
        })
      });

      if (res.ok) {
        inputEl.value = '';
        const successMsg = document.getElementById('wishes-success-msg');
        if (successMsg) successMsg.style.display = 'block';
        submitBtn.innerHTML = `✅ Imetumwa!`;
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
          if (successMsg) successMsg.style.display = 'none';
        }, 3000);
        renderWishes();
      } else {
        alert('Kulitokea hitilafu wakati wa kutuma ujumbe.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    } catch (err) {
      console.error(err);
      alert('Hitilafu ya mtandao');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

// Background Music Player
function setupMusicPlayer() {
  const toggleBtn = document.getElementById('music-toggle-btn');
  if (!toggleBtn) return;

  audioPlayer = new Audio();
  // Romantic royalty-free harp/strings wedding music
  audioPlayer.src = 'https://assets.mixkit.co/music/preview/mixkit-romantic-wedding-harp-and-strings-1002.mp3';
  audioPlayer.loop = true;

  toggleBtn.addEventListener('click', () => {
    if (isAudioPlaying) {
      audioPlayer.pause();
      isAudioPlaying = false;
      toggleBtn.classList.remove('playing');
      toggleBtn.innerHTML = '🎵';
      toggleBtn.title = 'Washa Muziki';
    } else {
      audioPlayer.play().then(() => {
        isAudioPlaying = true;
        toggleBtn.classList.add('playing');
        toggleBtn.innerHTML = '🎶';
        toggleBtn.title = 'Zima Muziki';
      }).catch(err => {
        console.log('Audio autoplay prevented:', err);
      });
    }
  });

  // Attempt gentle autoplay on first user interaction with screen
  document.body.addEventListener('click', function autoPlayOnce() {
    if (!isAudioPlaying) {
      audioPlayer.play().then(() => {
        isAudioPlaying = true;
        toggleBtn.classList.add('playing');
        toggleBtn.innerHTML = '🎶';
      }).catch(() => {});
    }
    document.body.removeEventListener('click', autoPlayOnce);
  }, { once: true });
}

function switchCardTab(tabId) {
  // Hide all panels
  document.querySelectorAll('.card-tab-panel').forEach(p => {
    p.classList.remove('active');
  });

  // Deactivate all bottom nav buttons
  document.querySelectorAll('.nav-tab-item').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.tab === tabId) {
      btn.classList.add('active');
    }
  });

  // Activate target panel
  const target = document.getElementById('panel-' + tabId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function setupMusicPlayer() {
  const musicUrl = currentEvent?.musicUrl || '/music/harusi_song.mp3';
  if (!audioPlayer) {
    audioPlayer = new Audio(musicUrl);
    audioPlayer.loop = true;
    audioPlayer.volume = 0.8;
    audioPlayer.preload = 'auto';

    audioPlayer.addEventListener('play', () => {
      isAudioPlaying = true;
      updateCardMusicUI(true);
    });

    audioPlayer.addEventListener('pause', () => {
      isAudioPlaying = false;
      updateCardMusicUI(false);
    });

    audioPlayer.addEventListener('ended', () => {
      isAudioPlaying = false;
      updateCardMusicUI(false);
    });
  }

  const toggleBtn = document.getElementById('music-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCardMusic();
    });
  }

  // Also enable on first interaction if envelope is skipped or already open
  const startOnInteraction = () => {
    if (audioPlayer && !isAudioPlaying) {
      audioPlayer.play().then(() => {
        isAudioPlaying = true;
        updateCardMusicUI(true);
      }).catch(() => {});
    }
  };
  document.addEventListener('click', startOnInteraction, { once: true });
  document.addEventListener('touchstart', startOnInteraction, { once: true });
}

function updateCardMusicUI(playing) {
  const toggleBtn = document.getElementById('music-toggle-btn');
  if (toggleBtn) {
    if (playing) {
      toggleBtn.classList.add('playing');
      toggleBtn.innerHTML = '🎶';
      toggleBtn.title = 'Sitisha Muziki';
    } else {
      toggleBtn.classList.remove('playing');
      toggleBtn.innerHTML = '🎵';
      toggleBtn.title = 'Washa Muziki wa Harusi';
    }
  }
}

function toggleCardMusic() {
  if (!audioPlayer) setupMusicPlayer();
  if (!isAudioPlaying) {
    audioPlayer.play().then(() => {
      isAudioPlaying = true;
      updateCardMusicUI(true);
    }).catch(err => {
      console.warn('Playback error:', err);
    });
  } else {
    audioPlayer.pause();
    isAudioPlaying = false;
    updateCardMusicUI(false);
  }
}

function openEnvelope() {
  const overlay = document.getElementById('envelope-overlay');
  if (overlay) {
    overlay.classList.add('opened');
  }

  // Start playing real wedding music upon opening envelope
  if (!audioPlayer) setupMusicPlayer();
  if (audioPlayer) {
    audioPlayer.play().then(() => {
      isAudioPlaying = true;
      updateCardMusicUI(true);
    }).catch((err) => {
      console.warn('Autoplay error on envelope open:', err);
    });
  }
}

function shareCardViaWhatsApp() {
  if (!currentGuest || !currentEvent) return;
  const currentUrl = window.location.href;
  const groom = currentEvent.groomName || 'James';
  const bride = currentEvent.brideName || 'Lilian';

  const seatType = Number(currentGuest.seats) === 2 ? 'Double (Wewe na Mimi)' : (Number(currentGuest.seats) === 1 ? 'Single' : `Watu ${currentGuest.seats}`);
  const text = `Habari mpenzi wangu,\n\nHii hapa kadi yetu rasmi ya mwaliko wa Send-off ya *${bride} & ${groom}*:\n👉 ${currentUrl}\n\nMwaliko wetu ni wa *${seatType}* na kadi yetu ya QR ya kuingilia mlangoni ipo hapo. Fungua uione! 💍`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function sendRsvpDirectToWhatsApp() {
  if (!currentGuest || !currentEvent) return;
  const groom = currentEvent.groomName || 'James';
  const bride = currentEvent.brideName || 'Lilian';
  const committeePhone = '255742999194'; // Committee number

  const text = `Habari Kamati ya Send-off ya *${bride} & ${groom}*,\n\nMimi *${currentGuest.name}* (Msimbo: *${currentGuest.id}*), nimewasilisha chaguo langu la kinywaji cha usiku wa tafrija (${selectedDrink || 'Chaguo Maalumu'}).\n\nHongereni sana na Mungu awabariki! 🥂`;

  window.open(`https://api.whatsapp.com/send?phone=${committeePhone}&text=${encodeURIComponent(text)}`, '_blank');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

