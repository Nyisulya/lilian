/**
 * Table QR Drink Ordering System (order.js)
 * Allows guests at tables to scan QR codes and place drink orders seamlessly.
 */

let allDrinks = [];
let allTables = [];
let activeTable = { id: 'meza-1', name: 'Meza Kuu' };
let currentCategory = 'all';
let cart = {}; // { [drinkId]: { drink, qty } }

document.addEventListener('DOMContentLoaded', async () => {
  detectTableFromUrl();
  await loadEventAndDrinks();
  renderDrinks();
});

// 1. Detect Table ID from path /order/:tableId or ?table=...
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

// 2. Load Drinks & Tables
async function loadEventAndDrinks() {
  try {
    const res = await fetch('/api/event');
    const data = await res.json();
    allDrinks = data.drinks || [];
    allTables = data.tables || [];

    // Find table name
    const foundTable = allTables.find(t => 
      String(t.id).toLowerCase() === String(activeTable.id).toLowerCase() ||
      String(t.name).toLowerCase() === String(activeTable.id).toLowerCase()
    );

    if (foundTable) {
      activeTable = foundTable;
    } else {
      activeTable.name = activeTable.id.replace(/-/g, ' ').toUpperCase();
    }

    // Update UI table pills
    const nameEl = document.getElementById('active-table-name');
    if (nameEl) nameEl.textContent = activeTable.name;

    const trayTable = document.getElementById('tray-table-display');
    if (trayTable) trayTable.textContent = `📍 ${activeTable.name}`;

  } catch (err) {
    console.error('Error loading drinks:', err);
  }
}

// 3. Filter Category
function filterCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDrinks();
}

// 4. Render Drinks Grid
function renderDrinks() {
  const container = document.getElementById('drinks-grid-container');
  if (!container) return;

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

    const visualHtml = d.image
      ? `<div class="drink-image-wrap"><img src="${d.image}" alt="${escapeHtml(d.name)}" onerror="this.parentElement.innerHTML='<div class=\\'drink-icon-wrap\\'>${d.icon || '🍹'}</div>'"></div>`
      : `<div class="drink-icon-wrap">${d.icon || '🍹'}</div>`;

    return `
      <div class="drink-card" id="card-${d.id}">
        <div>
          ${visualHtml}
          <div class="drink-name">${escapeHtml(d.name)}</div>
          <div class="drink-desc">${escapeHtml(d.description || d.category || '')}</div>
        </div>

        <div class="drink-card-footer">
          <button type="button" 
                  class="btn-add-drink" 
                  id="btn-add-${d.id}" 
                  style="${hasQty ? 'display: none;' : 'display: block;'}" 
                  onclick="addDrinkToCart('${d.id}')">
            + Ongeza
          </button>

          <div class="qty-control-wrap ${hasQty ? 'active' : ''}" id="qty-wrap-${d.id}">
            <button type="button" class="qty-btn" onclick="changeQty('${d.id}', -1)">-</button>
            <span class="qty-val" id="qty-val-${d.id}">${qty}</span>
            <button type="button" class="qty-btn" onclick="changeQty('${d.id}', 1)">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 5. Cart Management
function addDrinkToCart(drinkId) {
  const drink = allDrinks.find(d => d.id === drinkId);
  if (!drink) return;

  cart[drinkId] = {
    drink,
    qty: 1
  };

  updateCardUI(drinkId);
  updateTrayUI();
}

function changeQty(drinkId, delta) {
  if (!cart[drinkId]) return;

  cart[drinkId].qty += delta;

  if (cart[drinkId].qty <= 0) {
    delete cart[drinkId];
  }

  updateCardUI(drinkId);
  updateTrayUI();
}

function updateCardUI(drinkId) {
  const addBtn = document.getElementById(`btn-add-${drinkId}`);
  const qtyWrap = document.getElementById(`qty-wrap-${drinkId}`);
  const qtyVal = document.getElementById(`qty-val-${drinkId}`);

  const item = cart[drinkId];
  const qty = item ? item.qty : 0;

  if (addBtn && qtyWrap && qtyVal) {
    if (qty > 0) {
      addBtn.style.display = 'none';
      qtyWrap.classList.add('active');
      qtyVal.textContent = qty;
    } else {
      addBtn.style.display = 'block';
      qtyWrap.classList.remove('active');
      qtyVal.textContent = '0';
    }
  }
}

function updateTrayUI() {
  const tray = document.getElementById('order-tray');
  const countBadge = document.getElementById('tray-total-items-badge');

  const items = Object.values(cart);
  const totalCount = items.reduce((sum, item) => sum + item.qty, 0);

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

// 6. Submit Order to Server & Auto WhatsApp Dispatch to 0787661560
async function submitDrinkOrder() {
  const items = Object.values(cart);
  if (items.length === 0) {
    alert('Tafadhali chagua angalau kinywaji kimoja kwenye menyu kabla ya kutuma oda.');
    return;
  }

  const guestName = document.getElementById('order-guest-name')?.value.trim() || '';
  const notes = document.getElementById('order-notes')?.value.trim() || '';
  const submitBtn = document.getElementById('btn-submit-order');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>⏳ Inatuma Oda kwa Mhudumu...</span>`;
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

    if (res.ok && data.success) {
      // Clear Cart
      const orderedItems = [...items];
      cart = {};
      renderDrinks();
      updateTrayUI();

      // Show Success Modal without leaving page!
      openSuccessModal(data.order || payload, orderedItems);
    } else {
      alert(`Hitilafu: ${data.error || 'Haikuweza kutuma oda. Tafadhali jaribu tena.'}`);
    }
  } catch (err) {
    console.error('Error submitting order:', err);
    alert('Hitilafu ya mtandao wakati wa kutuma oda ya kinywaji.');
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
      <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span>${it.drink.icon || '🍹'} <strong>${it.qty}x</strong> ${escapeHtml(it.drink.name)}</span>
        <span style="color: #2ecc71; font-weight: 700;">✓ Imeagizwa</span>
      </div>
    `).join('');

    itemsEl.innerHTML = `
      <div style="font-weight: 700; color: var(--gold-light); margin-bottom: 6px;">Vinywaji Ulivyoagiza:</div>
      ${itemsHtml}
      ${order.notes ? `<div style="margin-top: 8px; font-size: 0.78rem; color: #fae19c;">📝 <em>"${escapeHtml(order.notes)}"</em></div>` : ''}
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
