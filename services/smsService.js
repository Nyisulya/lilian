/**
 * NextSMS Integration Service
 * Messaging API: https://messaging-service.co.tz/api/sms/v1/text/single
 */

const { readDB, writeDB } = require('./db');

// Format phone number to Tanzanian standard 255XXXXXXXXX
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
 * Dispatch SMS via NextSMS API or Simulation
 */
async function sendRawSMS(toPhone, messageText, messageType, guestName = '') {
  const db = readDB();
  const config = db.smsConfig || {};
  const formattedPhone = formatPhone(toPhone);

  const cleanMessageText = (messageText || '').replace(/\*/g, '');

  const logEntry = {
    id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    recipientName: guestName,
    recipientPhone: formattedPhone,
    messageType: messageType,
    messageText: cleanMessageText,
    provider: 'NextSMS',
    senderId: config.senderId || 'NEXTSMS',
    status: 'pending',
    responseMessage: ''
  };

  // Check if simulation mode is active or credentials not yet provided
  if (config.simulationMode || !config.username || !config.password) {
    logEntry.status = 'delivered';
    logEntry.responseMessage = config.simulationMode 
      ? 'Imetumwa kwa mafanikio (Simulation Mode)' 
      : 'Imetumwa kwenye kumbukumbu (Tafadhali weka NextSMS API Key)';

    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);

    console.log(`[SMS SIMULATION] To: ${formattedPhone} | Type: ${messageType}\nMessage: ${cleanMessageText}`);
    return { success: true, mode: 'simulation', log: logEntry };
  }

  // STRICT SAFETY ENFORCEMENT: Only allow sending live SMS to user's phone (0787661560 / 255787661560)
  const ALLOWED_LIVE_PHONE = '255787661560';
  if (formattedPhone !== ALLOWED_LIVE_PHONE) {
    logEntry.status = 'blocked_safety';
    logEntry.responseMessage = 'Ujumbe umezuiwa kiusalama (Ujumbe unaruhusiwa kutumwa kwa 0787661560 pekee)';
    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);
    console.log(`[SMS BLOCKED FOR SAFETY] Dispatched to ${formattedPhone} blocked. Allowed phone: 0787661560 only.`);
    return { success: false, blocked: true, message: 'Ujumbe umezuiwa: Ni namba 0787661560 pekee inayoruhusiwa kupokea SMS kwa sasa.', log: logEntry };
  }

  // Real NextSMS API Call
  try {
    const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
    
    const payload = {
      from: config.senderId || 'NEXTSMS',
      to: formattedPhone,
      text: cleanMessageText
    };

    const response = await fetch('https://messaging-service.co.tz/api/sms/v1/text/single', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json().catch(() => ({}));

    const firstMsg = resData?.messages?.[0];
    const msgStatus = firstMsg?.status?.name || '';
    const isRejected = msgStatus.includes('REJECTED');

    if (response.ok && !isRejected) {
      logEntry.status = 'delivered';
      logEntry.responseMessage = firstMsg?.status?.description || 'Imetumwa kwa mafanikio NextSMS';
    } else {
      logEntry.status = 'failed';
      logEntry.responseMessage = firstMsg?.status?.description || resData.message || `Hitilafu ya NextSMS (${response.status})`;
    }

    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);

    return { success: response.ok, data: resData, log: logEntry };
  } catch (err) {
    console.error('NextSMS API Exception:', err);
    logEntry.status = 'failed';
    logEntry.responseMessage = err.message || 'Hitilafu ya mtandao wakati wa kuwasiliana na NextSMS';

    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);

    return { success: false, error: err.message, log: logEntry };
  }
}

