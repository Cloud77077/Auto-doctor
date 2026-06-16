const axios = require('axios');

async function sendMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    console.log('[Telegram] Not configured, skipping send');
    return { success: false, error: 'Not configured' };
  }
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await axios.post(url, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML'
    });
    return { success: true, data: res.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function sendGeminiResult({ botToken, chatId, phone, geminiUrl, sessionId }) {
  const text = `
🎉 <b>Gemini URL Found!</b>

📱 <b>Number:</b> <code>${phone}</code>
🔗 <b>Gemini URL:</b> ${geminiUrl}
🤖 <b>Session:</b> ${sessionId}
🕐 <b>Time:</b> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
`.trim();

  return sendMessage(botToken, chatId, text);
}

async function sendStatus({ botToken, chatId, message }) {
  return sendMessage(botToken, chatId, `ℹ️ ${message}`);
}

module.exports = { sendMessage, sendGeminiResult, sendStatus };
