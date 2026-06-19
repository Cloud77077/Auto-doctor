const otpDoctor = require('./otpDoctor');
const { checkIfJioAndRequestOTP, completeLoginWithOTP } = require('./jioLogin');
const { sendGeminiResult } = require('./telegram');
const { saveResult } = require('./database');

// Global state
const sessions = {};
let globalStop = false;
let io = null;

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

  while (!globalStop && !sessions[sessionId]?._stop) {
    try {

      // ── STEP 1: Buy number ────────────────────────────────────────
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

      // ── STEP 2: Check if Jio IMMEDIATELY ─────────────────────────
      updateSession(sessionId, { step: 'Checking if Jio number' });
      log(sessionId, 'Checking if Jio number on Jio website...');

      const jioCheck = await checkIfJioAndRequestOTP({
        phone,
        sessionId,
        onLog: (msg) => log(sessionId, msg)
      });

      if (!jioCheck.isJio) {
        // Not Jio — cancel and try new number immediately
        log(sessionId, 'Non-Jio number — cancelling and buying new');
        await otpDoctor.cancelNumber(apiKey, activationId);
        saveResult({ sessionId, phone, activationId, status: 'not_jio' });
        updateSession(sessionId, { step: 'Non-Jio, buying new number...' });
        await delay(2000);
        continue;
      }

      // ── STEP 3: Jio confirmed — now wait for OTP ──────────────────
      updateSession(sessionId, { step: 'Jio confirmed — waiting for OTP' });
      log(sessionId, 'Jio confirmed — now waiting for OTP SMS...');

      const otpResult = await otpDoctor.waitForOTP(apiKey, activationId);

      if (!otpResult.success) {
        log(sessionId, `OTP failed: ${otpResult.error}`);
        await otpDoctor.cancelNumber(apiKey, activationId);

        // Close the browser that was kept open
        if (jioCheck.browser) await jioCheck.browser.close().catch(() => {});

        saveResult({ sessionId, phone, activationId, status: 'otp_failed', error: otpResult.error });
        updateSession(sessionId, { step: 'OTP failed, retrying...' });
        await delay(3000);
        continue;
      }

      const otp = otpDoctor.extractOTP(otpResult.smsText);
      log(sessionId, `OTP received: ${otp} (SMS: ${otpResult.smsText})`);
      updateSession(sessionId, { step: 'OTP received — logging in', otp });

      // ── STEP 4: Complete Jio login with OTP ───────────────────────
      updateSession(sessionId, { step: 'Logging into Jio' });

      const loginResult = await completeLoginWithOTP({
        browser: jioCheck.browser,
        page: jioCheck.page,
        context: jioCheck.context,
        otp,
        sessionId,
        onLog: (msg) => log(sessionId, msg)
      });

      if (!loginResult.success) {
        log(sessionId, `Login failed: ${loginResult.error}`);
        saveResult({ sessionId, phone, activationId, otp, status: 'login_failed', error: loginResult.error });
        updateSession(sessionId, { step: 'Login failed, retrying...' });
        await delay(5000);
        continue;
      }

      // ── STEP 5: Got Gemini URL ────────────────────────────────────
      const { geminiUrl } = loginResult;
      updateSession(sessionId, { step: '✅ Gemini URL found!', geminiUrl });
      log(sessionId, `✅ Gemini URL: ${geminiUrl}`);

      saveResult({ sessionId, phone, activationId, otp, geminiUrl, status: 'success' });

      // ── STEP 6: Send to Telegram ──────────────────────────────────
      if (telegramToken && telegramChatId) {
        updateSession(sessionId, { step: 'Sending to Telegram' });
        await sendGeminiResult({
          botToken: telegramToken,
          chatId: telegramChatId,
          phone,
          geminiUrl,
          sessionId
        });
        log(sessionId, 'Sent to Telegram ✅');
      }

      emit('result', { sessionId, phone, geminiUrl, time: new Date().toISOString() });
      updateSession(sessionId, { step: 'Done — starting next number...' });
      await delay(3000);

    } catch (err) {
      log(sessionId, `Unexpected error: ${err.message}`);
      updateSession(sessionId, { step: 'Error — retrying...', error: err.message });
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
