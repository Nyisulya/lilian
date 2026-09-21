/* ================================================================
   NYAHENDE SMART DIGITAL INVITATION CARD LOGIC (CARD.JS)
   Clean, luxury royal invitation card (matches Image 2)
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
});

// Load Guest & Event Data
async function loadGuestCard(guestId) {
  try {
    const res = await fetch(`/api/guests/${encodeURIComponent(guestId)}`);
    if (!res.ok) {
      document.getElementById('card-viewport').innerHTML = `
        <div class="glass-card text-center" style="margin-top: 50px; padding: 24px;">
          <h2 class="font-serif gold-text">Mualikwa Hakupatikana</h2>
          <p style="margin: 15px 0;">Msimbo wa kadi <strong>${escapeHtml(guestId)}</strong> haukutambuliwa kwenye mfumo.</p>
          <a href="/" class="btn btn-gold btn-sm">Rudi Mwanzo</a>
        </div>
      `;
      return;
    }

    const data = await res.json();
    currentGuest = data.guest;
    currentEvent = data.event;

    renderRoyalCard(data);
  } catch (err) {
    console.error('Error loading card:', err);
  }
}

// Render Royal Card (matching Image 2 layout & user specifications)
function renderRoyalCard(data) {
  const { event, guest, table } = data;
  const brideName = event.brideName || 'Lilian';

  // 1. Page Title & Envelope Info
  document.title = `👑 Kadi Rasmi ya Mwaliko: Send-off ya ${brideName} - ${guest.name}`;

  const envNames = document.getElementById('envelope-couple-names');
  if (envNames) envNames.textContent = `Send-off ya ${brideName}`;

  const envGuest = document.getElementById('envelope-guest-name');
  if (envGuest) envGuest.textContent = guest.name;

  // 2. Card Header
  const titleDisplay = document.getElementById('card-title-display');
  if (titleDisplay) titleDisplay.textContent = `SEND-OFF YA ${brideName.toUpperCase()}`;

  const familyDisplay = document.getElementById('card-family-name');
  if (familyDisplay) {
    const fam = event.familyName || 'FAMILIA YA MZEE MARCUS NYAHENDE';
    familyDisplay.textContent = fam.toUpperCase();
  }

  // 3. Bride Image
  const brideImg = document.getElementById('bride-hero-img');
  if (brideImg && event.bridePhoto) {
    brideImg.src = event.bridePhoto;
    brideImg.alt = `Send-off ya ${brideName}`;
  }

  // 4. Guest Details Box
  const guestNameEl = document.getElementById('guest-honor-name');
  if (guestNameEl) guestNameEl.textContent = guest.name;

  const guestTitleEl = document.getElementById('guest-honor-title');
  if (guestTitleEl) {
    if (guest.title && guest.title.trim() && guest.title !== 'Mualikwa') {
      guestTitleEl.textContent = guest.title;
      guestTitleEl.style.display = 'block';
    } else {
      guestTitleEl.style.display = 'none';
    }
  }

  // 5. Seat Pill: "ondoa viti sijui, weka single au double"
  const seatCount = Number(guest.seats) || 1;
  const seatLabel = seatCount === 2 ? 'MWALIKO: DOUBLE' : (seatCount === 1 ? 'MWALIKO: SINGLE' : `MWALIKO: WATU ${seatCount}`);
  const seatTextEl = document.getElementById('guest-seat-text');
  if (seatTextEl) seatTextEl.textContent = seatLabel;

  // 6. Event Date & Time & Venue (Robust timezone parsing for Jumanne 13 Oktoba 2026)
  let dateFormatted = 'Jumanne, 13 Oktoba 2026';
  if (event.weddingDate) {
    const rawParts = String(event.weddingDate).split('T')[0].split('-');
    let dateObj;
    if (rawParts.length === 3) {
      dateObj = new Date(Number(rawParts[0]), Number(rawParts[1]) - 1, Number(rawParts[2]), 12, 0, 0);
    } else {
      dateObj = new Date(event.weddingDate);
    }
    const days = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
    const months = ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'];
    const dayName = days[dateObj.getDay()] || 'Jumanne';
    const day = dateObj.getDate();
    const monthName = months[dateObj.getMonth()] || 'Oktoba';
    const year = dateObj.getFullYear();
    dateFormatted = `${dayName}, ${day} ${monthName} ${year}`;
  }

  const timeFormatted = event.receptionTime || 'Saa 12:30 Jioni';
  const dtEl = document.getElementById('event-datetime-display');
  if (dtEl) {
    dtEl.innerHTML = `📅 ${dateFormatted} &bull; ⏰ ${timeFormatted}`;
  }

  const venueEl = document.getElementById('event-venue-display');
  if (venueEl) {
    venueEl.textContent = event.receptionVenue || 'Bragging Social Hall, Goba, Dar es Salaam';
  }

  // 8. Dress Code
  const dressCodeEl = document.getElementById('card-dress-code');
  if (dressCodeEl) {
    dressCodeEl.textContent = event.dressCode || event.themeColor || 'Emerald Green & Touch of Gold (Kijani cha Kifalme na Mguso wa Dhahabu)';
  }

  // 9. Security Pass Code & Guest Number
  const codeDigitsEl = document.getElementById('guest-code-digits');
  if (codeDigitsEl) codeDigitsEl.textContent = guest.code || '4829';

  const guestNumEl = document.getElementById('guest-num-tag');
  if (guestNumEl) guestNumEl.textContent = `• Namba ya Mgeni: #${guest.id}`;

  // 10. QR Pass Image & Label
  const qrImg = document.getElementById('qr-pass-img');
  if (qrImg) {
    qrImg.src = `/api/qr/${encodeURIComponent(guest.id)}`;
    qrImg.alt = `QR Pass ya ${guest.name}`;
  }

  const qrPassLabel = document.getElementById('qr-pass-label');
  if (qrPassLabel) {
    qrPassLabel.textContent = `PASS: ${guest.code || '4829'}`;
  }
}

// Background Music Player
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

  const startOnInteraction = () => {
    if (audioPlayer && !isAudioPlaying) {
      audioPlayer.play().then(() => {
        isAudioPlaying = true;
        updateCardMusicUI(true);
      }).catch(() => {});
    }
  };
  // Attempt immediate playback if permitted
  if (!isAudioPlaying) {
    audioPlayer.play().then(() => {
      isAudioPlaying = true;
      updateCardMusicUI(true);
    }).catch(() => {});
  }
  ['click', 'touchstart', 'pointerdown', 'keydown', 'scroll'].forEach(evt => {
    window.addEventListener(evt, startOnInteraction, { once: true, passive: true });
  });
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

  // Start music upon envelope opening
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

// WhatsApp Share
function shareCardViaWhatsApp() {
  if (!currentGuest || !currentEvent) return;
  const currentUrl = window.location.href;
  const bride = currentEvent.brideName || 'Lilian';

  const seatCount = Number(currentGuest.seats) || 1;
  const seatLabel = seatCount === 2 ? 'Double' : (seatCount === 1 ? 'Single' : `Watu ${seatCount}`);
  const text = `Habari mpenzi wangu,\n\nHii hapa kadi yetu rasmi ya mwaliko wa Send-off ya *${bride}*:\n👉 ${currentUrl}\n\nMwaliko wetu ni wa *${seatLabel}* na kadi yetu ya QR ya kuingilia mlangoni ipo hapo. Fungua uione! 💍`;

  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
