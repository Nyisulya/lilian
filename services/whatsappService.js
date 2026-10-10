/**
 * Automated WhatsApp Card & Invitation Dispatch Service
 * Supports: UltraMsg, Wasender, Meta Cloud API, Green-API, and Simulation Mode
 */

const fs = require('fs');
const path = require('path');
const { readDB, writeDB } = require('./db');

function formatPhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '255' + cleaned.substring(1);
  } else if (cleaned.startsWith('+255')) {
    cleaned = cleaned.substring(1);
  } else if (!cleaned.startsWith('255') && cleaned.length === 9) {
    cleaned = '255' + cleaned;
  }
  return cleaned;
}

/**
 * Dispatch WhatsApp Message (Image or Text) via Configured Gateway
 */
async function sendRawWhatsApp(toPhone, messageText, imageUrl = '', messageType = 'Mwaliko wa Kadi', guestName = '', options = {}) {
  const db = readDB();
  const config = db.whatsappConfig || {};
  const formattedPhone = formatPhone(toPhone);

  const logEntry = {
    id: `wa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    recipientName: guestName,
    recipientPhone: formattedPhone,
    messageType: messageType,
    messageText: messageText,
    imageUrl: imageUrl || null,
    provider: config.provider || 'UltraMsg',
    status: 'pending',
    responseMessage: ''
  };

  const wasenderApiKey = process.env.WASENDER_API_KEY || config.wasenderApiKey || (config.provider === 'Wasender' ? config.apiKey : '');
  const waProvider = config.provider || (wasenderApiKey ? 'Wasender' : 'UltraMsg');
  const waApiKey = (waProvider === 'Wasender' ? wasenderApiKey : '') || process.env.WHATSAPP_API_KEY || (waProvider === 'UltraMsg'
    ? (config.ultraMsgApiKey || config.apiKey)
    : config.apiKey);
  const waInstanceId = process.env.WHATSAPP_INSTANCE_ID || config.instanceId;

  // 1. Simulation Mode or Missing Credentials
  if (config.simulationMode === true || !waApiKey) {
    logEntry.status = 'delivered';
    logEntry.responseMessage = config.simulationMode === true 
      ? 'Imetumwa WhatsApp kwa mafanikio (Simulation Mode)' 
      : 'Imehifadhiwa (Tafadhali weka WhatsApp API Token kwenye Mipangilio)';

    db.whatsappLogs = db.whatsappLogs || [];
    db.whatsappLogs.unshift(logEntry);
    writeDB(db);

    console.log(`[WHATSAPP SIMULATION] To: ${formattedPhone} | Type: ${messageType}\nImage: ${imageUrl || 'None'}\nText: ${messageText}`);
    return { success: true, mode: 'simulation', log: logEntry };
  }

  // 2. WasenderAPI Gateway (Direct WhatsApp Web Session via wasenderapi.com)
  if (waProvider === 'Wasender') {
    if (!wasenderApiKey) {
      logEntry.status = 'failed';
      logEntry.provider = 'Wasender';
      logEntry.responseMessage = 'WASENDER_API_KEY haipo. Weka API key ya Wasender kwenye .env au kwenye Mipangilio ya WhatsApp.';
      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);
      return { success: false, error: logEntry.responseMessage, log: logEntry };
    }
    try {
      const endpoint = 'https://wasenderapi.com/api/send-message';
      const recipientNumber = formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`;
      
      let finalImageUrl = imageUrl;
      if (options.cardLocalPath && fs.existsSync(options.cardLocalPath)) {
        try {
          const fileBuf = fs.readFileSync(options.cardLocalPath);
          const upRes = await fetch('https://wasenderapi.com/api/upload', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${wasenderApiKey}`,
              'Content-Type': 'image/jpeg'
            },
            body: fileBuf
          });
          const upData = await upRes.json().catch(() => ({}));
          if (upData && upData.publicUrl) {
            finalImageUrl = upData.publicUrl;
          }
        } catch (e) {
          console.warn('Wasender direct upload fallback:', e);
        }
      }

      const payload = {
        to: recipientNumber,
        text: messageText
      };

      if (finalImageUrl && finalImageUrl.startsWith('http')) {
        payload.imageUrl = finalImageUrl;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${wasenderApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json().catch(() => ({}));
      if (response.ok && (resData.success === true || resData.data?.msgId)) {
        logEntry.status = 'delivered';
        logEntry.provider = 'Wasender';
        logEntry.responseMessage = 'Imetumwa WhatsApp kwa mafanikio kupitia WasenderAPI';
      } else {
        logEntry.status = 'failed';
        logEntry.provider = 'Wasender';
        logEntry.responseMessage = resData.message || resData.error || `Hitilafu ya WasenderAPI (${response.status})`;
      }

      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);

      return { success: response.ok && resData.success !== false, data: resData, log: logEntry };
    } catch (err) {
      console.error('WasenderAPI Exception:', err);
      logEntry.status = 'failed';
      logEntry.provider = 'Wasender';
      logEntry.responseMessage = err.message || 'Hitilafu ya mtandao';
      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);
      return { success: false, error: err.message, log: logEntry };
    }
  }

  // 3. UltraMsg Gateway (Easiest & Most Popular in Tanzania for Auto WhatsApp)
  if (waProvider === 'UltraMsg' && waInstanceId && waApiKey) {
    try {
      const rawInst = String(waInstanceId).trim();
      const instId = rawInst.startsWith('instance') ? rawInst : `instance${rawInst}`;
      const endpoint = imageUrl 
        ? `https://api.ultramsg.com/${instId}/messages/image`
        : `https://api.ultramsg.com/${instId}/messages/chat`;

      let cleanImage = imageUrl;
      if (cleanImage && cleanImage.startsWith('data:')) {
        cleanImage = cleanImage.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
      }

      const payload = imageUrl ? {
        token: waApiKey,
        to: formattedPhone,
        image: cleanImage,
        caption: messageText
      } : {
        token: waApiKey,
        to: formattedPhone,
        body: messageText
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(payload).toString()
      });

      const resData = await response.json().catch(() => ({}));
      if (response.ok && (resData.sent === 'true' || resData.id)) {
        logEntry.status = 'delivered';
        logEntry.responseMessage = 'Imetumwa WhatsApp kwa mafanikio kupitia UltraMsg';
      } else {
        logEntry.status = 'failed';
        logEntry.responseMessage = resData.message || resData.error || `Hitilafu ya UltraMsg (${response.status})`;
      }

      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);

      return { success: response.ok, data: resData, log: logEntry };
    } catch (err) {
      console.error('UltraMsg Exception:', err);
      logEntry.status = 'failed';
      logEntry.responseMessage = err.message || 'Hitilafu ya mtandao';
      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);
      return { success: false, error: err.message, log: logEntry };
    }
  }

  // 3. Meta Official Cloud API
  const metaToken = process.env.WHATSAPP_TOKEN || config.apiKey;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || config.phoneNumberId;
  const useTemplate = options.useTemplate ?? config.useTemplate ?? (waProvider === 'Meta');
  const metaTemplate = options.templateName || config.templateName || 'mwaliko_wa_sherehe';
  const metaLang = options.templateLanguage || config.templateLanguage || 'sw';
  const metaParams = options.templateParams || config.templateParams;

  if (waProvider === 'Meta' && metaPhoneId && metaToken) {
    try {
      const endpoint = `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`;
      
      let payload;
      if (useTemplate && metaTemplate) {
        // Send via Approved Meta Template
        payload = {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: metaTemplate,
            language: { code: metaLang },
            components: []
          }
        };

        const headerImageUrl = options.headerImageUrl || (imageUrl && imageUrl.startsWith('http') ? imageUrl : null);
        if (headerImageUrl) {
          payload.template.components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: headerImageUrl } }]
          });
        }

        if (metaParams && Array.isArray(metaParams) && metaParams.length > 0) {
          payload.template.components.push({
            type: 'body',
            parameters: metaParams.map(p => ({ type: 'text', text: String(p || '') }))
          });
        }
      } else {
        // Direct image/text payload
        payload = (imageUrl && imageUrl.startsWith('http')) ? {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'image',
          image: {
            link: imageUrl,
            caption: messageText
          }
        } : {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: messageText }
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const resData = await response.json().catch(() => ({}));
      if (response.ok && resData.messages) {
        logEntry.status = 'delivered';
        logEntry.responseMessage = 'Imetumwa WhatsApp kwa mafanikio kupitia Meta Cloud API';
      } else {
        logEntry.status = 'failed';
        logEntry.responseMessage = resData?.error?.message || `Hitilafu ya Meta (${response.status})`;
      }

      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);

      return { success: response.ok, data: resData, log: logEntry };
    } catch (err) {
      console.error('Meta Cloud API Exception:', err);
      logEntry.status = 'failed';
      logEntry.responseMessage = err.message;
      db.whatsappLogs = db.whatsappLogs || [];
      db.whatsappLogs.unshift(logEntry);
      writeDB(db);
      return { success: false, error: err.message, log: logEntry };
    }
  }

  // Fallback if provider not matched
  logEntry.status = 'failed';
  logEntry.responseMessage = `Mtoa huduma '${waProvider}' hajatambuliwa au hana credentials sahihi. Ujumbe HAUJATUMWA.`;
  db.whatsappLogs = db.whatsappLogs || [];
  db.whatsappLogs.unshift(logEntry);
  writeDB(db);
  return { success: false, mode: 'unmatched', error: logEntry.responseMessage, log: logEntry };
}

