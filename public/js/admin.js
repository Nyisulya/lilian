/* ================================================================
   KAMATI APP & DASHBOARD LOGIC (ADMIN.JS)
   ================================================================ */

let allGuests = [];
let allTables = [];
let allOrders = [];
let eventDetails = {};
let currentEditingGuestId = null;

// Pagination state for all long tables
const paginationState = {
  guests: { page: 1, pageSize: 10, data: [] },
  pledges: { page: 1, pageSize: 10, data: [] },
  sms: { page: 1, pageSize: 10, data: [] },
  orders: { page: 1, pageSize: 10, data: [] },
  finLedger: { page: 1, pageSize: 10, data: [] },
  finContributors: { page: 1, pageSize: 10, data: [] }
};

function paginateArray(items, page, pageSize) {
  if (!Array.isArray(items)) return [];
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function renderPaginationBar(containerId, totalItems, currentPage, pageSize, onPageChangeName, onPageSizeChangeName) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalItems === 0) {
    container.innerHTML = `<div class="pagination-info" style="color: var(--text-muted); font-size: 0.8rem;">Hakuna taarifa za kuonyesha.</div>`;
    return;
  }

  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);

  let startBtn = Math.max(1, safePage - 2);
  let endBtn = Math.min(totalPages, startBtn + 4);
  if (endBtn - startBtn < 4) {
    startBtn = Math.max(1, endBtn - 4);
  }

  let pageButtonsHtml = '';
  for (let p = startBtn; p <= endBtn; p++) {
    pageButtonsHtml += `
      <button type="button" class="page-btn ${p === safePage ? 'active' : ''}" onclick="${onPageChangeName}(${p})">
        ${p}
      </button>
    `;
  }

  container.innerHTML = `
    <div class="pagination-info">
      Inaonyesha <strong>${start} - ${end}</strong> ya <strong>${totalItems}</strong>
    </div>

    <div class="pagination-controls-wrap">
      <div class="page-size-selector">
        <span>Onyesha:</span>
        <select onchange="${onPageSizeChangeName}(parseInt(this.value, 10))">
          <option value="5" ${pageSize === 5 ? 'selected' : ''}>5</option>
          <option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option>
          <option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option>
          <option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option>
          <option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option>
        </select>
      </div>

      <div class="pagination-pages">
        <button type="button" class="page-btn" ${safePage <= 1 ? 'disabled' : ''} onclick="${onPageChangeName}(1)" title="Mwanzo">«</button>
        <button type="button" class="page-btn" ${safePage <= 1 ? 'disabled' : ''} onclick="${onPageChangeName}(${safePage - 1})" title="Iliyopita">‹</button>
        ${pageButtonsHtml}
        <button type="button" class="page-btn" ${safePage >= totalPages ? 'disabled' : ''} onclick="${onPageChangeName}(${safePage + 1})" title="Ifuatayo">›</button>
        <button type="button" class="page-btn" ${safePage >= totalPages ? 'disabled' : ''} onclick="${onPageChangeName}(${totalPages})" title="Mwisho">»</button>
      </div>
    </div>
  `;
}

// Global pagination event setters
function setGuestsPage(page) {
  paginationState.guests.page = page;
  renderGuestTable();
}
function setGuestsPageSize(size) {
  paginationState.guests.pageSize = size;
  paginationState.guests.page = 1;
  renderGuestTable();
}

function setPledgesPage(page) {
  paginationState.pledges.page = page;
  renderPledgesTable();
}
function setPledgesPageSize(size) {
  paginationState.pledges.pageSize = size;
  paginationState.pledges.page = 1;
  renderPledgesTable();
}

function setSmsPage(page) {
  paginationState.sms.page = page;
  renderSmsLogsTable();
}
function setSmsPageSize(size) {
  paginationState.sms.pageSize = size;
  paginationState.sms.page = 1;
  renderSmsLogsTable();
}

function setFinLedgerPage(page) {
  paginationState.finLedger.page = page;
  renderFinLedgerTable();
}
function setFinLedgerPageSize(size) {
  paginationState.finLedger.pageSize = size;
  paginationState.finLedger.page = 1;
  renderFinLedgerTable();
}

function setFinContributorsPage(page) {
  paginationState.finContributors.page = page;
  renderContributorFinancialTable(currentFinanceFilter);
}
function setFinContributorsPageSize(size) {
  paginationState.finContributors.pageSize = size;
  paginationState.finContributors.page = 1;
  renderContributorFinancialTable(currentFinanceFilter);
}

document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  initDashboard();
  setupTabs();
  setupEventListeners();
});

function checkAdminAuth() {
  const isAuth = sessionStorage.getItem('kamati_auth');
  const lockEl = document.getElementById('admin-auth-lock');
  if (!lockEl) return;
  if (isAuth === '2030') {
    lockEl.style.display = 'none';
  } else {
    lockEl.style.display = 'flex';
    const pinInput = document.getElementById('admin-auth-pin');
    if (pinInput) setTimeout(() => pinInput.focus(), 200);
  }
}

function verifyAdminAuth(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('admin-auth-pin');
  const err = document.getElementById('admin-auth-error');
  const lockEl = document.getElementById('admin-auth-lock');
  const val = input ? input.value.trim() : '';

  if (val === '2030') {
    sessionStorage.setItem('kamati_auth', '2030');
    if (lockEl) lockEl.style.display = 'none';
    initDashboard();
  } else {
    if (err) err.textContent = '❌ Nenosiri sio sahihi (2030). Jaribu tena!';
    if (input) {
      input.value = '';
      input.focus();
    }
  }
}

