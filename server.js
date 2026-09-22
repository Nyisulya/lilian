const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const multer = require('multer');
const compression = require('compression');
const dbService = require('./services/db');
const { readDB, writeDB, getDBFilePath } = dbService;
const smsService = require('./services/smsService');
const whatsappService = require('./services/whatsappService');
const telegramService = require('./services/telegramService');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'public', 'images');

// Ensure images directory exists
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, IMAGES_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E4);
    cb(null, `${baseName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max image upload
});

// Enable Gzip/Brotli Compression for ultra-fast load times
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Disable aggressive browser caching for code & data files so updates appear immediately
    if (/\.(html|css|js|json)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // Media files (jpg, png, mp3) cached with revalidation
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

// Database Backup Download Endpoint (One-click backup for Committee)
app.get('/api/backup/download', (req, res) => {
  const filePath = getDBFilePath();
  const dateTag = new Date().toISOString().slice(0, 10);
  res.download(filePath, `harusi_database_backup_${dateTag}.json`);
});

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

// 1. Event Info & Config
app.get('/api/event', (req, res) => {
  const db = readDB();
  res.json({
    event: db.event,
    tables: db.tables,
    drinks: db.drinks,
    timeline: db.timeline
  });
});

app.put('/api/event', (req, res) => {
  const db = readDB();
  db.event = { ...db.event, ...req.body };
  writeDB(db);
  res.json({ success: true, event: db.event });
});

// 2. Stats for Kamati Dashboard
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const guests = db.guests || [];

  const totalGuests = guests.length;
  let totalSeatsAllocated = 0;
  let completedCount = 0;
  let debtorsCount = 0;
  let totalDebtorsBalance = 0;
  let completedAmount = 0;
  let totalPledges = 0;
  let totalPaid = 0;

  const drinkCounts = {};
  (db.drinks || []).forEach(d => { drinkCounts[d.id] = { name: d.name, count: 0, icon: d.icon }; });

  const tableOccupancy = {};
  (db.tables || []).forEach(t => {
    tableOccupancy[t.id] = { id: t.id, name: t.name, capacity: t.capacity, assigned: 0, checkedIn: 0 };
  });

  guests.forEach(g => {
    const seats = Number(g.seats) || 1;
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;

    totalSeatsAllocated += seats;
    totalPledges += pledge;
    totalPaid += paid;

    if (pledge > 0 && balance <= 0) {
      completedCount++;
      completedAmount += paid;
    } else if (balance > 0) {
      debtorsCount++;
      totalDebtorsBalance += balance;
    }

    if (g.drinkPreference && drinkCounts[g.drinkPreference]) {
      drinkCounts[g.drinkPreference].count += seats;
    }

    if (g.tableId && tableOccupancy[g.tableId]) {
      tableOccupancy[g.tableId].assigned += seats;
    }
  });

  res.json({
    totalGuests,
    totalSeatsAllocated,
    completedCount,
    debtorsCount,
    totalDebtorsBalance,
    completedAmount,
    financials: {
      totalPledges,
      totalPaid,
      totalBalance: totalPledges - totalPaid,
      percentagePaid: totalPledges > 0 ? Math.round((totalPaid / totalPledges) * 100) : 0
    },
    tableOccupancy
  });
});

// 3. Guests List & CRUD
app.get('/api/guests', (req, res) => {
  const db = readDB();
  res.json(db.guests || []);
});

app.get('/api/guests/:id', (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === req.params.id.toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  const table = (db.tables || []).find(t => t.id === guest.tableId);
  const drink = (db.drinks || []).find(d => d.id === guest.drinkPreference);

  res.json({
    guest,
    table: table || { name: 'Haijapangwa Bado', id: null },
    drink: drink || null,
    event: db.event,
    timeline: db.timeline,
    drinks: db.drinks
  });
});

// Helper to generate unique 4-digit gate pass code
function generateUniqueCode(existingGuests) {
  const usedCodes = new Set((existingGuests || []).map(g => String(g.code)));
  for (let i = 0; i < 3000; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    if (!usedCodes.has(rand)) return rand;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

app.post('/api/guests', (req, res) => {
  const db = readDB();
  const guests = db.guests || [];

  // Generate next sequential number ID (1, 2, 3...)
  let nextId = 1;
  const existingIds = guests
    .map(g => {
      const match = g.id && String(g.id).match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    })
    .filter(n => n > 0);

  if (existingIds.length > 0) {
    nextId = Math.max(...existingIds) + 1;
  }

  const assignedCode = req.body.code ? String(req.body.code).trim() : generateUniqueCode(guests);

  const newGuest = {
    id: req.body.id ? String(req.body.id).trim() : String(nextId),
    code: assignedCode,
    name: req.body.name || 'Mgeni Maalumu',
    title: req.body.title || 'Mualikwa',
    phone: req.body.phone ? req.body.phone.replace(/[^0-9]/g, '') : '',
    committeeMember: 'Kamati ya Harusi',
    tableId: req.body.tableId || 'meza-1',
    seats: parseInt(req.body.seats, 10) || 1,
    pledgeAmount: parseInt(req.body.pledgeAmount, 10) || 0,
    paidAmount: parseInt(req.body.paidAmount, 10) || 0,
    rsvpStatus: req.body.rsvpStatus || 'pending',
    guestCountAttending: parseInt(req.body.seats, 10) || 1,
    drinkPreference: req.body.drinkPreference || null,
    checkedIn: false,
    checkInTime: null,
    reminderCount: 0,
    wishes: null,
    createdAt: new Date().toISOString()
  };

  guests.push(newGuest);
  db.guests = guests;
  writeDB(db);

  res.status(201).json(newGuest);
});

app.put('/api/guests/:id', (req, res) => {
  const db = readDB();
  const idx = (db.guests || []).findIndex(g => g.id.toLowerCase() === req.params.id.toLowerCase());
  if (idx === -1) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  db.guests[idx] = { ...db.guests[idx], ...req.body };
  writeDB(db);
  res.json(db.guests[idx]);
});

app.delete('/api/guests/:id', (req, res) => {
  const db = readDB();
  const initialLen = (db.guests || []).length;
  db.guests = (db.guests || []).filter(g => g.id.toLowerCase() !== req.params.id.toLowerCase());
  if (db.guests.length === initialLen) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }
  writeDB(db);
  res.json({ success: true, message: 'Mualikwa amefutwa' });
});

// Increment Reminder count
app.post('/api/guests/:id/remind', (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === req.params.id.toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }
  guest.reminderCount = (guest.reminderCount || 0) + 1;
  writeDB(db);
  res.json({ success: true, reminderCount: guest.reminderCount });
});

// 3.1 Record Payment with Automatic SMS Notification (NextSMS)
app.post('/api/payments', async (req, res) => {
  const { guestId, amount, sendSms = true, note = '' } = req.body;
  const payAmount = parseInt(amount, 10);
  
  if (!guestId || !payAmount || payAmount <= 0) {
    return res.status(400).json({ error: 'Tafadhali chagua mualikwa na uweke kiasi sahihi cha malipo.' });
  }

  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === guestId.toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana.' });
  }

  const previousPaid = Number(guest.paidAmount) || 0;
  const newTotalPaid = previousPaid + payAmount;
  const pledgeAmount = Number(guest.pledgeAmount) || 0;
  const newBalance = pledgeAmount - newTotalPaid;

  guest.paidAmount = newTotalPaid;
  guest.paymentHistory = guest.paymentHistory || [];
  guest.paymentHistory.push({
    id: `pay-${Date.now()}`,
    amount: payAmount,
    date: new Date().toISOString(),
    previousPaid,
    newTotalPaid,
    balance: newBalance > 0 ? newBalance : 0,
    note
  });

  writeDB(db);

  // Automatic SMS & WhatsApp Notification Trigger
  let smsResult = null;
  let waResult = null;

  if (guest.phone) {
    if (sendSms) {
      try {
        smsResult = await smsService.sendPaymentNotificationSMS(guest, payAmount, newBalance, newTotalPaid);
      } catch (e) {
        console.error('Error sending payment SMS:', e);
      }
    }

    // When guest completes 100% of payment -> Automatically send official WhatsApp card sequence!
    if (newBalance <= 0) {
      try {
        waResult = await whatsappService.sendFullWhatsAppInvitation(guest);
      } catch (e) {
        console.error('Error sending automatic WhatsApp invitation:', e);
      }
    }
  }

  res.json({
    success: true,
    message: newBalance <= 0 
      ? `Malipo ya Tsh ${payAmount.toLocaleString('sw-TZ')} yamesajiliwa! Mualikwa amekamilisha ahadi yote na Kadi rasmi ya WhatsApp & SMS zimetumwa kiotomatiki.`
      : `Malipo ya Tsh ${payAmount.toLocaleString('sw-TZ')} yamesajiliwa! Salio lililobaki ni Tsh ${newBalance.toLocaleString('sw-TZ')} na SMS imetumwa kiotomatiki.`,
    guest,
    newBalance: newBalance > 0 ? newBalance : 0,
    isCompleted: newBalance <= 0,
    smsResult,
    waResult
  });
});

// 3.2 Bulk SMS Debt / Sendoff Reminder to All Unpaid Guests
app.post('/api/sms/remind-debtors', async (req, res) => {
  const db = readDB();
  const guests = db.guests || [];
  const { customMessage } = req.body || {};
  
  // Remind all guests who have not completed payment (paid === 0 or balance > 0)
  const debtors = guests.filter(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    return (paid === 0 || (pledge - paid) > 0) && g.phone && g.phone.trim().length > 0;
  });

  if (debtors.length === 0) {
    return res.json({ success: true, message: 'Hakuna mualikwa anayedaiwa au anayehitaji kikumbusho kwa sasa!', count: 0 });
  }

  const results = [];
  for (const guest of debtors) {
    const balance = (Number(guest.pledgeAmount) || 0) - (Number(guest.paidAmount) || 0);
    try {
      const smsRes = await smsService.sendDebtReminderSMS(guest, balance, customMessage);
      results.push({ guestId: guest.id, name: guest.name, phone: guest.phone, balance, smsRes });
      guest.reminderCount = (guest.reminderCount || 0) + 1;
    } catch (e) {
      console.error(`Error sending reminder to ${guest.name}:`, e);
    }
  }

  writeDB(db);
  res.json({
    success: true,
    message: `SMS za vikumbusho vya Sendoff zimetumwa kwa wageni wote ${results.length} kiotomatiki (haziizidi SMS 3)!`,
    count: results.length,
    results
  });
});

// 3.3 Single SMS Debt / Sendoff Reminder
app.post('/api/sms/remind/:id', async (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === req.params.id.toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  const { customMessage } = req.body || {};
  const pledge = Number(guest.pledgeAmount) || 0;
  const paid = Number(guest.paidAmount) || 0;
  if (paid > 0 && paid >= pledge && pledge > 0) {
    return res.status(400).json({ error: `${guest.name} amekwishalipa mchango wake wote.` });
  }

  const balance = pledge - paid;
  const smsRes = await smsService.sendDebtReminderSMS(guest, balance, customMessage);
  guest.reminderCount = (guest.reminderCount || 0) + 1;
  writeDB(db);

  res.json({
    success: true,
    message: `SMS ya kikumbusho cha Sendoff imetumwa kwa ${guest.name}.`,
    smsRes
  });
});

// 3.4 SMS Logs / Outbox
app.get('/api/sms/logs', (req, res) => {
  const db = readDB();
  res.json(db.smsLogs || []);
});

// 3.5 SMS Configuration (NextSMS API settings)
app.get('/api/sms/config', (req, res) => {
  const db = readDB();
  res.json(db.smsConfig || {});
});

app.put('/api/sms/config', (req, res) => {
  const db = readDB();
  db.smsConfig = { ...db.smsConfig, ...req.body };
  writeDB(db);
  res.json({ success: true, message: 'Mipangilio ya NextSMS imesasishwa kikamilifu!', config: db.smsConfig });
});

// 3.6 Direct / Test SMS
app.post('/api/sms/test', async (req, res) => {
  const { phone, message, name = 'Mchangiaji' } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Tafadhali weka namba ya simu.' });
  }

  const firstName = smsService.getFirstName(name);
  const text = message || `Habari ${firstName}, huu ni ujumbe wa majaribio kutoka Kamati ya Harusi ya Lilian & James kupitia jina jipya la SENDOFF. Mfumo wa SMS unafanya kazi kikamilifu!`;
  const result = await smsService.sendRawSMS(phone, text, 'Majaribio ya SMS (Test)', firstName);
  res.json({
    success: result.success,
    result
  });
});

// 3.7 Send Single Official Invitation SMS with 4-Digit Pass Code
app.post('/api/sms/send-invitation/:id', async (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(req.params.id).toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana.' });
  }
  if (!guest.phone) {
    return res.status(400).json({ error: 'Mgeni huyu hana namba ya simu.' });
  }

  // Ensure 4-digit code exists
  if (!guest.code) {
    guest.code = generateUniqueCode(db.guests || []);
    writeDB(db);
  }

  const result = await smsService.sendInvitationSMS(guest);
  res.json({
    success: result.success,
    message: `SMS rasmi ya mwaliko yenye Kodi ya Kuingilia (${guest.code}) imetumwa kwa ${guest.name}!`,
    code: guest.code,
    result
  });
});

// 3.8 Send Thank You SMS (Strictly 1 SMS, ends with lilian.nyisu.com)
app.post('/api/sms/send-thank-you/:id', async (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(req.params.id).toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana.' });
  }
  if (!guest.phone) {
    return res.status(400).json({ error: 'Mgeni huyu hana namba ya simu.' });
  }

  const result = await smsService.sendPaymentNotificationSMS(guest, req.body.amount || 0, 0, guest.paidAmount || 0);
  res.json({
    success: result.success,
    message: `SMS ya shukrani (SMS 1) imetumwa kwa ${guest.name}!`,
    result
  });
});

// 3.8 Bulk Send Official Invitation SMS to All / Filtered Guests with 4-Digit Pass Codes
app.post('/api/sms/send-invitations-bulk', async (req, res) => {
  const { guestIds } = req.body || {};
  const db = readDB();
  let targetGuests = db.guests || [];

  if (Array.isArray(guestIds) && guestIds.length > 0) {
    const idSet = new Set(guestIds.map(id => String(id).toLowerCase()));
    targetGuests = targetGuests.filter(g => idSet.has(String(g.id).toLowerCase()));
  }

  // Filter those with phone numbers
  const validRecipients = targetGuests.filter(g => g.phone && g.phone.trim().length >= 7);

  if (validRecipients.length === 0) {
    return res.status(400).json({ error: 'Hakuna wageni wenye namba za simu waliochaguliwa.' });
  }

  // Ensure each recipient has a 4-digit code
  let dbUpdated = false;
  validRecipients.forEach(g => {
    if (!g.code) {
      g.code = generateUniqueCode(db.guests || []);
      dbUpdated = true;
    }
  });
  if (dbUpdated) {
    writeDB(db);
  }

  const dispatched = [];
  for (const guest of validRecipients) {
    try {
      const smsRes = await smsService.sendInvitationSMS(guest);
      dispatched.push({ guestId: guest.id, name: guest.name, phone: guest.phone, code: guest.code, success: smsRes.success });
    } catch (e) {
      console.error(`Error sending invite SMS to ${guest.name}:`, e);
      dispatched.push({ guestId: guest.id, name: guest.name, phone: guest.phone, code: guest.code, success: false, error: e.message });
    }
  }

  res.json({
    success: true,
    message: `SMS za mwaliko zenye kodi za tarakimu 4 zimetumwa kwa wageni wote ${dispatched.length} kikamilifu!`,
    totalSent: dispatched.length,
    results: dispatched
  });
});

// 3.9 Automated WhatsApp Dispatch Endpoints
app.post('/api/whatsapp/send-invitation/:id', async (req, res) => {
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(req.params.id).toLowerCase());
  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana.' });
  }
  if (!guest.phone) {
    return res.status(400).json({ error: 'Mgeni huyu hana namba ya WhatsApp.' });
  }

  const result = await whatsappService.sendFullWhatsAppInvitation(guest);
  res.json({
    success: result.success,
    message: `Kadi ya Picha na ujumbe wa WhatsApp zimetumwa kwa ${guest.name} (${guest.phone}) kiotomatiki!`,
    result
  });
});

app.get('/api/whatsapp/config', (req, res) => {
  const db = readDB();
  res.json(db.whatsappConfig || {});
});

app.put('/api/whatsapp/config', (req, res) => {
  const db = readDB();
  db.whatsappConfig = { ...db.whatsappConfig, ...req.body };
  writeDB(db);
  res.json({ success: true, message: 'Mipangilio ya WhatsApp imesasishwa kikamilifu!', config: db.whatsappConfig });
});

app.get('/api/whatsapp/logs', (req, res) => {
  const db = readDB();
  res.json(db.whatsappLogs || []);
});

// 4. RSVP & Drink Preference Submission (From Guest E-Card)
app.post('/api/rsvp', (req, res) => {
  const { guestId, rsvpStatus, guestCountAttending, drinkPreference, wishes } = req.body;
  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === (guestId || '').toLowerCase());

  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  guest.rsvpStatus = rsvpStatus || 'confirmed';
  if (guestCountAttending) {
    guest.guestCountAttending = Math.min(parseInt(guestCountAttending, 10), guest.seats);
  }
  if (drinkPreference) {
    guest.drinkPreference = drinkPreference;
  }
  if (wishes && wishes.trim()) {
    guest.wishes = wishes.trim();
    // Add to wishes guestbook as well
    db.wishes = db.wishes || [];
    db.wishes.unshift({
      id: `wish-${Date.now()}`,
      guestName: guest.name,
      message: wishes.trim(),
      time: new Date().toISOString()
    });
  }

  writeDB(db);
  res.json({ success: true, message: 'Uthibitisho wako umepokelewa kikamilifu!', guest });
});

// 5. Wishes / Guestbook
app.get('/api/wishes', (req, res) => {
  const db = readDB();
  res.json(db.wishes || []);
});

app.post('/api/wishes', (req, res) => {
  const { guestName, message } = req.body;
  if (!guestName || !message) {
    return res.status(400).json({ error: 'Tafadhali weka jina na ujumbe wako' });
  }

  const db = readDB();
  db.wishes = db.wishes || [];
  const newWish = {
    id: `wish-${Date.now()}`,
    guestName: guestName.trim(),
    message: message.trim(),
    time: new Date().toISOString()
  };
  db.wishes.unshift(newWish);
  writeDB(db);

  res.status(201).json(newWish);
});

// 6. Security Bodyguard / Kuhakiki Kadi Mlangoni (Nyahende Gate Scan & 4-Digit Code)
app.post('/api/verify', (req, res) => {
  const rawCode = (req.body.code || req.body.token || '').trim();
  if (!rawCode) {
    return res.status(400).json({ status: 'invalid', message: 'Tafadhali weka kodi ya tarakimu 4, namba ya mgeni (#), jina au namba ya simu.' });
  }

  const db = readDB();
  const guests = db.guests || [];
  const query = rawCode.toLowerCase();

  let guest = null;

  // 1. Check if rawCode matches 4-digit security code (e.g. "4829")
  guest = guests.find(g => g.code && String(g.code).trim() === rawCode);

  // 2. Check if rawCode matches guest ID (e.g. "1", "2", or "#1", or "TWG-101")
  if (!guest) {
    const cleanId = rawCode.replace(/^[#\s]+/, '').replace(/^twg-?/i, '');
    guest = guests.find(g => String(g.id).toLowerCase() === cleanId.toLowerCase());
  }

  // 3. Check by Phone number (last 9 digits or contains)
  if (!guest) {
    const cleanQueryPhone = rawCode.replace(/\D/g, '');
    if (cleanQueryPhone.length >= 7) {
      const querySuffix = cleanQueryPhone.slice(-9);
      guest = guests.find(g => {
        if (!g.phone) return false;
        const cleanPhone = g.phone.replace(/\D/g, '');
        return cleanPhone.endsWith(querySuffix) || cleanPhone.includes(cleanQueryPhone) || cleanQueryPhone.includes(cleanPhone);
      });
    }
  }

  // 4. Check by Name (e.g. "Msaki", "Baraka", etc.)
  if (!guest) {
    const nameMatches = guests.filter(g => g.name && g.name.toLowerCase().includes(query));
    if (nameMatches.length === 1) {
      guest = nameMatches[0];
    } else if (nameMatches.length > 1) {
      // Multiple matches found! Return list for usher to choose
      return res.json({
        status: 'multiple_matches',
        matches: nameMatches.map(m => {
          const tbl = (db.tables || []).find(t => t.id === m.tableId) || { name: 'Haijapangwa' };
          return {
            id: m.id,
            code: m.code,
            name: m.name,
            phone: m.phone,
            seats: m.seats,
            tableName: tbl.name,
            checkedIn: m.checkedIn
          };
        }),
        message: `Watu ${nameMatches.length} wamepatikana kwa jina '${rawCode}'. Chagua mgeni husika:`
      });
    }
  }

  if (!guest) {
    return res.status(404).json({
      status: 'invalid',
      code: rawCode,
      message: `HAPANA! Mgeni mwenye kodi, namba au jina '${rawCode}' hakupatikana kwenye daftari la waalikwa.`
    });
  }

  const table = (db.tables || []).find(t => t.id === guest.tableId) || { name: 'Haijapangwa' };

  if (guest.checkedIn) {
    // Already used! Prevent fraud / double entry
    return res.json({
      status: 'already_used',
      code: guest.id,
      guest: {
        id: guest.id,
        name: guest.name,
        title: guest.title,
        seats: guest.seats,
        tableName: table.name,
        code: guest.code,
        checkInTime: guest.checkInTime
      },
      message: `TAHADHARI! Kadi hii ya ${guest.name} ILIKWISHATUMIKA saa ${new Date(guest.checkInTime).toLocaleTimeString('sw-TZ')}!`
    });
  }

  // Mark as checked in
  guest.checkedIn = true;
  guest.checkInTime = new Date().toISOString();
  writeDB(db);

  return res.json({
    status: 'valid',
    code: guest.id,
    guest: {
      id: guest.id,
      name: guest.name,
      title: guest.title,
      seats: guest.seats,
      tableName: table.name,
      code: guest.code,
      checkInTime: guest.checkInTime
    },
    message: `KADI HALALI! Karibu sana ${guest.name} (${table.name}).`
  });
});

// Reset check-in status (for testing or committee overrides)
app.post('/api/verify/reset', (req, res) => {
  const { guestId } = req.body;
  const db = readDB();
  const guest = (db.guests || []).find(g => g.id.toUpperCase() === (guestId || '').toUpperCase());
  if (guest) {
    guest.checkedIn = false;
    guest.checkInTime = null;
    writeDB(db);
    return res.json({ success: true, message: `Hali ya kadi ya ${guest.name} imerejeshwa (bado hajaingia).` });
  }
  res.status(404).json({ error: 'Mualikwa hakupatikana' });
});

// 7. QR Code Generator Endpoint (Returns PNG Stream)
app.get('/api/qr/:id', async (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(id).toLowerCase() || String(g.code) === String(id));
  const guestCode = guest ? (guest.code || guest.id) : id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const verifyPayload = guest ? `${baseUrl}/invite/${guest.id}?code=${guestCode}` : `${baseUrl}/invite/${id}`;

  try {
    const qrBuffer = await QRCode.toBuffer(verifyPayload, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      scale: 8,
      color: {
        dark: '#0f382a', // Luxury Emerald Dark Green
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).send('Error generating QR code');
  }
});

// 7.1 Table QR Code Generator Endpoint (Points directly to /order/:tableId)
app.get('/api/qr/table/:id', async (req, res) => {
  const tableId = req.params.id;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const orderUrl = `${baseUrl}/order/${tableId}`;

  try {
    const qrBuffer = await QRCode.toBuffer(orderUrl, {
      errorCorrectionLevel: 'H',
      type: 'png',
      margin: 2,
      scale: 10,
      color: {
        dark: '#031a10', // Luxury Deep Emerald Green
        light: '#ffffff'
      }
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err) {
    console.error('Table QR generation error:', err);
    res.status(500).send('Error generating Table QR code');
  }
});

// 7.2 Table Drink Orders API (Instant WhatsApp Dispatch to 0787661560)
app.get('/api/orders', (req, res) => {
  const db = readDB();
  res.json(db.orders || []);
});

app.post('/api/orders', async (req, res) => {
  const { tableId, tableName: inputTableName, guestName, items, notes } = req.body;
  if (!tableId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Tafadhali chagua vinywaji na meza yako.' });
  }

  const db = readDB();
  const foundTable = (db.tables || []).find(t => String(t.id).toLowerCase() === String(tableId).toLowerCase());
  const resolvedTableName = inputTableName ? inputTableName.trim() : (foundTable ? foundTable.name : tableId.replace(/-/g, ' ').toUpperCase());
  
  const orderId = `ORD-${Date.now().toString().slice(-6)}`;
  const newOrder = {
    id: orderId,
    tableId: tableId,
    tableName: resolvedTableName,
    guestName: guestName ? guestName.trim() : 'Mgeni wa Meza',
    items: items.map(it => ({
      id: it.id,
      name: it.name,
      qty: parseInt(it.qty, 10) || 1,
      category: it.category || 'Kinywaji',
      icon: it.icon || '🍹'
    })),
    notes: notes ? notes.trim() : '',
    status: 'pending', // pending, preparing, delivered, cancelled
    timestamp: new Date().toISOString()
  };

  db.orders = db.orders || [];
  db.orders.unshift(newOrder);
  writeDB(db);

  // Auto-dispatch notification to Telegram Bot (@Lilian_sendoff_bot)
  let tgResult = null;
  try {
    tgResult = await telegramService.sendDrinkOrderNotification(newOrder);
  } catch (e) {
    console.error('Error dispatching Telegram order notification:', e);
  }

  // Auto-dispatch WhatsApp notification directly to 0787661560 in background
  let waResult = null;
  const BAR_WA_NUMBER = '0787661560';
  try {
    waResult = await whatsappService.sendTableDrinkOrderWhatsApp(newOrder, BAR_WA_NUMBER);
  } catch (e) {
    console.error('Error dispatching WhatsApp order notification:', e);
  }

  res.status(201).json({
    success: true,
    order: newOrder,
    message: `Oda yako ya kinywaji imepokelewa na mhudumu wetu atakuletea moja kwa moja kwenye meza yako!`,
    telegramNotification: tgResult,
    waNotification: waResult
  });
});

// 7.3 Telegram Bot API & Management
app.get('/api/telegram/status', async (req, res) => {
  const sync = await telegramService.syncTelegramUpdates();
  const db = readDB();
  res.json({
    ok: true,
    botUsername: telegramService.BOT_USERNAME,
    botUrl: `https://t.me/${telegramService.BOT_USERNAME}`,
    subscribersCount: db.telegramConfig?.chatIds?.length || 0,
    subscribers: db.telegramConfig?.chats || [],
    sync
  });
});

