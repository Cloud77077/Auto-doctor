const otpDoctor = require('./otpDoctor');
const { loginAndExtractGemini } = require('./jioLogin');
const { sendGeminiResult } = require('./telegram');
const { saveResult } = require('./database');

// Global state
const sessions = {}; // sessionId -> { status, phone, activationId, step, ... }
let globalStop = false;
let io = null; // Socket.io instance, set externally

function setIO(socketIO) {
  io = socketIO;
}

function emit(event, data) {
  if (io) io.emit(event, data);
}

function updateSession(sessionId, updates) {
  sessions[sessionId] = { ...sessions[sessionId], ...updates };
  emit('session_update', { sessionId, ...sessions[sessionId] });
}

function log(sessionId, message) {
  console.log(`[Session ${sessionId}] ${message}`);
  emit('log', { sessionId, message, time: new Date().toISOString() });
}

async function runSession({ sessionId, apiKey, service, telegramToken, telegramChatId, maxPrice }) {
  globalStop = false;

  updateSession(sessionId, { status: 'running', step: 'Starting', phone: null, error: null });
  log(sessionId, 'Session started');

  while (!globalStop) {
    try {
      // Step 1: Buy number
      updateSession(sessionId, { step: 'Buying number' });
      log(sessionId, 'Purchasing number from OTP Doctor...');

      const purchase = await otpDoctor.purchaseNumber(apiKey, service, maxPrice);
      if (!purchase.success) {
        log(sessionId, `Purchase failed: ${purchase.error}`);
        if (purchase.error === 'NO_BALANCE') {
          updateSession(sessionId, { status: 'stopped', step: 'No balance', error: 'Insufficient balance' });
          return;
        }
        log(sessionId, 'Retrying in 10s...');
        await delay(10000);
        continue;
      }

      const { activationId, phone } = purchase;
      updateSession(sessionId, { step: 'Number purchased', phone, activationId });
      log(sessionId, `Got number: ${phone} (ID: ${activationId})`);

      // Step 2: Wait for OTP
      updateSession(sessionId, { step: 'Waiting for OTP' });
      log(sessionId, 'Waiting for OTP SMS...');

      const otpResult = await otpDoctor.waitForOTP(apiKey, activationId);

      if (!otpResult.success) {
        log(sessionId, `OTP failed: ${otpResult.error} — cancelling number`);
        await otpDoctor.cancelNumber(apiKey, activationId);
        saveResult({ sessionId, phone, activationId, status: 'otp_failed', error: otpResult.error });
        updateSession(sessionId, { step: 'OTP failed, retrying...' });
        await delay(3000);
        continue;
      }

      const otp = otpDoctor.extractOTP(otpResult.smsText);
      log(sessionId, `OTP received: ${otp} (SMS: ${otpResult.smsText})`);
      updateSession(sessionId, { step: 'OTP received', otp });

      // Step 3: Login to Jio
      updateSession(sessionId, { step: 'Logging into Jio' });
      log(sessionId, 'Starting Jio login automation...');

      const loginResult = await loginAndExtractGemini({
        phone,
        otp,
        sessionId,
        onLog: (msg) => log(sessionId, msg)
      });

      if (loginResult.notJio) {
        log(sessionId, 'Not a Jio number — cancelling and retrying');
        await otpDoctor.cancelNumber(apiKey, activationId);
        saveResult({ sessionId, phone, activationId, otp, status: 'not_jio' });
        updateSession(sessionId, { step: 'Not Jio, retrying...' });
        await delay(2000);
        continue;
      }

      if (!loginResult.success) {
        log(sessionId, `Login failed: ${loginResult.error}`);
        saveResult({ sessionId, phone, activationId, otp, status: 'login_failed', error: loginResult.error });
        updateSession(sessionId, { step: 'Login failed, retrying...' });
        await delay(5000);
        continue;
      }

      // Step 4: Got Gemini URL!
      const { geminiUrl } = loginResult;
      updateSession(sessionId, { step: 'Gemini found!', geminiUrl });
      log(sessionId, `✅ Gemini URL: ${geminiUrl}`);

      saveResult({ sessionId, phone, activationId, otp, geminiUrl, status: 'success' });

      // Step 5: Send to Telegram
      if (telegramToken && telegramChatId) {
        updateSession(sessionId, { step: 'Sending to Telegram' });
        await sendGeminiResult({ botToken: telegramToken, chatId: telegramChatId, phone, geminiUrl, sessionId });
        log(sessionId, 'Sent to Telegram');
      }

      emit('result', { sessionId, phone, geminiUrl, time: new Date().toISOString() });

      updateSession(sessionId, { step: 'Done, starting next...' });
      await delay(3000);

    } catch (err) {
      log(sessionId, `Unexpected error: ${err.message}`);
      updateSession(sessionId, { step: 'Error, retrying...', error: err.message });
      await delay(5000);
    }
  }

  updateSession(sessionId, { status: 'stopped', step: 'Stopped' });
  log(sessionId, 'Session stopped');
}

function stopAll() {
  globalStop = true;
  Object.keys(sessions).forEach(id => {
    sessions[id].status = 'stopping';
  });
  emit('stopped', { message: 'All sessions stopping...' });
}

function stopSession(sessionId) {
  if (sessions[sessionId]) {
    sessions[sessionId]._stop = true;
  }
}

function getSessions() {
  return sessions;
}

function clearSessions() {
  Object.keys(sessions).forEach(k => delete sessions[k]);
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { runSession, stopAll, stopSession, getSessions, clearSessions, setIO };

