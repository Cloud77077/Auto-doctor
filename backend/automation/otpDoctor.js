const axios = require('axios');
const config = require('../config');

const BASE = config.otpDoctorBaseUrl;

async function getBalance(apiKey) {
  const res = await axios.get(BASE, {
    params: { action: 'getBalance', api_key: apiKey }
  });
  // Response: ACCESS_BALANCE:123.45
  const data = res.data;
  if (data.startsWith('ACCESS_BALANCE:')) {
    return { success: true, balance: parseFloat(data.split(':')[1]) };
  }
  return { success: false, error: data };
}

async function getCountries(apiKey) {
  const res = await axios.get(BASE, {
    params: { action: 'getCountries', api_key: apiKey }
  });
  return { success: true, data: res.data };
}

async function getServices(apiKey, country) {
  const res = await axios.get(BASE, {
    params: { action: 'getServices', api_key: apiKey, country }
  });
  return { success: true, data: res.data };
}

async function purchaseNumber(apiKey, service, maxPrice) {
  const params = { action: 'getNumber', api_key: apiKey, service };
  if (maxPrice) params.maxPrice = maxPrice;

  const res = await axios.get(BASE, { params });
  const data = res.data;

  // Response: ACCESS_NUMBER:activationId:phoneNumber
  if (data.startsWith('ACCESS_NUMBER:')) {
    const parts = data.split(':');
    return {
      success: true,
      activationId: parts[1],
      phone: parts[2]
    };
  }
  return { success: false, error: data };
}

async function checkSMS(apiKey, id) {
  const res = await axios.get(BASE, {
    params: { action: 'getStatus', api_key: apiKey, id }
  });
  const data = res.data;

  if (data.startsWith('STATUS_OK:')) {
    return { success: true, status: 'OK', smsText: data.replace('STATUS_OK:', '') };
  }
  if (data === 'STATUS_WAIT_CODE') {
    return { success: true, status: 'WAITING' };
  }
  if (data === 'STATUS_WAIT_RETRY') {
    return { success: true, status: 'RETRY' };
  }
  if (data === 'STATUS_CANCEL') {
    return { success: true, status: 'CANCELLED' };
  }
  return { success: false, error: data };
}

async function cancelNumber(apiKey, id) {
  const res = await axios.get(BASE, {
    params: { action: 'setStatus', api_key: apiKey, id, status: 8 }
  });
  return { success: res.data === 'STATUS_CANCEL', raw: res.data };
}

async function requestNextSMS(apiKey, id) {
  const res = await axios.get(BASE, {
    params: { action: 'setStatus', api_key: apiKey, id, status: 3 }
  });
  return { success: res.data === 'ACCESS_RETRY_GET', raw: res.data };
}

// Poll until OTP arrives or timeout
async function waitForOTP(apiKey, id, timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkSMS(apiKey, id);
    if (!result.success) return { success: false, error: result.error };
    if (result.status === 'OK') return { success: true, smsText: result.smsText };
    if (result.status === 'CANCELLED') return { success: false, error: 'Cancelled' };
    await new Promise(r => setTimeout(r, 5000));
  }
  return { success: false, error: 'Timeout waiting for OTP' };
}

// Extract OTP digits from SMS text
function extractOTP(smsText) {
  const match = smsText.match(/\b(\d{4,8})\b/);
  return match ? match[1] : null;
}

module.exports = {
  getBalance,
  getCountries,
  getServices,
  purchaseNumber,
  checkSMS,
  cancelNumber,
  requestNextSMS,
  waitForOTP,
  extractOTP
};

