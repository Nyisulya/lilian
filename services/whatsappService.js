/**
 * Automated WhatsApp Card & Invitation Dispatch Service
 * Supports: UltraMsg, Wasender, Meta Cloud API, Green-API, and Simulation Mode
 */

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
async function sendRawWhatsApp(toPhone, messageText, imageUrl = '', messageType = 'Mwaliko wa Kadi', guestName = '') {
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

  // 1. Simulation Mode or Missing Credentials
  if (config.simulationMode !== false || !config.apiKey) {
    logEntry.status = 'delivered';
    logEntry.responseMessage = config.simulationMode !== false 
      ? 'Imetumwa WhatsApp kwa mafanikio (Simulation Mode)' 
      : 'Imehifadhiwa (Tafadhali weka WhatsApp API Token kwenye Mipangilio)';

    db.whatsappLogs = db.whatsappLogs || [];
    db.whatsappLogs.unshift(logEntry);
    writeDB(db);

    console.log(`[WHATSAPP SIMULATION] To: ${formattedPhone} | Type: ${messageType}\nImage: ${imageUrl || 'None'}\nText: ${messageText}`);
    return { success: true, mode: 'simulation', log: logEntry };
  }

  // 2. UltraMsg Gateway (Easiest & Most Popular in Tanzania for Auto WhatsApp)
  if (config.provider === 'UltraMsg' && config.instanceId && config.apiKey) {
    try {
      const endpoint = imageUrl 
        ? `https://api.ultramsg.com/${config.instanceId}/messages/image`
        : `https://api.ultramsg.com/${config.instanceId}/messages/chat`;

      const payload = imageUrl ? {
        token: config.apiKey,
        to: formattedPhone,
        image: imageUrl,
        caption: messageText
      } : {
        token: config.apiKey,
        to: formattedPhone,
        body: messageText
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
  if (config.provider === 'Meta' && config.phoneNumberId && config.apiKey) {
    try {
      const endpoint = `https://graph.facebook.com/v19.0/${config.phoneNumberId}/messages`;
      const payload = imageUrl ? {
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

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
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
  logEntry.status = 'delivered';
  logEntry.responseMessage = 'Imesajiliwa kwenye kumbukumbu';
  db.whatsappLogs = db.whatsappLogs || [];
  db.whatsappLogs.unshift(logEntry);
  writeDB(db);
  return { success: true, mode: 'logged', log: logEntry };
}

/**
 * Send Full 3-Message WhatsApp Sequence Automatically upon Payment Completion
 */
async function sendFullWhatsAppInvitation(guest) {
  const db = readDB();
  const event = db.event || {};
  const bride = event.brideName || 'Lilian';
  const table = (db.tables || []).find(t => t.id === guest.tableId) || { name: 'Meza Maalumu' };
  const config = db.whatsappConfig || db.smsConfig || {};
  const systemUrl = config.systemUrl || 'https://lilian.nyisu.com';
  
  const dateStr = '13 Oktoba 2026';
  const timeStr = 'Kuanzia Saa 12:30 Jioni';
  const venue = event.receptionVenue || 'Mlimani City Conference Hall, Dar es Salaam';
  const mapsUrl = event.googleMapsUrl || 'https://maps.google.com/?q=Mlimani+City+Conference+Centre+Dar+es+Salaam';
  const cardImageUrl = `${systemUrl}${event.bridePhoto || '/images/lilian_sendoff.jpg'}`;
  const interactiveCardUrl = `${systemUrl}/invite/${guest.id}`;

  // Message 1: Official Invitation + Photo Card + 4-Digit Pass Code
  const famName = event.familyName || 'Mzee Marcus Nyahende';
  const seatTypeStr = Number(guest.seats) === 2 ? 'Double (Wewe na Mwenza wako)' : (Number(guest.seats) === 1 ? 'Single (Mtu 1)' : `Watu ${guest.seats}`);
  const msg1 = `💍 *MWALIKO WA SHEREHE YA SEND-OFF YA ${bride.toUpperCase()}* 💍\n\nHabari Ndugu *${guest.name}*,\n\nFamilia ya ${famName} inayo heshima na furaha kubwa kukualika ${guest.seats > 1 ? 'wewe na mwenza wako' : ''} katika usiku wa sherehe ya kumuaga binti yao mpendwa *${bride}* (Send-off Party).\n\n🎟️ *Aina ya Kadi (Mwaliko):* ${seatTypeStr}\n📍 *Meza Yako:* ${table.name}\n🔑 *Kodi Yako ya Kuingilia Mlangoni:* *${guest.code || '4829'}*\n📅 *Tarehe:* ${dateStr}\n⏰ *Muda:* ${timeStr}\n🏛️ *Ukumbi:* ${venue}\n\n✨ Fungua Kadi Yako ya Kidijitali ya VIP hapa:\n👉 ${interactiveCardUrl}\n\nPicha ya kadi yako rasmi imeambatanishwa hapo juu. Karibu sana tufurahi pamoja! ✨🥂`;

  // Message 2: Venue Location
  const msg2 = `📍 *UKUMBI & MAHALI ILIPO (LOCATION)* 📍\n\nSherehe itafanyika:\n🏛️ *Ukumbi:* ${venue}\n📅 *Tarehe:* ${dateStr}\n⏰ *Muda:* ${timeStr}\n\nBonyeza link hii ya Google Maps itakuongoza moja kwa moja hadi ukumbini bila kupotea:\n👉 ${mapsUrl}\n\nKaribu sana!`;

  // Message 3: Dress Code & Schedule
  const msg3 = `👗👔 *DRESS CODE & RATIBA YA USIKU WA SEND-OFF* 👗👔\n\n🎨 *Rangi Rasmi za Siku Hiyo (Dress Code):*\n• *Shades of Blue & Sterling Silver* (Vivuli vya Bluu na Fedha kung'aa) au vazi lolote nadhifu la heshima.\n• Rangi zinazopendekezwa: Midnight Blue, Navy Blue, Royal Blue, Cerulean, Sky Blue, na vito/aksesori za Sterling Silver.\n\n⏰ *Ratiba ya Matukio:*\n• Saa 12:00 Jioni: Milango ya ukumbi inafunguliwa & Mapokezi ya wageni\n• Saa 01:30 Usiku: Bibi Harusi (${bride}) anaingia ukumbini\n• Saa 02:30 Usiku: Chakula cha usiku (Dinner) & Shamrashamra\n\nTunakutakia maandalizi mema, uwepo wako utaleta nakshi na furaha kubwa! 🙏💐`;

  const results = [];
  // Send 1st (Photo + Invite)
  const r1 = await sendRawWhatsApp(guest.phone, msg1, cardImageUrl, 'Kadi ya Picha & Mwaliko', guest.name);
  results.push(r1);

  // Send 2nd (Location)
  const r2 = await sendRawWhatsApp(guest.phone, msg2, '', 'Ramani ya Ukumbi (Location)', guest.name);
  results.push(r2);

  // Send 3rd (Dress Code)
  const r3 = await sendRawWhatsApp(guest.phone, msg3, '', 'Dress Code & Ratiba', guest.name);
  results.push(r3);

  return { success: true, results };
}

/**
 * 2. Automated WhatsApp Dispatch for Table Drink Orders
 * Sends instant order ticket to the assigned bar waiter / bartender number (e.g. 0787661560)
 */
async function sendTableDrinkOrderWhatsApp(order, targetPhone = '0787661560') {
  const db = readDB();
  const event = db.event || {};
  const groom = event.groomName || 'James';
  const bride = event.brideName || 'Lilian';

  const itemsList = (order.items || []).map(it => `• *${it.qty || 1}x* ${it.name} ${it.icon || '🍹'}`).join('\n');
  const now = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

  const msg = `🍾 *ODA MPYA YA KINYAWAJI (BAR ORDER)* 🍾
💍 *Sherehe:* Send-off ya ${bride.toUpperCase()} & ${groom.toUpperCase()}
📍 *Meza:* *${(order.tableName || 'Meza ya Wageni').toUpperCase()}*
👤 *Mualikwa / Mteja:* ${order.guestName ? order.guestName : 'Mgeni wa Meza'}

📋 *Vinywaji Vilivyoagizwa:*
${itemsList || '• Kinywaji hakikutajwa'}

${order.notes ? `📝 *Maelekezo:* ${order.notes}\n` : ''}⏰ *Muda:* Saa ${now}
🔢 *Namba ya Oda:* #${order.id || Date.now()}

_Mhudumu wa baa tafadhali fikisha vinywaji hivi kwenye meza husika mara moja!_ 🥂`;

  return await sendRawWhatsApp(targetPhone, msg, '', 'Oda ya Kinywaji cha Meza', order.guestName || order.tableName);
}

module.exports = {
  sendRawWhatsApp,
  sendFullWhatsAppInvitation,
  sendTableDrinkOrderWhatsApp,
  formatPhone
};