/**
 * Send Full 3-Message WhatsApp Sequence Automatically upon Payment Completion
 */
async function sendFullWhatsAppInvitation(guest) {
  const db = readDB();
  const event = db.event || {};
  const config = db.whatsappConfig || db.smsConfig || {};
  const systemUrl = config.systemUrl || 'https://lilian.nyisu.com';
  
  const venue = event.receptionVenue || 'Bragging Social Hall, Goba, Dar es Salaam';
  const mapsUrl = event.googleMapsUrl || 'https://maps.google.com/?q=Bragging+Social+Hall+Goba+Dar+es+Salaam';
  const guestCode = guest.code || guest.id || '3001';
  const isDouble = Number(guest.seats) >= 2;
  
  // Attach personalized card image (base64 for instant delivery)
  const cardLocalPath = path.join(__dirname, '..', 'public', 'images', 'cards', `card_${guest.id}.jpg`);
  let cardImagePayload = `${systemUrl}/images/cards/card_${guest.id}.jpg`;
  if (fs.existsSync(cardLocalPath)) {
    const base64Data = fs.readFileSync(cardLocalPath).toString('base64');
    cardImagePayload = 'data:image/jpeg;base64,' + base64Data;
  }

  const doubleNotice = isDouble 
    ? '\n\n📲 *Kumbuka:* Kadi hii ni DOUBLE, unaweza kumtumia mpendwa wako mtakayeongozana naye ukumbini.'
    : '';

  const msg = `💍 *KADI YA MWALIKO - SEND-OFF YA LILIAN*

Habari Ndugu *${guest.name}*,

Uthibitisho wa kadi yako ya mwaliko wa Send-off ya Lilian umeambatanishwa hapa. Tafadhali hifadhi kadi hii kwa ajili ya kuonyesha getini.

📍 *Mahali Ukumbi Ulipo (Location):*
${venue}
👉 ${mapsUrl}

✍️ *Tafadhali bofya link hii kuthibitisha uwepo wako:*
👉 ${systemUrl}/confirm/${guestCode}

📖 Bonyeza link hii kuona hadithi nzuri na picha za Lilian:
👉 ${systemUrl}

Karibu sana tufurahi na kusherehekea pamoja! ✨🥂`;

  const publicCardUrl = `${systemUrl}/images/cards/card_${guest.id}.jpg`;
  const sendOptions = {
    cardLocalPath: fs.existsSync(cardLocalPath) ? cardLocalPath : null,
    useTemplate: config.provider === 'Meta',
    templateName: config.templateName || 'mwaliko_wa_sherehe',
    templateLanguage: config.templateLanguage || 'sw',
    headerImageUrl: publicCardUrl,
    templateParams: [
      guest.name,
      isDouble 
        ? 'Kumbuka: Kadi hii ni DOUBLE, unaweza kumtumia mpendwa wako mtakayeongozana naye ukumbini.' 
        : 'Karibu sana tufurahi na kusherehekea pamoja!'
    ]
  };

  const res = await sendRawWhatsApp(guest.phone, msg, cardImagePayload, 'Kadi ya Mwaliko', guest.name, sendOptions);
  return { success: res.success !== false, results: [res] };
}

