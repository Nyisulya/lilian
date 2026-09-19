/* ================================================================
   SECURITY BODYGUARD & SCANNER LOGIC (SECURITY.JS)
   ================================================================ */

let html5QrCode = null;
let isScannerRunning = false;
let audioCtx = null;
let recentScans = [];

document.addEventListener('DOMContentLoaded', () => {
  initAudio();
  loadGateStats();
  setupManualForm();
  setupCameraScanner();
});

// Initialize Web Audio API for Instant Chimes (No external sound files required)
function initAudio() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  } catch (e) {
    console.log('Web Audio not supported');
  }
}

function playValidSound() {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    // Pleasant dual chime (C5 -> G5)
    const now = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.setValueAtTime(783.99, now + 0.12); // G5

    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.5);
  } catch (e) {
    console.error(e);
  }
}

function playWarningSound() {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Harsh buzzer sound (Sawtooth wave)
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.setValueAtTime(160, now + 0.15);
    osc.frequency.setValueAtTime(110, now + 0.3);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  } catch (e) {
    console.error(e);
  }
}

// -------------------------------------------------------------
// Verification Engine
// -------------------------------------------------------------
async function verifyCode(code) {
  if (!code || !code.trim()) return;

  const resultContainer = document.getElementById('scan-result-container');
  resultContainer.innerHTML = `
    <div class="glass-card" style="text-align: center; padding: 20px;">
      <div style="font-size: 1.2rem; color: var(--gold-light);">Inakagua kadi: <strong>${escapeHtml(code)}</strong>...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    const data = await res.json();
    renderVerificationResult(data);
    await loadGateStats();
  } catch (err) {
    console.error(err);
    resultContainer.innerHTML = `
      <div class="result-card result-invalid">
        <div class="result-status-icon">⚠️</div>
        <div class="result-status-title">Hitilafu ya Seva</div>
        <p>Haikuweza kuunganishwa na mfumo wa ukaguzi.</p>
      </div>
    `;
  }
}

function renderVerificationResult(data) {
  const container = document.getElementById('scan-result-container');
  if (!container) return;

  const nowTime = new Date().toLocaleTimeString('sw-TZ');

  if (data.status === 'valid') {
    playValidSound();
    const g = data.guest;

    container.innerHTML = `
      <div class="result-card result-valid">
        <div class="result-status-icon">✅</div>
        <div class="result-status-title">KADI HALALI • RUHUSU KUINGIA</div>
        <div class="result-guest-name">${escapeHtml(g.name)}</div>
        <div style="font-size: 0.9rem; color: #a7f3d0; margin-bottom: 12px;">${escapeHtml(g.title || 'Mgeni Maalumu')}</div>

        <div class="result-meta-grid">
          <div class="result-meta-item">
            <div class="result-meta-label">Upangaji wa Meza</div>
            <div class="result-meta-val">📍 ${escapeHtml(g.tableName)}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Aina ya Mwaliko</div>
            <div class="result-meta-val">${Number(g.seats) === 2 ? '👥 Double (Watu 2)' : (Number(g.seats) === 1 ? '👤 Single (Mtu 1)' : `👥 Watu ${g.seats}`)}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Msimbo wa Kadi</div>
            <div class="result-meta-val">🔑 Pass: ${g.code || '4829'}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Muda Alioingia</div>
            <div class="result-meta-val">⏱️ ${nowTime}</div>
          </div>
        </div>

        <div style="margin-top: 16px;">
          <button class="btn btn-outline-gold btn-sm" onclick="resetGuestCheckIn('${g.id}')">
            🔄 Rejesha (Futa Check-in)
          </button>
        </div>
      </div>
    `;

    addRecentScan({
      id: g.id,
      name: g.name,
      table: g.tableName,
      time: nowTime,
      status: 'valid'
    });

  } else if (data.status === 'already_used') {
    playWarningSound();
    const g = data.guest || {};
    const originalTime = g.checkInTime ? new Date(g.checkInTime).toLocaleTimeString('sw-TZ') : 'Mapema';

    container.innerHTML = `
      <div class="result-card result-already-used">
        <div class="result-status-icon">🚨</div>
        <div class="result-status-title">TAHADHARI! KADI ILIKWISHATUMIKA!</div>
        <p style="color: #fca5a5; font-weight: 600; margin: 8px 0;">
          Kadi hii tayari ilishakaguliwa saa <strong>${originalTime}</strong>! Inazuia kuingia mara mbili.
        </p>
        <div class="result-guest-name" style="color: #ffffff;">${escapeHtml(g.name || data.code)}</div>
        
        <div class="result-meta-grid">
          <div class="result-meta-item">
            <div class="result-meta-label">Meza</div>
            <div class="result-meta-val">${escapeHtml(g.tableName || '-')}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Kaguzi ya Awali</div>
            <div class="result-meta-val">⚠️ Saa ${originalTime}</div>
          </div>
        </div>

        <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center;">
          <button class="btn btn-outline-gold btn-sm" onclick="resetGuestCheckIn('${g.id || data.code}')">
            Ruhusu Upya (Override)
          </button>
        </div>
      </div>
    `;

    addRecentScan({
      id: g.id || data.code,
      name: g.name || data.code,
      table: 'Kadi Imerudiwa',
      time: nowTime,
      status: 'already_used'
    });

  } else if (data.status === 'multiple_matches') {
    playValidSound();
    const matchesHtml = (data.matches || []).map(m => `
      <div style="background: rgba(0,0,0,0.4); border: 1px solid var(--bg-glass-border); border-radius: 10px; padding: 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
        <div>
          <div style="font-weight: 700; color: #ffffff; font-size: 1rem;">${escapeHtml(m.name)}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Simu: <strong>${escapeHtml(m.phone || '-')}</strong> | 📍 Meza: <strong>${escapeHtml(m.tableName)}</strong> (${Number(m.seats) === 2 ? 'Double' : (Number(m.seats) === 1 ? 'Single' : `${m.seats} Viti`)})
          </div>
        </div>
        <div>
          ${m.checkedIn ? '<span class="badge badge-danger">✓ Alishaingia</span>' : `<button class="btn btn-emerald btn-sm" onclick="verifyCode('${m.id}')">✅ Ingiza Ndani</button>`}
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="result-card" style="border: 2px solid var(--gold-primary); text-align: left;">
        <div class="result-status-title" style="color: var(--gold-light); margin-bottom: 8px;">
          👥 Matokeo ya Utafutaji wa Wageni
        </div>
        <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">${data.message}</p>
        <div>${matchesHtml}</div>
      </div>
    `;

  } else {
    // Invalid
    playWarningSound();
    container.innerHTML = `
      <div class="result-card result-invalid">
        <div class="result-status-icon">❌</div>
        <div class="result-status-title">KADI BATILI / HAIFAI</div>
        <p style="color: #fde68a; margin: 8px 0;">
          Msimbo <strong>${escapeHtml(data.code || code)}</strong> haupatikani kwenye orodha ya waalikwa wa harusi hii.
        </p>
      </div>
    `;

    addRecentScan({
      id: code,
      name: 'Msimbo Batili',
      table: 'Haupo',
      time: nowTime,
      status: 'invalid'
    });
  }
}

// Reset Guest check-in status (Override)
async function resetGuestCheckIn(guestId) {
  if (!confirm(`Unataka kurejesha kadi ya ${guestId} ili iweze kuscan-iwa tena?`)) return;

  try {
    const res = await fetch('/api/verify/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId })
    });
    const result = await res.json();
    alert(result.message || 'Kadi imerejeshwa.');
    document.getElementById('scan-result-container').innerHTML = '';
    loadGateStats();
  } catch (e) {
    console.error(e);
  }
}

// -------------------------------------------------------------
// Gate Statistics & Recent Log
// -------------------------------------------------------------
async function loadGateStats() {
  try {
    const res = await fetch('/api/stats');
    const s = await res.json();
    
    document.getElementById('gate-scanned-count').textContent = s.checkedInCount;
    document.getElementById('gate-confirmed-count').textContent = s.confirmedCount;
    document.getElementById('gate-remaining-count').textContent = s.remainingToArrive;
  } catch (err) {
    console.error('Error loading gate stats:', err);
  }
}

function addRecentScan(scan) {
  recentScans.unshift(scan);
  if (recentScans.length > 8) recentScans.pop();

  const listEl = document.getElementById('recent-scans-list');
  if (!listEl) return;

  listEl.innerHTML = recentScans.map(s => {
    let badge = `<span class="badge badge-success">Imeruhusiwa</span>`;
    if (s.status === 'already_used') badge = `<span class="badge badge-danger">Imerudiwa</span>`;
    if (s.status === 'invalid') badge = `<span class="badge badge-warning">Batili</span>`;

    return `
      <div class="scanned-item">
        <div>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(s.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(s.table)} • ${s.id}</div>
        </div>
        <div style="text-align: right;">
          ${badge}
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${s.time}</div>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Camera QR Scanner & Manual Inputs
// -------------------------------------------------------------
function setupManualForm() {
  const form = document.getElementById('manual-code-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('manual-code-input');
    if (input && input.value.trim()) {
      verifyCode(input.value.trim());
      input.value = '';
    }
  });
}

