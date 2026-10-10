const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// Auto-load .env file if present (kept locally and in .gitignore, never pushed to Git)
const envFilePath = path.join(__dirname, '.env');
if (fs.existsSync(envFilePath)) {
  try {
    const envLines = fs.readFileSync(envFilePath, 'utf8').split(/\r?\n/);
    for (const rawLine of envLines) {
      const line = rawLine.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const splitIdx = line.indexOf('=');
        const k = line.substring(0, splitIdx).trim();
        const v = line.substring(splitIdx + 1).trim();
        if (k && !process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  } catch (e) {
    console.error('Error loading .env file:', e);
  }
}

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

// Database Sync from Git Endpoint (One-click sync on VPS after git pull)
app.post('/api/backup/sync-git', (req, res) => {
  try {
    const legacyFile = path.join(__dirname, 'data', 'db.json');
    if (!fs.existsSync(legacyFile)) {
      return res.status(404).json({ error: 'Faili la data/db.json halikupatikana.' });
    }
    const freshData = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    writeDB(freshData);
    res.json({
      success: true,
      message: `Database imesawazishwa kikamilifu kutoka Git! Wageni wote ${freshData.guests?.length || 0} wamewekwa.`,
      guestCount: freshData.guests?.length || 0
    });
  } catch (err) {
    console.error('Error syncing database from git:', err);
    res.status(500).json({ error: 'Hitilafu ya kusawazisha database: ' + err.message });
  }
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
// 2. Stats for Kamati Dashboard & Gate Security
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const guests = db.guests || [];

  const totalGuests = guests.length;
  let totalSeatsAllocated = 0;
  let totalSeats = 0;
  let checkedInSeats = 0;
  let checkedInCards = 0;
  let confirmedSeats = 0;
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

  let rsvpConfirmed = 0;
  let rsvpDeclined = 0;
  let rsvpPending = 0;
  let rsvpConfirmedSeats = 0;

  guests.forEach(g => {
    const seats = Number(g.seats) || 1;
    const pledge = Number(g.pledgeAmount) || 0;
    const paid = Number(g.paidAmount) || 0;
    const balance = pledge - paid;

    totalSeatsAllocated += seats;
    totalSeats += seats;
    totalPledges += pledge;
    totalPaid += paid;
    confirmedSeats += seats;

    // RSVP Attendance counting
    if (g.rsvpStatus === 'confirmed') {
      rsvpConfirmed++;
      rsvpConfirmedSeats += seats;
    } else if (g.rsvpStatus === 'declined') {
      rsvpDeclined++;
    } else {
      rsvpPending++;
    }

    // Calculate actual seats entered
    const entered = (g.seatsCheckedIn !== undefined && g.seatsCheckedIn !== null)
      ? Number(g.seatsCheckedIn)
      : (g.checkedIn ? seats : 0);

    checkedInSeats += entered;
    if (entered > 0) {
      checkedInCards++;
    }

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
      tableOccupancy[g.tableId].checkedIn += entered;
    }
  });

  const remainingToArrive = Math.max(0, totalSeats - checkedInSeats);

  res.json({
    totalGuests,
    totalSeats,
    totalSeatsAllocated,
    checkedInCount: checkedInSeats, // Total individual people inside
    checkedInCards, // Total cards/families scanned
    confirmedCount: confirmedSeats, // Total expected people
    remainingToArrive, // People still to arrive
    completedCount,
    debtorsCount,
    totalDebtorsBalance,
    completedAmount,
    rsvpStats: {
      confirmed: rsvpConfirmed,
      confirmedSeats: rsvpConfirmedSeats,
      declined: rsvpDeclined,
      pending: rsvpPending
    },
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
  const search = String(req.params.id).trim().toLowerCase();
  const guest = (db.guests || []).find(g => 
    String(g.id).toLowerCase() === search || 
    String(g.code || '').toLowerCase() === search
  );
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

function removeStaleCardFiles(guestId, guestCode) {
  const cardsDir = path.join(__dirname, 'public', 'images', 'cards');
  if (!fs.existsSync(cardsDir)) return;
  if (guestId) {
    const p1 = path.join(cardsDir, `card_${guestId}.jpg`);
    if (fs.existsSync(p1)) {
      try { fs.unlinkSync(p1); } catch (e) {}
    }
  }
  if (guestCode) {
    const p2 = path.join(cardsDir, `card_${guestCode}.jpg`);
    if (fs.existsSync(p2)) {
      try { fs.unlinkSync(p2); } catch (e) {}
    }
  }
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Remove any stale card image from previous deleted guest with same ID/code
  removeStaleCardFiles(newGuest.id, newGuest.code);

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

  const oldGuest = db.guests[idx];
  removeStaleCardFiles(oldGuest.id, oldGuest.code);

  db.guests[idx] = { ...db.guests[idx], ...req.body, updatedAt: new Date().toISOString() };
  removeStaleCardFiles(db.guests[idx].id, db.guests[idx].code);

  writeDB(db);
  res.json(db.guests[idx]);
});

app.delete('/api/guests/:id', (req, res) => {
  const db = readDB();
  const toDelete = (db.guests || []).find(g => g.id.toLowerCase() === req.params.id.toLowerCase());
  if (!toDelete) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  removeStaleCardFiles(toDelete.id, toDelete.code);

  db.guests = (db.guests || []).filter(g => g.id.toLowerCase() !== req.params.id.toLowerCase());
  writeDB(db);
  res.json({ success: true, message: 'Mualikwa amefutwa na kadi yake imeondolewa' });
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
    } catch (e) {
      console.error(`Error sending reminder to ${guest.name}:`, e);
    }
  }

  const freshDb = readDB();
  for (const r of results) {
    const target = (freshDb.guests || []).find(g => g.id === r.guestId);
    if (target) {
      target.reminderCount = (target.reminderCount || 0) + 1;
    }
  }
  writeDB(freshDb);
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

app.post('/api/whatsapp/send-all-completed', async (req, res) => {
  try {
    const result = await whatsappService.sendAllCompletedWhatsAppInvitations();
    res.json({
      success: true,
      message: `Mchakato umekamilika! Kadi zimetumwa kwa wageni ${result.sent} kati ya ${result.total}.`,
      result
    });
  } catch (err) {
    console.error('Error in bulk WhatsApp send:', err);
    res.status(500).json({ success: false, error: err.message });
  }
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

app.post('/api/whatsapp/test', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) {
    return res.status(400).json({ error: 'Tafadhali ingiza namba ya simu.' });
  }
  const testMsg = `✨ *JARIBIO LA MFUMO WA WHATSAPP (SEND-OFF YA LILIAN)* ✨\n\nHabari! Huu ni ujumbe wa majaribio kutoka mfumo wa kiotomatiki wa Harusi (UltraMsg Gateway).\n\nNamba yako ya WhatsApp imeunganishwa kikamilifu na mfumo uko tayari kutuma kadi na mialiko kwa wageni wote! 🥂🎉`;
  
  const db = readDB();
  const config = db.whatsappConfig || {};
  const systemUrl = config.systemUrl || 'https://lilian.nyisu.com';
  const testImg = `${systemUrl}/images/cards/card_1.jpg`;

  try {
    const result = await whatsappService.sendRawWhatsApp(phone, testMsg, testImg, 'Jaribio la WhatsApp', 'Majaribio');
    res.json({
      success: result.success,
      message: result.success ? 'Ujumbe wa majaribio na picha ya kadi zimetumwa WhatsApp kwa mafanikio!' : (result.log?.responseMessage || 'Hitilafu ya utumaji'),
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// META WHATSAPP CLOUD API - WEBHOOK & INBOX
// ============================================================

// Webhook Verification (Meta GET Challenge)
app.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const db = readDB();
  const config = db.whatsappConfig || {};
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || config.verifyToken || 'harusi_whatsapp_token_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('✅ [WHATSAPP WEBHOOK] Verified successfully by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [WHATSAPP WEBHOOK] Verification token mismatch:', { received: token, expected: expectedToken });
      return res.sendStatus(403);
    }
  }
  res.status(400).send('Invalid verification request');
});

// Incoming Message Receiver (Meta POST Webhook)
app.post('/api/whatsapp/webhook', (req, res) => {
  // Always return 200 immediately to prevent Meta retry floods
  res.sendStatus(200);

  const body = req.body;
  if (!body) return;
  console.log('📥 [WHATSAPP WEBHOOK POST RECEIVED]:', JSON.stringify(body).slice(0, 300));

  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value;
        if (!val) continue;

        // Process incoming messages
        if (val.messages && Array.isArray(val.messages)) {
          const contacts = val.contacts || [];
          const contactMap = {};
          contacts.forEach(c => {
            if (c.wa_id) contactMap[c.wa_id] = c.profile?.name || '';
          });

          const db = readDB();
          db.whatsappInbox = db.whatsappInbox || [];

          for (const msg of val.messages) {
            const senderPhone = String(msg.from || '').trim();
            const senderName = contactMap[senderPhone] || '';
            const msgId = msg.id || `inbox-msg-${Date.now()}`;
            const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString() : new Date().toISOString();

            let text = '';
            const msgType = msg.type || 'text';
            if (msg.type === 'text') {
              text = msg.text?.body || '';
            } else if (msg.type === 'button') {
              text = msg.button?.text || '[Kitufe kilichobonyezwa]';
            } else if (msg.type === 'interactive') {
              text = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[Jibu la Kitufe]';
            } else if (msg.type === 'image') {
              text = msg.image?.caption ? `📷 [Picha]: ${msg.image.caption}` : '📷 [Picha imetumwa]';
            } else if (msg.type === 'audio') {
              text = '🎙️ [Ujumbe wa sauti / Voice note]';
            } else if (msg.type === 'video') {
              text = '🎥 [Video imetumwa]';
            } else if (msg.type === 'document') {
              text = '📄 [Waraka / Faili limetumwa]';
            } else if (msg.type === 'location') {
              text = `📍 [Eneo / Mahali]: ${msg.location?.name || ''} (${msg.location?.latitude}, ${msg.location?.longitude})`;
            } else {
              text = `[${msgType}]`;
            }

            // Match guest from database by phone
            const cleanSender = senderPhone.replace(/[^0-9]/g, '');
            const guest = (db.guests || []).find(g => {
              const p = String(g.phone || '').replace(/[^0-9]/g, '');
              return p && (p === cleanSender || cleanSender.endsWith(p) || p.endsWith(cleanSender));
            });

            // Prevent duplicate message entries
            if (!db.whatsappInbox.some(m => m.msgId === msgId)) {
              db.whatsappInbox.unshift({
                id: `inbox-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                msgId: msgId,
                timestamp: timestamp,
                senderPhone: senderPhone,
                senderName: senderName || (guest ? guest.name : 'Mgeni'),
                guestId: guest ? guest.id : null,
                guestTable: guest ? (guest.table || guest.tableName || 'Haijatengwa') : null,
                guestSeats: guest ? guest.seats : null,
                messageText: text,
                rawType: msgType,
                status: 'unread'
              });
              console.log(`📩 [WHATSAPP INBOX] Ujumbe kutoka kwa ${senderName || (guest ? guest.name : senderPhone)}: "${text}"`);
            }
          }
          writeDB(db);
        }

        // Process message delivery status updates from Meta
        if (val.statuses && Array.isArray(val.statuses)) {
          const db = readDB();
          let updated = false;
          db.whatsappLogs = db.whatsappLogs || [];
          for (const st of val.statuses) {
            const stId = st.id;
            const newStatus = st.status; // 'sent', 'delivered', 'read', 'failed'
            const logItem = db.whatsappLogs.find(l => l.id === stId || (l.rawResponse && String(l.rawResponse).includes(stId)));
            if (logItem) {
              if (newStatus === 'delivered' || newStatus === 'read') {
                logItem.status = 'delivered';
                logItem.metaDeliveryStatus = newStatus;
                updated = true;
              } else if (newStatus === 'failed') {
                logItem.status = 'failed';
                const errDetail = st.errors && st.errors[0] ? st.errors[0].title || st.errors[0].message : 'Meta delivery failed';
                logItem.responseMessage = errDetail;
                updated = true;
              }
            }
          }
          if (updated) {
            writeDB(db);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error processing Meta WhatsApp webhook payload:', err);
  }
});

// WhatsApp Inbox List Endpoint
app.get('/api/whatsapp/inbox', (req, res) => {
  const db = readDB();
  res.json(db.whatsappInbox || []);
});

// WhatsApp Quick Reply Endpoint (24-Hour Customer Care Window)
app.post('/api/whatsapp/inbox/reply', async (req, res) => {
  const { phone, message, inboxId } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: 'Namba ya simu na ujumbe vinahitajika.' });
  }

  const db = readDB();
  db.whatsappInbox = db.whatsappInbox || [];
  if (inboxId) {
    const item = db.whatsappInbox.find(m => m.id === inboxId);
    if (item) {
      item.status = 'replied';
      item.repliedAt = new Date().toISOString();
      item.replyText = message;
    }
    writeDB(db);
  }

  try {
    // Send direct text (free-form message inside 24-hr customer service window)
    const result = await whatsappService.sendRawWhatsApp(phone, message, '', 'Jibu la Huduma', '', { useTemplate: false });
    res.json({
      success: result.success,
      message: result.success ? 'Jibu limetumwa kikamilifu kwa mgeni!' : (result.log?.responseMessage || 'Hitilafu ya utumaji'),
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark WhatsApp Inbox as Read
app.post('/api/whatsapp/inbox/mark-read', (req, res) => {
  const { id } = req.body || {};
  const db = readDB();
  db.whatsappInbox = db.whatsappInbox || [];
  if (id === 'all') {
    db.whatsappInbox.forEach(m => { if (m.status === 'unread') m.status = 'read'; });
  } else if (id) {
    const item = db.whatsappInbox.find(m => m.id === id);
    if (item && item.status === 'unread') item.status = 'read';
  }
  writeDB(db);
  res.json({ success: true, count: db.whatsappInbox.filter(m => m.status === 'unread').length });
});

// Delete message from inbox
app.delete('/api/whatsapp/inbox/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  db.whatsappInbox = (db.whatsappInbox || []).filter(m => m.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// 4. RSVP & Drink Preference Submission (From Guest E-Card)
app.post('/api/rsvp', (req, res) => {
  const { guestId, rsvpStatus, guestCountAttending, drinkPreference, wishes } = req.body;
  const db = readDB();
  const search = String(guestId || '').trim().toLowerCase();
  const guest = (db.guests || []).find(g =>
    String(g.id).toLowerCase() === search ||
    String(g.code || '').toLowerCase() === search
  );

  if (!guest) {
    return res.status(404).json({ error: 'Mualikwa hakupatikana' });
  }

  guest.rsvpStatus = rsvpStatus || 'confirmed';
  guest.rsvpAt = new Date().toISOString();
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

  // Send instant real-time notification to Telegram bot
  try {
    telegramService.sendRsvpNotification(guest, guest.rsvpStatus).catch(() => {});
  } catch (e) {}

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
  // Clean rawCode: extract code if scanner sent a full URL, query param, or "PASS: 3001" prefix
  let cleanInput = rawCode.replace(/^["']|["']$/g, '').trim();

  // 0. Extract from URL if QR scanner read a web URL
  if (cleanInput.includes('http://') || cleanInput.includes('https://') || cleanInput.includes('?code=') || cleanInput.includes('/invite/')) {
    try {
      const urlObj = new URL(cleanInput.startsWith('http') ? cleanInput : `https://harusi.app/${cleanInput.replace(/^\/+/, '')}`);
      const codeFromParam = urlObj.searchParams.get('code');
      if (codeFromParam) {
        cleanInput = codeFromParam;
      } else {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart !== 'invite' && lastPart !== 'invite.html') {
          cleanInput = lastPart;
        }
      }
    } catch (e) {
      const match = cleanInput.match(/code=([a-zA-Z0-9_-]+)/i);
      if (match) cleanInput = match[1];
    }
  }

  // Extract from "PASS : 3001" or "KODI: 3001" prefix
  const passPrefix = cleanInput.match(/(?:pass|kodi)\s*[:#-]?\s*([a-zA-Z0-9]+)/i);
  if (passPrefix) {
    cleanInput = passPrefix[1];
  }

  const query = cleanInput.toLowerCase();

  let guest = null;

  // 1. Check if cleanInput matches security code (e.g. "3001")
  guest = guests.find(g => g.code && String(g.code).trim().toLowerCase() === cleanInput.toLowerCase());

  // 2. Check if cleanInput matches guest ID (e.g. "1", "26", or "#26", or "TWG-101")
  if (!guest) {
    const cleanId = cleanInput.replace(/^[#\s]+/, '').replace(/^twg-?/i, '');
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
  const totalSeats = Number(guest.seats) || 1;
  const alreadyEntered = (guest.seatsCheckedIn !== undefined && guest.seatsCheckedIn !== null)
    ? Number(guest.seatsCheckedIn)
    : (guest.checkedIn ? totalSeats : 0);

  // 1. If all seats already entered -> Already Used
  if (guest.checkedIn || alreadyEntered >= totalSeats) {
    const originalTime = guest.checkInTime ? new Date(guest.checkInTime).toLocaleTimeString('sw-TZ') : 'Mapema';
    return res.json({
      status: 'already_used',
      code: guest.id,
      guest: {
        id: guest.id,
        name: guest.name,
        title: guest.title,
        seats: totalSeats,
        seatsCheckedIn: alreadyEntered,
        tableName: table.name,
        code: guest.code,
        checkInTime: guest.checkInTime,
        lastCheckInTime: guest.lastCheckInTime,
        checkInLog: guest.checkInLog || []
      },
      message: totalSeats > 1
        ? `TAHADHARI! Kadi hii ya ${guest.name} (${totalSeats === 2 ? 'Watu 2' : `Watu ${totalSeats}`}) ILIKWISHATUMIKA! Watu wote ${alreadyEntered} walishamaliza kuingia ukumbini.`
        : `TAHADHARI! Kadi hii ya ${guest.name} ILIKWISHATUMIKA saa ${originalTime}!`
    });
  }

  // 2. Incremental Check-In (Akiingia mtu wa kwanza inakubali na kubakiza 1; akija wa pili ndo inajifunga)
  const newEntered = alreadyEntered + 1;
  const remaining = totalSeats - newEntered;
  const nowIso = new Date().toISOString();

  guest.seatsCheckedIn = newEntered;
  if (!guest.checkInTime) {
    guest.checkInTime = nowIso;
  }
  guest.lastCheckInTime = nowIso;
  guest.checkInLog = guest.checkInLog || [];
  guest.checkInLog.push({ seatNumber: newEntered, time: nowIso });

  if (newEntered >= totalSeats) {
    guest.checkedIn = true; // Kadi inajifunga rasmi
  } else {
    guest.checkedIn = false; // Bado imebaki nafasi 1
  }
  writeDB(db);

  return res.json({
    status: 'valid',
    seatNumber: newEntered,
    totalSeats: totalSeats,
    remainingSeats: remaining,
    code: guest.id,
    guest: {
      id: guest.id,
      name: guest.name,
      title: guest.title,
      seats: totalSeats,
      seatsCheckedIn: newEntered,
      remainingSeats: remaining,
      tableName: table.name,
      code: guest.code,
      checkInTime: guest.checkInTime,
      lastCheckInTime: guest.lastCheckInTime,
      checkInLog: guest.checkInLog
    },
    message: totalSeats > 1
      ? (remaining > 0
          ? `ANARUHUSIWA KUINGIA (Mtu wa ${newEntered} kati ya ${totalSeats}). Imebaki nafasi 1.`
          : `ANARUHUSIWA KUINGIA (Mtu wa ${newEntered} kati ya ${totalSeats}). Watu wote 2 wameingia. Kadi imejifunga.`)
      : `ANARUHUSIWA KUINGIA. Karibu sana ${guest.name} (${table.name}).`
  });
});

// Update seats checked in (Kama wote 2 wapo getini kwa pamoja)
app.post('/api/verify/set-seats', (req, res) => {
  const { guestId, seatsCheckedIn } = req.body;
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(guestId || '').toLowerCase() || String(g.code) === String(guestId));
  if (!guest) {
    return res.status(404).json({ error: 'Mgeni hakupatikana' });
  }

  const totalSeats = Number(guest.seats) || 1;
  const count = Math.min(totalSeats, Math.max(1, Number(seatsCheckedIn) || 1));
  guest.seatsCheckedIn = count;
  guest.checkedIn = count >= totalSeats;
  if (!guest.checkInTime) {
    guest.checkInTime = new Date().toISOString();
  }
  guest.lastCheckInTime = new Date().toISOString();
  writeDB(db);

  const table = (db.tables || []).find(t => t.id === guest.tableId) || { name: 'Haijapangwa' };

  res.json({
    success: true,
    guest: {
      id: guest.id,
      name: guest.name,
      seats: totalSeats,
      seatsCheckedIn: guest.seatsCheckedIn,
      checkedIn: guest.checkedIn,
      tableName: table.name
    },
    message: count < totalSeats
      ? `Imesasishwa: Mtu 1 ameingia. Imebaki nafasi 1 ya mtu wa pili.`
      : `Imesasishwa: Watu wote 2 wameingia. Kadi sasa imejifunga.`
  });
});

// Reset check-in status (for testing or committee overrides)
app.post('/api/verify/reset', (req, res) => {
  const { guestId } = req.body;
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(guestId || '').toLowerCase() || String(g.code) === String(guestId));
  if (guest) {
    guest.checkedIn = false;
    guest.seatsCheckedIn = 0;
    guest.checkInTime = null;
    guest.lastCheckInTime = null;
    guest.checkInLog = [];
    writeDB(db);
    return res.json({ success: true, message: `Hali ya kadi ya ${guest.name} imerejeshwa (bado hajaingia).` });
  }
  res.status(404).json({ error: 'Mualikwa hakupatikana' });
});

// Dynamic Personalized Card Generator Endpoint (Redirects to unified handler)
app.get('/api/card-image/:id', (req, res) => {
  res.redirect('/api/card/image/' + encodeURIComponent(req.params.id));
});

// 7. QR Code Generator Endpoint (Returns PNG Stream)
app.get('/api/qr/:id', async (req, res) => {
  const id = req.params.id;
  const db = readDB();
  const guest = (db.guests || []).find(g => String(g.id).toLowerCase() === String(id).toLowerCase() || String(g.code) === String(id));
  const guestCode = guest ? (guest.code || guest.id) : id;
  // Use short pass code for instant scanability (NOT full URL)
  const verifyPayload = String(guestCode);

  try {
    const qrBuffer = await QRCode.toBuffer(verifyPayload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 2,
      scale: 12,
      version: 1,
      color: {
        dark: '#000000',
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
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

app.get('/favicon.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'favicon.png'));
});

app.get('/favicon.svg', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'favicon.svg'));
});

app.get('/og-image.jpg', (req, res) => {
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
  res.sendFile(path.join(__dirname, 'public', 'og-image.jpg'));
});

// Dynamic Card Image Endpoint (Cross-Platform for VPS Linux & Windows)
app.get('/api/card/image/:id', (req, res) => {
  const db = readDB();
  const search = String(req.params.id).trim().toLowerCase();
  const guest = (db.guests || []).find(g => 
    String(g.id).toLowerCase() === search || 
    String(g.code || '').toLowerCase() === search
  );
  const targetId = guest ? guest.id : req.params.id;
  const cardsDir = path.join(__dirname, 'public', 'images', 'cards');
  if (!fs.existsSync(cardsDir)) {
    fs.mkdirSync(cardsDir, { recursive: true });
  }

  const cardFile = path.join(cardsDir, `card_${targetId}.jpg`);
  const codeFile = (guest && guest.code) ? path.join(cardsDir, `card_${guest.code}.jpg`) : null;
  const existingFile = fs.existsSync(cardFile) ? cardFile : (codeFile && fs.existsSync(codeFile) ? codeFile : null);

  const forceRegenerate = req.query.regenerate === 'true' || req.query.regenerate === '1';

  // 1. Direct check: If card already exists on disk and no forced regeneration is requested, serve it immediately (0ms)
  if (existingFile && !forceRegenerate) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(existingFile);
  }

  // 2. On-the-fly generation via Python
  const scriptPath = path.join(__dirname, 'services', 'generate_card.py');
  const { execFile } = require('child_process');

  const pyCandidates = process.platform === 'win32'
    ? ['python', 'python3']
    : ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3', path.join(__dirname, 'venv', 'bin', 'python3')];

  const tryExec = (idx) => {
    if (idx >= pyCandidates.length) {
      if (existingFile) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.sendFile(existingFile);
      }
      console.error(`❌ [Card Gen Error] Failed to generate card for ID ${targetId}. Python Pillow/qrcode not found on system.`);
      console.error(`👉 Install with: sudo apt install -y python3-pil python3-qrcode (or pip3 install pillow qrcode)`);
      return res.status(404).json({ error: 'Kadi ya picha haikupatikana.' });
    }

    const cmd = pyCandidates[idx];
    execFile(cmd, [scriptPath, targetId, cardFile], (err, stdout, stderr) => {
      if (err) {
        return tryExec(idx + 1);
      }
      if (fs.existsSync(cardFile)) {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        return res.sendFile(cardFile);
      }
      return tryExec(idx + 1);
    });
  };

  tryExec(0);
});

// Endpoint to clean all stale card images and regenerate fresh cards for current guests
app.post('/api/cards/clean-and-regenerate', (req, res) => {
  const cardsDir = path.join(__dirname, 'public', 'images', 'cards');
  if (fs.existsSync(cardsDir)) {
    const files = fs.readdirSync(cardsDir);
    for (const f of files) {
      if (f.endsWith('.jpg') || f.endsWith('.png')) {
        try { fs.unlinkSync(path.join(cardsDir, f)); } catch (e) {}
      }
    }
  }

  const scriptPath = path.join(__dirname, 'services', 'generate_card.py');
  const { execFile } = require('child_process');
  const pyCandidates = process.platform === 'win32'
    ? ['python', 'python3']
    : ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3', path.join(__dirname, 'venv', 'bin', 'python3')];

  const tryExec = (idx) => {
    if (idx >= pyCandidates.length) {
      return res.json({ success: true, message: 'Kadi za zamani zimefutwa.' });
    }
    execFile(pyCandidates[idx], [scriptPath, 'all'], (err) => {
      if (err) return tryExec(idx + 1);
      res.json({ success: true, message: 'Kadi zote za wageni zimezalishwa upya kikamilifu!' });
    });
  };
  tryExec(0);
});

app.get('/invite/:id', (req, res) => {
  const db = readDB();
  const search = String(req.params.id).trim().toLowerCase();
  const guest = (db.guests || []).find(g => 
    String(g.id).toLowerCase() === search || 
    String(g.code || '').toLowerCase() === search
  );
  const event = db.event || {};
  const guestId = guest ? guest.id : req.params.id;
  const guestName = guest ? guest.name : 'Mualikwa Maalumu';
  const tableName = (db.tables || []).find(t => t.id === (guest ? guest.tableId : null))?.name || 'Meza Maalumu';

  const host = req.get('host') || 'lilian.nyisu.com';
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const baseUrl = `${protocol}://${host}`;
  const ogImage = `${baseUrl}/images/lilian_sendoff.jpg?v=20261018`;

  const filePath = path.join(__dirname, 'public', 'invite.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.sendFile(filePath);

    const safeGuestName = String(guestName).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const cleanGuestName = String(guestName).replace(/[^a-zA-Z0-9_-]/g, '_');

    const ogTags = `
  <title>👑 Kadi ya Mwaliko: Send-off ya Lilian - ${safeGuestName}</title>
  <link rel="icon" type="image/png" sizes="64x64" href="/favicon.png?v=20261013e">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=20261013e">
  <link rel="shortcut icon" href="/favicon.ico?v=20261013e">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=20261013e">
  <meta name="theme-color" content="#071510">

  <!-- Open Graph / WhatsApp / SMS Rich Previews -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Send-off ya Lilian Marcus Nyahende">
  <meta property="og:title" content="👑 Kadi Rasmi ya Mwaliko: Send-off ya Lilian - ${safeGuestName}">
  <meta property="og:description" content="Mwaliko Maalumu kwa ${safeGuestName} (${tableName}). Tarehe 18/10/2026 Bragging Social Hall, Goba, Dar es Salaam. Bofya kufungua Kadi ya VIP na Kodi ya Kuingilia.">
  <meta property="og:url" content="${baseUrl}/invite/${guestId}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:secure_url" content="${ogImage}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="720">
  <meta property="og:image:height" content="720">
  <link rel="image_src" href="${ogImage}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="👑 Kadi Rasmi ya Mwaliko: Send-off ya Lilian - ${safeGuestName}">
  <meta name="twitter:description" content="Mwaliko Maalumu kwa ${safeGuestName}. Bofya kufungua kadi yako.">
  <meta name="twitter:image" content="${ogImage}">
    `;

    let modified = html.replace(/<title>.*?<\/title>/i, ogTags);

    // SSR PRE-RENDER: Stream the EXACT card image and guest name directly in the initial HTML!
    // 1. Direct card image src - browser starts loading immediately on first byte of HTML!
    modified = modified.replace(
      /src="\/api\/card\/image\/1"/g,
      `src="/api/card/image/${encodeURIComponent(guestId)}"`
    );
    // 2. Direct download button href & filename
    modified = modified.replace(
      /href="\/api\/card\/image\/1"\s+download="[^"]*"/g,
      `href="/api/card/image/${encodeURIComponent(guestId)}" download="Kadi_Sendoff_Lilian_${cleanGuestName}.jpg"`
    );
    // 3. Envelope guest name pre-filled
    modified = modified.replace(
      /<div class="envelope-guest-title-val" id="envelope-guest-name">Mheshimiwa Mualikwa<\/div>/,
      `<div class="envelope-guest-title-val" id="envelope-guest-name">${safeGuestName}</div>`
    );
    // 4. Inject preloaded JSON payload so client JS does not need any network roundtrip!
    const ssrScript = `<script>window.__INITIAL_GUEST__ = ${JSON.stringify(guest || null)}; window.__INITIAL_EVENT__ = ${JSON.stringify(event || null)};</script>\n</head>`;
    modified = modified.replace('</head>', ssrScript);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(modified);
  });
});

// Lightweight RSVP Confirmation Page (linked from SMS)
app.get('/confirm/:id', (req, res) => {
  const db = readDB();
  const search = String(req.params.id).trim().toLowerCase();
  const guest = (db.guests || []).find(g =>
    String(g.id).toLowerCase() === search ||
    String(g.code || '').toLowerCase() === search
  );
  const guestId = guest ? guest.id : req.params.id;
  const guestName = guest ? guest.name : 'Mualikwa Maalumu';

  const filePath = path.join(__dirname, 'public', 'confirm.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) return res.sendFile(filePath);

    const safeGuestName = String(guestName).replace(/[<>&"]/g, c => ({'<':'<','>':'>','&':'&','"':'"'}[c]));
    const inject = `<script>window.__GUEST_ID__ = ${JSON.stringify(String(guestId))}; window.__GUEST_NAME__ = ${JSON.stringify(safeGuestName)};</script>\n</head>`;
    const modified = html.replace('</head>', inject);

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

  // Pre-warm and verify guest cards for instant 0ms responses on VPS
  try {
    const db = readDB();
    const cardsDir = path.join(__dirname, 'public', 'images', 'cards');
    if (!fs.existsSync(cardsDir)) fs.mkdirSync(cardsDir, { recursive: true });
    const missing = (db.guests || []).filter(g => !fs.existsSync(path.join(cardsDir, `card_${g.id}.jpg`)));
    if (missing.length > 0) {
      console.log(`⚡ Pre-generating ${missing.length} missing guest cards for instant delivery...`);
      const { execFile } = require('child_process');
      const scriptPath = path.join(__dirname, 'services', 'generate_card.py');
      const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
      execFile(pyCmd, [scriptPath, 'all'], (err, stdout, stderr) => {
        if (!err) {
          console.log(`✅ All guest cards pre-generated and verified!`);
        } else {
          console.warn(`⚠️ Could not pre-generate cards automatically via ${pyCmd}.`);
          console.warn(`👉 To enable dynamic card generation on VPS, run: sudo apt install -y python3-pil python3-qrcode`);
        }
      });
    } else {
      console.log(`✅ All ${db.guests ? db.guests.length : 0} guest cards are pre-generated and cached for 0ms response!`);
    }
  } catch (e) {}
});
