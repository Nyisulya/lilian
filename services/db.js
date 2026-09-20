/**
 * Centralized Database & Persistent Storage Service
 * 
 * Protects live data from Git overwrites by isolating runtime data to data/live_db.json
 * Automatically handles backups in data/backups/
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LIVE_DB_FILE = path.join(DATA_DIR, 'live_db.json');
const LEGACY_DB_FILE = path.join(DATA_DIR, 'db.json');
const VPS_BACKUP_FILE = path.join(DATA_DIR, 'db.vps.backup.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// 1. Ensure required directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// 2. Safe initialization / Migration to live_db.json
// If live_db.json does not exist, initialize from db.vps.backup.json or db.json
if (!fs.existsSync(LIVE_DB_FILE)) {
  try {
    if (fs.existsSync(VPS_BACKUP_FILE)) {
      fs.copyFileSync(VPS_BACKUP_FILE, LIVE_DB_FILE);
      console.log('✅ Initialized live_db.json from VPS backup (preserved live data)');
    } else if (fs.existsSync(LEGACY_DB_FILE)) {
      fs.copyFileSync(LEGACY_DB_FILE, LIVE_DB_FILE);
      console.log('✅ Initialized live_db.json from db.json');
    } else {
      fs.writeFileSync(LIVE_DB_FILE, JSON.stringify({
        event: {},
        committeeMembers: [],
        tables: [],
        drinks: [],
        timeline: [],
        guests: [],
        wishes: [],
        smsConfig: {},
        smsLogs: [],
        whatsappConfig: {},
        whatsappLogs: [],
        orders: []
      }, null, 2), 'utf8');
      console.log('✅ Created fresh live_db.json');
    }
  } catch (err) {
    console.error('Error during initial live_db.json setup:', err);
  }
}

function getDBFilePath() {
  return fs.existsSync(LIVE_DB_FILE) ? LIVE_DB_FILE : LEGACY_DB_FILE;
}

function readDB() {
  const target = getDBFilePath();
  try {
    const raw = fs.readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw);

    // Auto-migrate legacy venue if still present in database
    if (parsed.event) {
      let changed = false;
      if (!parsed.event.receptionVenue || parsed.event.receptionVenue.includes('Mlimani')) {
        parsed.event.receptionVenue = 'Bragging Social Hall, Goba, Dar es Salaam';
        parsed.event.googleMapsUrl = 'https://maps.google.com/?q=Bragging+Social+Hall+Goba+Dar+es+Salaam';
        parsed.event.googleMapsEmbed = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15848.7!2d39.18!3d-6.75!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sBragging+Social+Hall+Goba!5e0!3m2!1sen!2stz!4v1700000000000!5m2!1sen!2stz';
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(target, JSON.stringify(parsed, null, 2), 'utf8');
      }
    }

    return parsed;
  } catch (err) {
    console.error('Error reading primary database:', err);
    // Fallback attempt to latest backup
    const latestBackup = path.join(BACKUPS_DIR, 'live_db_latest_backup.json');
    if (fs.existsSync(latestBackup)) {
      try {
        return JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
      } catch (e) {}
    }
    return { event: {}, committeeMembers: [], tables: [], drinks: [], timeline: [], guests: [], wishes: [], smsConfig: {}, smsLogs: [], orders: [] };
  }
}

let lastHourlyBackupTime = 0;

function writeDB(data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);

    // 1. Primary write to live_db.json (Ignored by Git, safe from git pull / git reset)
    fs.writeFileSync(LIVE_DB_FILE, jsonStr, 'utf8');

    // 2. Rolling backup in data/backups/live_db_latest_backup.json
    const latestBackup = path.join(BACKUPS_DIR, 'live_db_latest_backup.json');
    fs.writeFileSync(latestBackup, jsonStr, 'utf8');

    // 3. Hourly timestamped snapshot (keeps historical restore points)
    const now = Date.now();
    if (now - lastHourlyBackupTime > 3600 * 1000) {
      lastHourlyBackupTime = now;
      const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
      const timeBackup = path.join(BACKUPS_DIR, `db_snapshot_${dateTag}.json`);
      fs.writeFileSync(timeBackup, jsonStr, 'utf8');
    }

    return true;
  } catch (err) {
    console.error('Error writing live_db.json:', err);
    return false;
  }
}

module.exports = {
  readDB,
  writeDB,
  getDBFilePath,
  DATA_DIR,
  BACKUPS_DIR,
  LIVE_DB_FILE
};