function setupCameraScanner() {
  const toggleBtn = document.getElementById('toggle-camera-btn');
  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', () => {
    if (isScannerRunning) {
      stopCamera();
    } else {
      startCamera();
    }
  });
}

function startCamera() {
  const readerElement = document.getElementById('reader');
  const toggleBtn = document.getElementById('toggle-camera-btn');
  if (!readerElement || !window.Html5Qrcode) {
    alert('Maktaba ya Kamera inapakuliwa, tafadhali subiri au tumia kuandika msimbo hapo chini.');
    return;
  }

  html5QrCode = new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrCode.start(
    { facingMode: 'environment' }, // Rear camera on mobile phones
    config,
    (decodedText) => {
      // Audio trigger on scan
      verifyCode(decodedText);
      // Optional throttle to prevent continuous duplicate scans in 2 seconds
    },
    (errorMessage) => {
      // Scanning ongoing...
    }
  ).then(() => {
    isScannerRunning = true;
    toggleBtn.innerHTML = '🛑 Zima Kamera';
    toggleBtn.classList.remove('btn-gold');
    toggleBtn.classList.add('btn-emerald');
  }).catch(err => {
    console.error('Camera start error:', err);
    alert('Haikuweza kufungua kamera: ' + err);
  });
}

function stopCamera() {
  const toggleBtn = document.getElementById('toggle-camera-btn');
  if (html5QrCode && isScannerRunning) {
    html5QrCode.stop().then(() => {
      isScannerRunning = false;
      toggleBtn.innerHTML = '📷 Washa Kamera ya Simu';
      toggleBtn.classList.add('btn-gold');
      toggleBtn.classList.remove('btn-emerald');
    }).catch(err => console.error(err));
  }
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
