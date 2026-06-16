require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  otpDoctorApiKey: process.env.OTP_DOCTOR_API_KEY || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  maxSessions: parseInt(process.env.MAX_SESSIONS || '5'),
  otpDoctorBaseUrl: 'https://otpdoctor.in/stubs/handler_api.php',
  jioLoginUrl: 'https://www.jio.com/selfcare/login/',
  pollIntervalMs: 5000,
  maxWaitMs: 300000, // 5 minutes max wait for OTP
};