// Helper to switch tabs from anywhere (e.g. Dashboard quick links)
function switchToTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-target="${tabId}"]`);
  if (btn) {
    btn.click();
  } else {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.target === tabId));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
  }
}

async function initDashboard() {
  await Promise.all([
    loadStats(),
    loadEventData(),
    loadGuests(),
    loadSmsLogs(),
    loadSmsConfig(),
    loadWhatsAppConfig(),
    loadDrinkOrders(),
    loadDrinksAdmin(),
    loadGalleryImages()
  ]);
  renderDashboardOverview();
}

// Auto-refresh drink orders every 15s in background
setInterval(() => {
  if (sessionStorage.getItem('kamati_auth') === '2030') {
    loadDrinkOrders(true);
  }
}, 15000);

// -------------------------------------------------------------
// Data Fetching
// -------------------------------------------------------------
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    renderStats(stats);
    renderDashboardOverview();
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

async function loadEventData() {
  try {
    const res = await fetch('/api/event');
    const data = await res.json();
    eventDetails = data.event;
    allTables = data.tables;
    allDrinks = data.drinks;

    const sidebarTitle = document.getElementById('sidebar-event-title');
    if (sidebarTitle && eventDetails) {
      const groom = eventDetails.groomName || 'James';
      const bride = eventDetails.brideName || 'Lilian';
      sidebarTitle.textContent = `Send-off ya ${bride} & ${groom}`;
    }

    populateTableSelects();
    renderSeatingView();
    populateSettingsForm();
    renderDashboardOverview();
  } catch (err) {
    console.error('Error loading event data:', err);
  }
}

async function loadGuests() {
  try {
    const res = await fetch('/api/guests');
    allGuests = await res.json();
    renderGuestTable(allGuests);
    renderPledgesTable(allGuests);
    renderFinancialReportView();
    renderDashboardOverview();
  } catch (err) {
    console.error('Error loading guests:', err);
  }
}

// -------------------------------------------------------------
// Render Functions
// -------------------------------------------------------------
function renderStats(stats) {
  // Numbers
  if (document.getElementById('stat-total-guests')) {
    document.getElementById('stat-total-guests').textContent = stats.totalGuests;
  }
  if (document.getElementById('stat-seats-allocated')) {
    document.getElementById('stat-seats-allocated').textContent = `${stats.totalSeatsAllocated} Viti Vimetengwa`;
  }
  
  if (document.getElementById('stat-completed-count')) {
    document.getElementById('stat-completed-count').textContent = stats.completedCount || 0;
  }
  if (document.getElementById('stat-completed-sub')) {
    document.getElementById('stat-completed-sub').textContent = `Tsh ${(stats.completedAmount || 0).toLocaleString('sw-TZ')} Zimekamilika`;
  }

  if (document.getElementById('stat-debtors-count')) {
    document.getElementById('stat-debtors-count').textContent = stats.debtorsCount || 0;
  }
  if (document.getElementById('stat-debtors-sub')) {
    document.getElementById('stat-debtors-sub').textContent = `Baki: Tsh ${(stats.totalDebtorsBalance || 0).toLocaleString('sw-TZ')} Inadaiwa`;
  }

  // Financials
  const f = stats.financials;
  if (document.getElementById('stat-paid-amount')) {
    document.getElementById('stat-paid-amount').textContent = `Tsh ${f.totalPaid.toLocaleString('sw-TZ')}`;
  }
  if (document.getElementById('stat-pledges-total')) {
    document.getElementById('stat-pledges-total').textContent = `Lengo: Tsh ${f.totalPledges.toLocaleString('sw-TZ')}`;
  }
  if (document.getElementById('stat-balance-amount')) {
    document.getElementById('stat-balance-amount').textContent = `Baki: Tsh ${f.totalBalance.toLocaleString('sw-TZ')}`;
  }
  
  // Financial progress bar update
  const progressBar = document.getElementById('stat-paid-progress');
  if (progressBar) {
    progressBar.style.width = `${Math.min(f.percentagePaid, 100)}%`;
  }
  if (document.getElementById('stat-percent-text')) {
    document.getElementById('stat-percent-text').textContent = `${f.percentagePaid}% Imelipwa`;
  }
}

function renderDashboardOverview() {
  // Update Hero Titles
  const groom = eventDetails?.groomName || 'James';
  const bride = eventDetails?.brideName || 'Lilian';
  const venue = eventDetails?.receptionVenue || 'Bragging Social Hall, Goba, Dar es Salaam';
  const dateStr = eventDetails?.weddingDate || '13 Oktoba 2026';

  const heroTitle = document.getElementById('dash-hero-title');
  if (heroTitle) heroTitle.textContent = `Send-off ya ${bride} & ${groom}`;

  const heroSub = document.getElementById('dash-hero-subtitle');
  if (heroSub) heroSub.textContent = `${venue} • Tarehe: ${dateStr}`;

  // Update Seating Snapshot
  const totalAllocated = allGuests.reduce((s, g) => s + (Number(g.seats) || 1), 0);
  const totalCapacity = allTables.reduce((s, t) => s + (Number(t.capacity) || 0), 0);
  const seatsStat = document.getElementById('dash-seats-stat');
  if (seatsStat) seatsStat.textContent = `${totalAllocated} / ${totalCapacity} Viti`;

  const tablesBadge = document.getElementById('dash-tables-badge');
  if (tablesBadge) tablesBadge.textContent = `${allTables.length} Meza`;



  // Update Payment instructions
  const pDisplay = document.getElementById('fin-payment-details-display')?.textContent.trim();
  const dashPay = document.getElementById('dash-payment-details-stat');
  if (dashPay && pDisplay) {
    dashPay.textContent = pDisplay;
  }

  // Populate Recent Registered Guests (Top 6 latest)
  const tbody = document.getElementById('dash-recent-guests-tbody');
  if (tbody && Array.isArray(allGuests)) {
    if (allGuests.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 20px;">Bado hakuna mualikwa aliyesajiliwa. Bofya "+ Ongeza Mualikwa" hapo juu.</td></tr>`;
      return;
    }

    const recentList = [...allGuests].slice(0, 6);
    tbody.innerHTML = recentList.map(g => {
      const pledge = Number(g.pledgeAmount) || 0;
      const paid = Number(g.paidAmount) || 0;
      const balance = Math.max(0, pledge - paid);
      const isCompleted = balance === 0 && pledge > 0;

      return `
        <tr>
          <td style="font-weight: 700; color: var(--gold-light);">#${g.id}</td>
          <td>
            <div style="font-weight: 600; color: #ffffff;">${escapeHtml(g.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(g.title || '')}</div>
          </td>
          <td style="font-size: 0.85rem;">${escapeHtml(g.phone || '-')}</td>
          <td style="font-weight: 600;">
            <span class="badge ${Number(g.seats) === 2 ? 'badge-gold' : 'badge-emerald'}" style="font-size: 0.74rem; padding: 2px 8px;">
              ${Number(g.seats) === 2 ? '👥 Double' : (Number(g.seats) === 1 ? '👤 Single' : `👥 Watu ${g.seats}`)}
            </span>
          </td>
          <td style="font-weight: 600;">Tsh ${pledge.toLocaleString('sw-TZ')}</td>
          <td style="color: #2ecc71; font-weight: 700;">Tsh ${paid.toLocaleString('sw-TZ')}</td>
          <td style="color: ${balance > 0 ? '#f39c12' : '#2ecc71'}; font-weight: 700;">
            ${isCompleted ? '<span class="badge badge-success">✓ Kamili</span>' : `Tsh ${balance.toLocaleString('sw-TZ')}`}
          </td>
          <td>
            <button type="button" class="btn btn-sm btn-emerald" style="padding: 3px 8px; font-size: 0.75rem;" onclick="openPaymentModal('${g.id}')">
              💰 Lipa
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

function renderGuestTable(guests) {
  const tbody = document.getElementById('guest-table-body');
  if (!tbody) return;

  if (guests !== undefined) {
    paginationState.guests.data = guests;
  }
  const items = paginationState.guests.data || allGuests || [];
  const total = items.length;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px;">Hakuna mualikwa aliyepatikana.</td></tr>`;
    renderPaginationBar('pagination-guests', 0, 1, paginationState.guests.pageSize, 'setGuestsPage', 'setGuestsPageSize');
    return;
  }

  const totalPages = Math.ceil(total / paginationState.guests.pageSize) || 1;
  if (paginationState.guests.page > totalPages) paginationState.guests.page = totalPages;
  if (paginationState.guests.page < 1) paginationState.guests.page = 1;

  const paginated = paginateArray(items, paginationState.guests.page, paginationState.guests.pageSize);

  tbody.innerHTML = paginated.map(g => {
    const table = allTables.find(t => t.id === g.tableId) || { name: 'Haijapangwa' };
    
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;
    
    let paymentBadge = `<span class="badge badge-success">✓ Kamilifu (100%)</span>`;
    if (pledge === 0 && paid === 0) {
      paymentBadge = `<span class="badge badge-gold">Hakuna Ahadi</span>`;
    } else if (paid === 0) {
      paymentBadge = `<span class="badge badge-danger">Hajalipa (Tsh ${pledge.toLocaleString('sw-TZ')})</span>`;
    } else if (balance > 0) {
      paymentBadge = `<span class="badge badge-warning">Anadaiwa Tsh ${balance.toLocaleString('sw-TZ')}</span>`;
    }

    return `
      <tr>
        <td style="font-weight: 700; color: var(--gold-light);">#${g.id}</td>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(g.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(g.title || '')}</div>
        </td>
        <td>
          <span class="badge badge-gold" style="font-family: monospace; font-size: 0.88rem; font-weight: 800; letter-spacing: 1px; padding: 4px 8px;" title="Kodi ya Kuingilia Mlangoni">
            🔑 ${g.code || '4829'}
          </span>
        </td>
        <td>${escapeHtml(g.phone || '-')}</td>
        <td>
          <div style="font-weight: 600; color: var(--gold-light);">${escapeHtml(table.name)}</div>
          <div style="margin-top: 3px;">
            <span class="badge ${Number(g.seats) === 2 ? 'badge-gold' : 'badge-emerald'}" style="font-size: 0.74rem; font-weight: 700; padding: 2px 8px;">
              ${Number(g.seats) === 2 ? '👥 Double (Watu 2)' : (Number(g.seats) === 1 ? '👤 Single (Mtu 1)' : `👥 Watu ${g.seats}`)}
            </span>
          </div>
        </td>
        <td>${paymentBadge}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-action-edit" onclick="openEditGuestModal('${g.id}')" title="Hariri taarifa za mualikwa huyu">
              ✏️ Hariri
            </button>
            <button type="button" class="btn-action-pay" onclick="openPaymentModal('${g.id}')" title="Sajili mchango au malipo ya mualikwa">
              💰 Malipo
            </button>
            <button type="button" class="btn-action-delete" onclick="deleteGuest('${g.id}')" title="Futa mualikwa huyu">
              🗑️ Futa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationBar('pagination-guests', total, paginationState.guests.page, paginationState.guests.pageSize, 'setGuestsPage', 'setGuestsPageSize');
}

function renderPledgesTable(guests) {
  const tbody = document.getElementById('pledges-table-body');
  if (!tbody) return;

  if (guests !== undefined) {
    paginationState.pledges.data = guests;
  }
  const items = paginationState.pledges.data || allGuests || [];

  let debtorCount = 0;
  let totalDebts = 0;

  (allGuests || []).forEach(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;
    if (paid === 0 || balance > 0) {
      debtorCount++;
      totalDebts += (balance > 0 ? balance : 0);
    }
  });

  const summaryEl = document.getElementById('debtors-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `Wasiochangia / Wanaodaiwa: <strong>${debtorCount}</strong> | Madeni Yaliyobaki: <strong>Tsh ${totalDebts.toLocaleString('sw-TZ')}</strong>`;
  }

  const total = items.length;
  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--text-muted);">Hakuna mchangiaji aliyepatikana kwa vigezo hivi.</td></tr>`;
    renderPaginationBar('pagination-pledges', 0, 1, paginationState.pledges.pageSize, 'setPledgesPage', 'setPledgesPageSize');
    return;
  }

  const totalPages = Math.ceil(total / paginationState.pledges.pageSize) || 1;
  if (paginationState.pledges.page > totalPages) paginationState.pledges.page = totalPages;
  if (paginationState.pledges.page < 1) paginationState.pledges.page = 1;

  const paginated = paginateArray(items, paginationState.pledges.page, paginationState.pledges.pageSize);

  tbody.innerHTML = paginated.map(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;
    const isCompleted = balance <= 0 && pledge > 0;

    let statusBadge = isCompleted 
      ? `<span class="badge badge-success">✓ Amemaliza</span>` 
      : (balance > 0 ? `<span class="badge badge-danger">Anadaiwa</span>` : `<span class="badge badge-gold">Bado Ahadi</span>`);

    return `
      <tr>
        <td style="font-weight: 700; color: var(--gold-light);">#${g.id}</td>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(g.name)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(g.phone)}</div>
        </td>
        <td>Tsh ${pledge.toLocaleString('sw-TZ')}</td>
        <td style="color: #2ecc71; font-weight: 600;">Tsh ${paid.toLocaleString('sw-TZ')}</td>
        <td style="color: ${balance > 0 ? '#e74c3c' : '#2ecc71'}; font-weight: 600;">
          Tsh ${balance.toLocaleString('sw-TZ')}
          <div style="margin-top: 2px;">${statusBadge}</div>
        </td>
        <td>
          <span class="reminder-badge">Imetumwa x${g.reminderCount || 0}</span>
        </td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-action-pay" onclick="openPaymentModal('${g.id}')" title="Sajili Malipo & Tuma SMS">+ Weka Malipo</button>
            ${(paid === 0 || balance > 0) ? `<button type="button" class="btn-action-sms" onclick="sendSingleDebtReminderSMS('${g.id}')" title="Tuma SMS ya Kikumbusho (NextSMS - SMS 3)">📨 Tuma SMS</button>` : ''}
            <button type="button" class="btn-action-wa" onclick="openReminderModal('${g.id}')" title="Tuma Kikumbusho WhatsApp">📲 WhatsApp</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationBar('pagination-pledges', total, paginationState.pledges.page, paginationState.pledges.pageSize, 'setPledgesPage', 'setPledgesPageSize');
}

function renderSeatingView() {
  const grid = document.getElementById('seating-tables-grid');
  if (!grid) return;

  if (!allTables || allTables.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: rgba(7, 21, 16, 0.6); border: 1.5px dashed var(--gold-primary); border-radius: 16px;">
        <div style="font-size: 3rem; margin-bottom: 10px;">🪑</div>
        <h4 class="font-serif gold-text" style="font-size: 1.25rem; margin-bottom: 8px;">Bado Hakuna Meza Zilizosajiliwa</h4>
        <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 480px; margin: 0 auto 16px auto;">
          Anza kwa kusajili meza za ukumbini (mfano: <em>Meza Kuu, Meza 1, Meza ya Wazazi, n.k.</em>) ili kuwapangia wageni viti na kutoa kadi za QR za mezani.
        </p>
        <button type="button" class="btn btn-gold" onclick="openAddTableModal()" style="font-size: 0.92rem; padding: 10px 22px;">
          ➕ Ongeza Meza ya Kwanza Sasa
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = allTables.map(t => {
    const tableGuests = (allGuests || []).filter(g => g.tableId === t.id);
    const assignedSeats = tableGuests.reduce((sum, g) => sum + (Number(g.seats) || 1), 0);
    const isFull = assignedSeats >= t.capacity;

    return `
      <div class="table-card">
        <div class="table-card-header">
          <div>
            <div class="table-card-title">${escapeHtml(t.name)}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(t.notes || '')}</div>
          </div>
          <span class="badge ${isFull ? 'badge-danger' : 'badge-gold'}">
            ${assignedSeats} / ${t.capacity} Viti
          </span>
        </div>
        <ul class="table-guest-list">
          ${tableGuests.map(g => `
            <li class="table-guest-item">
              <span>${escapeHtml(g.name)}</span>
              <span style="color: var(--gold-light); font-weight: 600;">${Number(g.seats) === 2 ? '👥 Double (2)' : (Number(g.seats) === 1 ? '👤 Single (1)' : `👥 ${g.seats} Viti`)}</span>
            </li>
          `).join('') || '<li style="color: var(--text-muted); font-size: 0.8rem;">Bado haina wageni</li>'}
        </ul>
        <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(212, 175, 55, 0.15); display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <a href="/order/${t.id}" target="_blank" class="btn btn-sm btn-outline-gold" style="font-size: 0.74rem; padding: 3px 8px;" title="Jaribu Menyu ya Vinywaji ya meza hii">
            🍸 QR Menyu ↗
          </a>
          <div style="display: flex; gap: 6px;">
            <button type="button" class="btn-action-edit" onclick="openEditTableModal('${t.id}')" title="Hariri Meza" style="padding: 3px 8px; font-size: 0.75rem;">
              ✏️ Hariri
            </button>
            <button type="button" class="btn-action-delete" onclick="deleteTable('${t.id}')" title="Futa Meza" style="padding: 3px 8px; font-size: 0.75rem;">
              🗑️ Futa
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function populateTableSelects() {
  const select = document.getElementById('guest-table-select');
  if (!select) return;

  if (!allTables || allTables.length === 0) {
    select.innerHTML = '<option value="">-- Hakuna Meza Zilizosajiliwa Bado --</option>';
    return;
  }

  select.innerHTML = '<option value="">-- Chagua Meza --</option>' + allTables.map(t => `
    <option value="${t.id}">${escapeHtml(t.name)} (Uwezo: ${t.capacity})</option>
  `).join('');
}

function populateSettingsForm() {
  if (!eventDetails) return;
  setInputValue('set-groom-name', eventDetails.groomName);
  setInputValue('set-groom-fullname', eventDetails.groomFullName);
  setInputValue('set-bride-name', eventDetails.brideName);
  setInputValue('set-bride-fullname', eventDetails.brideFullName);
  setInputValue('set-wedding-date', eventDetails.weddingDate);
  setInputValue('set-church-venue', eventDetails.churchVenue);
  setInputValue('set-reception-venue', eventDetails.receptionVenue);
  setInputValue('set-maps-url', eventDetails.googleMapsUrl);
  setInputValue('set-youtube-url', eventDetails.youtubeLiveUrl);
  setInputValue('set-gallery-url', eventDetails.pictureGalleryUrl);
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || '';
}

// -------------------------------------------------------------
// WhatsApp Messaging Engine (Kadi ya Mwaliko & Vikumbusho x 5)
// -------------------------------------------------------------

// 1. Tuma Kadi ya Mwaliko (Picha ya Kadi & Ujumbe 3 za WhatsApp)
let activeSendoffGuest = null;
let currentCardBlob = null;

function sendWhatsAppCard(guestId) {
  openSendoffWhatsAppModal(guestId);
}

function openSendoffWhatsAppModal(guestId) {
  const guest = allGuests.find(g => String(g.id) === String(guestId));
  if (!guest) return;
  activeSendoffGuest = guest;

  const table = allTables.find(t => t.id === guest.tableId) || { name: 'Haijapangwa' };
  const bride = eventDetails.brideName || 'Lilian';
  const dateStr = eventDetails.weddingDate || '13 Oktoba 2026';
  const timeStr = 'Kuanzia Saa 12:30 Jioni';
  const venue = eventDetails.receptionVenue && !eventDetails.receptionVenue.includes('Mlimani') ? eventDetails.receptionVenue : 'Bragging Social Hall, Goba, Dar es Salaam';
  const mapsUrl = eventDetails.googleMapsUrl && !eventDetails.googleMapsUrl.includes('Mlimani') ? eventDetails.googleMapsUrl : 'https://maps.google.com/?q=Bragging+Social+Hall+Goba+Dar+es+Salaam';

  // Update modal header info
  const nameEl = document.getElementById('wa-card-guest-name');
  const seatsEl = document.getElementById('wa-card-guest-seats');
  const tableEl = document.getElementById('wa-card-guest-table');
  const codeBadge = document.getElementById('wa-card-guest-code-badge');
  const queueCounter = document.getElementById('wa-queue-counter');

  const seatLabel = Number(guest.seats) === 2 ? '👥 Double (Watu 2 / Mwenza)' : (Number(guest.seats) === 1 ? '👤 Single (Mtu 1)' : `👥 Watu ${guest.seats}`);

  if (nameEl) nameEl.textContent = guest.name;
  if (seatsEl) seatsEl.textContent = `Mwaliko: ${seatLabel}`;
  if (tableEl) tableEl.textContent = `Meza: ${table.name}`;
  if (codeBadge) codeBadge.textContent = `🔑 Pass Code: ${guest.code || '4829'}`;

  const currentIdx = allGuests.findIndex(g => String(g.id) === String(guest.id));
  if (queueCounter) {
    queueCounter.textContent = `Mgeni ${currentIdx >= 0 ? currentIdx + 1 : 1} / ${allGuests.length}`;
  }

  // Message 1: Invitation + Photo Card + 4-Digit Gate Pass Code
  const famName = eventDetails?.familyName || 'Mzee Marcus Nyahende';
  const msg1 = `💍 *MWALIKO WA SHEREHE YA SEND-OFF YA ${bride.toUpperCase()}* 💍\n\nHabari Ndugu *${guest.name}*,\n\nFamilia ya ${famName} inayo heshima na furaha kubwa kukualika ${guest.seats > 1 ? 'wewe na mwenza wako' : ''} katika usiku wa sherehe ya kumuaga binti yao mpendwa *${bride}* (Send-off Party).\n\n🎟️ *Aina ya Kadi (Mwaliko):* ${seatLabel}\n📍 *Meza Yako:* ${table.name}\n🔑 *Kodi Yako ya Kuingilia Mlangoni:* *${guest.code || '4829'}*\n📅 *Tarehe:* ${dateStr}\n⏰ *Muda:* ${timeStr}\n🏛️ *Ukumbi:* ${venue}\n\nPicha ya kadi yako rasmi yenye Kodi yako ya siri ya kuingilia (${guest.code || '4829'}) na QR Code imeambatanishwa hapo juu. Karibu sana tufurahi pamoja! ✨🥂`;

  // Message 2: Venue Location
  const msg2 = `📍 *UKUMBI & MAHALI ILIPO (LOCATION)* 📍\n\nSherehe itafanyika:\n🏛️ *Ukumbi:* ${venue}\n📅 *Tarehe:* ${dateStr}\n⏰ *Muda:* ${timeStr}\n\nBonyeza link hii ya Google Maps itakuongoza moja kwa moja hadi ukumbini bila kupotea:\n👉 ${mapsUrl}\n\nKaribu sana!`;

  // Message 3: Dress Code & Schedule
  const msg3 = `👗 *DRESS CODE & RATIBA YA USIKU WA SEND-OFF* 👗\n\n🎨 *Rangi za Siku Hiyo (Dress Code):*\n• *Emerald Green & Touch of Gold* (Kijani Kibichi na Mguso wa Dhahabu) au vazi lolote nadhifu la heshima.\n\n⏰ *Ratiba ya Matukio:*\n• Saa 12:00 Jioni: Milango ya ukumbi inafunguliwa & Mapokezi ya wageni\n• Saa 01:30 Usiku: Bibi Harusi (${bride}) anaingia ukumbini\n• Saa 02:30 Usiku: Chakula cha usiku (Dinner) & Shamrashamra\n\nTunakutakia maandalizi mema, uwepo wako utaleta nakshi na furaha kubwa! 🙏💐`;

  const txt1 = document.getElementById('wa-text-msg-1');
  const txt2 = document.getElementById('wa-text-msg-2');
  const txt3 = document.getElementById('wa-text-msg-3');
  if (txt1) txt1.value = msg1;
  if (txt2) txt2.value = msg2;
  if (txt3) txt3.value = msg3;

  selectWaMsgTab(1);

  // Open modal
  const modal = document.getElementById('whatsapp-sendoff-modal');
  if (modal) modal.classList.add('active');

  // Render Card on Canvas
  renderSendoffCardCanvas(guest, table);
}

function navigateSendoffGuest(direction) {
  if (!activeSendoffGuest || !allGuests.length) return;
  const currentIdx = allGuests.findIndex(g => String(g.id) === String(activeSendoffGuest.id));
  let nextIdx = currentIdx + direction;
  if (nextIdx < 0) nextIdx = allGuests.length - 1;
  if (nextIdx >= allGuests.length) nextIdx = 0;
  openSendoffWhatsAppModal(allGuests[nextIdx].id);
}

async function sendSingleGuestInvitationSMS(guestId) {
  const gId = guestId || (activeSendoffGuest ? activeSendoffGuest.id : null);
  if (!gId) return;
  const guest = allGuests.find(g => String(g.id) === String(gId));
  if (!guest) return;

  if (!guest.phone) {
    alert(`Mgeni ${guest.name} hana namba ya simu iliyosajiliwa.`);
    return;
  }

  if (!confirm(`Unataka kutuma SMS rasmi ya mwaliko yenye Kodi ya Pass (${guest.code || '4829'}) kwa ${guest.name} (${guest.phone}) kupitia SENDOFF?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/sms/send-invitation/${gId}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ ${data.message}`);
      loadSmsLogs();
    } else {
      alert(`Hitilafu: ${data.error || data?.result?.log?.responseMessage || 'Haikufanikiwa'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Hitilafu ya mtandao');
  }
}

function openBulkInvitationModal() {
  const modal = document.getElementById('bulk-invitation-modal');
  if (!modal) return;
  const withPhone = allGuests.filter(g => g.phone && g.phone.trim().length >= 7);
  const countEl = document.getElementById('bulk-sms-recipient-count');
  if (countEl) countEl.textContent = `${withPhone.length} Wageni (Kati ya ${allGuests.length})`;
  modal.classList.add('active');
}

async function executeBulkInvitationSMS() {
  const withPhone = allGuests.filter(g => g.phone && g.phone.trim().length >= 7);
  if (withPhone.length === 0) {
    alert('Hakuna wageni wenye namba za simu kwenye orodha.');
    return;
  }

  if (!confirm(`Je, una uhakika unataka kutuma SMS za mwaliko kwa wageni wote ${withPhone.length} kwa mara moja kupitia Sender ID ya SENDOFF?\n\nKila mgeni atapokea Meza yake na Kodi yake ya kipekee ya tarakimu 4.`)) {
    return;
  }

  const btn = document.getElementById('btn-start-bulk-sms');
  const progressWrap = document.getElementById('bulk-sms-progress-wrap');
  const progressText = document.getElementById('bulk-sms-progress-text');
  if (btn) btn.disabled = true;
  if (progressWrap) progressWrap.style.display = 'block';

  try {
    const res = await fetch('/api/sms/send-invitations-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guestIds: withPhone.map(g => g.id) })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (progressText) progressText.innerHTML = `<span style="color: #2ecc71;">✅ SMS zote ${data.totalSent} zimetumwa kwa mafanikio makubwa!</span>`;
      alert(`🎉 ${data.message}`);
      closeModal('bulk-invitation-modal');
      await loadSmsLogs();
      await loadGuests();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikufanikiwa kutuma SMS za mkupuo'}`);
    }
  } catch (e) {
    console.error(e);
    alert('Hitilafu ya mtandao wakati wa kutuma SMS');
  } finally {
    if (btn) btn.disabled = false;
    if (progressWrap) progressWrap.style.display = 'none';
  }
}

function selectWaMsgTab(tabNum) {
  const tabs = document.querySelectorAll('.wa-msg-tab');
  tabs.forEach((t, idx) => {
    if (idx + 1 === tabNum) t.classList.add('active');
    else t.classList.remove('active');
  });

  const panels = [1, 2, 3];
  panels.forEach(num => {
    const p = document.getElementById(`wa-panel-${num}`);
    if (p) {
      if (num === tabNum) p.classList.add('active');
      else p.classList.remove('active');
    }
  });
}

function sendWhatsAppDirect(tabNum) {
  if (!activeSendoffGuest) return;
  const textarea = document.getElementById(`wa-text-msg-${tabNum}`);
  if (!textarea) return;
  openWhatsAppWindow(activeSendoffGuest.phone, textarea.value);
}

function copyWaText(tabNum) {
  const textarea = document.getElementById(`wa-text-msg-${tabNum}`);
  if (!textarea) return;
  navigator.clipboard.writeText(textarea.value).then(() => {
    alert(`✅ Ujumbe wa ${tabNum} umenakiliwa kikamilifu! Sasa unaweza kupaste kwenye WhatsApp.`);
  }).catch(() => {
    alert('Tafadhali chagua na kunakili ujumbe uliopo kwenye sanduku.');
  });
}

async function renderSendoffCardCanvas(guest, table) {
  const canvas = document.getElementById('sendoff-card-canvas');
  const imgPreview = document.getElementById('sendoff-card-img-preview');
  const spinner = document.getElementById('card-generating-spinner');

  if (!canvas || !imgPreview) return;

  if (spinner) spinner.style.display = 'block';
  imgPreview.style.display = 'none';

  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1440;
  canvas.width = W;
  canvas.height = H;

  // 1. Background Luxury Emerald Radial Gradient
  const bgGrad = ctx.createRadialGradient(W / 2, 360, 80, W / 2, H / 2, 900);
  bgGrad.addColorStop(0, '#0f3825');
  bgGrad.addColorStop(0.4, '#082518');
  bgGrad.addColorStop(0.85, '#04150e');
  bgGrad.addColorStop(1, '#020b07');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Subtle Golden Star Dust / Bokeh
  ctx.fillStyle = 'rgba(249, 231, 159, 0.25)';
  const starSeeds = [
    [100, 150, 2], [220, 90, 3], [350, 180, 2], [750, 110, 3], [920, 190, 2],
    [80, 420, 3], [980, 380, 2], [140, 720, 2], [960, 700, 3], [120, 1050, 3],
    [940, 1020, 2], [200, 1340, 2], [450, 1380, 3], [700, 1350, 2], [880, 1320, 3]
  ];
  starSeeds.forEach(([sx, sy, sr]) => {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  });

  // 3. Luxury Double Gold Borders
  ctx.save();
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  // Ornamental Corner Flourishes
  const cornerSize = 40;
  const drawCorner = (x, y, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * cornerSize);
    ctx.lineTo(x, y);
    ctx.lineTo(x + dx * cornerSize, y);
    ctx.strokeStyle = '#fae19c';
    ctx.lineWidth = 3;
    ctx.stroke();
    // small diamond
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(x + dx * 16, y + dy * 16, 4, 0, Math.PI * 2);
    ctx.fill();
  };
  drawCorner(56, 56, 1, 1);
  drawCorner(W - 56, 56, -1, 1);
  drawCorner(56, H - 56, 1, -1);
  drawCorner(W - 56, H - 56, -1, -1);
  ctx.restore();

  // 4. Header Text
  ctx.textAlign = 'center';

  // Small emblem
  ctx.font = '32px serif';
  ctx.fillText('💍', W / 2, 105);

  ctx.fillStyle = '#a7f3d0';
  ctx.font = '600 21px "Outfit", sans-serif';
  const canvasFam = (eventDetails?.familyName || 'FAMILIA YA MZEE MARCUS NYAHENDE').toUpperCase();
  ctx.fillText(canvasFam, W / 2, 140);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '400 17px "Outfit", sans-serif';
  ctx.fillText('KWA HESHIMA INAKUALIKA KWENYE USIKU WA', W / 2, 172);

  // Big Gold Title
  ctx.save();
  ctx.shadowColor = 'rgba(212, 175, 55, 0.6)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#fae19c';
  ctx.font = 'bold 58px "Playfair Display", "Cinzel", serif';
  ctx.fillText(`SEND-OFF YA ${(eventDetails?.brideName || 'Lilian').toUpperCase()}`, W / 2, 242);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 26px "Playfair Display", serif';
  ctx.fillText('A Night of Celebration, Love & Elegance', W / 2, 288);

  ctx.fillStyle = '#d4af37';
  ctx.font = '18px serif';
  ctx.fillText('─────── ◆ ───────', W / 2, 320);

  // 5. Load & Draw Bride Photo (Lilian)
  await new Promise(resolve => {
    const brideImg = new Image();
    brideImg.crossOrigin = 'anonymous';
    brideImg.src = eventDetails?.bridePhoto || '/images/lilian_sendoff.jpg';
    brideImg.onload = () => {
      const px = W / 2;
      const py = 490;
      const pr = 145; // radius

      // Glow behind circle
      ctx.save();
      ctx.shadowColor = 'rgba(212, 175, 55, 0.5)';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(px, py, pr + 6, 0, Math.PI * 2);
      ctx.fillStyle = '#d4af37';
      ctx.fill();
      ctx.restore();

      // Circle clipping
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(brideImg, px - pr, py - pr, pr * 2, pr * 2);
      ctx.restore();

      // Gold braided ring
      ctx.save();
      ctx.strokeStyle = '#fae19c';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Ribbon badge under photo
      ctx.save();
      ctx.fillStyle = '#d4af37';
      const rw = 260;
      const rh = 34;
      const rx = W / 2 - rw / 2;
      const ry = py + pr - 14;
      ctx.beginPath();
      ctx.roundRect(rx, ry, rw, rh, 17);
      ctx.fill();

      ctx.fillStyle = '#051910';
      ctx.font = 'bold 15px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BIBI HARUSI MTARAJIWA', W / 2, ry + 22);
      ctx.restore();

      resolve();
    };
    brideImg.onerror = () => resolve();
  });

  // 6. Personalized Guest Box
  const gBoxX = 110;
  const gBoxY = 690;
  const gBoxW = 860;
  const gBoxH = 370;

  ctx.save();
  ctx.fillStyle = 'rgba(3, 18, 12, 0.72)';
  ctx.beginPath();
  ctx.roundRect(gBoxX, gBoxY, gBoxW, gBoxH, 20);
  ctx.fill();

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // "MWALIKO MAALUMU KWA"
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 17px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MWALIKO MAALUMU KWA:', W / 2, gBoxY + 45);

  // Guest Name (Big, Elegant)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px "Playfair Display", serif';
  ctx.fillText(guest.name, W / 2, gBoxY + 98);

  if (guest.title) {
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '400 20px "Outfit", sans-serif';
    ctx.fillText(guest.title, W / 2, gBoxY + 130);
  }

  // Single Centered Badge: Mwaliko (Single / Double)
  const badgeY = guest.title ? gBoxY + 155 : gBoxY + 135;
  const bW = 380;
  const bH = 50;

  ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - bW / 2, badgeY, bW, bH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#fae19c';
  ctx.font = 'bold 20px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  const canvasSeatLabel = Number(guest.seats) === 2 ? 'DOUBLE' : (Number(guest.seats) === 1 ? 'SINGLE' : `WATU ${guest.seats}`);
  ctx.fillText(`🎟️ MWALIKO: ${canvasSeatLabel}`, W / 2, badgeY + 32);

  // Event Details Inside Box
  const detY = badgeY + 85;
  ctx.fillStyle = '#fae19c';
  ctx.font = 'bold 24px "Outfit", sans-serif';
  let canvasDateStr = '13 OKTOBA 2026';
  if (eventDetails?.weddingDate) {
    const d = new Date(eventDetails.weddingDate);
    const months = ['JANUARI', 'FEBRUARI', 'MACHI', 'APRILI', 'MEI', 'JUNI', 'JULAI', 'AGOSTI', 'SEPTEMBA', 'OKTOBA', 'NOVEMBA', 'DESEMBA'];
    canvasDateStr = `${d.getDate()} ${months[d.getMonth()] || 'OKTOBA'} ${d.getFullYear()}`;
  }
  const canvasTimeStr = (eventDetails?.receptionTime || 'Saa 12:30 Jioni').toUpperCase();
  ctx.fillText(`📅 ${canvasDateStr}  •  ⏰ ${canvasTimeStr}`, W / 2, detY);

  ctx.fillStyle = '#ffffff';
  ctx.font = '500 21px "Outfit", sans-serif';
  const canvasVenueStr = (eventDetails?.receptionVenue || 'Bragging Social Hall, Goba, Dar es Salaam').toUpperCase();
  ctx.fillText(`🏛️ ${canvasVenueStr}`, W / 2, detY + 36);

  ctx.restore();

  // 7. Bottom Section: Dress code & QR Code
  // Left side: Dress code & Quote
  ctx.textAlign = 'left';
  ctx.fillStyle = '#d4af37';
  ctx.font = 'bold 20px "Outfit", sans-serif';
  ctx.fillText('👗 RANGI ZA SHEREHE (DRESS CODE):', 110, 1145);

  ctx.fillStyle = '#ffffff';
  ctx.font = '600 24px "Outfit", sans-serif';
  const canvasDressStr = eventDetails?.themeColor || eventDetails?.dressCode || 'Emerald Green & Touch of Gold';
  ctx.fillText(canvasDressStr, 110, 1180);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'italic 21px "Playfair Display", serif';
  ctx.fillText('✨ "Uwepo wako utaleta nakshi na furaha tele!"', 110, 1225);

  // Dedicated 4-Digit Security Pass Code Box on Left
  ctx.save();
  ctx.fillStyle = 'rgba(212, 175, 55, 0.15)';
  ctx.beginPath();
  ctx.roundRect(110, 1255, 480, 75, 14);
  ctx.fill();

  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#fae19c';
  ctx.font = 'bold 15px "Outfit", sans-serif';
  ctx.fillText('🔑 KODI YA KUINGILIA MLANGONI:', 130, 1282);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 34px monospace';
  ctx.fillText(`${guest.code || '4829'}`, 130, 1318);

  ctx.fillStyle = 'rgba(250, 225, 156, 0.9)';
  ctx.font = 'bold 18px "Outfit", sans-serif';
  ctx.fillText(`• Namba ya Mgeni: #${guest.id}`, 275, 1314);
  ctx.restore();

  // Right side: QR Code Box
  await new Promise(resolve => {
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = `/api/qr/${guest.id}`;
    qrImg.onload = () => {
      const qx = 750;
      const qy = 1100;
      const qs = 220;

      // White frame
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(qx, qy, qs, qs, 16);
      ctx.fill();

      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw QR
      ctx.drawImage(qrImg, qx + 12, qy + 12, qs - 24, qs - 24);
      ctx.restore();

      // Label below QR
      ctx.fillStyle = '#fae19c';
      ctx.font = 'bold 16px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`PASS: ${guest.code || '4829'}`, qx + qs / 2, qy + qs + 26);

      resolve();
    };
    qrImg.onerror = () => resolve();
  });

  // Finished rendering! Convert canvas to preview image
  canvas.toBlob(blob => {
    currentCardBlob = blob;
    const url = URL.createObjectURL(blob);
    imgPreview.src = url;
    if (spinner) spinner.style.display = 'none';
    imgPreview.style.display = 'block';
  }, 'image/png');
}