app.post('/api/telegram/test', async (req, res) => {
  const result = await telegramService.sendTestNotification();
  res.json(result);
});

app.post('/api/telegram/sync', async (req, res) => {
  const result = await telegramService.syncTelegramUpdates();
  res.json(result);
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const db = readDB();
  const order = (db.orders || []).find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Oda haikupatikana' });
  }

  order.status = status || order.status;
  if (status === 'delivered') order.deliveredAt = new Date().toISOString();
  writeDB(db);
  res.json({ success: true, order });
});

// 7.3 Drinks Management Endpoints (CRUD + Photo Uploads)
app.get('/api/drinks', (req, res) => {
  const db = readDB();
  res.json(db.drinks || []);
});

app.post('/api/drinks', upload.single('imageFile'), (req, res) => {
  const db = readDB();
  const drinks = db.drinks || [];
  const { name, category, description, icon, image, base64Image } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Jina la kinywaji linahitajika.' });
  }

  let finalImageUrl = image || '';
  if (req.file) {
    finalImageUrl = `/images/${req.file.filename}`;
  } else if (base64Image && base64Image.startsWith('data:image')) {
    try {
      const match = base64Image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `drink_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, fname), Buffer.from(match[2], 'base64'));
        finalImageUrl = `/images/${fname}`;
      }
    } catch (e) {
      console.error('Base64 image save error:', e);
    }
  }

  const idSlug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const newDrink = {
    id: `${idSlug}-${Date.now().toString().slice(-4)}`,
    name: name.trim(),
    category: category || 'Pombe / Bia',
    description: description ? description.trim() : '',
    icon: icon || '🍹',
    image: finalImageUrl
  };

  drinks.push(newDrink);
  db.drinks = drinks;
  writeDB(db);
  res.status(201).json({ success: true, drink: newDrink, message: 'Kinywaji kimeongezwa kikamilifu!' });
});

app.put('/api/drinks/:id', upload.single('imageFile'), (req, res) => {
  const db = readDB();
  const drinks = db.drinks || [];
  const idx = drinks.findIndex(d => String(d.id).toLowerCase() === String(req.params.id).toLowerCase());

  if (idx === -1) {
    return res.status(404).json({ error: 'Kinywaji hakikupatikana.' });
  }

  let finalImageUrl = drinks[idx].image || '';
  if (req.file) {
    finalImageUrl = `/images/${req.file.filename}`;
  } else if (req.body.image !== undefined) {
    finalImageUrl = req.body.image;
  } else if (req.body.base64Image && req.body.base64Image.startsWith('data:image')) {
    try {
      const match = req.body.base64Image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `drink_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, fname), Buffer.from(match[2], 'base64'));
        finalImageUrl = `/images/${fname}`;
      }
    } catch (e) {
      console.error('Base64 image save error:', e);
    }
  }

  drinks[idx] = {
    ...drinks[idx],
    name: req.body.name ? req.body.name.trim() : drinks[idx].name,
    category: req.body.category || drinks[idx].category,
    description: req.body.description !== undefined ? req.body.description.trim() : drinks[idx].description,
    icon: req.body.icon || drinks[idx].icon,
    image: finalImageUrl
  };

  db.drinks = drinks;
  writeDB(db);
  res.json({ success: true, drink: drinks[idx], message: 'Kinywaji kimesasishwa kikamilifu!' });
});

