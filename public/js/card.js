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
  if (window.__INITIAL_GUEST__) {
    currentGuest = window.__INITIAL_GUEST__;
    currentEvent = window.__INITIAL_EVENT__;
    renderRoyalCard({ guest: currentGuest, event: currentEvent });
    setupMusicPlayer();
    return;
  }
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

// Render Royal Card (Official High-Resolution Masterpiece Image)
function renderRoyalCard(data) {
  const { event, guest } = data;
  if (!guest) return;
  const brideName = event?.brideName || 'Lilian';

  // 1. Page Title & Envelope Info
  document.title = `👑 Kadi Rasmi ya Mwaliko: Send-off ya ${brideName} - ${guest.name}`;

  const envNames = document.getElementById('envelope-couple-names');
  if (envNames) envNames.textContent = `Send-off ya ${brideName}`;

  const envGuest = document.getElementById('envelope-guest-name');
  if (envGuest) envGuest.textContent = guest.name;

  // 2. Official High-Resolution Card Image (Matches pristine local card exactly)
  const officialCardImg = document.getElementById('official-card-img');
  if (officialCardImg) {
    officialCardImg.src = `/api/card/image/${encodeURIComponent(guest.id)}?v=20261013g`;
    officialCardImg.alt = `Kadi Rasmi ya Mwaliko: Send-off ya ${brideName} - ${guest.name}`;
  }

  // 3. Download Button
  const downloadBtn = document.getElementById('btn-download-card');
  if (downloadBtn) {
    const cleanGuestName = String(guest.name || 'Mualikwa').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBtn.href = `/api/card/image/${encodeURIComponent(guest.id)}?v=20261013g`;
    downloadBtn.download = `Kadi_Sendoff_Lilian_${cleanGuestName}.jpg`;
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

// WhatsApp Share - Shares the ACTUAL CARD IMAGE (photo)
async function shareCardViaWhatsApp() {
  if (!currentGuest || !currentEvent) return;
  const bride = currentEvent.brideName || 'Lilian';
  const guestName = currentGuest.name || 'Mualikwa';
  const guestCode = currentGuest.code || currentGuest.id;
  const seatCount = Number(currentGuest.seats) || 1;
  const seatLabel = seatCount === 2 ? 'Double (Watu 2)' : (seatCount === 1 ? 'Single (Mtu 1)' : `Watu ${seatCount}`);

  const caption = `💍 *KADI YA MWALIKO - SEND-OFF YA ${bride.toUpperCase()}*\n\n` +
    `Habari Ndugu *${guestName}*,\n\n` +
    `Ukifika ukumbini mlangoni, utaonyesha kadi hii au utataja namba yako maalum ya mwaliko: *${guestCode}*.\n\n` +
    `📍 *Mahali Ukumbi Ulipo (Location):*\n` +
    `Bragging Social Hall, Goba, Dar es Salaam\n` +
    `👉 https://maps.google.com/?q=Bragging+Social+Hall+Goba+Dar+es+Salaam\n\n` +
    `✍️ *Tafadhali bofya link hii kuthibitisha uwepo wako:*\n` +
    `👉 https://lilian.nyisu.com/confirm/${guestCode}\n\n` +
    `📖 Bonyeza link hii kuona hadithi nzuri na picha za ${bride}:\n` +
    `👉 https://lilian.nyisu.com\n\n` +
    `Karibu sana tufurahi na kusherehekea pamoja! ✨🥂`;

  const cardImageUrl = `/images/cards/card_${currentGuest.id}.jpg`;
  const btn = document.querySelector('.btn-whatsapp-share');
  const origBtnContent = btn ? btn.innerHTML : '';

  try {
    if (btn) btn.innerHTML = '<span>⏳</span><span>Inatayarisha Picha...</span>';

    const response = await fetch(cardImageUrl);
    if (!response.ok) throw new Error('Haikupatikana');
    const blob = await response.blob();
    const cleanGuestName = String(guestName).replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `Kadi_Sendoff_${bride}_${cleanGuestName}.jpg`;
    const file = new File([blob], fileName, { type: 'image/jpeg' });

    // 1. Mobile Web Share API: Natively attaches the real image file to WhatsApp!
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: `Kadi ya ${guestName}`,
        text: caption,
        files: [file]
      });
      if (btn) btn.innerHTML = '<span>✅</span><span>Imetumwa!</span>';
      setTimeout(() => { if (btn) btn.innerHTML = origBtnContent; }, 3000);
      return;
    }

    // 2. Desktop Fallback: Copy Image + Auto-Download + Open WhatsApp
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);

    try {
      const pngBlob = await convertCardToPngBlob(blob);
      if (pngBlob && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      }
    } catch (e) {
      console.warn('Clipboard write fallback:', e);
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(caption + '\n\n(Picha ya kadi imepakuliwa na kunakiliwa. Bonyeza Ctrl+V kupaste)')}`;
    window.open(waUrl, '_blank');

    alert(`📥 Picha ya kadi yako imepakuliwa na kunakiliwa!\n\nKwenye WhatsApp, bonyeza Ctrl+V kupaste picha ya kadi.`);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Share error:', err);
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(caption)}`, '_blank');
    }
  } finally {
    if (btn) btn.innerHTML = origBtnContent;
  }
}

function convertCardToPngBlob(jpgBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(jpgBlob);
  });
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
