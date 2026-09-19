/* ================================================================
   LILIAN & KELVIN ROYAL SEND-OFF JAVASCRIPT (WEDDING.JS)
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initCountdown();
  loadWishes();
  setupPinModalEvents();
  setupLookupForm();
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
          ✨ Kuwa wa kwanza kutoa pongezi kwa Bibi Harusi Lilian & Kelvin!
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
// 5. ROMANTIC AMBIENT WEDDING AUDIO SYNTHESIZER
// -------------------------------------------------------------
let audioCtx = null;
let isPlaying = false;
let ambientInterval = null;

function toggleWeddingMusic() {
  const btn = document.getElementById('music-toggle-btn');
  if (!isPlaying) {
    startAmbientChimes();
    isPlaying = true;
    if (btn) {
      btn.classList.add('playing');
      btn.innerHTML = '🎶 Muziki Unacheza (Pause)';
    }
  } else {
    stopAmbientChimes();
    isPlaying = false;
    if (btn) {
      btn.classList.remove('playing');
      btn.innerHTML = '🎵 Muziki wa Harusi';
    }
  }
}

function startAmbientChimes() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const pentatonicNotes = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];
    
    function playChime() {
      if (!audioCtx || audioCtx.state === 'closed') return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      const freq = pentatonicNotes[Math.floor(Math.random() * pentatonicNotes.length)];
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 3.0);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 3.1);
    }

    playChime();
    ambientInterval = setInterval(playChime, 1200);
  } catch (e) {
    console.log('Audio not supported:', e);
  }
}

function stopAmbientChimes() {
  if (ambientInterval) clearInterval(ambientInterval);
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
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