/**
 * Send WhatsApp Card Invitation Sequence to all guests who have completed payment
 */
async function sendAllCompletedWhatsAppInvitations() {
  const db = readDB();
  const guests = db.guests || [];
  
  // Find guests with completed payments and a valid phone number
  const completedGuests = guests.filter(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const isPaid = (pledge > 0 && paid >= pledge) || g.isCompleted === true;
    const hasPhone = g.phone && g.phone.replace(/[^0-9]/g, '').length >= 9;
    return isPaid && hasPhone;
  });

  const results = [];
  for (const guest of completedGuests) {
    try {
      const res = await sendFullWhatsAppInvitation(guest);
      results.push({ guestId: guest.id, name: guest.name, phone: guest.phone, success: res.success });
      // 5.0s delay for Wasender account protection and anti-ban policy
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      results.push({ guestId: guest.id, name: guest.name, phone: guest.phone, success: false, error: err.message });
    }
  }

  return {
    total: completedGuests.length,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  };
}

/**
 * 2. Automated WhatsApp Dispatch for Table Drink Orders
 * Sends instant order ticket to the assigned service phone (e.g. 0787661560)
 */
async function sendTableDrinkOrderWhatsApp(order, targetPhone = '0787661560') {
  const db = readDB();
  const event = db.event || {};
  const bride = event.brideName || 'Lilian';

  const itemsList = (order.items || []).map(it => `• *${it.qty || 1}x* ${it.name} ${it.icon || '🍹'}`).join('\n');
  const now = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

  const msg = `🍾 *ODA MPYA YA KINYWAJI MEZANI* 🍾
💍 *Sherehe:* Send-off ya ${bride.toUpperCase()}
📍 *Meza:* *${(order.tableName || 'Meza ya Wageni').toUpperCase()}*
👤 *Mualikwa / Mteja:* ${order.guestName ? order.guestName : 'Mgeni wa Meza'}

📋 *Vinywaji Vilivyoagizwa:*
${itemsList || '• Kinywaji hakikutajwa'}

${order.notes ? `📝 *Maelekezo:* ${order.notes}\n` : ''}⏰ *Muda:* Saa ${now}
🔢 *Namba ya Oda:* #${order.id || Date.now()}

_Mhudumu wetu atafikisha vinywaji hivi moja kwa moja kwenye meza husika mara moja!_ 🥂`;

  return await sendRawWhatsApp(targetPhone, msg, '', 'Oda ya Kinywaji cha Meza', order.guestName || order.tableName);
}

module.exports = {
  sendRawWhatsApp,
  sendFullWhatsAppInvitation,
  sendAllCompletedWhatsAppInvitations,
  sendTableDrinkOrderWhatsApp,
  formatPhone
};
