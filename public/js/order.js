/**
 * Ultra-Fast Table QR Drink Ordering System (order.js)
 * Instant Zero-Delay Bootstrapping, Strict Cumulative Limit Across All Orders (Usiku Mzima),
 * Per-Drink Limits (e.g. Ceres max 2), Master Service Switch, Background SMS/WA/Telegram Dispatch.
 */

let allDrinks = [];
let allTables = [];
let activeTable = { id: 'meza-1', name: 'Meza Kuu' };
let currentCategory = 'all';
let cart = {}; // { [drinkId]: { drink, qty } }
let serviceActive = true;
let maxTotalPerOrder = 4; // Overall limit per guest for the whole night

// Guest Session ID for cumulative tracking across multiple orders and page reloads
function getGuestSessionId() {
  let id = localStorage.getItem('wedding_guest_session_id');
  if (!id) {
    id = 'guest_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('wedding_guest_session_id', id);
  }
  return id;
}

const guestSessionId = getGuestSessionId();
let guestTotalOrdered = 0; // Cumulative drinks ordered tonight
let guestItemCounts = {};   // { [drinkId]: countOrderedTonight }

// Instant bootstrap or fallback load
document.addEventListener('DOMContentLoaded', () => {
  initOrderSystem();
});

async function initOrderSystem() {
  detectTableFromUrl();

  // 1. FAST BOOTSTRAP: Check if data was injected by server for 0ms rendering
  if (window.__ORDER_BOOTSTRAP__) {
    const data = window.__ORDER_BOOTSTRAP__;
    allDrinks = data.drinks || [];
    allTables = data.allTables || [];
    if (data.activeTable) activeTable = data.activeTable;
    serviceActive = data.serviceActive !== false;
    maxTotalPerOrder = data.maxTotalPerOrder || 4;

    applyServiceStatus();
    updateTableUI();
    updateQuotaUI();
    renderDrinks();

    // Fetch live cumulative quota asynchronously
    fetchGuestQuota();
    return;
  }

  // 2. FALLBACK: Fetch if opened directly as static file
  await loadFallbackData();
  fetchGuestQuota();
}

function applyServiceStatus() {
  const closedOverlay = document.getElementById('service-closed-overlay');
  if (closedOverlay) {
    closedOverlay.style.display = serviceActive ? 'none' : 'flex';
  }
}

function updateTableUI() {
  const nameEl = document.getElementById('active-table-name');
  if (nameEl) nameEl.textContent = activeTable.name;

  const trayTable = document.getElementById('tray-table-display');
  if (trayTable) trayTable.textContent = `📍 ${activeTable.name}`;
}

// Fetch cumulative quota for this person for tonight
async function fetchGuestQuota() {
  try {
    const res = await fetch(`/api/orders/quota/${guestSessionId}`);
    if (res.ok) {
      const data = await res.json();
      guestTotalOrdered = typeof data.totalOrdered === 'number' ? data.totalOrdered : 0;
      guestItemCounts = data.drinkCounts || {};
      if (typeof data.maxTotal === 'number') {
        maxTotalPerOrder = data.maxTotal;
      }
      if (typeof data.serviceActive === 'boolean') {
        serviceActive = data.serviceActive;
        applyServiceStatus();
      }
      updateQuotaUI();
      renderDrinks();
      updateTrayUI();
    }
  } catch (err) {
    console.error('Error fetching guest quota:', err);
  }
}

// Update Quota Pill in Header (Quiet mode: Only shown when limit is reached!)
function updateQuotaUI() {
  const pill = document.getElementById('quota-display-pill');
  const txt = document.getElementById('quota-display-text');
  if (!pill) return;

  if (guestTotalOrdered >= maxTotalPerOrder) {
    pill.style.display = 'inline-flex';
    pill.style.background = 'rgba(239, 68, 68, 0.2)';
    pill.style.border = '1.5px solid #ef4444';
    pill.style.color = '#fca5a5';
    if (txt) txt.textContent = `🔒 Umefikisha Kikomo cha Kuagiza Vinywaji (${guestTotalOrdered}/${maxTotalPerOrder})`;
  } else {
    // Hidden when guest still has remaining drinks
    pill.style.display = 'none';
  }
}

