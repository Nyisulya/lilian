/**
 * ==========================================================================
 * LILIAN MARCUS NYAHENDE — ROYAL CELEBRATION JAVASCRIPT (CELEBRATION.JS)
 * Interactive Stardust Engine, Royal Confetti, Music Player & Live Wishes
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  initStardustEngine();
  initRoyalMusic();
  initReactions();
  initConfettiBurst();
  initGalleryLightbox();
  initWishesBoard();
  initScrollEffects();
});

/* ==========================================================================
   1. GOLDEN STARDUST & SPARKLING PARTICLES ENGINE (CANVAS)
   ========================================================================== */
function initStardustEngine() {
  const canvas = document.getElementById('stardust-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particles = [];
  const particleCount = Math.min(width > 768 ? 75 : 40, 90);

  const colors = [
    'rgba(245, 208, 97, ', // Gold
    'rgba(255, 235, 153, ', // Champagne light gold
    'rgba(212, 159, 43, ',  // Deep gold
    'rgba(52, 211, 153, ',  // Emerald spark
    'rgba(255, 255, 255, '  // Pure diamond white
  ];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.8 + 0.8,
      speedY: -(Math.random() * 0.45 + 0.15),
      speedX: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.85 + 0.15,
      opacitySpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    for (let p of particles) {
      p.y += p.speedY;
      p.x += p.speedX;
      p.opacity += p.opacitySpeed;

      if (p.opacity > 0.95 || p.opacity < 0.1) {
        p.opacitySpeed = -p.opacitySpeed;
      }

      // Recycle off-screen
      if (p.y < -10) {
        p.y = height + 10;
        p.x = Math.random() * width;
      }
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;

      // Draw particle with glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.max(0, Math.min(1, p.opacity)) + ')';
      ctx.shadowBlur = p.size * 3;
      ctx.shadowColor = 'rgba(245, 208, 97, 0.6)';
      ctx.fill();
    }

    requestAnimationFrame(render);
  }

  render();
}

/* ==========================================================================
   2. ROYAL WEDDING MUSIC PLAYER
   ========================================================================== */
let weddingAudio = null;
let isAudioPlaying = false;

function initRoyalMusic() {
  const toggleBtn = document.getElementById('music-toggle-btn');
  if (!toggleBtn) return;

  weddingAudio = new Audio('/music/harusi_song.mp3');
  weddingAudio.loop = true;
  weddingAudio.volume = 0.55;

  weddingAudio.addEventListener('error', () => {
    // Fallback to happy wedding song if first file fails
    weddingAudio.src = '/music/happy_wedding.mp3';
  });

  toggleBtn.addEventListener('click', () => {
    toggleAudio();
  });

  // Optional: First user touch anywhere attempts to play gently
  const startOnInteraction = () => {
    if (!isAudioPlaying) {
      toggleAudio();
    }
    document.removeEventListener('click', startOnInteraction);
  };
  document.addEventListener('click', startOnInteraction, { once: true });
}

function toggleAudio() {
  const toggleBtn = document.getElementById('music-toggle-btn');
  if (!weddingAudio || !toggleBtn) return;

  if (isAudioPlaying) {
    weddingAudio.pause();
    isAudioPlaying = false;
    toggleBtn.classList.remove('music-playing');
    toggleBtn.querySelector('.btn-label').textContent = '🎵 Cheza Muziki';
  } else {
    weddingAudio.play().then(() => {
      isAudioPlaying = true;
      toggleBtn.classList.add('music-playing');
      toggleBtn.querySelector('.btn-label').textContent = '⏸ Tuliza Muziki';
    }).catch(err => {
      console.warn('Autoplay prevented by browser:', err);
    });
  }
}

/* ==========================================================================
   3. CELEBRATION REACTIONS & FLOATING HEARTS
   ========================================================================== */