function downloadSendoffCard() {
  if (!currentCardBlob || !activeSendoffGuest) return;
  const link = document.createElement('a');
  link.download = `Kadi_Sendoff_${(eventDetails?.brideName || 'Lilian')}_${activeSendoffGuest.id}_${activeSendoffGuest.name.replace(/\s+/g, '_')}.png`;
  link.href = URL.createObjectURL(currentCardBlob);
  link.click();
}

async function copySendoffCardImage() {
  if (!currentCardBlob) {
    alert('Kadi inatengenezwa, tafadhali subiri sekunde chache...');
    return;
  }
  try {
    const item = new ClipboardItem({ 'image/png': currentCardBlob });
    await navigator.clipboard.write([item]);
    const btn = document.getElementById('btn-copy-card-img');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '✅ Picha Imenakiliwa!';
      setTimeout(() => { btn.innerHTML = orig; }, 3000);
    }
    alert('✅ Picha ya Kadi imenakiliwa kikamilifu!\n\nSasa fungua WhatsApp Web kwenye mazungumzo ya mgeni huyu na ubonyeze Ctrl+V kupaste picha ya kadi mara moja.');
  } catch (err) {
    console.error('Clipboard error:', err);
    downloadSendoffCard();
    alert('Picha imepakuliwa kwenye kifaa chako. Unaweza kuiweka moja kwa moja kwenye WhatsApp!');
  }
}

// 2. Vikumbusho vya Michango x 5
let activeReminderGuest = null;

function openReminderModal(guestId) {
  const guest = allGuests.find(g => g.id === guestId);
  if (!guest) return;

  activeReminderGuest = guest;
  document.getElementById('reminder-guest-name').textContent = guest.name;
  document.getElementById('reminder-pledge-info').textContent = 
    `Ahadi: Tsh ${Number(guest.pledgeAmount).toLocaleString()} | Baki: Tsh ${(Number(guest.pledgeAmount) - Number(guest.paidAmount)).toLocaleString()}`;

  selectReminderStage(1);
  document.getElementById('reminder-modal').classList.add('active');
}

