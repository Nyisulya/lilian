/**
 * NextSMS Integration Service
 * Messaging API: https://messaging-service.co.tz/api/sms/v1/text/single
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { smsConfig: {}, smsLogs: [], guests: [], event: {} };
  }
}

function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing DB in smsService:', e);
    return false;
  }
}

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

  const logEntry = {
    id: `sms-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    recipientName: guestName,
    recipientPhone: formattedPhone,
    messageType: messageType,
    messageText: messageText,
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

    console.log(`[SMS SIMULATION] To: ${formattedPhone} | Type: ${messageType}\nMessage: ${messageText}`);
    return { success: true, mode: 'simulation', log: logEntry };
  }

  // Real NextSMS API Call
  try {
    const authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
    
    const payload = {
      from: config.senderId || 'NEXTSMS',
      to: formattedPhone,
      text: messageText
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

/**
 * 1. Automatic SMS on Payment Entry:
 * Thank You SMS (Guaranteed strictly 1 SMS <= 160 chars, ends with website domain lilian.nyisu.com)
 */
async function sendPaymentNotificationSMS(guest, amountPaidNewly, newBalance, totalPaid) {
  const db = readDB();
  const config = db.smsConfig || {};
  const domain = config.domainName || 'lilian.nyisu.com';

  // Base text requested: "Ndugu {name}, asante sana kwa mchango wako katika maandalizi ya Sendoff ya Lilian Marcus Nyahende. Mungu akubariki na akuongezee. Asante kwa upendo wako."
  // Tuned to guarantee strictly <= 160 characters (1 SMS) with domain lilian.nyisu.com at the end
  let message = `Ndugu ${guest.name}, asante kwa mchango wako Sendoff ya Lilian Marcus Nyahende. Mungu akubariki na akuongezee. Asante kwa upendo! ${domain}`;
  if (message.length > 160) {
    // Failsafe for extra-long guest names (e.g. 25+ chars):
    message = `Ndugu ${guest.name}, asante kwa mchango Sendoff ya Lilian Marcus Nyahende. Mungu akubariki na akuongezee! Asante. ${domain}`;
  }

  return await sendRawSMS(guest.phone, message, 'Shukrani za Mchango (1 SMS)', guest.name);
}

/**
 * 2. Automatic Debt / Sendoff Reminder SMS (Guaranteed <= 3 SMS Units, ends with website domain lilian.nyisu.com)
 */
async function sendDebtReminderSMS(guest, remainingBalance, customTemplate) {
  const db = readDB();
  const config = db.smsConfig || {};
  const domain = config.domainName || 'lilian.nyisu.com';

  const defaultTemplate = `Ndugu {name}, naomba ushiriki katika maandalizi ya Sendoff ya Lilian Marcus Nyahende itakayofanyika 13/10/2026 Dar es Salaam. Mchango wako ni muhimu sana.\n\nMchango utumwe kwa:\n0713980004 Mixx Peter Nyahende\n8869724 M Pesa Lilian Sendoff\n0132009296900 CRDB Beatrice Kavita\n0716275451 Mixx Lilian Marcus\n\nMchango ufikishwe kabla ya 30 Sept 2026. Asante kwa upendo. Mungu akubariki.\n${domain}`;

  const template = customTemplate || config.reminderTemplate || defaultTemplate;
  const message = template.replace(/{name}/g, guest.name);

  return await sendRawSMS(guest.phone, message, 'Kikumbusho cha Sendoff (SMS)', guest.name);
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

  const message = `Habari Ndugu ${guest.name}, unakaribishwa kwenye Send-off ya Lilian Marcus Nyahende tarehe 13/10/2026 ukumbi wa Mlimani City. Kodi yako: ${guest.code || '3001'} (${seatType}). Kadi: ${cardUrl} | ${domain}`;

  return await sendRawSMS(guest.phone, message, 'Mwaliko & Pass Code', guest.name);
}

module.exports = {
  sendRawSMS,
  sendPaymentNotificationSMS,
  sendDebtReminderSMS,
  sendInvitationSMS,
  formatPhone
};