app.delete('/api/drinks/:id', (req, res) => {
  const db = readDB();
  const initialLen = (db.drinks || []).length;
  db.drinks = (db.drinks || []).filter(d => String(d.id).toLowerCase() !== String(req.params.id).toLowerCase());

  if (db.drinks.length === initialLen) {
    return res.status(404).json({ error: 'Kinywaji hakikupatikana.' });
  }

  writeDB(db);
  res.json({ success: true, message: 'Kinywaji kimefutwa kwenye menyu.' });
});

// 7.4 Photo Gallery & Bride / Couple Image Upload API
app.get('/api/gallery', (req, res) => {
  try {
    const db = readDB();
    const event = db.event || {};
    const imageList = [];

    const scanDir = (dir, prefix = '') => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      files.forEach(filename => {
        const filePath = path.join(dir, filename);
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          if (filename === 'gallery') scanDir(filePath, 'gallery/');
          return;
        }
        const ext = path.extname(filename).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) return;

        const relUrl = `/images/${prefix}${filename}`;
        let role = 'Galari ya Picha';
        if (filename === 'lilian_sendoff.jpg' || filename === 'brenda_sendoff.jpg' || relUrl === event.bridePhoto) role = '👰 Picha Kuu ya Bibi Harusi';
        else if (filename === 'wedding_couple.jpg' || relUrl === event.couplePhoto) role = '💍 Picha Kuu ya Maharusi';
        else if (filename === 'wedding_venue.jpg' || relUrl === event.venuePhoto) role = '🏛️ Picha ya Ukumbi';

        imageList.push({
          filename: `${prefix}${filename}`,
          url: relUrl,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          role
        });
      });
    };

    scanDir(IMAGES_DIR);

    // Sort newest first
    imageList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    res.json({ images: imageList, eventPhotos: {
      bride: event.bridePhoto || '/images/lilian_sendoff.jpg',
      couple: event.couplePhoto || '/images/wedding_couple.jpg',
      venue: event.venuePhoto || '/images/wedding_venue.jpg'
    }});
  } catch (err) {
    console.error('Gallery read error:', err);
    res.status(500).json({ error: 'Hitilafu ya kusoma picha za galari.' });
  }
});

