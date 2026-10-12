/**
 * Ultra-Fast Table QR Drink Ordering System (order.js)
 * Instant Zero-Delay Bootstrapping, Strict 4-Drinks Max, Per-Drink Limits, Master Service Switch.
 */

let allDrinks = [];
let allTables = [];
let activeTable = { id: 'meza-1', name: 'Meza Kuu' };
let currentCategory = 'all';
let cart = {}; // { [drinkId]: { drink, qty } }
let serviceActive = true;
let maxTotalPerOrder = 4;

// Instant bootstrap or fallback load
document.addEventListener('DOMContentLoaded', () => {
  initOrderSystem();
});

function initOrderSystem() {
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
    renderDrinks();
    return;
  }

  // 2. FALLBACK: Fetch if opened directly as static file
  loadFallbackData();
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
  }, 3200);
}

// Render Drinks Grid
function renderDrinks() {
  const container = document.getElementById('drinks-grid-container');
  if (!container) return;

  const totalCartCount = getTotalCartCount();
  const isOverallLimitReached = totalCartCount >= maxTotalPerOrder;

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
    const maxItemQty = d.maxQtyPerOrder || 4;
    const isItemLimitReached = qty >= maxItemQty;
    const canIncrement = !isOverallLimitReached && !isItemLimitReached;

    const visualHtml = d.image
      ? `<div class="drink-image-wrap"><img src="${d.image}" alt="${escapeHtml(d.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'drink-icon-wrap\\'>${d.icon || '🍹'}</div>'"></div>`
      : `<div class="drink-icon-wrap">${d.icon || '🍹'}</div>`;

    const limitNoticeHtml = maxItemQty < 4
      ? `<div class="drink-limit-pill">⚠️ Mwisho ${maxItemQty} tu kwa meza</div>`
      : '';

    return `
      <div class="drink-card" id="card-${d.id}">
        <div>
          ${visualHtml}
          <div class="drink-name">${escapeHtml(d.name)}</div>
          <div class="drink-desc">${escapeHtml(d.description || d.category || '')}</div>
          ${limitNoticeHtml}
        </div>

        <div class="drink-card-footer">
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
        </div>
      </div>
    `;
  }).join('');
}

// Cart Management with limits enforcement
function addDrinkToCart(drinkId) {
  if (!serviceActive) {
    showToast('Samahani, huduma ya kuagiza vinywaji imefungwa kwa sasa ukumbini.');
    applyServiceStatus();
    return;
  }

  const drink = allDrinks.find(d => d.id === drinkId);
  if (!drink) return;

  const totalCartCount = getTotalCartCount();
  if (totalCartCount >= maxTotalPerOrder) {
    showToast(`⚠️ Kikomo cha vinywaji ${maxTotalPerOrder} kwa agizo moja kimefikiwa!`);
    return;
  }

  const maxItemLimit = drink.maxQtyPerOrder || 4;
  const currentItemQty = cart[drinkId] ? cart[drinkId].qty : 0;
  if (currentItemQty >= maxItemLimit) {
    showToast(`⚠️ Kikomo cha ${drink.name} ni ${maxItemLimit} pekee kwa agizo moja!`);
    return;
  }

  cart[drinkId] = {
    drink,
    qty: currentItemQty + 1
  };

  renderDrinks();
  updateTrayUI();
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
    if (totalCartCount >= maxTotalPerOrder) {
      showToast(`⚠️ Kikomo cha vinywaji ${maxTotalPerOrder} kwa agizo moja kimefikiwa!`);
      return;
    }

    const maxItemLimit = cart[drinkId].drink.maxQtyPerOrder || 4;
    if (cart[drinkId].qty >= maxItemLimit) {
      showToast(`⚠️ Kikomo cha ${cart[drinkId].drink.name} ni ${maxItemLimit} pekee kwa agizo moja!`);
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
}

function updateTrayUI() {
  const tray = document.getElementById('order-tray');
  const countBadge = document.getElementById('tray-total-items-badge');

  const items = Object.values(cart);
  const totalCount = items.reduce((sum, item) => sum + item.qty, 0);

  if (countBadge) {
    countBadge.textContent = `${totalCount} / ${maxTotalPerOrder} ${totalCount === 1 ? 'Kinywaji' : 'Vinywaji'}`;
  }

  if (tray) {
    if (totalCount > 0) {
      tray.classList.add('active');
    } else {
      tray.classList.remove('active');
    }
  }
}

// Submit Order to Server & Multi-Channel SMS/WA Dispatch
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
  if (totalCount > maxTotalPerOrder) {
    showToast(`Kikomo cha agizo moja ni vinywaji ${maxTotalPerOrder} pekee.`);
    return;
  }

  // Check per-item limits
  for (const it of items) {
    const limit = it.drink.maxQtyPerOrder || 4;
    if (it.qty > limit) {
      showToast(`Kikomo cha ${it.drink.name} ni ${limit} pekee.`);
      return;
    }
  }

  const guestName = document.getElementById('order-guest-name')?.value.trim() || '';
  const notes = document.getElementById('order-notes')?.value.trim() || '';
  const submitBtn = document.getElementById('btn-submit-order');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳ Inatuma Oda kwa Wahudumu...</span>`;
  }

  const payload = {
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
      // Clear Cart
      const orderedItems = [...items];
      cart = {};
      renderDrinks();
      updateTrayUI();

      // Show Success Modal
      openSuccessModal(data.order || payload, orderedItems);
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

function openSuccessModal(order, items) {
  const modal = document.getElementById('order-success-modal');
  const tableEl = document.getElementById('success-modal-table');
  const itemsEl = document.getElementById('success-modal-items');

  if (tableEl) {
    tableEl.textContent = `📍 ${activeTable.name}`;
  }

  if (itemsEl) {
    const itemsHtml = (items || []).map(it => `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
        <span>${it.drink.icon || '🍹'} <strong>${it.qty}x</strong> ${escapeHtml(it.drink.name)}</span>
        <span style="color: #2ecc71; font-weight: 700;">✓ Imeagizwa</span>
      </div>
    `).join('');

    itemsEl.innerHTML = `
      <div style="font-weight: 700; color: var(--gold-light); margin-bottom: 8px;">Vinywaji Ulivyoagiza:</div>
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