function initReactions() {
  const reactionBtns = document.querySelectorAll('.btn-reaction');
  reactionBtns.forEach(btn => {
    const type = btn.getAttribute('data-reaction');
    const countEl = btn.querySelector('.reaction-count');
    
    // Initial saved count or random seed
    const defaultCounts = {
      hongera: 428,
      upendo: 892,
      malkia: 654,
      baraka: 730
    };
    
    let count = parseInt(localStorage.getItem(`reaction_${type}`)) || defaultCounts[type] || 500;
    if (countEl) countEl.textContent = count;

    btn.addEventListener('click', (e) => {
      count++;
      localStorage.setItem(`reaction_${type}`, count);
      if (countEl) countEl.textContent = count;

      createFloatingBurst(e.clientX || btn.getBoundingClientRect().left + 40, e.clientY || btn.getBoundingClientRect().top, btn.getAttribute('data-icon') || '❤️');
    });
  });
}

function createFloatingBurst(x, y, icon) {
  for (let i = 0; i < 5; i++) {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = icon;
    heart.style.left = `${x + (Math.random() - 0.5) * 40}px`;
    heart.style.top = `${y}px`;
    heart.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    heart.style.setProperty('--dx2', `${(Math.random() - 0.5) * 180}px`);
    document.body.appendChild(heart);

    setTimeout(() => {
      heart.remove();
    }, 1800);
  }
}

/* ==========================================================================
   4. ROYAL CONFETTI BURST ENGINE
   ========================================================================== */
function initConfettiBurst() {
  const burstBtn = document.getElementById('confetti-burst-btn');
  if (burstBtn) {
    burstBtn.addEventListener('click', () => {
      triggerConfetti();
    });
  }
}