// Detect Table ID from path /order/:tableId or ?table=...
function detectTableFromUrl() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let tableParam = null;

  if (pathParts.length >= 2 && pathParts[0] === 'order') {
    tableParam = pathParts[1];
  } else {
    const urlParams = new URLSearchParams(window.location.search);
    tableParam = urlParams.get('table') || urlParams.get('tableId');
  }

  if (tableParam) {
    activeTable.id = tableParam;
  }
}

// Fallback loader if not server bootstrapped
async function loadFallbackData() {
  try {
    const [eventRes, cfgRes] = await Promise.allSettled([
      fetch('/api/event').then(r => r.json()),
      fetch('/api/orders/notification-config').then(r => r.json())
    ]);

    if (eventRes.status === 'fulfilled' && eventRes.value) {
      allDrinks = eventRes.value.drinks || [];
      allTables = eventRes.value.tables || [];

      const foundTable = allTables.find(t => 
        String(t.id).toLowerCase() === String(activeTable.id).toLowerCase() ||
        String(t.name).toLowerCase() === String(activeTable.id).toLowerCase()
      );

      if (foundTable) {
        activeTable = foundTable;
      } else {
        activeTable.name = activeTable.id.toLowerCase().startsWith('meza-')
          ? `Meza ${activeTable.id.replace(/^meza-/i, '')}`
          : activeTable.id.replace(/-/g, ' ').toUpperCase();
      }
    }

    if (cfgRes.status === 'fulfilled' && cfgRes.value) {
      serviceActive = cfgRes.value.serviceActive !== false;
      maxTotalPerOrder = cfgRes.value.maxTotalPerOrder || 4;
    }

    applyServiceStatus();
    updateTableUI();
    updateQuotaUI();
    renderDrinks();
  } catch (err) {
    console.error('Error loading fallback drinks data:', err);
  }
}

// Filter Category
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDrinks();
}

function getTotalCartCount() {
  return Object.values(cart).reduce((sum, item) => sum + (item.qty || 0), 0);
}

// Toast warning notification helper
function showToast(msg) {
  const t = document.getElementById('toast-notice');
  if (!t) {
    alert(msg);
    return;
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => {
    t.classList.remove('show');
  }, 3400);
}

