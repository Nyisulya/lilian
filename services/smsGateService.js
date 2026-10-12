/**
 * SMS Gateway for Android™ Integration Service (sms-gate.app)
 * Automatically dispatches instant SMS alerts for Table Drink Orders to the assigned phone.
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

function getSmsGateConfig() {
  const db = readDB();
  const dbCfg = db.orderNotificationConfig || db.smsGateConfig || {};

  return {
    enabled: dbCfg.enabled !== false,
    serverUrl: dbCfg.serverUrl || process.env.SMS_GATE_SERVER_URL || 'https://api.sms-gate.app',
    username: dbCfg.username || process.env.SMS_GATE_USERNAME || 'N9E09U',
    password: dbCfg.password || process.env.SMS_GATE_PASSWORD || 'uwuyehml2kt4p4',
    deviceId: dbCfg.deviceId || process.env.SMS_GATE_DEVICE_ID || 'v-6kXzHB8eibBnzwYeV-H',
    simNumber: parseInt(dbCfg.simNumber || process.env.SMS_GATE_SIM_NUMBER || 1, 10),
    recipientPhone: dbCfg.recipientPhone || process.env.SMS_GATE_ORDER_PHONE || '0787661560',
    simulationMode: dbCfg.simulationMode === true
  };
}

/**
 * Dispatch an SMS using sms-gate.app Cloud API
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
 * Format and send an Instant Table Drink Order Notification
 */
async function sendOrderSMSNotification(order, customPhone = '') {
  const cfg = getSmsGateConfig();
  const phoneToSend = customPhone || cfg.recipientPhone || '0787661560';

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

  return await sendSmsGateNotification(phoneToSend, smsText, {
    recipientName: `Mhudumu (${phoneToSend})`,
    messageType: 'Oda ya Kinywaji Mezani'
  });
}

module.exports = {
  getSmsGateConfig,
  sendSmsGateNotification,
  sendOrderSMSNotification,
  formatPhoneE164
};
