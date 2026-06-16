const express = require('express');
const router = express.Router();
const sessionManager = require('../automation/sessionManager');
const { getResults, clearResults, getConfig } = require('../automation/database');

// Start automation sessions
router.post('/start', async (req, res) => {
  const { service, sessionCount = 1, maxPrice } = req.body;
  const apiKey = getConfig('apiKey');
  const telegramToken = getConfig('telegramToken');
  const telegramChatId = getConfig('telegramChatId');

  if (!apiKey) return res.json({ success: false, error: 'No API key configured' });
  if (!service) return res.json({ success: false, error: 'Service required' });

  const count = Math.min(parseInt(sessionCount), 5);
  const startedSessions = [];

  for (let i = 0; i < count; i++) {
    const sessionId = `session_${Date.now()}_${i + 1}`;
    startedSessions.push(sessionId);

    // Run async, don't await
    sessionManager.runSession({
      sessionId,
      apiKey,
      service,
      telegramToken,
      telegramChatId,
      maxPrice
    }).catch(err => console.error(`Session ${sessionId} crashed:`, err));
  }

  res.json({ success: true, sessions: startedSessions });
});

// Stop all sessions
router.post('/stop', (req, res) => {
  sessionManager.stopAll();
  res.json({ success: true, message: 'Stop signal sent to all sessions' });
});

// Get session statuses
router.get('/sessions', (req, res) => {
  res.json({ success: true, sessions: sessionManager.getSessions() });
});

// Get results
router.get('/results', (req, res) => {
  const results = getResults(200);
  res.json({ success: true, results });
});

// Export results as text
router.get('/results/export', (req, res) => {
  const results = getResults(1000);
  const lines = results
    .filter(r => r.gemini_url)
    .map(r => `${r.phone} | ${r.gemini_url} | ${r.created_at}`)
    .join('\n');

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="gemini-results.txt"');
  res.send(lines || 'No results yet');
});

// Clear results
router.delete('/results', (req, res) => {
  clearResults();
  res.json({ success: true });
});

module.exports = router;
