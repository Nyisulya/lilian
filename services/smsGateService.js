/**
 * SMS Gateway for Android™ Integration Service (sms-gate.app)
 * Automatically dispatches instant SMS alerts for Table Drink Orders to multiple assigned phones.
 */

const { readDB, writeDB } = require('./db');

function formatPhoneE164(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/[^0-9]/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '255' + digits.substring(1);
  } else if (digits.length === 9) {
    digits = '255' + digits;
  }
  return digits.startsWith('+') ? digits : `+${digits}`;
}

function parsePhonesList(raw) {
  if (Array.isArray(raw)) {
    return raw.map(p => String(p).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
  }
  return [];
}

function getSmsGateConfig() {
  const db = readDB();
  const dbCfg = db.orderNotificationConfig || db.smsGateConfig || {};

  let phones = parsePhonesList(dbCfg.recipientPhones);
  if (phones.length === 0 && dbCfg.recipientPhone) {
    phones = parsePhonesList(dbCfg.recipientPhone);
  }
  if (phones.length === 0 && process.env.SMS_GATE_ORDER_PHONE) {
    phones = parsePhonesList(process.env.SMS_GATE_ORDER_PHONE);
  }
  if (phones.length === 0) {
    phones = ['0787661560'];
  }

  return {
    enabled: dbCfg.enabled !== false,
    serviceActive: dbCfg.serviceActive !== false, // Master switch for table drink orders
    maxTotalPerOrder: parseInt(dbCfg.maxTotalPerOrder || 4, 10),
    serverUrl: dbCfg.serverUrl || process.env.SMS_GATE_SERVER_URL || 'https://api.sms-gate.app',
    username: dbCfg.username || process.env.SMS_GATE_USERNAME || 'N9E09U',
    password: dbCfg.password || process.env.SMS_GATE_PASSWORD || 'uwuyehml2kt4p4',
    deviceId: dbCfg.deviceId || process.env.SMS_GATE_DEVICE_ID || 'v-6kXzHB8eibBnzwYeV-H',
    simNumber: parseInt(dbCfg.simNumber || process.env.SMS_GATE_SIM_NUMBER || 1, 10),
    recipientPhones: phones,
    recipientPhone: phones[0] || '0787661560',
    simulationMode: dbCfg.simulationMode === true
  };
}

/**
 * Dispatch an SMS using sms-gate.app Cloud API to a single phone number
 */
async function sendSmsGateNotification(toPhone, messageText, options = {}) {
  const cfg = getSmsGateConfig();
  const targetPhone = formatPhoneE164(toPhone || cfg.recipientPhone);

  const logEntry = {
    id: `sms-gate-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    recipientName: options.recipientName || 'Mhudumu / Kaunta',
    recipientPhone: targetPhone,
    messageType: options.messageType || 'Oda ya Kinywaji Mezani',
    messageText: messageText,
    provider: 'SMS-Gate',
    senderId: `SIM ${cfg.simNumber}`,
    status: 'pending',
    responseMessage: ''
  };

  if (!cfg.enabled) {
    logEntry.status = 'skipped';
    logEntry.responseMessage = 'Arifa za SMS zimezimwa kwenye mipangilio.';
    return { success: false, skipped: true, error: logEntry.responseMessage };
  }

  if (cfg.simulationMode) {
    logEntry.status = 'delivered';
    logEntry.responseMessage = 'Imetumwa kwa mafanikio (Simulation Mode)';
    const db = readDB();
    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);
    console.log(`[SMS-GATE SIMULATION] To: ${targetPhone} | Message: ${messageText}`);
    return { success: true, mode: 'simulation', log: logEntry };
  }

  try {
    const authHeader = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    const endpoint = `${cfg.serverUrl.replace(/\/$/, '')}/3rdparty/v1/messages`;

    const payload = {
      textMessage: {
        text: messageText
      },
      phoneNumbers: [targetPhone],
      deviceId: cfg.deviceId,
      simNumber: cfg.simNumber
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json().catch(() => ({}));

    if (response.ok || response.status === 202) {
      logEntry.status = 'delivered';
      logEntry.responseMessage = `Imetumwa kwa mafanikio kupitia SMS-Gate (${resData.id || '202 Accepted'})`;
    } else {
      logEntry.status = 'failed';
      logEntry.responseMessage = resData.message || resData.error || `Hitilafu ya SMS-Gate (${response.status})`;
    }

    const db = readDB();
    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);

    return {
      success: logEntry.status === 'delivered',
      data: resData,
      log: logEntry
    };
  } catch (err) {
    console.error('SMS-Gate Dispatch Error:', err);
    logEntry.status = 'failed';
    logEntry.responseMessage = `Hitilafu ya Mtandao: ${err.message}`;

    const db = readDB();
    db.smsLogs = db.smsLogs || [];
    db.smsLogs.unshift(logEntry);
    writeDB(db);

    return { success: false, error: err.message, log: logEntry };
  }
}

/**
 * Format and send an Instant Table Drink Order Notification to ALL configured recipient phones
 */
async function sendOrderSMSNotification(order, specificPhones = null) {
  const cfg = getSmsGateConfig();
  const phonesToSend = Array.isArray(specificPhones) && specificPhones.length > 0 
    ? specificPhones 
    : cfg.recipientPhones;

  const itemsList = (order.items || [])
    .map(it => `• ${it.qty || 1}x ${it.name}`)
    .join('\n');

  const nowTime = new Date().toLocaleTimeString('sw-TZ', { hour: '2-digit', minute: '2-digit' });

  const smsText = `🍾 ODA MPYA YA KINYWAJI!
📍 Meza: ${order.tableName || order.tableId || 'Meza ya Wageni'} (#${order.id || ''})
👤 Mgeni: ${order.guestName || 'Mgeni wa Meza'}
📋 Vinywaji:
${itemsList || '• Kinywaji hakikutajwa'}
${order.notes ? `📝 Maelekezo: "${order.notes}"\n` : ''}⏰ Muda: ${nowTime}

Tafadhali peleka mezani mara moja!`;

  const results = [];
  for (const phone of phonesToSend) {
    const res = await sendSmsGateNotification(phone, smsText, {
      recipientName: `Mhudumu (${phone})`,
      messageType: 'Oda ya Kinywaji Mezani'
    });
    results.push({ phone, result: res });
  }

  return {
    success: results.some(r => r.result.success),
    totalSent: results.filter(r => r.result.success).length,
    results
  };
}

module.exports = {
  getSmsGateConfig,
  sendSmsGateNotification,
  sendOrderSMSNotification,
  formatPhoneE164,
  parsePhonesList
};