function selectReminderStage(stageNum) {
  if (!activeReminderGuest) return;

  const g = activeReminderGuest;
  const balance = (Number(g.pledgeAmount) - Number(g.paidAmount)).toLocaleString();
  const paid = Number(g.paidAmount).toLocaleString();
  const pledge = Number(g.pledgeAmount).toLocaleString();
  const groom = eventDetails.groomName || 'James';
  const bride = eventDetails.brideName || 'Lilian';

  let msg = '';
  switch (stageNum) {
    case 1:
      msg = `Habari ${g.name}, naomba ushiriki katika maandalizi ya Sendoff ya Lilian Marcus Nyahende itakayofanyika 13/10/2026 Dar es Salaam.\nMchango wako ni muhimu sana.\n\nMchango utumwe kwa:\n0713980004 Mixx Peter Nyahende\n0716553494 Beatrice Kavita\n0132009296900 CRDB Beatrice Kavita\n8869724 M Pesa Lilian Sendoff\n\nTutashukuru tukipata mchango kabla ya 30 Sept 2026. Asante kwa upendo.\nMungu akubariki.\nhttps://lilian.nyisu.com`;
      break;
    case 2:
      msg = `Habari Ndugu *${g.name}*,\n\nKamati ya harusi ya *${groom} & ${bride}* inapenda kukujulisha kuwa maandalizi yanaendelea vizuri sana. Tunatambua mchango wako uliokwishatoa wa *Tsh ${paid}*.\n\nSalio lako lililobaki ni *Tsh ${balance}*. Tunashukuru sana kwa ushirikiano wako wa dhati!`;
      break;
    case 3:
      msg = `Habari Ndugu *${g.name}*,\n\nTunapenda kukukumbusha kuwa wiki hii tuna kikao muhimu cha kamati cha kupokea na kujumuisha michango ya harusi ya *${groom} & ${bride}*.\n\nTafadhali kamilisha salio lako la *Tsh ${balance}* ili liweze kuingizwa kwenye ripoti ya kikao hiki. Asante sana kwa mshikamano wako!`;
      break;
    case 4:
      msg = `Ndugu *${g.name}* Mpendwa,\n\nZimebaki siku chache kabla ya kufunga mahesabu ya huduma muhimu za harusi ya *${groom} & ${bride}* (Ukumbi, Vyakula na Vinywaji).\n\nTunaomba ukamilishe salio lako la *Tsh ${balance}* ili kurahisisha upangaji wa kadi na meza kwa wakati. Tunathamini sana mchango wako!`;
      break;
    case 5:
      msg = `MUHIMU: Ndugu *${g.name}*,\n\nKadi za mwaliko na upangaji wa meza za harusi ya *${groom} & ${bride}* unakamilishwa leo rasmi. Ili kadi yako ya VIP na namba yako ya meza vitoke kwenye mfumo, tunaomba ukamilishe salio lako la mwisho la *Tsh ${balance}*.\n\nAhsante sana kwa kuwa sehemu ya kufanikisha siku hii ya baraka!`;
      break;
  }

  document.getElementById('reminder-message-preview').value = msg;
  
  // Update stage tabs style
  document.querySelectorAll('.reminder-stage-btn').forEach(btn => {
    if (parseInt(btn.dataset.stage, 10) === stageNum) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function sendSelectedReminder() {
  if (!activeReminderGuest) return;
  const text = document.getElementById('reminder-message-preview').value;
  
  // Increment reminder count on server
  fetch(`/api/guests/${activeReminderGuest.id}/remind`, { method: 'POST' });
  activeReminderGuest.reminderCount = (activeReminderGuest.reminderCount || 0) + 1;
  renderPledgesTable(allGuests);

  openWhatsAppWindow(activeReminderGuest.phone, text);
  closeModal('reminder-modal');
}

// 3. Ripoti ya Kamati ya Kutuma WhatsApp (Summary Report)
function generateWhatsAppReport() {
  fetch('/api/stats')
    .then(r => r.json())
    .then(s => {
      const today = new Date().toLocaleDateString('sw-TZ', { day: 'numeric', month: 'long', year: 'numeric' });
      const f = s.financials;

      const reportText = 
`💍 *RIPOTI YA KAMATI YA HARUSI YA ${eventDetails.groomName?.toUpperCase()} & ${eventDetails.brideName?.toUpperCase()}* 💍
📅 *Tarehe ya Ripoti:* ${today}
🏷️ *Kifurushi:* ${eventDetails.package || 'NYAHENDE VIP'}

👥 *TAKWIMU ZA WAALIKWA NA VITI:*
• Jumla ya Waalikwa: ${s.totalGuests} (${s.totalSeatsAllocated} Viti Vimetengwa)
• Walio Kamilisha Ahadi (100%): ${s.completedCount || 0} Waalikwa
• Wanaodaiwa Salio: ${s.debtorsCount || 0} Waalikwa (Baki: Tsh ${(s.totalDebtorsBalance || 0).toLocaleString()} Inadaiwa)

💰 *MICHANGO NA AHADI (FINANCIALS):*
• Lengo la Ahadi: Tsh ${f.totalPledges.toLocaleString()}
• Zilizolipwa: Tsh ${f.totalPaid.toLocaleString()} (${f.percentagePaid}%)
• Salio Lililobaki: Tsh ${f.totalBalance.toLocaleString()}

📍 *UKUMBI & RATIBA:*
• ${eventDetails.receptionVenue}
• Saa: ${eventDetails.receptionTime}

_Imetolewa kiotomatiki kupitia Mfumo wa Kidijitali wa Nyahende Smart Invitations_`;

      document.getElementById('whatsapp-report-output').textContent = reportText;
    });
}

function copyWhatsAppReport() {
  const text = document.getElementById('whatsapp-report-output').textContent;
  navigator.clipboard.writeText(text).then(() => {
    alert('✅ Ripoti ya Kamati imenakiliwa kikamilifu! Sasa unaweza kuipaste moja kwa moja kwenye Group la WhatsApp la Kamati.');
  }).catch(() => {
    alert('Tafadhali nakili maandishi yaliyopo hapo juu.');
  });
}

// -------------------------------------------------------------
// Guest CRUD Operations
// -------------------------------------------------------------
function openAddGuestModal() {
  currentEditingGuestId = null;
  document.getElementById('modal-guest-title').textContent = 'Ongeza Mualikwa Mpya';
  document.getElementById('guest-form').reset();
  document.getElementById('guest-modal').classList.add('active');
}

function openEditGuestModal(id) {
  const guest = allGuests.find(g => g.id === id);
  if (!guest) return;

  currentEditingGuestId = id;
  document.getElementById('modal-guest-title').textContent = `Hariri Mualikwa: ${guest.name}`;
  
  setInputValue('guest-input-name', guest.name);
  setInputValue('guest-input-title', guest.title);
  setInputValue('guest-input-phone', guest.phone);
  setInputValue('guest-input-seats', guest.seats);
  setInputValue('guest-table-select', guest.tableId);
  setInputValue('guest-input-pledge', guest.pledgeAmount);
  setInputValue('guest-input-paid', guest.paidAmount);

  document.getElementById('guest-modal').classList.add('active');
}

async function handleSaveGuest(e) {
  e.preventDefault();

  const payload = {
    name: document.getElementById('guest-input-name').value,
    title: document.getElementById('guest-input-title').value,
    phone: document.getElementById('guest-input-phone').value,
    committeeMember: 'Kamati ya Harusi',
    seats: parseInt(document.getElementById('guest-input-seats').value, 10),
    tableId: document.getElementById('guest-table-select').value,
    pledgeAmount: parseInt(document.getElementById('guest-input-pledge').value, 10) || 0,
    paidAmount: parseInt(document.getElementById('guest-input-paid').value, 10) || 0
  };

  try {
    let res;
    if (currentEditingGuestId) {
      res = await fetch(`/api/guests/${currentEditingGuestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (res.ok) {
      closeModal('guest-modal');
      await initDashboard();
    } else {
      alert('Hitilafu katika kuhifadhi mualikwa');
    }
  } catch (err) {
    console.error(err);
    alert('Hitilafu ya mtandao');
  }
}

async function deleteGuest(id) {
  if (!confirm(`Una uhakika unataka kumfuta mualikwa ${id}?`)) return;

  try {
    const res = await fetch(`/api/guests/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await initDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

// Payment Recording Modal
let activePaymentGuest = null;

function openPaymentModal(guestId) {
  const guest = allGuests.find(g => g.id === guestId);
  if (!guest) return;

  activePaymentGuest = guest;
  const pledge = Number(guest.pledgeAmount) || 0;
  const paid = Number(guest.paidAmount) || 0;
  const balance = pledge - paid;

  document.getElementById('pay-guest-name').textContent = guest.name;
  document.getElementById('pay-current-paid').textContent = `Tsh ${paid.toLocaleString('sw-TZ')}`;
  document.getElementById('pay-pledge').textContent = `Tsh ${pledge.toLocaleString('sw-TZ')}`;
  document.getElementById('pay-calc-current-bal').textContent = `Tsh ${balance > 0 ? balance.toLocaleString('sw-TZ') : 0}`;
  document.getElementById('pay-amount-input').value = '';
  document.getElementById('pay-send-sms-checkbox').checked = true;

  updatePaymentPreview();
  document.getElementById('payment-modal').classList.add('active');
}

function updatePaymentPreview() {
  if (!activePaymentGuest) return;

  const pledge = Number(activePaymentGuest.pledgeAmount) || 0;
  const paid = Number(activePaymentGuest.paidAmount) || 0;
  const inputAmount = parseInt(document.getElementById('pay-amount-input').value, 10) || 0;

  const newTotalPaid = paid + inputAmount;
  const newBalance = pledge - newTotalPaid;

  const newBalEl = document.getElementById('pay-calc-new-bal');
  const badgeWrap = document.getElementById('pay-sms-badge-wrap');
  const previewText = document.getElementById('pay-sms-preview-text');

  if (newBalEl) {
    newBalEl.textContent = `Tsh ${(newBalance > 0 ? newBalance : 0).toLocaleString('sw-TZ')}`;
    newBalEl.style.color = newBalance <= 0 ? '#2ecc71' : '#f39c12';
  }

  const couple = `${eventDetails.groomName || 'James'} & ${eventDetails.brideName || 'Lilian'}`;

  if (inputAmount <= 0) {
    if (previewText) previewText.textContent = 'Weka kiasi hapo juu kuona SMS itakayotumwa kiotomatiki...';
    if (badgeWrap) badgeWrap.innerHTML = `<span class="badge badge-gold">Inasubiri Kiasi</span>`;
    return;
  }

  const guestFirstName = getClientFirstName(activePaymentGuest.name);
  const domain = 'lilian.nyisu.com';

  if (newBalance <= 0 && pledge > 0) {
    // Completed
    if (badgeWrap) {
      badgeWrap.innerHTML = `<span class="badge badge-success">🎉 SMS ya Shukrani (1 SMS)</span>`;
    }
    if (previewText) {
      previewText.textContent = `Habari ${guestFirstName}, asante kwa mchango Sendoff ya Lilian Marcus. Mungu akubariki na akuongezee zaidi!\nAmen.\nKuona taarifa za harusi: https://${domain}`;
    }
  } else {
    // Partial
    if (badgeWrap) {
      badgeWrap.innerHTML = `<span class="badge badge-success">💬 SMS ya Shukrani (1 SMS)</span>`;
    }
    if (previewText) {
      previewText.textContent = `Habari ${guestFirstName}, asante kwa mchango Sendoff ya Lilian Marcus. Mungu akubariki na akuongezee zaidi!\nAmen.\nKuona taarifa za harusi: https://${domain}`;
    }
  }
}

async function handleRecordPayment(e) {
  e.preventDefault();
  if (!activePaymentGuest) return;

  const amount = parseInt(document.getElementById('pay-amount-input').value, 10) || 0;
  const sendSms = document.getElementById('pay-send-sms-checkbox').checked;
  const submitBtn = document.getElementById('pay-submit-btn');

  if (amount <= 0) {
    alert('Tafadhali weka kiasi halali cha malipo');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = 'Inasajili & Kutuma SMS...';

  try {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestId: activePaymentGuest.id,
        amount,
        sendSms
      })
    });

    const result = await res.json();
    if (res.ok) {
      alert(`✅ ${result.message}`);
      closeModal('payment-modal');
      await initDashboard();
    } else {
      alert(result.error || 'Kulitokea hitilafu wakati wa kusajili malipo.');
    }
  } catch (err) {
    console.error(err);
    alert('Hitilafu ya mtandao');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '✅ Sajili Malipo & Tuma SMS Kiotomatiki';
  }
}

// Bulk SMS Debt Reminder (Sendoff Reminder Guaranteed <= 3 SMS)
async function sendBulkDebtReminders() {
  const debtors = allGuests.filter(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    return (paid === 0 || (pledge - paid) > 0) && g.phone && g.phone.trim().length > 0;
  });
  if (debtors.length === 0) {
    alert('Hakuna mualikwa anayehitaji kikumbusho kwa sasa!');
    return;
  }

  const totalSmsUnits = debtors.length * 3;
  if (!confirm(`Je, una uhakika unataka kutuma SMS ya kikumbusho cha Sendoff ya Lilian Marcus Nyahende kwa wageni wote wasiochangia ${debtors.length}?\n\nKila mgeni atatumiwa VIPANDE 3 VYA SMS (Jumla ya SMS: ${totalSmsUnits}). Ujumbe huu umehakikishwa hauzidi SMS 3!`)) {
    return;
  }

  const btn = document.getElementById('bulk-reminder-btn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Inatuma SMS...';

  try {
    const res = await fetch('/api/sms/remind-debtors', { method: 'POST' });
    const data = await res.json();
    alert(`✅ ${data.message}`);
    await initDashboard();
  } catch (e) {
    console.error(e);
    alert('Hitilafu ya kutuma SMS');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// Single SMS Debt Reminder
async function sendSingleDebtReminderSMS(guestId) {
  const guest = allGuests.find(g => g.id === guestId);
  if (!guest) return;

  if (!confirm(`Tuma SMS ya kikumbusho cha Sendoff ya Lilian Marcus Nyahende (Vipande 3 vya SMS) kwenda kwa ${guest.name} (${guest.phone})?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/sms/remind/${guest.id}`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      await initDashboard();
    } else {
      alert(data.error || 'Hitilafu');
    }
  } catch (e) {
    console.error(e);
    alert('Hitilafu ya mtandao');
  }
}

// Load SMS Logs
async function loadSmsLogs() {
  try {
    const res = await fetch('/api/sms/logs');
    const logs = await res.json();
    renderSmsLogs(logs);
  } catch (err) {
    console.error('Error loading SMS logs:', err);
  }
}

function renderSmsLogs(logs) {
  const tbody = document.getElementById('sms-logs-table-body');
  if (!tbody) return;

  if (logs !== undefined) {
    paginationState.sms.data = logs;
  }
  const items = paginationState.sms.data || [];
  const total = items.length;

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px;">Bado hakuna SMS zilizotumwa.</td></tr>`;
    renderPaginationBar('pagination-sms', 0, 1, paginationState.sms.pageSize, 'setSmsPage', 'setSmsPageSize');
    return;
  }

  const totalPages = Math.ceil(total / paginationState.sms.pageSize) || 1;
  if (paginationState.sms.page > totalPages) paginationState.sms.page = totalPages;
  if (paginationState.sms.page < 1) paginationState.sms.page = 1;

  const paginated = paginateArray(items, paginationState.sms.page, paginationState.sms.pageSize);

  tbody.innerHTML = paginated.map(l => {
    const timeStr = new Date(l.timestamp).toLocaleString('sw-TZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    let typeBadge = `<span class="badge badge-gold">${escapeHtml(l.messageType)}</span>`;
    if (l.messageType && l.messageType.includes('Kamili')) {
      typeBadge = `<span class="badge badge-success">✓ Malipo Kamili</span>`;
    } else if (l.messageType && l.messageType.includes('Awali')) {
      typeBadge = `<span class="badge badge-warning">Malipo ya Awali</span>`;
    } else if (l.messageType && l.messageType.includes('Deni')) {
      typeBadge = `<span class="badge badge-danger">Kikumbusho cha Deni</span>`;
    }

    const statusBadge = l.status === 'delivered'
      ? `<span class="badge badge-success">✓ Imetumwa</span>`
      : `<span class="badge badge-danger">Imeshindikana</span>`;

    return `
      <tr>
        <td style="white-space: nowrap; font-size: 0.8rem;">${timeStr}</td>
        <td><strong>${escapeHtml(l.recipientName || 'Mchangiaji')}</strong></td>
        <td>${escapeHtml(l.recipientPhone)}</td>
        <td>${typeBadge}</td>
        <td style="font-size: 0.82rem; max-width: 320px; line-height: 1.4;">${escapeHtml(l.messageText)}</td>
        <td>
          ${statusBadge}
          <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(l.senderId)}</div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationBar('pagination-sms', total, paginationState.sms.page, paginationState.sms.pageSize, 'setSmsPage', 'setSmsPageSize');
}

function renderSmsLogsTable() {
  renderSmsLogs();
}

// Load SMS Configuration
async function loadSmsConfig() {
  try {
    const res = await fetch('/api/sms/config');
    const config = await res.json();

    setInputValue('set-sms-username', config.username);
    setInputValue('set-sms-password', config.password);
    setInputValue('set-sms-senderid', config.senderId || 'NEXTSMS');
    setInputValue('set-sms-payment-details', config.paymentDetails);
    setInputValue('set-sms-thankyou-template', config.thankYouTemplate || '');
    setInputValue('set-sms-reminder-template', config.reminderTemplate || '');
    setInputValue('set-sms-systemurl', config.systemUrl || 'https://lilian.nyisu.com');
    updateThankYouSmsUnits();
    updateReminderSmsUnits();

    const simSelect = document.getElementById('set-sms-simulation');
    if (simSelect) {
      simSelect.value = String(config.simulationMode !== false);
    }

    const badge = document.getElementById('sms-mode-badge');
    if (badge) {
      badge.textContent = config.simulationMode ? 'Simulation (Majaribio)' : 'Live NextSMS (Halisi)';
      badge.className = config.simulationMode ? 'badge badge-gold' : 'badge badge-success';
    }
  } catch (err) {
    console.error('Error loading SMS config:', err);
  }
}

function updateThankYouSmsUnits() {
  const textarea = document.getElementById('set-sms-thankyou-template');
  const badge = document.getElementById('sms-thankyou-units-badge');
  const statusMsg = document.getElementById('sms-thankyou-status-msg');
  if (!textarea || !badge) return;

  const text = textarea.value || '';
  const sampleText = text.replace('{name}', 'Peter');
  const charCount = sampleText.length;
  
  if (charCount <= 160) {
    badge.className = 'badge badge-success';
    badge.textContent = `1 SMS (Herufi ~${charCount} / 160)`;
    if (statusMsg) {
      statusMsg.style.color = '#2ecc71';
      statusMsg.textContent = `✓ Haitazidi SMS 1 (SMS 1)`;
    }
  } else {
    const parts = Math.ceil(charCount / 153);
    badge.className = 'badge badge-danger';
    badge.textContent = `⚠️ ${parts} SMS (Herufi ~${charCount} - Zaidi ya 160!)`;
    if (statusMsg) {
      statusMsg.style.color = '#e74c3c';
      statusMsg.textContent = `⚠️ Tahadhari: Ujumbe huu unazidi SMS 1!`;
    }
  }
}

function updateReminderSmsUnits() {
  const textarea = document.getElementById('set-sms-reminder-template');
  const badge = document.getElementById('sms-reminder-units-badge');
  const statusMsg = document.getElementById('sms-reminder-status-msg');
  if (!textarea || !badge) return;

  const text = textarea.value || '';
  const sampleText = text.replace('{name}', 'Mr & Mrs Bright Nyahende');
  const charCountWithBreaks = sampleText.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').length;
  
  let parts = 1;
  if (charCountWithBreaks > 160) {
    parts = Math.ceil(charCountWithBreaks / 153);
  }

  if (parts <= 3) {
    badge.className = 'badge badge-success';
    badge.textContent = `${parts} SMS (Herufi ~${charCountWithBreaks} / 459)`;
    if (statusMsg) {
      statusMsg.style.color = '#2ecc71';
      statusMsg.textContent = `✓ Haitazidi SMS 3 (Sasa: SMS ${parts})`;
    }
  } else {
    badge.className = 'badge badge-danger';
    badge.textContent = `⚠️ ${parts} SMS (Herufi ~${charCountWithBreaks} / 459)`;
    if (statusMsg) {
      statusMsg.style.color = '#e74c3c';
      statusMsg.textContent = `⚠️ Tahadhari: Ujumbe huu unazidi SMS 3!`;
    }
  }
}

// Load WhatsApp Automated Configuration
async function loadWhatsAppConfig() {
  try {
    const res = await fetch('/api/whatsapp/config');
    const config = await res.json();

    const provSelect = document.getElementById('set-wa-provider');
    if (provSelect && config.provider) provSelect.value = config.provider;

    const simSelect = document.getElementById('set-wa-simulation');
    if (simSelect) simSelect.value = String(config.simulationMode !== false);

    setInputValue('set-wa-instance', config.instanceId);
    setInputValue('set-wa-token', config.apiKey);
  } catch (err) {
    console.error('Error loading WhatsApp config:', err);
  }
}

// -------------------------------------------------------------
// Sidebar Toggle Helper for Mobile & Responsiveness
// -------------------------------------------------------------
function toggleSidebar(forceState) {
  const sidebar = document.getElementById('admin-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;

  const isOpen = forceState !== undefined ? forceState : !sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// -------------------------------------------------------------
// Tabs & Event Listeners
// -------------------------------------------------------------
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.target);
      if (targetPanel) targetPanel.classList.add('active');

      const activeTitle = btn.dataset.title || btn.textContent.trim();
      const topbarTitle = document.getElementById('topbar-active-title');
      if (topbarTitle) topbarTitle.textContent = activeTitle;

      // Close mobile sidebar after clicking tab
      if (window.innerWidth <= 1024) {
        toggleSidebar(false);
      }

      if (btn.dataset.target === 'tab-dashboard') {
        renderDashboardOverview();
      } else if (btn.dataset.target === 'tab-sms') {
        loadSmsLogs();
      } else if (btn.dataset.target === 'tab-finance-report') {
        renderFinancialReportView();
      } else if (btn.dataset.target === 'tab-drinks') {
        loadDrinksAdmin();
      } else if (btn.dataset.target === 'tab-gallery') {
        loadGalleryImages();
      } else if (btn.dataset.target === 'tab-orders') {
        loadDrinkOrders();
      }
    });
  });
}

function applyGuestFilters() {
  const q = (document.getElementById('search-guests-input')?.value || '').toLowerCase();
  const status = document.getElementById('filter-guest-status-select')?.value || 'all';

  const filtered = allGuests.filter(g => {
    const matchesQuery = !q || 
      (g.name && g.name.toLowerCase().includes(q)) || 
      (g.phone && g.phone.includes(q)) || 
      (g.id && String(g.id).toLowerCase().includes(q)) ||
      (g.code && String(g.code).toLowerCase().includes(q));
    
    let matchesStatus = true;
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;

    if (status === 'completed') {
      matchesStatus = (pledge > 0 && balance <= 0) || (paid > 0 && balance <= 0);
    } else if (status === 'debtors') {
      matchesStatus = balance > 0;
    } else if (status === 'unpaid') {
      matchesStatus = paid === 0;
    }

    return matchesQuery && matchesStatus;
  });

  paginationState.guests.page = 1;
  renderGuestTable(filtered);
}

function applyPledgesFilters() {
  const q = (document.getElementById('search-pledges-input')?.value || '').toLowerCase();
  const status = document.getElementById('filter-pledges-status-select')?.value || 'all';

  const filtered = allGuests.filter(g => {
    const matchesQuery = !q || 
      (g.name && g.name.toLowerCase().includes(q)) || 
      (g.phone && g.phone.includes(q)) || 
      (g.id && String(g.id).toLowerCase().includes(q));
    
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;

    let matchesStatus = true;
    if (status === 'completed') {
      matchesStatus = (pledge > 0 && balance <= 0) || (paid > 0 && balance <= 0);
    } else if (status === 'partial') {
      matchesStatus = paid > 0 && balance > 0;
    } else if (status === 'unpaid') {
      matchesStatus = paid === 0;
    } else if (status === 'debtors') {
      matchesStatus = balance > 0;
    }

    return matchesQuery && matchesStatus;
  });

  paginationState.pledges.page = 1;
  renderPledgesTable(filtered);
}

function setupEventListeners() {
  // Search guests & Filters
  const searchInput = document.getElementById('search-guests-input');
  if (searchInput) searchInput.addEventListener('input', applyGuestFilters);

  const statusFilter = document.getElementById('filter-guest-status-select');
  if (statusFilter) statusFilter.addEventListener('change', applyGuestFilters);

  // Search pledges & Filters
  const searchPledgesInput = document.getElementById('search-pledges-input');
  if (searchPledgesInput) searchPledgesInput.addEventListener('input', applyPledgesFilters);

  const statusPledgesFilter = document.getElementById('filter-pledges-status-select');
  if (statusPledgesFilter) statusPledgesFilter.addEventListener('change', applyPledgesFilters);

  // Forms
  const guestForm = document.getElementById('guest-form');
  if (guestForm) guestForm.addEventListener('submit', handleSaveGuest);

  const payForm = document.getElementById('payment-form');
  if (payForm) payForm.addEventListener('submit', handleRecordPayment);

  // NextSMS Config Form
  const smsConfigForm = document.getElementById('sms-config-form');
  if (smsConfigForm) {
    smsConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        username: document.getElementById('set-sms-username').value.trim(),
        password: document.getElementById('set-sms-password').value.trim(),
        senderId: document.getElementById('set-sms-senderid').value.trim() || 'NEXTSMS',
        simulationMode: document.getElementById('set-sms-simulation').value === 'true',
        paymentDetails: document.getElementById('set-sms-payment-details').value.trim(),
        thankYouTemplate: document.getElementById('set-sms-thankyou-template') ? document.getElementById('set-sms-thankyou-template').value : '',
        reminderTemplate: document.getElementById('set-sms-reminder-template') ? document.getElementById('set-sms-reminder-template').value : '',
        systemUrl: document.getElementById('set-sms-systemurl').value.trim() || 'https://lilian.nyisu.com',
        domainName: 'lilian.nyisu.com'
      };

      try {
        const res = await fetch('/api/sms/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          alert('✅ Mipangilio ya NextSMS imehifadhiwa kikamilifu!');
          await loadSmsConfig();
        } else {
          alert(data.error || 'Hitilafu');
        }
      } catch (err) {
        console.error(err);
        alert('Hitilafu ya mtandao');
      }
    });

    const thankyouTemplateInput = document.getElementById('set-sms-thankyou-template');
    if (thankyouTemplateInput) {
      thankyouTemplateInput.addEventListener('input', updateThankYouSmsUnits);
    }

    const reminderTemplateInput = document.getElementById('set-sms-reminder-template');
    if (reminderTemplateInput) {
      reminderTemplateInput.addEventListener('input', updateReminderSmsUnits);
    }
  }

  // WhatsApp Automated Config Form
  const waConfigForm = document.getElementById('whatsapp-config-form');
  if (waConfigForm) {
    waConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        provider: document.getElementById('set-wa-provider').value,
        simulationMode: document.getElementById('set-wa-simulation').value === 'true',
        instanceId: document.getElementById('set-wa-instance').value.trim(),
        apiKey: document.getElementById('set-wa-token').value.trim(),
        systemUrl: document.getElementById('set-sms-systemurl')?.value.trim() || window.location.origin
      };

      try {
        const res = await fetch('/api/whatsapp/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok) {
          alert('✅ Mipangilio ya WhatsApp ya Kiotomatiki imehifadhiwa kikamilifu!');
          await loadWhatsAppConfig();
        } else {
          alert(data.error || 'Hitilafu');
        }
      } catch (err) {
        console.error(err);
        alert('Hitilafu ya mtandao');
      }
    });
  }

  // Settings form
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        groomName: document.getElementById('set-groom-name').value,
        groomFullName: document.getElementById('set-groom-fullname').value,
        brideName: document.getElementById('set-bride-name').value,
        brideFullName: document.getElementById('set-bride-fullname').value,
        weddingDate: document.getElementById('set-wedding-date').value,
        churchVenue: document.getElementById('set-church-venue').value,
        receptionVenue: document.getElementById('set-reception-venue').value,
        googleMapsUrl: document.getElementById('set-maps-url').value,
        youtubeLiveUrl: document.getElementById('set-youtube-url').value,
        pictureGalleryUrl: document.getElementById('set-gallery-url').value
      };

      const res = await fetch('/api/event', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('✅ Mipangilio ya harusi imesasishwa kikamilifu!');
        await loadEventData();
      }
    });
  }
}

function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

// -------------------------------------------------------------
// Table Management Operations (CRUD)
// -------------------------------------------------------------
function openAddTableModal() {
  const title = document.getElementById('table-modal-title');
  const editId = document.getElementById('table-edit-id');
  const nameInput = document.getElementById('table-input-name');
  const capInput = document.getElementById('table-input-capacity');
  const notesInput = document.getElementById('table-input-notes');

  if (title) title.textContent = '➕ Ongeza Meza Mpya';
  if (editId) editId.value = '';
  if (nameInput) nameInput.value = '';
  if (capInput) capInput.value = '10';
  if (notesInput) notesInput.value = '';

  openModal('table-modal');
  if (nameInput) setTimeout(() => nameInput.focus(), 150);
}

function openEditTableModal(tableId) {
  const table = (allTables || []).find(t => String(t.id) === String(tableId));
  if (!table) return;

  const title = document.getElementById('table-modal-title');
  const editId = document.getElementById('table-edit-id');
  const nameInput = document.getElementById('table-input-name');
  const capInput = document.getElementById('table-input-capacity');
  const notesInput = document.getElementById('table-input-notes');

  if (title) title.textContent = `✏️ Hariri Meza: ${table.name}`;
  if (editId) editId.value = table.id;
  if (nameInput) nameInput.value = table.name || '';
  if (capInput) capInput.value = table.capacity || 10;
  if (notesInput) notesInput.value = table.notes || '';

  openModal('table-modal');
  if (nameInput) setTimeout(() => nameInput.focus(), 150);
}

async function handleSaveTable(e) {
  if (e) e.preventDefault();

  const editId = document.getElementById('table-edit-id')?.value;
  const name = document.getElementById('table-input-name')?.value.trim();
  const capacity = parseInt(document.getElementById('table-input-capacity')?.value, 10) || 10;
  const notes = document.getElementById('table-input-notes')?.value.trim() || '';
  const saveBtn = document.getElementById('btn-save-table');

  if (!name) {
    alert('Tafadhali weka jina la meza.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Inahifadhi meza...';
  }

  try {
    const url = editId ? `/api/tables/${editId}` : '/api/tables';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, capacity, notes })
    });

    const data = await res.json();
    if (res.ok) {
      alert(editId ? `✅ Meza "${name}" imesasishwa kikamilifu!` : `✅ Meza mpya "${name}" imeongezwa kikamilifu!`);
      closeModal('table-modal');
      await loadEventData();
      await loadGuests();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kuhifadhi meza'}`);
    }
  } catch (err) {
    console.error('Error saving table:', err);
    alert('Hitilafu ya mtandao wakati wa kuhifadhi meza.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Hifadhi Meza';
    }
  }
}

async function deleteTable(tableId) {
  const table = (allTables || []).find(t => String(t.id) === String(tableId));
  const tableName = table ? table.name : tableId;

  if (!confirm(`Je, una uhakika unataka kufuta meza hii "${tableName}"?\n\nWageni waliokuwa kwenye meza hii hawatafutwa, bali watakuwa "Hawajapangiwa meza".`)) {
    return;
  }

  try {
    const res = await fetch(`/api/tables/${tableId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`🗑️ Meza "${tableName}" imefutwa kikamilifu.`);
      await loadEventData();
      await loadGuests();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kufuta meza'}`);
    }
  } catch (err) {
    console.error('Error deleting table:', err);
    alert('Hitilafu ya mtandao wakati wa kufuta meza.');
  }
}

function openWhatsAppWindow(phone, text) {
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function getClientFirstName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Mpendwa';
  let clean = fullName.trim();
  const titles = ['mr.', 'mr', 'mrs.', 'mrs', 'dr.', 'dr', 'prof.', 'prof', 'eng.', 'eng', 'mhe.', 'mhe', 'ndugu', 'bi.', 'bi', 'mzee', 'mama', 'baba', 'mstr', 'miss', 'ms'];
  let parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Mpendwa';

  while (parts.length > 1 && (titles.includes(parts[0].toLowerCase()) || parts[0] === '&' || parts[0].toLowerCase() === 'na')) {
    parts.shift();
  }
  return parts[0] || 'Mpendwa';
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

/* ================================================================
   FINANCIAL REPORTING HUB LOGIC
   ================================================================ */

let currentFinanceFilter = 'all';

function switchTab(tabId) {
  const btn = document.querySelector(`.tab-btn[data-target="${tabId}"]`);
  if (btn) btn.click();
}

function renderFinancialReportView(filterMode) {
  if (filterMode) currentFinanceFilter = filterMode;
  if (!Array.isArray(allGuests) || allGuests.length === 0) return;

  // 1. Core Totals
  const totalPledges = allGuests.reduce((s, g) => s + (Number(g.pledgeAmount) || 0), 0);
  const totalPaid = allGuests.reduce((s, g) => s + (Number(g.paidAmount) || 0), 0);
  const totalBalance = Math.max(0, totalPledges - totalPaid);
  const percentage = totalPledges > 0 ? ((totalPaid / totalPledges) * 100).toFixed(1) : 0;
  const avgContribution = allGuests.length > 0 ? Math.round(totalPaid / allGuests.length) : 0;

  // 2. Segments
  const completedGuests = allGuests.filter(g => Number(g.pledgeAmount) > 0 && Number(g.paidAmount) >= Number(g.pledgeAmount));
  const partialGuests = allGuests.filter(g => Number(g.paidAmount) > 0 && Number(g.paidAmount) < Number(g.pledgeAmount));
  const zeroGuests = allGuests.filter(g => Number(g.paidAmount) === 0 && Number(g.pledgeAmount) > 0);

  const completedSum = completedGuests.reduce((s, g) => s + Number(g.paidAmount), 0);
  const partialPaid = partialGuests.reduce((s, g) => s + Number(g.paidAmount), 0);
  const partialBalance = partialGuests.reduce((s, g) => s + (Number(g.pledgeAmount) - Number(g.paidAmount)), 0);
  const zeroBalance = zeroGuests.reduce((s, g) => s + Number(g.pledgeAmount), 0);

  // 3. Update Hero KPIs
  const elTarget = document.getElementById('fin-hero-target');
  if (elTarget) elTarget.textContent = `Tsh ${totalPledges.toLocaleString('sw-TZ')}`;

  const elPaid = document.getElementById('fin-hero-paid');
  if (elPaid) elPaid.textContent = `Tsh ${totalPaid.toLocaleString('sw-TZ')}`;

  const elPaidSub = document.getElementById('fin-hero-paid-sub');
  if (elPaidSub) elPaidSub.textContent = `${percentage}% ya lengo kuu`;

  const elBal = document.getElementById('fin-hero-balance');
  if (elBal) elBal.textContent = `Tsh ${totalBalance.toLocaleString('sw-TZ')}`;

  const elBalSub = document.getElementById('fin-hero-balance-sub');
  if (elBalSub) elBalSub.textContent = `${(100 - Number(percentage)).toFixed(1)}% bado inasubiriwa`;

  const elAvg = document.getElementById('fin-hero-avg');
  if (elAvg) elAvg.textContent = `Tsh ${avgContribution.toLocaleString('sw-TZ')}`;

  const elProgress = document.getElementById('fin-hero-progress-bar');
  if (elProgress) elProgress.style.width = `${Math.min(percentage, 100)}%`;

  const elProgressText = document.getElementById('fin-hero-progress-text');
  if (elProgressText) elProgressText.textContent = `${percentage}% Imekusanywa`;

  const elMiniComp = document.getElementById('fin-mini-completed');
  if (elMiniComp) elMiniComp.textContent = completedGuests.length;

  const elMiniTotal = document.getElementById('fin-mini-total');
  if (elMiniTotal) elMiniTotal.textContent = allGuests.length;

  const elMiniDebtors = document.getElementById('fin-mini-debtors');
  if (elMiniDebtors) elMiniDebtors.textContent = partialGuests.length + zeroGuests.length;

  // 4. Update Segments Cards
  const elSegCompCount = document.getElementById('fin-seg-completed-count');
  if (elSegCompCount) elSegCompCount.textContent = completedGuests.length;
  const elSegCompSum = document.getElementById('fin-seg-completed-sum');
  if (elSegCompSum) elSegCompSum.textContent = `Tsh ${completedSum.toLocaleString('sw-TZ')}`;

  const elSegPartCount = document.getElementById('fin-seg-partial-count');
  if (elSegPartCount) elSegPartCount.textContent = partialGuests.length;
  const elSegPartBal = document.getElementById('fin-seg-partial-balance');
  if (elSegPartBal) elSegPartBal.textContent = `Tsh ${partialBalance.toLocaleString('sw-TZ')}`;
  const elSegPartText = document.getElementById('fin-seg-partial-paid-text');
  if (elSegPartText) elSegPartText.textContent = `Wamelipa Tsh ${partialPaid.toLocaleString('sw-TZ')}`;

  const elSegZeroCount = document.getElementById('fin-seg-zero-count');
  if (elSegZeroCount) elSegZeroCount.textContent = zeroGuests.length;
  const elSegZeroSum = document.getElementById('fin-seg-zero-sum');
  if (elSegZeroSum) elSegZeroSum.textContent = `Tsh ${zeroBalance.toLocaleString('sw-TZ')}`;

  // 5. Render Top Donors Leaderboard
  const topDonorsContainer = document.getElementById('fin-top-donors-list');
  if (topDonorsContainer) {
    const sorted = [...allGuests].sort((a, b) => (Number(b.paidAmount) || 0) - (Number(a.paidAmount) || 0)).slice(0, 5);
    topDonorsContainer.innerHTML = sorted.map((g, idx) => {
      let rankBadge = `<span class="top-donor-rank rank-other">${idx + 1}</span>`;
      if (idx === 0) rankBadge = `<span class="top-donor-rank rank-1">🥇</span>`;
      else if (idx === 1) rankBadge = `<span class="top-donor-rank rank-2">🥈</span>`;
      else if (idx === 2) rankBadge = `<span class="top-donor-rank rank-3">🥉</span>`;

      const paid = Number(g.paidAmount) || 0;
      const pledge = Number(g.pledgeAmount) || 0;
      const isDone = pledge > 0 && paid >= pledge;

      return `
        <div class="top-donor-item">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${rankBadge}
            <div>
              <div style="font-weight: 700; color: #ffffff; font-size: 0.9rem;">${escapeHtml(g.name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(g.title || 'Mchangiaji')}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: #2ecc71; font-size: 0.92rem;">Tsh ${paid.toLocaleString('sw-TZ')}</div>
            <div style="font-size: 0.72rem; color: ${isDone ? '#2ecc71' : 'var(--gold-light)'};">
              ${isDone ? '✓ Amemaliza 100%' : `Ahadi: Tsh ${pledge.toLocaleString('sw-TZ')}`}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Render Payment Audit Ledger (All Transactions Across Database)
  const allTransactions = [];
  allGuests.forEach(g => {
    if (Array.isArray(g.paymentHistory)) {
      g.paymentHistory.forEach(p => {
        allTransactions.push({
          ...p,
          guestName: g.name,
          guestPhone: g.phone,
          guestId: g.id
        });
      });
    }
  });

  allTransactions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  renderFinLedgerTable(allTransactions);

  // 7. Render Comprehensive Contributor Table
  renderContributorFinancialTable(currentFinanceFilter);

  // 8. Populate Printable Statement
  populatePrintableFinancialStatement(totalPledges, totalPaid, totalBalance, percentage);
}

function renderFinLedgerTable(transactions) {
  const ledgerContainer = document.getElementById('fin-ledger-table-body');
  const ledgerCount = document.getElementById('fin-ledger-count');
  if (!ledgerContainer) return;

  if (transactions !== undefined) {
    paginationState.finLedger.data = transactions;
  }
  const items = paginationState.finLedger.data || [];
  const total = items.length;
  if (ledgerCount) ledgerCount.textContent = total;

  if (total === 0) {
    ledgerContainer.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 20px;">Bado hakuna kumbukumbu za miamala iliyoingizwa.</td></tr>`;
    renderPaginationBar('pagination-fin-ledger', 0, 1, paginationState.finLedger.pageSize, 'setFinLedgerPage', 'setFinLedgerPageSize');
    return;
  }

  const totalPages = Math.ceil(total / paginationState.finLedger.pageSize) || 1;
  if (paginationState.finLedger.page > totalPages) paginationState.finLedger.page = totalPages;
  if (paginationState.finLedger.page < 1) paginationState.finLedger.page = 1;

  const paginated = paginateArray(items, paginationState.finLedger.page, paginationState.finLedger.pageSize);

  ledgerContainer.innerHTML = paginated.map(tx => {
    let formattedDate = 'Hivi karibuni';
    try {
      if (tx.date) {
        const d = new Date(tx.date);
        formattedDate = d.toLocaleDateString('sw-TZ', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
                        d.toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {}

    const amt = Number(tx.amount) || 0;
    const bal = Number(tx.balance) || 0;

    return `
      <tr>
        <td style="white-space: nowrap; font-size: 0.8rem; color: var(--text-secondary);">${formattedDate}</td>
        <td>
          <strong>${escapeHtml(tx.guestName)}</strong>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(tx.guestPhone || '')} (${escapeHtml(tx.guestId)})</div>
        </td>
        <td>
          <span style="font-weight: 700; color: #2ecc71; font-size: 0.95rem;">+ Tsh ${amt.toLocaleString('sw-TZ')}</span>
        </td>
        <td>
          <span style="font-weight: 600; color: ${bal === 0 ? '#2ecc71' : 'var(--gold-light)'};">
            ${bal === 0 ? '✓ Hakuna Salio' : `Tsh ${bal.toLocaleString('sw-TZ')}`}
          </span>
        </td>
        <td style="font-size: 0.82rem; color: var(--text-secondary);">
          ${escapeHtml(tx.note || tx.id || 'Malipo ya Mchango')}
        </td>
        <td>
          <span class="badge badge-success" style="font-size: 0.72rem;">✓ SMS Imetumwa</span>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationBar('pagination-fin-ledger', total, paginationState.finLedger.page, paginationState.finLedger.pageSize, 'setFinLedgerPage', 'setFinLedgerPageSize');
}

function filterFinancialTable(mode) {
  currentFinanceFilter = mode;
  paginationState.finContributors.page = 1;
  renderContributorFinancialTable(mode);
}

function renderContributorFinancialTable(filterMode) {
  const container = document.getElementById('fin-contributors-table-body');
  if (!container) return;

  const mode = filterMode || currentFinanceFilter || 'all';
  let filtered = [...allGuests];
  if (mode === 'completed') {
    filtered = allGuests.filter(g => Number(g.pledgeAmount) > 0 && Number(g.paidAmount) >= Number(g.pledgeAmount));
  } else if (mode === 'partial') {
    filtered = allGuests.filter(g => Number(g.paidAmount) > 0 && Number(g.paidAmount) < Number(g.pledgeAmount));
  } else if (mode === 'zero') {
    filtered = allGuests.filter(g => Number(g.paidAmount) === 0 && Number(g.pledgeAmount) > 0);
  }

  paginationState.finContributors.data = filtered;
  const total = filtered.length;

  if (total === 0) {
    container.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 24px; color: var(--text-muted);">Hakuna rekodi zilizopatikana kwenye kundi hili.</td></tr>`;
    renderPaginationBar('pagination-fin-contributors', 0, 1, paginationState.finContributors.pageSize, 'setFinContributorsPage', 'setFinContributorsPageSize');
    return;
  }

  const totalPages = Math.ceil(total / paginationState.finContributors.pageSize) || 1;
  if (paginationState.finContributors.page > totalPages) paginationState.finContributors.page = totalPages;
  if (paginationState.finContributors.page < 1) paginationState.finContributors.page = 1;

  const paginated = paginateArray(filtered, paginationState.finContributors.page, paginationState.finContributors.pageSize);

  container.innerHTML = paginated.map(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = Math.max(0, pledge - paid);
    const pct = pledge > 0 ? Math.min(100, Math.round((paid / pledge) * 100)) : 0;

    let statusBadge = '';
    if (balance === 0 && pledge > 0) {
      statusBadge = `<span class="badge badge-success">✓ 100% Amemaliza</span>`;
    } else if (paid > 0) {
      statusBadge = `<span class="badge badge-warning">⏳ Wanadaiwa Salio</span>`;
    } else {
      statusBadge = `<span class="badge badge-danger">⚠️ Bado Hajalipa</span>`;
    }

    return `
      <tr>
        <td><code>${escapeHtml(g.id)}</code></td>
        <td>
          <strong>${escapeHtml(g.name)}</strong>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(g.title || 'Mualikwa')}</div>
        </td>
        <td><a href="tel:${escapeHtml(g.phone)}" style="color: var(--gold-light);">${escapeHtml(g.phone)}</a></td>
        <td style="font-weight: 600;">Tsh ${pledge.toLocaleString('sw-TZ')}</td>
        <td style="font-weight: 700; color: #2ecc71;">Tsh ${paid.toLocaleString('sw-TZ')}</td>
        <td style="font-weight: 700; color: ${balance === 0 ? '#2ecc71' : '#f39c12'};">
          ${balance === 0 ? 'Tsh 0' : `Tsh ${balance.toLocaleString('sw-TZ')}`}
        </td>
        <td style="min-width: 120px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 3px;">
            <span>${pct}%</span>
          </div>
          <div class="progress-bar-wrap" style="height: 6px;">
            <div class="progress-bar-fill" style="width: ${pct}%;"></div>
          </div>
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-emerald" style="padding: 4px 8px; font-size: 0.75rem;" onclick="openPaymentModal('${g.id}')">
              💰 Lipa
            </button>
            ${balance > 0 ? `
              <button class="btn btn-sm btn-outline-gold" style="padding: 4px 8px; font-size: 0.75rem;" onclick="sendSingleDebtorSMS('${g.id}', '${escapeHtml(g.name)}', ${balance})">
                📩 SMS
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  renderPaginationBar('pagination-fin-contributors', total, paginationState.finContributors.page, paginationState.finContributors.pageSize, 'setFinContributorsPage', 'setFinContributorsPageSize');
}

function populatePrintableFinancialStatement(totalPledges, totalPaid, totalBalance, percentage) {
  const groom = eventDetails?.groomName || 'James';
  const bride = eventDetails?.brideName || 'Lilian';

  const elSub = document.getElementById('print-event-sub');
  if (elSub) {
    elSub.textContent = `KAMATI YA HARUSI YA ${groom.toUpperCase()} & ${bride.toUpperCase()} | TAREHE: ${new Date().toLocaleDateString('sw-TZ', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  }

  const elDate = document.getElementById('print-report-date');
  if (elDate) {
    elDate.textContent = new Date().toLocaleDateString('sw-TZ', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  const pTarget = document.getElementById('print-stat-target');
  if (pTarget) pTarget.textContent = `Tsh ${totalPledges.toLocaleString('sw-TZ')}`;

  const pPaid = document.getElementById('print-stat-paid');
  if (pPaid) pPaid.textContent = `Tsh ${totalPaid.toLocaleString('sw-TZ')}`;

  const pBal = document.getElementById('print-stat-balance');
  if (pBal) pBal.textContent = `Tsh ${totalBalance.toLocaleString('sw-TZ')}`;

  const pPct = document.getElementById('print-stat-percent');
  if (pPct) pPct.textContent = `${percentage}%`;

  const pTable = document.getElementById('print-table-body');
  if (pTable && Array.isArray(allGuests)) {
    pTable.innerHTML = allGuests.map((g, i) => {
      const pledge = Number(g.pledgeAmount) || 0;
      const paid = Number(g.paidAmount) || 0;
      const bal = Math.max(0, pledge - paid);
      let statusStr = bal === 0 && pledge > 0 ? 'Kamili (100%)' : (paid > 0 ? 'Salio' : 'Hajalipa');

      return `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(g.name)}</strong></td>
          <td>${escapeHtml(g.title || '-')}</td>
          <td>${escapeHtml(g.phone)}</td>
          <td>Tsh ${pledge.toLocaleString('sw-TZ')}</td>
          <td>Tsh ${paid.toLocaleString('sw-TZ')}</td>
          <td>Tsh ${bal.toLocaleString('sw-TZ')}</td>
          <td>${statusStr}</td>
        </tr>
      `;
    }).join('');
  }
}

// Print Official Report
function printFinancialReport() {
  renderFinancialReportView();
  window.print();
}

// Export Financial CSV (Excel Compatible)
function exportFinancialCSV() {
  if (!Array.isArray(allGuests) || allGuests.length === 0) {
    alert('Hakuna data za wageni za kupakua');
    return;
  }

  const headers = ['Msimbo', 'Jina la Mualikwa', 'Cheo/Uhusiano', 'Namba ya Simu', 'Ahadi (Tsh)', 'Iliyolipwa (Tsh)', 'Salio (Tsh)', 'Kiwango (%)', 'Hali ya Malipo'];
  const rows = allGuests.map(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const bal = Math.max(0, pledge - paid);
    const pct = pledge > 0 ? Math.round((paid / pledge) * 100) : 0;
    const status = bal === 0 && pledge > 0 ? 'Kamili' : (paid > 0 ? 'Salio' : 'Hajalipa');

    return [
      `"${g.id}"`,
      `"${(g.name || '').replace(/"/g, '""')}"`,
      `"${(g.title || '').replace(/"/g, '""')}"`,
      `"${g.phone || ''}"`,
      pledge,
      paid,
      bal,
      `${pct}%`,
      `"${status}"`
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Ripoti_ya_Fedha_Harusi_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Copy Financial WhatsApp Summary
function copyFinancialWhatsAppReport() {
  const totalPledges = allGuests.reduce((s, g) => s + (Number(g.pledgeAmount) || 0), 0);
  const totalPaid = allGuests.reduce((s, g) => s + (Number(g.paidAmount) || 0), 0);
  const totalBalance = Math.max(0, totalPledges - totalPaid);
  const percentage = totalPledges > 0 ? ((totalPaid / totalPledges) * 100).toFixed(1) : 0;

  const completed = allGuests.filter(g => (Number(g.pledgeAmount) > 0 && Number(g.paidAmount) >= Number(g.pledgeAmount)) || (Number(g.paidAmount) > 0 && (Number(g.pledgeAmount) - Number(g.paidAmount)) <= 0));
  const partial = allGuests.filter(g => Number(g.paidAmount) > 0 && (Number(g.pledgeAmount) - Number(g.paidAmount)) > 0);
  const zero = allGuests.filter(g => Number(g.paidAmount) === 0);

  const groom = eventDetails?.groomName || 'James';
  const bride = eventDetails?.brideName || 'Lilian';
  const todayStr = new Date().toLocaleDateString('sw-TZ', { day: '2-digit', month: 'long', year: 'numeric' });

  const reportText = `📊 *RIPOTI RASMI YA FEDHA & MAENDELEO YA MICHANGO*
💍 *Harusi ya ${groom} & ${bride}*
📅 *Tarehe ya Taarifa:* ${todayStr}
═════════════════════════

🎯 *Lengo Kuu la Bajeti:* Tsh ${totalPledges.toLocaleString('sw-TZ')}
💰 *Iliyokusanywa Mfukoni:* Tsh ${totalPaid.toLocaleString('sw-TZ')} (${percentage}%)
⏳ *Madeni Mtaani (Salio):* Tsh ${totalBalance.toLocaleString('sw-TZ')}

📈 *UGAWANYO WA WACHANGIAJI:*
✅ Walio kamilisha (100%): *${completed.length} Wageni* (Kadi zao ziko tayari!)
⏳ Waliolipa Nusu (Salio): *${partial.length} Wageni*
⚠️ Bado Hawajalipa: *${zero.length} Wageni*

🏦 *NJIA ZA KUKAMILISHA MCHANGO:*
Lipa Namba ya Kamati: *${document.getElementById('fin-payment-details-display')?.textContent.trim() || 'M-Pesa / Tigo Pesa ya Kamati'}*

_Asanteni sana wanakamati wote kwa upendo na mshikamano mkubwa!_ 🙏✨`;

  navigator.clipboard.writeText(reportText).then(() => {
    alert('📋 Ripoti ya Fedha ya WhatsApp imenakiliwa kikamilifu! Unaweza kuituma sasa hivi kwenye group la kamati.');
  }).catch(() => {
    prompt('Nakili ripoti hii ya WhatsApp hapa:', reportText);
  });
}



// Quick Test SMS sender from Settings
async function sendQuickTestSMS() {
  const phoneInput = document.getElementById('test-sms-phone');
  const btn = document.getElementById('test-sms-btn');
  const statusEl = document.getElementById('test-sms-status');

  const phone = phoneInput ? phoneInput.value.trim() : '';
  if (!phone) {
    alert('Tafadhali weka namba ya simu ya kujaribu.');
    return;
  }

  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Inatuma SMS...';
  if (statusEl) statusEl.innerHTML = '<span style="color: var(--gold-light);">Inawasiliana na NextSMS...</span>';

  try {
    const res = await fetch('/api/sms/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name: 'Majaribio' })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      if (statusEl) statusEl.innerHTML = '<span style="color: #2ecc71; font-weight: 600;">✅ SMS imetumwa kwa mafanikio kupitia jina la SENDOFF! Angalia simu yako sasa hivi.</span>';
      alert(`✅ SMS ya majaribio imetumwa kwa mafanikio kwenda ${phone} kupitia jina la "SENDOFF"!`);
      loadSmsLogs();
    } else {
      const errMsg = data?.result?.log?.responseMessage || data?.error || 'Hitilafu ya kutuma';
      if (statusEl) statusEl.innerHTML = `<span style="color: #e74c3c;">❌ Hitilafu: ${errMsg}</span>`;
      alert(`Hitilafu: ${errMsg}`);
    }
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.innerHTML = '<span style="color: #e74c3c;">❌ Hitilafu ya mtandao</span>';
    alert('Hitilafu ya mtandao');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// -------------------------------------------------------------
// PRINTABLE GATE MASTER REGISTRY (A-Z) FOR USHERS & BODYGUARDS
// -------------------------------------------------------------
function printGateGuestList() {
  const sorted = [...allGuests].sort((a, b) => a.name.localeCompare(b.name));
  const bride = eventDetails.brideName || 'Lilian';
  const venue = eventDetails.receptionVenue && !eventDetails.receptionVenue.includes('Mlimani') ? eventDetails.receptionVenue : 'Bragging Social Hall, Goba, Dar es Salaam';
  const dateStr = eventDetails?.weddingDate || '13 Oktoba 2026';

  const rows = sorted.map((g, idx) => {
    const table = allTables.find(t => t.id === g.tableId) || { name: 'Haijapangwa' };
    const seatLabel = Number(g.seats) === 2 ? 'Double' : (Number(g.seats) === 1 ? 'Single' : `Watu ${g.seats}`);
    return `
      <tr>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #999;">${idx + 1}</td>
        <td style="font-weight: bold; padding: 6px 8px; border: 1px solid #999;">${escapeHtml(g.name)}</td>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #999; font-weight: bold; color: #166534; font-family: monospace; font-size: 13px;">${g.code || '4829'}</td>
        <td style="text-align: center; padding: 6px 8px; border: 1px solid #999;">${escapeHtml(g.phone || '-')}</td>
        <td style="padding: 6px 8px; border: 1px solid #999;">${escapeHtml(table.name)}</td>
        <td style="text-align: center; font-weight: bold; padding: 6px 8px; border: 1px solid #999;">${seatLabel}</td>
        <td style="text-align: center; font-family: monospace; font-weight: bold; padding: 6px 8px; border: 1px solid #999;">#${g.id}</td>
        <td style="width: 70px; border: 1px solid #999; text-align: center; font-size: 14px;">[ &nbsp; ]</td>
      </tr>
    `;
  }).join('');

  const printWindow = window.open('', '_blank', 'width=950,height=800');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="sw">
    <head>
      <meta charset="UTF-8">
      <title>ORODHA YA WAGENI GETINI (A-Z) - SEND-OFF YA ${bride.toUpperCase()}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; line-height: 1.3; }
        h2 { margin: 0 0 4px 0; text-transform: uppercase; font-size: 18px; color: #000; }
        p { margin: 2px 0 12px 0; font-size: 13px; color: #444; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
        th { background: #f2f2f2; border: 1px solid #666; padding: 8px; text-align: left; font-size: 12px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px;">
        <div>
          <h2>💍 ORODHA KUU YA WAGENI GETINI (DOOR REGISTRY A-Z)</h2>
          <p><strong>SEND-OFF YA ${bride.toUpperCase()}</strong> &bull; Tarehe: ${dateStr} &bull; Ukumbi: ${venue}</p>
        </div>
        <div class="no-print">
          <button onclick="window.print()" style="padding: 10px 20px; font-weight: bold; background: #04140e; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
            🖨️ Bonyeza Hapa Kuchapisha (Print)
          </button>
        </div>
      </div>

      <p style="font-size: 12px; background: #f9f9f9; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px;">
        <strong>Maelekezo kwa Walinzi & Ushers wa Mlangoni:</strong> Tumia orodha hii kumkagua mgeni yeyote asiye na simu ya smartphone, aliyesahau simu, au mwenye kitochi kwa kuangalia jina lake au Kodi yake ya tarakimu 4. Weka alama ya tiki <strong>[ ✓ ]</strong> mara anapoingia ndani ukumbini.
      </p>

      <table>
        <thead>
          <tr>
            <th style="width: 25px; text-align: center;">#</th>
            <th>Jina Kamili la Mualikwa (A-Z)</th>
            <th style="text-align: center; width: 90px;">Kodi ya Getini</th>
            <th style="text-align: center; width: 110px;">Namba ya Simu</th>
            <th>Meza Aliyopangiwa</th>
            <th style="text-align: center; width: 75px;">Mwaliko</th>
            <th style="text-align: center; width: 75px;">Namba</th>
            <th style="text-align: center; width: 60px;">Tiki</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div style="margin-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #555; border-top: 1px solid #ccc; padding-top: 8px;">
        <div>Kamati ya Send-off ya Lilian &bull; Mfumo wa Kidijitali (Nyahende Events)</div>
        <div>Jumla ya Waalikwa: <strong>${sorted.length}</strong> | Jumla ya Viti: <strong>${sorted.reduce((acc, c) => acc + (Number(c.seats) || 1), 0)}</strong></div>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// -------------------------------------------------------------
// LIVE TABLE DRINK ORDERS MANAGEMENT & PRINTABLE TABLE QR STAND CARDS
// -------------------------------------------------------------

async function loadDrinkOrders(isSilent = false) {
  try {
    const res = await fetch('/api/orders');
    allOrders = await res.json();
    renderOrdersTable();
    updateTelegramStatusUI();

    // Update sidebar badge for pending orders
    const pendingOrders = allOrders.filter(o => o.status === 'pending');
    const badge = document.getElementById('sidebar-orders-count-badge');
    if (badge) {
      badge.textContent = `${pendingOrders.length} Mpya`;
      badge.style.display = pendingOrders.length > 0 ? 'inline-flex' : 'none';
    }
  } catch (err) {
    if (!isSilent) console.error('Error loading drink orders:', err);
  }
}

async function updateTelegramStatusUI() {
  try {
    const res = await fetch('/api/telegram/status');
    const data = await res.json();
    const countEl = document.getElementById('telegram-subscribers-count');
    if (countEl) {
      countEl.textContent = `${data.subscribersCount || 0} Watu/Magroup`;
    }
  } catch (e) {}
}

async function syncTelegramSubscribers() {
  const resultEl = document.getElementById('telegram-test-result');
  try {
    const res = await fetch('/api/telegram/sync', { method: 'POST' });
    const data = await res.json();
    await updateTelegramStatusUI();
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(16, 185, 129, 0.2)';
      resultEl.style.color = '#34d399';
      resultEl.style.border = '1px solid #10b981';
      resultEl.innerHTML = `✅ Umesasisha: Jumla ya wasajiliwa ${data.totalSubscribers || 0}. Wateja wapya: ${data.newSubscribers || 0}.`;
      setTimeout(() => { resultEl.style.display = 'none'; }, 5000);
    }
  } catch (err) {
    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(239, 68, 68, 0.2)';
      resultEl.style.color = '#f87171';
      resultEl.style.border = '1px solid #ef4444';
      resultEl.innerHTML = `Hitilafu ya kusasisha: ${err.message}`;
    }
  }
}

async function testTelegramNotification() {
  const resultEl = document.getElementById('telegram-test-result');
  if (resultEl) {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(56, 189, 248, 0.15)';
    resultEl.style.color = '#7dd3fc';
    resultEl.style.border = '1px solid #38bdf8';
    resultEl.innerHTML = '⏳ Inatuma ujumbe wa majaribio kwenye Telegram...';
  }

  try {
    const res = await fetch('/api/telegram/test', { method: 'POST' });
    const data = await res.json();
    if (resultEl) {
      if (data.success) {
        resultEl.style.background = 'rgba(16, 185, 129, 0.2)';
        resultEl.style.color = '#34d399';
        resultEl.style.border = '1px solid #10b981';
        resultEl.innerHTML = `✅ Ujumbe wa majaribio umetumwa kwa mafanikio kwa wapokeaji ${data.sentCount} / ${data.totalChats}!`;
      } else {
        resultEl.style.background = 'rgba(245, 158, 11, 0.2)';
        resultEl.style.color = '#fbbf24';
        resultEl.style.border = '1px solid #f59e0b';
        resultEl.innerHTML = `⚠️ ${data.message || 'Hakuna aliyejiunga na bot bado. Bofya "Fungua Bot Telegram" kisha bonyeza Start.'}`;
      }
    }
  } catch (err) {
    if (resultEl) {
      resultEl.style.background = 'rgba(239, 68, 68, 0.2)';
      resultEl.style.color = '#f87171';
      resultEl.style.border = '1px solid #ef4444';
      resultEl.innerHTML = `Hitilafu ya mtandao: ${err.message}`;
    }
  }
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-table-body');
  if (!tbody) return;

  const filterEl = document.getElementById('filter-order-status');
  const statusFilter = filterEl ? filterEl.value : 'all';

  let filtered = allOrders;
  if (statusFilter !== 'all') {
    filtered = allOrders.filter(o => o.status === statusFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">Hakuna oda ya kinywaji iliyopatikana kwa sasa.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const timeStr = o.timestamp ? new Date(o.timestamp).toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' }) : '-';
    
    let statusBadge = '<span class="badge badge-warning">⏳ Mpya / Inasubiri</span>';
    if (o.status === 'preparing') statusBadge = '<span class="badge badge-gold">🍸 Inaandaliwa</span>';
    else if (o.status === 'delivered') statusBadge = '<span class="badge badge-success">✓ Imefikishwa Mezani</span>';
    else if (o.status === 'cancelled') statusBadge = '<span class="badge badge-danger">❌ Imeghairiwa</span>';

    const itemsSummary = (o.items || []).map(it => `
      <div style="font-size: 0.85rem; color: #ffffff;">
        ${it.icon || '🍹'} <strong>${it.qty || 1}x</strong> ${escapeHtml(it.name)}
      </div>
    `).join('');

    return `
      <tr style="${o.status === 'pending' ? 'background: rgba(212, 175, 55, 0.06);' : ''}">
        <td style="font-weight: 700; color: var(--gold-light); font-family: monospace;">#${o.id}</td>
        <td style="font-size: 0.82rem; white-space: nowrap;">⏰ ${timeStr}</td>
        <td>
          <div style="font-weight: 700; color: var(--gold-light);">${escapeHtml(o.tableName)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Namba ya Meza: ${escapeHtml(o.tableId)}</div>
        </td>
        <td>
          <div style="font-weight: 600; color: #ffffff;">${escapeHtml(o.guestName || 'Mgeni wa Meza')}</div>
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 3px;">
            ${itemsSummary}
          </div>
        </td>
        <td style="font-size: 0.82rem; color: #a7f3d0; max-width: 180px;">
          ${o.notes ? `📝 <em>"${escapeHtml(o.notes)}"</em>` : '<span style="color: var(--text-muted);">-</span>'}
        </td>
        <td>${statusBadge}</td>
        <td>
          <div class="table-actions" style="gap: 4px;">
            ${o.status === 'pending' ? `
              <button type="button" class="btn btn-sm btn-gold" style="padding: 4px 8px; font-size: 0.75rem;" onclick="updateOrderStatus('${o.id}', 'preparing')">
                🍸 Anza Kuandaa
              </button>
            ` : ''}
            ${o.status !== 'delivered' && o.status !== 'cancelled' ? `
              <button type="button" class="btn btn-sm btn-emerald" style="padding: 4px 8px; font-size: 0.75rem;" onclick="updateOrderStatus('${o.id}', 'delivered')">
                ✅ Imefikishwa
              </button>
            ` : ''}
            ${o.status !== 'cancelled' && o.status !== 'delivered' ? `
              <button type="button" class="btn-action-delete" style="padding: 4px 8px; font-size: 0.75rem;" onclick="updateOrderStatus('${o.id}', 'cancelled')">
                ❌
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      await loadDrinkOrders();
    }
  } catch (err) {
    console.error('Error updating order status:', err);
  }
}

// -------------------------------------------------------------
// PRINTABLE LUXURY TABLE QR STAND CARDS (FOR ALL TABLES)
// -------------------------------------------------------------
function printAllTableQRCards() {
  const bride = eventDetails.brideName || 'Lilian';
  let venue = eventDetails.receptionVenue || 'Bragging Social Hall, Goba, Dar es Salaam';
  if (!venue || venue.includes('Mlimani')) {
    venue = 'Bragging Social Hall, Goba, Dar es Salaam';
  }
  const dateStr = eventDetails?.weddingDate || '13 Oktoba 2026';
  const origin = window.location.origin;

  const cardsHtml = allTables.map(t => {
    const qrUrl = `${origin}/api/qr/table/${t.id}`;
    const directUrl = `${origin}/order/${t.id}`;

    return `
      <div class="table-tent-card">
        <div class="card-inner">
          <div class="card-brand-top">✨ SEND-OFF YA ${bride.toUpperCase()} ✨</div>
          
          <div class="card-table-title">
            📍 ${escapeHtml(t.name.toUpperCase())}
          </div>
          <div class="card-table-sub">VIP TABLE SERVICE &bull; UWEZO: ${t.capacity} VITI</div>

          <div class="card-qr-box">
            <img src="${qrUrl}" alt="QR ya ${t.name}" class="card-qr-img">
          </div>

          <div class="card-cta-headline">
            📱 SCAN HAPA KUAGIZA KINYWAJI CHAKO
          </div>

          <div class="card-steps-box">
            <div><strong>1.</strong> Fungua Kamera ya simu yako na ielekeze kwenye QR Code hii.</div>
            <div><strong>2.</strong> Chagua kinywaji chako unachopenda kwenye menyu ya kidijitali.</div>
            <div><strong>3.</strong> Tuma oda, mhudumu wetu atakuletea moja kwa moja kwenye meza yako!</div>
          </div>

          <div class="card-footer-info">
            📅 ${dateStr} &bull; 🏛️ ${venue}<br>
            <span style="font-size: 9px; color: #777;">Link: ${directUrl}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const printWindow = window.open('', '_blank', 'width=1000,height=900');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="sw">
    <head>
      <meta charset="UTF-8">
      <title>KADI ZA QR ZA MEZA ZOTE (TABLE TENT CARDS) - HARUSI YA ${bride.toUpperCase()}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', sans-serif; background: #f0f2f5; color: #111; padding: 20px; }
        
        .print-toolbar {
          background: #04140e;
          color: #fff;
          padding: 16px 24px;
          border-radius: 8px;
          margin-bottom: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .table-tent-card {
          background: #ffffff;
          border: 3px solid #b8860b;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          page-break-inside: avoid;
          text-align: center;
        }

        .card-inner {
          border: 1.5px dashed #b8860b;
          border-radius: 12px;
          padding: 20px 16px;
          background: #fafaf7;
        }

        .card-brand-top {
          font-size: 11px;
          font-weight: bold;
          letter-spacing: 2px;
          color: #b8860b;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .card-table-title {
          font-size: 20px;
          font-weight: 900;
          color: #04140e;
          margin-bottom: 3px;
        }

        .card-table-sub {
          font-size: 11px;
          font-weight: bold;
          color: #166534;
          margin-bottom: 14px;
        }

        .card-qr-box {
          background: #ffffff;
          border: 2px solid #04140e;
          border-radius: 14px;
          display: inline-block;
          padding: 12px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.08);
          margin-bottom: 12px;
        }

        .card-qr-img {
          width: 180px;
          height: 180px;
          display: block;
        }

        .card-cta-headline {
          font-size: 14px;
          font-weight: 900;
          color: #04140e;
          letter-spacing: 0.5px;
          margin-bottom: 10px;
          background: #fef08a;
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid #eab308;
          display: inline-block;
        }

        .card-steps-box {
          background: #ffffff;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 10px 14px;
          text-align: left;
          font-size: 11.5px;
          line-height: 1.5;
          color: #333;
          margin-bottom: 12px;
        }

        .card-footer-info {
          font-size: 10px;
          color: #666;
          line-height: 1.4;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
        }

        @media print {
          body { background: #fff; padding: 0; }
          .print-toolbar { display: none !important; }
          .cards-grid { grid-template-columns: 1fr 1fr; gap: 16px; }
          .table-tent-card { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="print-toolbar">
        <div>
          <h2 style="font-size: 18px; margin-bottom: 2px;">🍾 KADI ZA QR ZA MEZA ZOTE (TABLE QR STANDS)</h2>
          <p style="font-size: 12px; color: #a7f3d0;">Jumla ya Meza: ${allTables.length} &bull; Zinafaa kuwekwa juu ya meza zote ukumbini.</p>
        </div>
        <button onclick="window.print()" style="padding: 10px 24px; font-weight: bold; background: #d4af37; color: #04140e; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
          🖨️ Chapisha Kadi Hizi (Print)
        </button>
      </div>

      <div class="cards-grid">
        ${cardsHtml}
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// -------------------------------------------------------------
// DRINKS & MENU MANAGEMENT (TAB-DRINKS)
// -------------------------------------------------------------

async function loadDrinksAdmin() {
  try {
    const res = await fetch('/api/drinks');
    if (res.ok) {
      allDrinks = await res.json();
      renderDrinksAdminTable();
    }
  } catch (err) {
    console.error('Error loading drinks in admin:', err);
  }
}

function renderDrinksAdminTable() {
  const tbody = document.getElementById('drinks-admin-table-body');
  if (!tbody) return;

  const categoryFilter = document.getElementById('filter-drinks-category')?.value || 'all';
  const filtered = categoryFilter === 'all'
    ? allDrinks
    : allDrinks.filter(d => d.category === categoryFilter);

  if (!filtered || filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">Hakuna vinywaji katika kategoria hii. Bofya "+ Ongeza Kinywaji Kipya" kuweka kinywaji.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const photoHtml = d.image
      ? `<img src="${d.image}" alt="${escapeHtml(d.name)}" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid var(--gold-primary);">`
      : `<div style="width: 44px; height: 44px; border-radius: 8px; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">${d.icon || '🍹'}</div>`;

    return `
      <tr>
        <td style="vertical-align: middle;">${photoHtml}</td>
        <td>
          <div style="font-weight: 700; color: #ffffff; font-size: 0.95rem;">${escapeHtml(d.name)}</div>
          <div style="font-size: 0.75rem; color: var(--gold-light);">ID: #${d.id}</div>
        </td>
        <td>
          <span class="badge badge-gold" style="font-size: 0.75rem; padding: 3px 8px;">
            ${escapeHtml(d.category)}
          </span>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 280px;">
          ${escapeHtml(d.description || '-')}
        </td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-action-edit" onclick="openEditDrinkModal('${d.id}')" title="Hariri Kinywaji">
              ✏️ Hariri
            </button>
            <button type="button" class="btn-action-delete" onclick="deleteDrink('${d.id}')" title="Futa Kinywaji">
              🗑️ Futa
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddDrinkModal() {
  const modal = document.getElementById('drink-modal');
  const title = document.getElementById('drink-modal-title');
  const editId = document.getElementById('drink-edit-id');
  const nameInput = document.getElementById('drink-input-name');
  const catInput = document.getElementById('drink-input-category');
  const iconInput = document.getElementById('drink-input-icon');
  const descInput = document.getElementById('drink-input-desc');
  const fileInput = document.getElementById('drink-file-input');
  const previewBox = document.getElementById('drink-preview-box');
  const imgUrl = document.getElementById('drink-image-url');

  if (title) title.textContent = 'Ongeza Kinywaji Kipya';
  if (editId) editId.value = '';
  if (nameInput) nameInput.value = '';
  if (catInput) catInput.value = 'Champagne & Wine';
  if (iconInput) iconInput.value = '🍾';
  if (descInput) descInput.value = '';
  if (fileInput) fileInput.value = '';
  if (imgUrl) imgUrl.value = '';
  if (previewBox) previewBox.innerHTML = '🍾';

  if (modal) modal.classList.add('active');
}

function openEditDrinkModal(id) {
  const drink = allDrinks.find(d => String(d.id) === String(id));
  if (!drink) return;

  const modal = document.getElementById('drink-modal');
  const title = document.getElementById('drink-modal-title');
  const editId = document.getElementById('drink-edit-id');
  const nameInput = document.getElementById('drink-input-name');
  const catInput = document.getElementById('drink-input-category');
  const iconInput = document.getElementById('drink-input-icon');
  const descInput = document.getElementById('drink-input-desc');
  const fileInput = document.getElementById('drink-file-input');
  const previewBox = document.getElementById('drink-preview-box');
  const imgUrl = document.getElementById('drink-image-url');

  if (title) title.textContent = `Hariri Kinywaji: ${drink.name}`;
  if (editId) editId.value = drink.id;
  if (nameInput) nameInput.value = drink.name || '';
  if (catInput) catInput.value = drink.category || 'Champagne & Wine';
  if (iconInput) iconInput.value = drink.icon || '🍹';
  if (descInput) descInput.value = drink.description || '';
  if (fileInput) fileInput.value = '';
  if (imgUrl) imgUrl.value = drink.image || '';

  if (previewBox) {
    if (drink.image) {
      previewBox.innerHTML = `<img src="${drink.image}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      previewBox.innerHTML = drink.icon || '🍹';
    }
  }

  if (modal) modal.classList.add('active');
}

function previewDrinkImageFile(event) {
  const file = event.target.files && event.target.files[0];
  const previewBox = document.getElementById('drink-preview-box');
  if (!file || !previewBox) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    previewBox.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
  };
  reader.readAsDataURL(file);
}

async function handleSaveDrink(event) {
  if (event) event.preventDefault();

  const editId = document.getElementById('drink-edit-id')?.value;
  const name = document.getElementById('drink-input-name')?.value.trim();
  const category = document.getElementById('drink-input-category')?.value;
  const icon = document.getElementById('drink-input-icon')?.value.trim() || '🍹';
  const description = document.getElementById('drink-input-desc')?.value.trim() || '';
  const fileInput = document.getElementById('drink-file-input');
  const existingImageUrl = document.getElementById('drink-image-url')?.value || '';
  const saveBtn = document.getElementById('btn-save-drink');

  if (!name) {
    alert('Tafadhali jaza jina la kinywaji.');
    return;
  }

  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Inahifadhi kinywaji...';
  }

  try {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('icon', icon);
    formData.append('description', description);
    formData.append('image', existingImageUrl);

    if (fileInput && fileInput.files && fileInput.files[0]) {
      formData.append('photo', fileInput.files[0]);
    }

    const url = editId ? `/api/drinks/${editId}` : '/api/drinks';
    const method = editId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`✅ ${data.message || 'Kinywaji kimehifadhiwa kikamilifu!'}`);
      closeModal('drink-modal');
      await loadDrinksAdmin();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kuhifadhi kinywaji'}`);
    }
  } catch (err) {
    console.error('Error saving drink:', err);
    alert('Hitilafu ya mtandao wakati wa kuhifadhi kinywaji.');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Hifadhi Kinywaji';
    }
  }
}

async function deleteDrink(id) {
  const drink = allDrinks.find(d => String(d.id) === String(id));
  const drinkName = drink ? drink.name : id;

  if (!confirm(`Je, una uhakika unataka kufuta kinywaji hiki "${drinkName}" kwenye orodha ya menyu?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/drinks/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      alert(`🗑️ ${data.message || 'Kinywaji kimefutwa'}`);
      await loadDrinksAdmin();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kufuta kinywaji'}`);
    }
  } catch (err) {
    console.error('Error deleting drink:', err);
    alert('Hitilafu ya mtandao wakati wa kufuta kinywaji.');
  }
}

// -------------------------------------------------------------
// GALLERY & PHOTO UPLOAD MANAGEMENT (TAB-GALLERY)
// -------------------------------------------------------------

async function loadGalleryImages() {
  try {
    const res = await fetch('/api/gallery');
    if (!res.ok) return;
    const data = await res.json();
    const images = data.images || [];

    // Cache buster for live preview images
    const t = Date.now();
    const brideImg = document.getElementById('preview-bride-img');
    const coupleImg = document.getElementById('preview-couple-img');
    const venueImg = document.getElementById('preview-venue-img');

    if (brideImg) brideImg.src = `${eventDetails?.bridePhoto || '/images/lilian_sendoff.jpg'}?t=${t}`;
    if (coupleImg) coupleImg.src = `/images/wedding_couple.jpg?t=${t}`;
    if (venueImg) venueImg.src = `/images/wedding_venue.jpg?t=${t}`;

    // Render Album Grid
    const albumGrid = document.getElementById('gallery-album-grid');
    if (!albumGrid) return;

    if (images.length === 0) {
      albumGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">
          Bado hakuna picha kwenye galari. Tumia kitufe cha "+ Pakia Picha Hapa" kuweka picha mpya.
        </div>
      `;
      return;
    }

    albumGrid.innerHTML = images.map(img => `
      <div style="position: relative; border-radius: 12px; overflow: hidden; border: 1px solid var(--bg-glass-border); background: #03140c; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
        <img src="${img.url}?t=${t}" alt="${escapeHtml(img.filename)}" style="width: 100%; height: 160px; object-fit: cover; display: block;">
        <div style="padding: 8px 10px; background: rgba(3, 18, 12, 0.95); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.72rem; color: var(--gold-light); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;">
            ${escapeHtml(img.filename)}
          </span>
          <button type="button" class="btn btn-sm btn-danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="deleteGalleryImage('${img.filename}')" title="Futa picha hii">
            🗑️
          </button>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Error loading gallery images:', err);
  }
}

function triggerGenericPhotoUpload() {
  const input = document.getElementById('generic-gallery-upload-input');
  if (input) input.click();
}

async function handleBridePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const res = await fetch('/api/upload/bride', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('🎉 Picha ya Bibi Harusi (Msichana) imesasishwa kikamilifu! Sasa itaonekana moja kwa moja kwenye tovuti na kadi za kidijitali.');
      const t = Date.now();
      const brideImg = document.getElementById('preview-bride-img');
      if (brideImg) brideImg.src = `${eventDetails?.bridePhoto || '/images/lilian_sendoff.jpg'}?t=${t}`;
      loadGalleryImages();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kupakia picha'}`);
    }
  } catch (err) {
    console.error('Error uploading bride photo:', err);
    alert('Hitilafu ya mtandao wakati wa kupakia picha ya Bibi Harusi.');
  }
}

async function handleCouplePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const res = await fetch('/api/upload/couple', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('🎉 Picha ya Maharusi (Couple) imesasishwa kikamilifu! Sasa itaonekana kwenye ukurasa mkuu (Hero banner) wa tovuti.');
      const t = Date.now();
      const coupleImg = document.getElementById('preview-couple-img');
      if (coupleImg) coupleImg.src = `/images/wedding_couple.jpg?t=${t}`;
      loadGalleryImages();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kupakia picha'}`);
    }
  } catch (err) {
    console.error('Error uploading couple photo:', err);
    alert('Hitilafu ya mtandao wakati wa kupakia picha ya Maharusi.');
  }
}

async function handleVenuePhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const res = await fetch('/api/upload/venue', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('🎉 Picha ya Ukumbi imesasishwa kikamilifu!');
      const t = Date.now();
      const venueImg = document.getElementById('preview-venue-img');
      if (venueImg) venueImg.src = `/images/wedding_venue.jpg?t=${t}`;
      loadGalleryImages();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kupakia picha'}`);
    }
  } catch (err) {
    console.error('Error uploading venue photo:', err);
    alert('Hitilafu ya mtandao wakati wa kupakia picha ya Ukumbi.');
  }
}

async function handleGenericGalleryUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('🎉 Picha imepakiwa na kuongezwa kwenye Galari ya Harusi!');
      loadGalleryImages();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kupakia picha'}`);
    }
  } catch (err) {
    console.error('Error uploading photo:', err);
    alert('Hitilafu ya mtandao wakati wa kupakia picha.');
  }
}

