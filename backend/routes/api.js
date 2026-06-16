const express = require('express');
const router = express.Router();
const otpDoctor = require('../automation/otpDoctor');
const { getConfig, setConfig, getAllConfig } = require('../automation/database');

// Save config
router.post('/config', (req, res) => {
  const { apiKey, telegramToken, telegramChatId } = req.body;
  if (apiKey) setConfig('apiKey', apiKey);
  if (telegramToken) setConfig('telegramToken', telegramToken);
  if (telegramChatId) setConfig('telegramChatId', telegramChatId);
  res.json({ success: true });
});

// Get config (masked)
router.get('/config', (req, res) => {
  const cfg = getAllConfig();
  res.json({
    hasApiKey: !!cfg.apiKey,
    hasTelegram: !!(cfg.telegramToken && cfg.telegramChatId),
    apiKeyPreview: cfg.apiKey ? cfg.apiKey.substring(0, 4) + '****' : null
  });
});

// Test API key + get balance
router.post('/test-connection', async (req, res) => {
  const { apiKey } = req.body;
  const key = apiKey || getConfig('apiKey');
  if (!key) return res.json({ success: false, error: 'No API key' });

  const result = await otpDoctor.getBalance(key);
  res.json(result);
});

// Get countries
router.get('/countries', async (req, res) => {
  const apiKey = getConfig('apiKey');
  if (!apiKey) return res.json({ success: false, error: 'No API key configured' });

  const result = await otpDoctor.getCountries(apiKey);
  res.json(result);
});

// Get services
router.get('/services', async (req, res) => {
  const apiKey = getConfig('apiKey');
  const { country } = req.query;
  if (!apiKey) return res.json({ success: false, error: 'No API key configured' });
  if (!country) return res.json({ success: false, error: 'Country required' });

  const result = await otpDoctor.getServices(apiKey, country);
  res.json(result);
});

// Get balance
router.get('/balance', async (req, res) => {
  const apiKey = getConfig('apiKey');
  if (!apiKey) return res.json({ success: false, error: 'No API key' });
  const result = await otpDoctor.getBalance(apiKey);
  res.json(result);
});

// Manual: Buy single number
router.post('/buy-number', async (req, res) => {
  const apiKey = getConfig('apiKey');
  const { service, maxPrice } = req.body;
  if (!apiKey) return res.json({ success: false, error: 'No API key' });
  if (!service) return res.json({ success: false, error: 'Service required' });

  const result = await otpDoctor.purchaseNumber(apiKey, service, maxPrice);
  res.json(result);
});

// Manual: Check SMS
router.get('/check-sms/:id', async (req, res) => {
  const apiKey = getConfig('apiKey');
  const result = await otpDoctor.checkSMS(apiKey, req.params.id);
  res.json(result);
});

// Manual: Cancel number
router.post('/cancel/:id', async (req, res) => {
  const apiKey = getConfig('apiKey');
  const result = await otpDoctor.cancelNumber(apiKey, req.params.id);
  res.json(result);
});

module.exports = router;
