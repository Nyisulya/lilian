/* ================================================================
   SECURITY BODYGUARD & SCANNER LOGIC (SECURITY.JS)
   ================================================================ */

let html5QrCode = null;
let isScannerRunning = false;
let isScanPaused = false;
let audioCtx = null;
let recentScans = [];

document.addEventListener('DOMContentLoaded', () => {
  initAudio();
  loadGateStats();
  setupManualForm();
  setupCameraScanner();
});

// Pause Scanner to let bodyguard review guest information without repeated rapid scans
function pauseScanner() {
  isScanPaused = true;
  const overlay = document.getElementById('scan-paused-indicator');
  if (overlay) overlay.style.display = 'flex';
  const resumeBtn = document.getElementById('btn-resume-scan');
  if (resumeBtn) resumeBtn.style.display = 'block';

  if (html5QrCode && isScannerRunning) {
    try {
      html5QrCode.pause(true);
    } catch (e) {
      console.log('Camera pause note:', e);
    }
  }
}

// Resume Scanner when bodyguard clicks "Scan Mgeni Anayefuata"
function resumeScanner() {
  isScanPaused = false;
  const overlay = document.getElementById('scan-paused-indicator');
  if (overlay) overlay.style.display = 'none';
  const resumeBtn = document.getElementById('btn-resume-scan');
  if (resumeBtn) resumeBtn.style.display = 'none';

  if (html5QrCode && isScannerRunning) {
    try {
      html5QrCode.resume();
    } catch (e) {
      console.log('Camera resume note:', e);
    }
  }

  // Smooth scroll back up to camera viewport
  const viewport = document.querySelector('.scanner-viewport-wrap');
  if (viewport) {
    viewport.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

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

  let clean = code.trim().replace(/^["']|["']$/g, '');
  if (clean.includes('http://') || clean.includes('https://') || clean.includes('?code=') || clean.includes('/invite/')) {
    try {
      const u = new URL(clean.startsWith('http') ? clean : `https://harusi.app/${clean.replace(/^\/+/, '')}`);
      const cp = u.searchParams.get('code');
      if (cp) clean = cp;
      else {
        const parts = u.pathname.split('/').filter(Boolean);
        const lp = parts[parts.length - 1];
        if (lp && lp !== 'invite' && lp !== 'invite.html') clean = lp;
      }
    } catch (e) {
      const m = clean.match(/code=([a-zA-Z0-9_-]+)/i);
      if (m) clean = m[1];
    }
  }
  const prefixM = clean.match(/(?:pass|kodi)\s*[:#-]?\s*([a-zA-Z0-9]+)/i);
  if (prefixM) clean = prefixM[1];

  const resultContainer = document.getElementById('scan-result-container');
  resultContainer.innerHTML = `
    <div class="glass-card" style="text-align: center; padding: 20px;">
      <div style="font-size: 1.2rem; color: var(--gold-light);">Inakagua kadi: <strong>${escapeHtml(clean)}</strong>...</div>
    </div>
  `;

  try {
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean })
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
    const totalSeats = Number(g.seats) || 1;
    const enteredSeats = Number(g.seatsCheckedIn) || totalSeats;

    let statusTitle = 'ANARUHUSIWA KUINGIA';
    let statusIcon = '✅';
    let subBanner = '';

    if (totalSeats === 2) {
      if (enteredSeats === 1) {
        statusTitle = 'ANARUHUSIWA KUINGIA (Mtu wa 1 kati ya 2)';
        statusIcon = '✅';
        subBanner = `
          <div style="background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; color: #fde68a; font-size: 0.9rem; text-align: left;">
            <div style="font-weight: 800; font-size: 1rem; color: #fbbf24;">📌 IMEBAKI NAFASI 1 YA KUINGIA</div>
            <div style="margin-top: 4px; color: #cbd5e1; font-size: 0.82rem;">
              Mtu wa kwanza ameruhusiwa kuingia. Mtu wa pili akija na kadi hii hii ataruhusiwa moja kwa moja!
            </div>
            <div style="margin-top: 10px;">
              <button type="button" class="btn btn-emerald btn-sm" onclick="setSeatsCheckedIn('${g.id}', 2)">
                👥 Kama Wapo Wote 2 Hapo Hapo (Ruhusu Wote & Funga Kadi)
              </button>
            </div>
          </div>
        `;
      } else {
        statusTitle = 'ANARUHUSIWA KUINGIA (Mtu wa 2 kati ya 2)';
        statusIcon = '🎉';
        subBanner = `
          <div style="background: rgba(46, 204, 113, 0.2); border: 1px solid #2ecc71; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; color: #a7f3d0; font-size: 0.9rem; text-align: left;">
            <div style="font-weight: 800; font-size: 1rem; color: #2ecc71;">🔒 NAFASI ZOTE 2 ZIMEKAMILIKA</div>
            <div style="margin-top: 4px; color: #cbd5e1; font-size: 0.82rem;">
              Watu wote wawili wameshaingia ukumbini. Kadi sasa imejifunga.
            </div>
          </div>
        `;
      }
    } else {
      statusTitle = 'ANARUHUSIWA KUINGIA (Mtu 1)';
      statusIcon = '✅';
      subBanner = `
        <div style="background: rgba(46, 204, 113, 0.15); border: 1px solid #2ecc71; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; color: #a7f3d0; font-size: 0.85rem; text-align: left;">
          🔒 Kadi ya Mtu 1 imekamilika na kujifunga.
        </div>
      `;
    }

    container.innerHTML = `
      <div class="result-card result-valid">
        <div class="result-status-icon">${statusIcon}</div>
        <div class="result-status-title">${statusTitle}</div>
        <div class="result-guest-name">${escapeHtml(g.name)}</div>
        <div style="font-size: 0.9rem; color: #a7f3d0; margin-bottom: 12px;">${escapeHtml(g.title || 'Mgeni Maalumu')}</div>

        ${subBanner}

        <div class="result-meta-grid">
          <div class="result-meta-item">
            <div class="result-meta-label">Upangaji wa Meza</div>
            <div class="result-meta-val">📍 ${escapeHtml(g.tableName)}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Aina ya Mwaliko</div>
            <div class="result-meta-val">${totalSeats === 2 ? '👥 Double (Watu 2)' : (totalSeats === 1 ? '👤 Single (Mtu 1)' : `👥 Watu ${totalSeats}`)}</div>
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

        <!-- Prominent Next Guest Action Button -->
        <div style="margin-top: 18px;">
          <button type="button" class="btn btn-emerald" style="width: 100%; padding: 14px; font-size: 1.05rem; font-weight: 800; border-radius: 12px; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);" onclick="resumeScanner()">
            📸 SCAN MGENI ANAYEFUATA ➔
          </button>
        </div>

        <div style="margin-top: 12px; text-align: center;">
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
    const totalSeats = Number(g.seats) || 1;

    container.innerHTML = `
      <div class="result-card result-already-used">
        <div class="result-status-icon">🚨</div>
        <div class="result-status-title">TAHADHARI! KADI ILIKWISHATUMIKA!</div>
        <p style="color: #fca5a5; font-weight: 600; margin: 8px 0;">
          ${totalSeats > 1 ? `Kadi hii ya watu ${totalSeats} tayari ilishakaguliwa na wote wameshaingia ukumbini!` : `Kadi hii tayari ilishakaguliwa saa <strong>${originalTime}</strong>! Inazuia kuingia mara mbili.`}
        </p>
        <div class="result-guest-name" style="color: #ffffff;">${escapeHtml(g.name || data.code)}</div>
        
        <div class="result-meta-grid">
          <div class="result-meta-item">
            <div class="result-meta-label">Meza</div>
            <div class="result-meta-val">${escapeHtml(g.tableName || '-')}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Aina ya Kadi</div>
            <div class="result-meta-val">${totalSeats === 2 ? '👥 Double (Watu 2)' : `Watu ${totalSeats}`}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Kaguzi ya Awali</div>
            <div class="result-meta-val">⚠️ Saa ${originalTime}</div>
          </div>
          <div class="result-meta-item">
            <div class="result-meta-label">Hali ya Kadi</div>
            <div class="result-meta-val" style="color: #ef4444;">❌ Imefungwa</div>
          </div>
        </div>

        <!-- Prominent Next Guest Action Button -->
        <div style="margin-top: 18px;">
          <button type="button" class="btn btn-emerald" style="width: 100%; padding: 14px; font-size: 1.05rem; font-weight: 800; border-radius: 12px; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);" onclick="resumeScanner()">
            📸 SCAN MGENI ANAYEFUATA ➔
          </button>
        </div>

        <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center;">
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

        <div style="margin-top: 18px;">
          <button type="button" class="btn btn-emerald" style="width: 100%; padding: 14px; font-size: 1.05rem; font-weight: 800; border-radius: 12px; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);" onclick="resumeScanner()">
            📸 SCAN MGENI ANAYEFUATA ➔
          </button>
        </div>
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

        <div style="margin-top: 18px;">
          <button type="button" class="btn btn-emerald" style="width: 100%; padding: 14px; font-size: 1.05rem; font-weight: 800; border-radius: 12px; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);" onclick="resumeScanner()">
            📸 SCAN MGENI ANAYEFUATA ➔
          </button>
        </div>
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

// Toggle seats checked in (Double card support: 1 or 2)
async function setSeatsCheckedIn(guestId, count) {
  try {
    const res = await fetch('/api/verify/set-seats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestId, seatsCheckedIn: count })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      // Re-verify to display updated state on screen
      verifyCode(guestId);
      loadGateStats();
    }
  } catch (e) {
    console.error(e);
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
    
    const scannedEl = document.getElementById('gate-scanned-count');
    const confirmedEl = document.getElementById('gate-confirmed-count');
    const remainingEl = document.getElementById('gate-remaining-count');

    if (scannedEl) scannedEl.textContent = s.checkedInCount !== undefined ? s.checkedInCount : 0;
    if (confirmedEl) confirmedEl.textContent = s.confirmedCount !== undefined ? s.confirmedCount : (s.totalSeats || s.totalGuests || 0);
    if (remainingEl) remainingEl.textContent = s.remainingToArrive !== undefined ? s.remainingToArrive : 0;
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
      pauseScanner();
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

  isScanPaused = false;
  const overlay = document.getElementById('scan-paused-indicator');
  if (overlay) overlay.style.display = 'none';
  const resumeBtn = document.getElementById('btn-resume-scan');
  if (resumeBtn) resumeBtn.style.display = 'none';

  html5QrCode = new Html5Qrcode('reader');
  const config = {
    fps: 15,  // Smooth and responsive detection
    qrbox: { width: 250, height: 250 },
    aspectRatio: 1.0,
    formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ]  // Only scan QR codes (skip barcodes)
  };

  html5QrCode.start(
    { facingMode: 'environment' }, // Rear camera on mobile phones
    config,
    (decodedText) => {
      // IF ALREADY PAUSED: completely ignore incoming frames!
      if (isScanPaused) return;

      // Immediately freeze/pause the scanner so guard can read results
      pauseScanner();

      // Perform verification
      verifyCode(decodedText);
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
      isScanPaused = false;
      const overlay = document.getElementById('scan-paused-indicator');
      if (overlay) overlay.style.display = 'none';
      const resumeBtn = document.getElementById('btn-resume-scan');
      if (resumeBtn) resumeBtn.style.display = 'none';

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