// Generic Upload (Single file multipart or base64 JSON)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (req.file) {
    return res.json({
      success: true,
      url: `/images/${req.file.filename}`,
      filename: req.file.filename,
      message: 'Picha imepakiwa kikamilifu!'
    });
  }

  const { dataUrl, filename = 'photo' } = req.body || {};
  if (dataUrl && dataUrl.startsWith('data:image')) {
    try {
      const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`;
        fs.writeFileSync(path.join(IMAGES_DIR, fname), Buffer.from(match[2], 'base64'));
        return res.json({
          success: true,
          url: `/images/${fname}`,
          filename: fname,
          message: 'Picha imepakiwa kikamilifu!'
        });
      }
    } catch (e) {
      console.error('Base64 upload save error:', e);
      return res.status(500).json({ error: 'Hitilafu ya kuhifadhi picha.' });
    }
  }

  res.status(400).json({ error: 'Tafadhali chagua picha ya kupakia.' });
});

// Upload / Update Bride Portrait (Picha ya Msichana / Bibi Harusi)
app.post('/api/upload/bride', upload.single('file'), (req, res) => {
  const db = readDB();
  db.event = db.event || {};
  let finalUrl = '';

  if (req.file) {
    // Copy as canonical lilian_sendoff.jpg and brenda_sendoff.jpg for backward compatibility
    finalUrl = `/images/${req.file.filename}`;
    try {
      fs.copyFileSync(req.file.path, path.join(IMAGES_DIR, 'lilian_sendoff.jpg'));
      fs.copyFileSync(req.file.path, path.join(IMAGES_DIR, 'brenda_sendoff.jpg'));
    } catch (e) {
      console.error('Copy lilian_sendoff error:', e);
    }
  } else if (req.body.dataUrl && req.body.dataUrl.startsWith('data:image')) {
    try {
      const match = req.body.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `bride_${Date.now()}.${ext}`;
        const buf = Buffer.from(match[2], 'base64');
        fs.writeFileSync(path.join(IMAGES_DIR, fname), buf);
        fs.writeFileSync(path.join(IMAGES_DIR, 'lilian_sendoff.jpg'), buf);
        fs.writeFileSync(path.join(IMAGES_DIR, 'brenda_sendoff.jpg'), buf);
        finalUrl = `/images/${fname}`;
      }
    } catch (e) {
      console.error('Bride photo save error:', e);
      return res.status(500).json({ error: 'Hitilafu ya kuhifadhi picha ya Bibi Harusi.' });
    }
  } else if (req.body.url) {
    finalUrl = req.body.url;
  } else {
    return res.status(400).json({ error: 'Tafadhali chagua picha ya Bibi Harusi.' });
  }

  db.event.bridePhoto = finalUrl;
  db.event.heroImage = finalUrl;
  writeDB(db);

  res.json({
    success: true,
    url: finalUrl,
    message: '🎉 Picha ya Bibi Harusi (Msichana) imesasishwa kikamilifu kwenye mfumo, kadi na tovuti!'
  });
});

// Upload / Update Couple Photo
app.post('/api/upload/couple', upload.single('file'), (req, res) => {
  const db = readDB();
  db.event = db.event || {};
  let finalUrl = '';

  if (req.file) {
    finalUrl = `/images/${req.file.filename}`;
    try {
      fs.copyFileSync(req.file.path, path.join(IMAGES_DIR, 'wedding_couple.jpg'));
    } catch (e) {}
  } else if (req.body.dataUrl && req.body.dataUrl.startsWith('data:image')) {
    try {
      const match = req.body.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `couple_${Date.now()}.${ext}`;
        const buf = Buffer.from(match[2], 'base64');
        fs.writeFileSync(path.join(IMAGES_DIR, fname), buf);
        fs.writeFileSync(path.join(IMAGES_DIR, 'wedding_couple.jpg'), buf);
        finalUrl = `/images/${fname}`;
      }
    } catch (e) {
      return res.status(500).json({ error: 'Hitilafu ya kuhifadhi picha.' });
    }
  } else if (req.body.url) {
    finalUrl = req.body.url;
  } else {
    return res.status(400).json({ error: 'Tafadhali chagua picha ya Maharusi.' });
  }

  db.event.couplePhoto = finalUrl;
  writeDB(db);

  res.json({
    success: true,
    url: finalUrl,
    message: '🎉 Picha Kuu ya Maharusi imesasishwa kikamilifu!'
  });
});

// Upload / Update Venue Photo
app.post('/api/upload/venue', upload.single('file'), (req, res) => {
  const db = readDB();
  db.event = db.event || {};
  let finalUrl = '';

  if (req.file) {
    finalUrl = `/images/${req.file.filename}`;
    try {
      fs.copyFileSync(req.file.path, path.join(IMAGES_DIR, 'wedding_venue.jpg'));
    } catch (e) {}
  } else if (req.body.dataUrl && req.body.dataUrl.startsWith('data:image')) {
    try {
      const match = req.body.dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (match) {
        const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
        const fname = `venue_${Date.now()}.${ext}`;
        const buf = Buffer.from(match[2], 'base64');
        fs.writeFileSync(path.join(IMAGES_DIR, fname), buf);
        fs.writeFileSync(path.join(IMAGES_DIR, 'wedding_venue.jpg'), buf);
        finalUrl = `/images/${fname}`;
      }
    } catch (e) {
      return res.status(500).json({ error: 'Hitilafu ya kuhifadhi picha.' });
    }
  } else if (req.body.url) {
    finalUrl = req.body.url;
  } else {
    return res.status(400).json({ error: 'Tafadhali chagua picha ya ukumbi.' });
  }

  db.event.venuePhoto = finalUrl;
  writeDB(db);

  res.json({
    success: true,
    url: finalUrl,
    message: '🎉 Picha ya Ukumbi na Mapambo imesasishwa kikamilifu!'
  });
});

// Delete Image from Gallery
app.delete('/api/gallery/:filename', (req, res) => {
  const filename = req.params.filename || '';
  const baseName = path.basename(filename);
  // Protect core defaults from accidental delete
  const protectedNames = ['lilian_sendoff.jpg', 'brenda_sendoff.jpg', 'wedding_couple.jpg', 'wedding_venue.jpg'];
  if (protectedNames.includes(baseName)) {
    return res.status(400).json({ error: 'Picha hii ya msingi haiwezi kufutwa, lakini unaweza kuibadilisha kwa kupakia picha mpya juu yake.' });
  }

  let filePath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(IMAGES_DIR, 'gallery', baseName);
  }

  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    try {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: 'Picha imefutwa kwenye galari.' });
    } catch (e) {
      return res.status(500).json({ error: 'Hitilafu ya kufuta faili.' });
    }
  }
  res.status(404).json({ error: 'Faili halikupatikana.' });
});

app.delete('/api/gallery/gallery/:filename', (req, res) => {
  const baseName = path.basename(req.params.filename || '');
  const filePath = path.join(IMAGES_DIR, 'gallery', baseName);
  if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
    try {
      fs.unlinkSync(filePath);
      return res.json({ success: true, message: 'Picha imefutwa kwenye galari.' });
    } catch (e) {
      return res.status(500).json({ error: 'Hitilafu ya kufuta faili.' });
    }
  }
  res.status(404).json({ error: 'Faili halikupatikana.' });
});

// 8. Tables Endpoints
app.get('/api/tables', (req, res) => {
  const db = readDB();
  res.json(db.tables || []);
});

app.post('/api/tables', (req, res) => {
  const db = readDB();
  const tables = db.tables || [];
  const name = req.body.name ? req.body.name.trim() : `Meza ${tables.length + 1}`;
  const newTable = {
    id: `meza-${Date.now().toString().slice(-6)}`,
    name,
    capacity: parseInt(req.body.capacity, 10) || 10,
    notes: req.body.notes ? req.body.notes.trim() : ''
  };
  tables.push(newTable);
  db.tables = tables;
  writeDB(db);
  res.status(201).json(newTable);
});

app.put('/api/tables/:id', (req, res) => {
  const db = readDB();
  const table = (db.tables || []).find(t => String(t.id).toLowerCase() === String(req.params.id).toLowerCase());
  if (!table) return res.status(404).json({ error: 'Meza haikupatikana.' });
  if (req.body.name) table.name = req.body.name.trim();
  if (req.body.capacity) table.capacity = parseInt(req.body.capacity, 10) || 10;
  if (req.body.notes !== undefined) table.notes = req.body.notes.trim();
  writeDB(db);
  res.json({ success: true, table });
});

app.delete('/api/tables/:id', (req, res) => {
  const db = readDB();
  const tableId = String(req.params.id).toLowerCase();
  const initialCount = (db.tables || []).length;
  db.tables = (db.tables || []).filter(t => String(t.id).toLowerCase() !== tableId);
  
  // Unassign any guests attached to this table
  (db.guests || []).forEach(g => {
    if (g.tableId && String(g.tableId).toLowerCase() === tableId) {
      g.tableId = null;
    }
  });
  
  writeDB(db);
  res.json({ success: true, message: 'Meza imefutwa kikamilifu.' });
});

// 9. Committee Management & Stats
app.get('/api/committee', (req, res) => {
  const db = readDB();
  res.json(db.committeeMembers || []);
});

app.post('/api/committee', (req, res) => {
  const db = readDB();
  const members = db.committeeMembers || [];
  const { name, role, phone, targetAmount } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Jina la mwanakamati linahitajika' });
  }

  const newMember = {
    id: `cm-${Date.now()}`,
    name: name.trim(),
    role: (role || 'Mjumbe wa Kamati').trim(),
    phone: phone ? phone.replace(/[^0-9]/g, '') : '',
    targetAmount: parseInt(targetAmount, 10) || 1000000
  };

  members.push(newMember);
  db.committeeMembers = members;
  writeDB(db);
  res.status(201).json(newMember);
});

app.delete('/api/committee/:id', (req, res) => {
  const db = readDB();
  const initialLen = (db.committeeMembers || []).length;
  db.committeeMembers = (db.committeeMembers || []).filter(m => m.id !== req.params.id);
  if (db.committeeMembers.length === initialLen) {
    return res.status(404).json({ error: 'Mwanakamati hakupatikana' });
  }
  writeDB(db);
  res.json({ success: true, message: 'Mwanakamati amefutwa' });
});

app.get('/api/committee/stats', (req, res) => {
  const db = readDB();
  const members = db.committeeMembers || [];
  const guests = db.guests || [];

  let totalPledges = 0;
  let totalPaid = 0;
  let completedCount = 0;
  let debtors = [];

  guests.forEach(g => {
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;

    totalPledges += pledge;
    totalPaid += paid;

    if (balance <= 0 && pledge > 0) {
      completedCount++;
    } else if (balance > 0) {
      debtors.push({
        id: g.id,
        name: g.name,
        phone: g.phone,
        pledgeAmount: pledge,
        paidAmount: paid,
        balance: balance
      });
    }
  });

  const balance = totalPledges - totalPaid;
  const percentagePaid = totalPledges > 0 ? Math.round((totalPaid / totalPledges) * 100) : 0;

  res.json({
    members,
    totalMembers: members.length,
    totalGuests: guests.length,
    totalPledges,
    totalPaid,
    balance: balance > 0 ? balance : 0,
    percentagePaid,
    completedCount,
    debtorsCount: debtors.length,
    debtors
  });
});

// -------------------------------------------------------------
// HTML Page Routes (WhatsApp Open Graph Optimized)
// -------------------------------------------------------------
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.get('/invite/:id', (req, res) => {
  const db = readDB();
  const guestId = req.params.id;
  const guest = (db.guests || []).find(g => g.id.toLowerCase() === guestId.toLowerCase());
  const event = db.event || {};
  const guestName = guest ? guest.name : 'Mualikwa Maalumu';
  const tableName = (db.tables || []).find(t => t.id === (guest ? guest.tableId : null))?.name || 'Meza Maalumu';

  const host = req.get('host') || 'lilian.nyisu.com';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const ogImage = `${baseUrl}/images/lilian_sendoff.jpg?v=20261013b`;

  const filePath = path.join(__dirname, 'public', 'invite.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.sendFile(filePath);

    const ogTags = `
  <title>👑 Kadi ya Mwaliko: Send-off ya Lilian - ${guestName}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=20261013b">
  <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=20261013b">
  <link rel="shortcut icon" href="/favicon.ico?v=20261013b">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20261013b">
  <meta name="theme-color" content="#071510">

  <!-- Open Graph / WhatsApp / SMS Rich Previews -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Send-off ya Lilian Marcus Nyahende">
  <meta property="og:title" content="👑 Kadi Rasmi ya Mwaliko: Send-off ya Lilian - ${guestName}">
  <meta property="og:description" content="Mwaliko Maalumu kwa ${guestName} (${tableName}). Tarehe 13/10/2026 Bragging Social Hall, Goba, Dar es Salaam. Bofya kufungua Kadi ya VIP na Kodi ya Kuingilia.">
  <meta property="og:url" content="${baseUrl}/invite/${guestId}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="720">
  <meta property="og:image:height" content="720">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="👑 Kadi Rasmi ya Mwaliko: Send-off ya Lilian - ${guestName}">
  <meta name="twitter:description" content="Mwaliko Maalumu kwa ${guestName}. Bofya kufungua kadi yako.">
  <meta name="twitter:image" content="${ogImage}">
    `;

    const modified = html.replace(/<title>.*?<\/title>/i, ogTags);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(modified);
  });
});

app.get('/security', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'security.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/kamati', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

function handleOrderPage(req, res) {
  const db = readDB();
  const tableId = req.params.tableId || req.query.table || 'meza-1';
  const table = (db.tables || []).find(t => String(t.id).toLowerCase() === String(tableId).toLowerCase()) || { name: 'Meza ya Wageni' };
  const event = db.event || {};
  const groom = event.groomName || 'James';
  const bride = event.brideName || 'Lilian';

  const filePath = path.join(__dirname, 'public', 'order.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.sendFile(filePath);

    const ogTags = `
  <title>🍸 Kuagiza Kinywaji: ${table.name} | Harusi ya ${groom} & ${bride}</title>
  <meta name="description" content="Chagua kinywaji chako uletewe kwenye ${table.name}. Send-off ya ${bride} & ${groom}.">
  <meta property="og:title" content="🍸 Menyu ya Vinywaji: ${table.name}">
  <meta property="og:description" content="Chagua kinywaji chako uletewe moja kwa moja kwenye ${table.name}.">
  <meta property="og:type" content="website">
  <meta name="theme-color" content="#071510">
    `;

    const modified = html.replace(/<title>.*?<\/title>/i, ogTags);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(modified);
  });
}

app.get('/order/:tableId', handleOrderPage);
app.get('/order', handleOrderPage);

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎉 NYAHENDE SMART INVITATIONS (VIP EVENTS SYSTEM) RUNNING!`);
  console.log(`📡 URL Kuu:           http://localhost:${PORT}`);
  console.log(`💌 Kadi ya Mwaliko:   http://localhost:${PORT}/invite/1`);
  console.log(`🛡️ Scanner ya Walinzi: http://localhost:${PORT}/security`);
  console.log(`📊 Dashibodi ya Kamati: http://localhost:${PORT}/admin`);
  console.log(`🤖 Telegram Bot:      https://t.me/${telegramService.BOT_USERNAME}`);
  console.log(`====================================================`);

  // Start background Telegram poller for subscriber discovery
  telegramService.startPolling(30000);
});
