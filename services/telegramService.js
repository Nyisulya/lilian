/**
 * Telegram Bot Notification Service for Lilian Send-off
 * Bot: @Lilian_sendoff_bot (t.me/Lilian_sendoff_bot)
 * Token: 8845308239:AAFy1h8-dX29OSZMVLQXuqM4jb7ZMTyX-Do
 * 
 * Automatically sends instant drink orders placed via QR codes to Telegram
 * and registers any user or group that starts or messages the bot.
 */

const https = require('https');
const dbService = require('./db');
const { readDB, writeDB } = dbService;

const DEFAULT_BOT_TOKEN = '8845308239:AAFy1h8-dX29OSZMVLQXuqM4jb7ZMTyX-Do';
const BOT_USERNAME = 'Lilian_sendoff_bot';

let lastUpdateId = 0;
let pollingTimer = null;

function getBotToken() {
  const db = readDB();
  return (db.telegramConfig && db.telegramConfig.token) || process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
}

/**
 * Helper to make Telegram API requests
 */
function telegramRequest(method, endpoint, payload = null) {
  return new Promise((resolve, reject) => {
    const token = getBotToken();
    const postData = payload ? JSON.stringify(payload) : null;
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${token}/${endpoint}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          resolve({ ok: false, error: 'JSON_PARSE_ERROR', raw: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Telegram API request timed out'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Sync updates from Telegram to discover who tapped /start or added the bot
 */
async function syncTelegramUpdates() {
  try {
    const res = await telegramRequest('GET', `getUpdates?offset=${lastUpdateId + 1}`);
    if (!res.ok || !Array.isArray(res.result)) {
      return { ok: false, newSubscribers: 0, totalSubscribers: 0 };
    }

    const db = readDB();
    db.telegramConfig = db.telegramConfig || {
      token: DEFAULT_BOT_TOKEN,
      botUsername: BOT_USERNAME,
      chatIds: [],
      chats: [] // { id, name, type, addedAt }
    };

    let newFound = 0;

    for (const update of res.result) {
      if (update.update_id > lastUpdateId) {
        lastUpdateId = update.update_id;
      }

      const msg = update.message || update.channel_post;
      if (!msg || !msg.chat) continue;

      const chatId = String(msg.chat.id);
      const chatTitle = msg.chat.title || [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' ') || msg.chat.username || 'Mtumiaji';
      const chatType = msg.chat.type || 'private';

      // Check if already registered
      if (!db.telegramConfig.chatIds.includes(chatId)) {
        db.telegramConfig.chatIds.push(chatId);
        db.telegramConfig.chats = db.telegramConfig.chats || [];
        db.telegramConfig.chats.push({
          id: chatId,
          name: chatTitle,
          type: chatType,
          username: msg.chat.username || null,
          addedAt: new Date().toISOString()
        });
        newFound++;

        // Send welcome reply
        sendTelegramMessage(chatId, `🎉 <b>Karibu kwenye Bot ya Send-off ya Lilian!</b>\n\nUmefanikiwa kujiunga. Ujumbe na taarifa za papo hapo za <b>oda za vinywaji mezani</b> zitafika hapa moja kwa moja. Mhudumu wetu atakuletea moja kwa moja kwenye meza yako. 🥂✨`).catch(() => {});
      }
    }

    if (newFound > 0) {
      writeDB(db);
      console.log(`🤖 Telegram Bot: Wateja/Magroup ${newFound} mapya yamesajiliwa kwa arifa za vinywaji.`);
    }

    return {
      ok: true,
      newSubscribers: newFound,
      totalSubscribers: db.telegramConfig.chatIds.length,
      chats: db.telegramConfig.chats
    };
  } catch (err) {
    console.error('Error syncing Telegram updates:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send raw HTML message to a specific chat ID
 */
async function sendTelegramMessage(chatId, htmlText) {
  return await telegramRequest('POST', 'sendMessage', {
    chat_id: chatId,
    text: htmlText,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

/**
 * Send drink order notification to all subscribed Telegram chats
 */
async function sendDrinkOrderNotification(order) {
  // Sync first to catch any recent /start
  await syncTelegramUpdates().catch(() => {});

  const db = readDB();
  const config = db.telegramConfig || {};
  const chatIds = config.chatIds || [];

  const timeStr = new Date(order.timestamp || Date.now()).toLocaleTimeString('sw-TZ', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const itemsList = (order.items || []).map(it => {
    return `• <b>${it.qty}x</b> ${it.icon || '🍹'} ${escapeHtml(it.name)}`;
  }).join('\n');

  const notesHtml = order.notes 
    ? `\n📝 <b>Maelekezo:</b> <i>"${escapeHtml(order.notes)}"</i>\n` 
    : '';

  const messageText = `🍾 <b>ODA MPYA YA KINYWAJI MEZANI</b> 🍾
💍 <b>Send-off ya Lilian</b>

📍 <b>Meza:</b> <b>${escapeHtml(order.tableName || 'Meza Kuu')}</b>
👤 <b>Mgeni / Mteja:</b> ${escapeHtml(order.guestName || 'Mgeni wa Meza')}
🔢 <b>Namba ya Oda:</b> <code>#${escapeHtml(order.id)}</code>
⏰ <b>Muda:</b> ${timeStr}

📋 <b>Vinywaji Vilivyoagizwa:</b>
${itemsList}
${notesHtml}
<i>Mhudumu wetu atafikisha vinywaji hivi moja kwa moja kwenye meza husika mara moja!</i> 🥂`;

  if (chatIds.length === 0) {
    console.warn('⚠️ Telegram Bot: Hakuna chat_id iliyosajiliwa bado. Fungua https://t.me/Lilian_sendoff_bot kisha bofya /start ili kuanza kupokea oda.');
    return {
      success: false,
      deliveredCount: 0,
      totalChats: 0,
      note: 'Hakuna aliyeanza bot bado. Bofya t.me/Lilian_sendoff_bot kisha bonyeza Start.'
    };
  }

  let deliveredCount = 0;
  const results = [];

  for (const cid of chatIds) {
    try {
      const res = await sendTelegramMessage(cid, messageText);
      if (res && res.ok) {
        deliveredCount++;
        results.push({ chatId: cid, status: 'sent' });
      } else {
        results.push({ chatId: cid, status: 'failed', error: res?.description });
      }
    } catch (e) {
      results.push({ chatId: cid, status: 'error', error: e.message });
    }
  }

  console.log(`📡 Telegram Bot: Oda #${order.id} imetumwa kwa watumiaji ${deliveredCount} / ${chatIds.length}`);
  return {
    success: deliveredCount > 0,
    deliveredCount,
    totalChats: chatIds.length,
    results
  };
}

/**
 * Send a test message to all registered chats or a specific chat
 */
async function sendTestNotification(targetChatId = null) {
  await syncTelegramUpdates().catch(() => {});
  const db = readDB();
  const chatIds = targetChatId ? [targetChatId] : (db.telegramConfig?.chatIds || []);

  if (chatIds.length === 0) {
    return {
      success: false,
      message: 'Hakuna mpokeaji aliyepatikana. Fungua t.me/Lilian_sendoff_bot kisha bofya /start kwenye Telegram.'
    };
  }

  const testText = `🔔 <b>JARIBIO LA MTANDAO WA TELEGRAM (@${BOT_USERNAME})</b>\n\n✅ Mfumo wa arifa za vinywaji vya <b>Send-off ya Lilian</b> umeunganishwa kikamilifu!\n\nWageni wakiscan QR Code ya mezani na kuweka oda ya vinywaji, taarifa zote zitafika hapa papo hapo. 🥂✨`;

  let sent = 0;
  for (const cid of chatIds) {
    try {
      const res = await sendTelegramMessage(cid, testText);
      if (res && res.ok) sent++;
    } catch (e) {}
  }

  return {
    success: sent > 0,
    sentCount: sent,
    totalChats: chatIds.length
  };
}

/**
 * Start periodic background syncing for new /start subscribers
 */
function startPolling(intervalMs = 30000) {
  if (pollingTimer) clearInterval(pollingTimer);
  // Initial sync
  syncTelegramUpdates().catch(() => {});
  pollingTimer = setInterval(() => {
    syncTelegramUpdates().catch(() => {});
  }, intervalMs);
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

module.exports = {
  getBotToken,
  syncTelegramUpdates,
  sendTelegramMessage,
  sendDrinkOrderNotification,
  sendTestNotification,
  startPolling,
  BOT_USERNAME
};