// Render Drinks Grid
function renderDrinks() {
  const container = document.getElementById('drinks-grid-container');
  if (!container) return;

  const totalCartCount = getTotalCartCount();
  const cumulativeTotal = guestTotalOrdered + totalCartCount;
  const isOverallLimitReached = cumulativeTotal >= maxTotalPerOrder;

  const filtered = currentCategory === 'all' 
    ? allDrinks 
    : allDrinks.filter(d => d.category === currentCategory);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8;">
        Hakuna vinywaji katika kategoria hii kwa sasa.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(d => {
    const cartItem = cart[d.id];
    const qty = cartItem ? cartItem.qty : 0;
    const hasQty = qty > 0;

    // Per-item cumulative limits
    const maxItemLimit = d.maxQtyPerOrder !== undefined ? d.maxQtyPerOrder : maxTotalPerOrder;
    const orderedOfThisItem = guestItemCounts[d.id] || 0;
    const cumulativeItemQty = orderedOfThisItem + qty;
    const isItemLimitReached = cumulativeItemQty >= maxItemLimit;
    const isItemFullyDepleted = orderedOfThisItem >= maxItemLimit;

    const canIncrement = !isOverallLimitReached && !isItemLimitReached;

    const visualHtml = d.image
      ? `<div class="drink-image-wrap"><img src="${d.image}" alt="${escapeHtml(d.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'drink-icon-wrap\\'>${d.icon || '🍹'}</div>'"></div>`
      : `<div class="drink-icon-wrap">${d.icon || '🍹'}</div>`;

    // Limit badge
    let limitNoticeHtml = '';
    if (isItemFullyDepleted) {
      limitNoticeHtml = `<div class="drink-limit-pill" style="color: #fca5a5; border-color: rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.15);">🔒 Umefikisha kikomo (${orderedOfThisItem}/${maxItemLimit})</div>`;
    } else if (maxItemLimit < maxTotalPerOrder) {
      limitNoticeHtml = `<div class="drink-limit-pill">⚠️ Mwisho ${maxItemLimit} usiku mzima ${orderedOfThisItem > 0 ? `(Umeagiza: ${orderedOfThisItem})` : ''}</div>`;
    }

    // Action button
    let actionBtnHtml = '';
    if (isItemFullyDepleted) {
      actionBtnHtml = `
        <button type="button" class="btn-add-drink limit-reached-btn" disabled style="opacity: 0.6; cursor: not-allowed;">
          🔒 Mwisho Umefikiwa
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button type="button" 
                class="btn-add-drink ${isOverallLimitReached ? 'limit-reached-btn' : ''}" 
                id="btn-add-${d.id}" 
                style="${hasQty ? 'display: none;' : 'display: block;'}" 
                onclick="addDrinkToCart('${d.id}')">
          + Ongeza
        </button>

        <div class="qty-control-wrap ${hasQty ? 'active' : ''}" id="qty-wrap-${d.id}">
          <button type="button" class="qty-btn" onclick="changeQty('${d.id}', -1)">-</button>
          <span class="qty-val" id="qty-val-${d.id}">${qty}</span>
          <button type="button" 
                  class="qty-btn ${!canIncrement ? 'limit-reached-btn' : ''}" 
                  id="qty-plus-${d.id}" 
                  onclick="changeQty('${d.id}', 1)">+</button>
        </div>
      `;
    }

    return `
      <div class="drink-card" id="card-${d.id}">
        <div>
          ${visualHtml}
          <div class="drink-name">${escapeHtml(d.name)}</div>
          <div class="drink-desc">${escapeHtml(d.description || d.category || '')}</div>
          ${limitNoticeHtml}
        </div>

        <div class="drink-card-footer">
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

// Cart Management with cumulative limits enforcement
function addDrinkToCart(drinkId) {
  if (!serviceActive) {
    showToast('Samahani, huduma ya kuagiza vinywaji imefungwa kwa sasa ukumbini.');
    applyServiceStatus();
    return;
  }

  const drink = allDrinks.find(d => d.id === drinkId);
  if (!drink) return;

  const totalCartCount = getTotalCartCount();
  const cumulativeTotal = guestTotalOrdered + totalCartCount;
  if (cumulativeTotal >= maxTotalPerOrder) {
    showToast(`⚠️ Umefikisha kikomo chako cha jumla cha vinywaji ${maxTotalPerOrder} kwa usiku mzima!`);
    return;
  }

  const maxItemLimit = drink.maxQtyPerOrder !== undefined ? drink.maxQtyPerOrder : maxTotalPerOrder;
  const orderedCount = guestItemCounts[drinkId] || 0;
  const currentItemQty = cart[drinkId] ? cart[drinkId].qty : 0;
  if (orderedCount + currentItemQty >= maxItemLimit) {
    showToast(`⚠️ Kikomo cha ${drink.name} ni ${maxItemLimit} tu kwa usiku mzima! Tayari umeagiza ${orderedCount}.`);
    return;
  }

  cart[drinkId] = {
    drink,
    qty: currentItemQty + 1
  };

  renderDrinks();
  updateTrayUI();
  updateQuotaUI();
}

function changeQty(drinkId, delta) {
  if (!cart[drinkId]) return;

  if (delta > 0) {
    if (!serviceActive) {
      showToast('Samahani, huduma ya kuagiza vinywaji imefungwa kwa sasa ukumbini.');
      applyServiceStatus();
      return;
    }

    const totalCartCount = getTotalCartCount();
    const cumulativeTotal = guestTotalOrdered + totalCartCount;
    if (cumulativeTotal >= maxTotalPerOrder) {
      showToast(`⚠️ Umefikisha kikomo chako cha jumla cha vinywaji ${maxTotalPerOrder} kwa usiku mzima!`);
      return;
    }

    const maxItemLimit = cart[drinkId].drink.maxQtyPerOrder !== undefined ? cart[drinkId].drink.maxQtyPerOrder : maxTotalPerOrder;
    const orderedCount = guestItemCounts[drinkId] || 0;
    if (orderedCount + cart[drinkId].qty >= maxItemLimit) {
      showToast(`⚠️ Kikomo cha ${cart[drinkId].drink.name} ni ${maxItemLimit} tu kwa usiku mzima!`);
      return;
    }

    cart[drinkId].qty += 1;
  } else {
    cart[drinkId].qty -= 1;
    if (cart[drinkId].qty <= 0) {
      delete cart[drinkId];
    }
  }

  renderDrinks();
  updateTrayUI();
  updateQuotaUI();
}

function updateTrayUI() {
  const tray = document.getElementById('order-tray');
  const countBadge = document.getElementById('tray-total-items-badge');

  const items = Object.values(cart);
  const totalCount = items.reduce((sum, item) => sum + item.qty, 0);
  const remainingOverall = Math.max(0, maxTotalPerOrder - (guestTotalOrdered + totalCount));

  if (countBadge) {
    countBadge.textContent = `${totalCount} ${totalCount === 1 ? 'Kinywaji' : 'Vinywaji'}`;
  }

  if (tray) {
    if (totalCount > 0) {
      tray.classList.add('active');
    } else {
      tray.classList.remove('active');
    }
  }
}

// Submit Order to Server & Multi-Channel SMS/WA/Telegram Dispatch
async function submitDrinkOrder() {
  if (!serviceActive) {
    applyServiceStatus();
    showToast('Samahani, huduma ya kuagiza vinywaji imefungwa kwa sasa ukumbini.');
    return;
  }

  const items = Object.values(cart);
  if (items.length === 0) {
    showToast('Tafadhali chagua angalau kinywaji kimoja kwenye menyu kabla ya kutuma oda.');
    return;
  }

  const totalCount = items.reduce((sum, item) => sum + item.qty, 0);
  if (guestTotalOrdered + totalCount > maxTotalPerOrder) {
    const rem = Math.max(0, maxTotalPerOrder - guestTotalOrdered);
    showToast(`Umebakiwa na nafasi ya vinywaji ${rem} tu kwa usiku mzima (Kikomo cha jumla ni ${maxTotalPerOrder}).`);
    return;
  }

  // Check cumulative per-item limits
  for (const it of items) {
    const limit = it.drink.maxQtyPerOrder !== undefined ? it.drink.maxQtyPerOrder : maxTotalPerOrder;
    const past = guestItemCounts[it.drink.id] || 0;
    if (past + it.qty > limit) {
      showToast(`Kikomo cha ${it.drink.name} ni ${limit} tu kwa usiku mzima. Umebakiwa na nafasi ya ${Math.max(0, limit - past)}.`);
      return;
    }
  }

  const guestName = document.getElementById('order-guest-name')?.value.trim() || '';
  const notes = document.getElementById('order-notes')?.value.trim() || '';
  const submitBtn = document.getElementById('btn-submit-order');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳ Inatuma Oda...</span>`;
  }

  const payload = {
    guestSessionId,
    tableId: activeTable.id,
    tableName: activeTable.name,
    guestName,
    notes,
    items: items.map(it => ({
      id: it.drink.id,
      name: it.drink.name,
      category: it.drink.category,
      icon: it.drink.icon,
      qty: it.qty
    }))
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.status === 403) {
      serviceActive = false;
      applyServiceStatus();
      alert('Samahani! Huduma ya kuagiza vinywaji imefungwa kwa sasa ukumbini na msimamizi.');
      return;
    }

    if (res.ok && data.success) {
      const orderedItems = [...items];
      cart = {};

      // Update cumulative counts immediately
      guestTotalOrdered = typeof data.totalOrdered === 'number' ? data.totalOrdered : (guestTotalOrdered + totalCount);
      items.forEach(it => {
        guestItemCounts[it.drink.id] = (guestItemCounts[it.drink.id] || 0) + it.qty;
      });

      updateQuotaUI();
      renderDrinks();
      updateTrayUI();

      // Show Success Modal instantly with remaining quota
      openSuccessModal(data.order || payload, orderedItems, data.remainingQuota);
    } else {
      showToast(`Hitilafu: ${data.error || 'Haikuweza kutuma oda. Tafadhali jaribu tena.'}`);
    }
  } catch (err) {
    console.error('Error submitting order:', err);
    showToast('Hitilafu ya mtandao wakati wa kutuma oda ya kinywaji.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>🍸 Tuma Oda ya Kinywaji Sasa</span>`;
    }
  }
}

