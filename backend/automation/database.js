const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'results.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    phone TEXT,
    activation_id TEXT,
    otp TEXT,
    gemini_url TEXT,
    status TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function saveResult({ sessionId, phone, activationId, otp, geminiUrl, status, error }) {
  const stmt = db.prepare(`
    INSERT INTO results (session_id, phone, activation_id, otp, gemini_url, status, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(sessionId, phone, activationId, otp || null, geminiUrl || null, status, error || null);
}

function getResults(limit = 100) {
  return db.prepare('SELECT * FROM results ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}

function getAllConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = {};
  rows.forEach(r => cfg[r.key] = r.value);
  return cfg;
}

function clearResults() {
  db.prepare('DELETE FROM results').run();
}

module.exports = { saveResult, getResults, getConfig, setConfig, getAllConfig, clearResults };