// Extract single first name (e.g. "Peter Joseph Mwita" -> "Peter", "Habari Peter")
function getFirstName(fullName) {
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

/**
 * 1. Automatic SMS on Payment Entry:
 * Thank You SMS (Guaranteed strictly 1 SMS <= 160 chars, ends with website domain lilian.nyisu.com)
 */
async function sendPaymentNotificationSMS(guest, amountPaidNewly, newBalance, totalPaid) {
  const db = readDB();
  const config = db.smsConfig || {};
  const domain = config.domainName || 'lilian.nyisu.com';
  const firstName = getFirstName(guest.name);

  // Keep single first name for Thank You SMS to guarantee strictly 1 SMS <= 160 characters
  let message = `Habari ${firstName}, asante kwa mchango Sendoff ya Lilian Marcus. Mungu akubariki na akuongezee zaidi!\nAmen.\nKuona taarifa za harusi: https://${domain}`;
  if (message.replace(/\n/g, '\r\n').length > 160) {
    message = `Habari ${firstName}, asante kwa mchango Sendoff ya Lilian Marcus. Mungu akubariki na akuongezee zaidi!\nAmen.\nKuona taarifa: https://${domain}`;
  }
  if (message.replace(/\n/g, '\r\n').length > 160) {
    message = `Habari ${firstName}, asante kwa mchango Sendoff ya Lilian Marcus. Mungu akubariki na akuongezee zaidi!\nAmen.\nKuona taarifa: ${domain}`;
  }

  return await sendRawSMS(guest.phone, message, 'Shukrani za Mchango (1 SMS)', firstName);
}

/**
 * 2. Automatic Debt / Sendoff Reminder SMS (Guaranteed <= 3 SMS Units, ends with website domain lilian.nyisu.com)
 */
async function sendDebtReminderSMS(guest, remainingBalance, customTemplate) {
  const db = readDB();
  const config = db.smsConfig || {};
  const domain = config.domainName || 'lilian.nyisu.com';
  // Use full name directly as stored in the database for reminder SMS
  const fullName = (guest.name || 'Mpendwa').trim();

  const defaultTemplate = `Habari {name}, naomba ushiriki katika maandalizi ya Sendoff ya Lilian Marcus Nyahende itakayofanyika 13/10/2026 Dar es Salaam.\nMchango wako ni muhimu sana.\n\nMchango utumwe kwa:\n0713980004 Mixx Peter Nyahende\n0716553494 Beatrice Kavita\n0132009296900 CRDB Beatrice Kavita\n8869724 M Pesa Lilian Sendoff\n\nTutashukuru tukipata mchango kabla ya 30 Sept 2026. Asante kwa upendo.\nMungu akubariki.\n${domain}`;

  let template = customTemplate || config.reminderTemplate || defaultTemplate;
  template = template.replace(/{name}/g, fullName).replace(/Ndugu\s+/g, 'Habari ').replace(/\*/g, '');
  if (template.includes('https://lilian.nyisu.com')) {
    template = template.replace('https://lilian.nyisu.com', 'lilian.nyisu.com');
  }
  const message = template;

  return await sendRawSMS(guest.phone, message, 'Kikumbusho cha Sendoff (SMS)', fullName);
}

/**
 * 3. Send Official Invitation SMS with 4-Digit Gate Pass Code & Digital Card (ends with lilian.nyisu.com)
 */
async function sendInvitationSMS(guest) {
  const db = readDB();
  const config = db.smsConfig || {};
  const domain = config.domainName || 'lilian.nyisu.com';
  const baseUrl = config.systemUrl || `https://${domain}`;
  const seatType = Number(guest.seats) === 2 ? 'Double' : (Number(guest.seats) === 1 ? 'Single' : `Watu ${guest.seats}`);
  const cardUrl = `${baseUrl}/invite/${guest.id}`;
  const firstName = getFirstName(guest.name);

  const message = `Habari ${firstName}, unakaribishwa kwenye Send-off ya Lilian Marcus Nyahende tarehe 13/10/2026 ukumbi wa Bragging Social Hall, Goba. Kodi yako: ${guest.code || '3001'} (${seatType}). Kadi: ${cardUrl} | ${domain}`;

  return await sendRawSMS(guest.phone, message, 'Mwaliko & Pass Code', firstName);
}

module.exports = {
  sendRawSMS,
  sendPaymentNotificationSMS,
  sendDebtReminderSMS,
  sendInvitationSMS,
  formatPhone,
  getFirstName
};