function openSuccessModal(order, items, remainingQuota) {
  const modal = document.getElementById('order-success-modal');
  const tableEl = document.getElementById('success-modal-table');
  const itemsEl = document.getElementById('success-modal-items');
  const quotaBox = document.getElementById('success-modal-quota-box');

  if (tableEl) {
    tableEl.textContent = `📍 ${activeTable.name}`;
  }

  // ONLY show limit notice if the guest has actually reached their overall limit!
  if (quotaBox) {
    const rem = typeof remainingQuota === 'number' ? remainingQuota : Math.max(0, maxTotalPerOrder - guestTotalOrdered);
    if (rem <= 0 || guestTotalOrdered >= maxTotalPerOrder) {
      quotaBox.style.display = 'block';
      quotaBox.style.background = 'rgba(239, 68, 68, 0.18)';
      quotaBox.style.border = '1px solid rgba(239, 68, 68, 0.5)';
      quotaBox.style.color = '#fca5a5';
      quotaBox.innerHTML = `
        <div style="font-size: 0.95rem; font-weight: 800; color: #fae19c; margin-bottom: 4px;">
          🔒 Umefikisha Kikomo cha Kuagiza Vinywaji (${guestTotalOrdered}/${maxTotalPerOrder})
        </div>
        <div style="color: #e2e8f0; font-size: 0.82rem;">
          ✨ Umefikisha kikomo chako cha jumla cha vinywaji kwa usiku wa leo. Asante sana na uwe na wakati mzuri!
        </div>
      `;
    } else {
      // Hidden completely when guest hasn't reached limit
      quotaBox.style.display = 'none';
      quotaBox.innerHTML = '';
    }
  }

  if (itemsEl) {
    const itemsHtml = (items || []).map(it => `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <span>${it.drink.icon || '🍹'} <strong>${it.qty}x</strong> ${escapeHtml(it.drink.name)}</span>
        <span style="color: #2ecc71; font-weight: 700;">✓ Imeagizwa</span>
      </div>
    `).join('');

    itemsEl.innerHTML = `
      <div style="font-weight: 700; color: var(--gold-light); margin-bottom: 8px;">Vinywaji Ulivyoagiza Mda Huu:</div>
      ${itemsHtml}
      ${order.notes ? `<div style="margin-top: 10px; font-size: 0.8rem; color: #fae19c; background: rgba(255,255,255,0.05); padding: 6px 10px; border-radius: 6px;">📝 <em>"${escapeHtml(order.notes)}"</em></div>` : ''}
    `;
  }

  if (modal) modal.classList.add('active');
}

function closeSuccessModal() {
  const modal = document.getElementById('order-success-modal');
  if (modal) modal.classList.remove('active');
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