function triggerConfetti() {
  // Simple, pure vanilla confetti burst
  const count = 120;
  const colors = ['#f5d061', '#ffeb99', '#10b981', '#34d399', '#ffffff', '#c89626'];

  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    confetti.style.position = 'fixed';
    confetti.style.width = `${Math.random() * 10 + 6}px`;
    confetti.style.height = `${Math.random() * 14 + 8}px`;
    confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    confetti.style.left = `${Math.random() * 100}vw`;
    confetti.style.top = '-20px';
    confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    confetti.style.pointerEvents = 'none';
    confetti.style.zIndex = '99999';
    confetti.style.boxShadow = '0 0 10px rgba(245, 208, 97, 0.6)';

    const duration = Math.random() * 2.5 + 2;
    const horizontalShift = (Math.random() - 0.5) * 200;

    confetti.animate([
      { transform: `translate(0, 0) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${horizontalShift}px, ${window.innerHeight + 50}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], {
      duration: duration * 1000,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    });

    document.body.appendChild(confetti);

    setTimeout(() => {
      confetti.remove();
    }, duration * 1000);
  }
}

/* ==========================================================================
   5. PHOTO GALLERY LIGHTBOX & FILTERING
   ========================================================================== */
function initGalleryLightbox() {
  const modal = document.getElementById('lightbox-modal');
  const modalImg = document.getElementById('lightbox-img');
  const modalCaption = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');

  if (!modal || !modalImg) return;

  // Click on gallery item
  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      const caption = item.querySelector('.gallery-caption');
      if (img) {
        modalImg.src = img.src;
        if (modalCaption) {
          modalCaption.textContent = caption ? caption.textContent : 'Send-off ya Lilian';
        }
        modal.classList.add('active');
      }
    });
  });

  // Close modal
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });

  // Filter tabs
  const filterBtns = document.querySelectorAll('.btn-filter');
  const galleryItems = document.querySelectorAll('.gallery-item');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');
      galleryItems.forEach(item => {
        const category = item.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
}

/* ==========================================================================
   6. LIVE GUESTBOOK OF WISHES
   ========================================================================== */
async function initWishesBoard() {
  const wishesFeed = document.getElementById('wishes-feed');
  const wishForm = document.getElementById('wish-form');
  if (!wishesFeed) return;

  // Load existing wishes
  await loadWishes();

  if (wishForm) {
    wishForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('wish-name');
      const textInput = document.getElementById('wish-message');
      const submitBtn = wishForm.querySelector('button[type="submit"]');

      const name = nameInput.value.trim();
      const message = textInput.value.trim();

      if (!name || !message) {
        alert('Tafadhali andika jina lako na ujumbe wa pongezi.');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Inatuma...';
      }

      try {
        const res = await fetch('/api/wishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, message })
        });

        if (res.ok) {
          nameInput.value = '';
          textInput.value = '';
          triggerConfetti();
          await loadWishes();
          alert('🎉 Pongezi zako zimechapishwa kikamilifu kwenye ukurasa wa sherehe!');
        } else {
          // Fallback UI insert
          prependWishToUI({ name, message, createdAt: new Date().toISOString() });
          nameInput.value = '';
          textInput.value = '';
          triggerConfetti();
        }
      } catch (err) {
        // Fallback offline UI insert
        prependWishToUI({ name, message, createdAt: new Date().toISOString() });
        nameInput.value = '';
        textInput.value = '';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = '✍️ Chapisha Pongezi Moja kwa Moja';
        }
      }
    });
  }
}

async function loadWishes() {
  const wishesFeed = document.getElementById('wishes-feed');
  if (!wishesFeed) return;

  try {
    const res = await fetch('/api/wishes');
    const wishes = await res.json();
    if (Array.isArray(wishes) && wishes.length > 0) {
      wishesFeed.innerHTML = '';
      wishes.slice(0, 30).forEach(w => {
        prependWishToUI(w);
      });
    } else {
      populateDefaultWishes();
    }
  } catch (err) {
    populateDefaultWishes();
  }
}

function prependWishToUI(wish) {
  const wishesFeed = document.getElementById('wishes-feed');
  if (!wishesFeed) return;

  const item = document.createElement('div');
  item.className = 'wish-item';
  const timeStr = wish.createdAt ? new Date(wish.createdAt).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : 'Sasa hivi';

  item.innerHTML = `
    <div class="wish-header">
      <span class="wish-author">👑 ${escapeHtml(wish.name || 'Mgeni wa Heshima')}</span>
      <span class="wish-time">${timeStr}</span>
    </div>
    <div class="wish-text">${escapeHtml(wish.message || '')}</div>
  `;

  wishesFeed.prepend(item);
}

function populateDefaultWishes() {
  const defaults = [
    { name: 'Dr. Josephat Mgaya', message: 'Hongera sana binti yangu Lilian. Mwenyezi Mungu ailinde na kuibariki ndoa yako iwe na amani na utajiri tele.' },
    { name: 'Beatrice Kavita', message: 'Kazi nzuri ya Mungu! Lilian unastahili furaha hii yote. Tunakupenda sana na usiku huu ni wa baraka tele.' },
    { name: 'Kamati ya Maandalizi', message: 'Tunawakaribisha wageni wote kusherehekea pamoja nasi. Kila mmoja wenu amekuwa nguzo kuu ya kufanikisha tukio hili la kihistoria.' }
  ];
  const wishesFeed = document.getElementById('wishes-feed');
  if (wishesFeed) {
    wishesFeed.innerHTML = '';
    defaults.forEach(d => prependWishToUI(d));
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ==========================================================================
   7. NAVBAR SCROLL & BACK TO TOP BUTTON
   ========================================================================== */
function initScrollEffects() {
  const nav = document.querySelector('.royal-nav');
  const backTopBtn = document.getElementById('back-to-top-btn');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (nav) {
      if (y > 40) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }

    if (backTopBtn) {
      if (y > 400) {
        backTopBtn.classList.add('visible');
      } else {
        backTopBtn.classList.remove('visible');
      }
    }
  });

  if (backTopBtn) {
    backTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