async function deleteGalleryImage(filename) {
  if (!confirm(`Je, una uhakika unataka kufuta picha hii (${filename}) kwenye galari?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/gallery/${filename}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      alert('🗑️ Picha imefutwa');
      loadGalleryImages();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kufuta picha'}`);
    }
  } catch (err) {
    console.error('Error deleting gallery image:', err);
    alert('Hitilafu ya mtandao wakati wa kufuta picha.');
  }
}

// Sync Database from Git (useful on VPS after git pull)
async function syncGitDatabase() {
  if (!confirm('Je, una uhakika unataka kusawazisha database na faili jipya la data/db.json kutoka Git?\n\nTaarifa za sasa zitasasishwa na orodha rasmi ya wageni 139.')) {
    return;
  }

  const btn = document.getElementById('btn-sync-git');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Inasawazisha...';
  }

  try {
    const res = await fetch('/api/backup/sync-git', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      await initDashboard();
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kusawazisha'}`);
    }
  } catch (err) {
    console.error('Error syncing git database:', err);
    alert('Hitilafu ya mtandao wakati wa kusawazisha database.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

// Expose modal and CRUD handlers on window for HTML onclick attributes
window.openModal = openModal;
window.closeModal = closeModal;
window.openAddTableModal = openAddTableModal;
window.openEditTableModal = openEditTableModal;
window.handleSaveTable = handleSaveTable;
window.deleteTable = deleteTable;
window.openAddDrinkModal = openAddDrinkModal;
window.openEditDrinkModal = openEditDrinkModal;
window.handleSaveDrink = handleSaveDrink;
window.deleteDrink = deleteDrink;
window.openAddGuestModal = openAddGuestModal;
window.openEditGuestModal = openEditGuestModal;
window.openPaymentModal = openPaymentModal;
window.syncGitDatabase = syncGitDatabase;




