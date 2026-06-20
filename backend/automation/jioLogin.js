const { chromium } = require('playwright');

async function checkIfJioAndRequestOTP({ phone, sessionId, onLog }) {
  const log = (msg) => {
    console.log(`[Session ${sessionId}] ${msg}`);
    if (onLog) onLog(msg);
  };

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      viewport: { width: 390, height: 844 }
    });

    const page = await context.newPage();

    log('Opening Jio login page...');
    await page.goto('https://www.jio.com/selfcare/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await randomDelay(1000, 1500);

    // Enter phone number
    const cleanPhone = phone.replace(/^91/, '');
    log(`Entering number: ${cleanPhone}`);
    const phoneInput = await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await phoneInput.click();
    await randomDelay(200, 400);
    await phoneInput.fill(cleanPhone);
    await randomDelay(600, 900);

    // Click Generate OTP
    log('Clicking Generate OTP...');
    const otpBtn = await page.waitForSelector('button:has-text("Generate OTP")', { timeout: 10000 });
    await otpBtn.click();

    // Detect outcome
    log('Detecting Jio or non-Jio...');
    const result = await Promise.race([
      page.waitForSelector('text=non-Jio number', { timeout: 10000 })
        .then(() => 'NOT_JIO'),
      page.waitForSelector('input[maxlength="1"]', { timeout: 10000 })
        .then(() => 'JIO')
    ]).catch(() => 'UNKNOWN');

    if (result === 'NOT_JIO' || result === 'UNKNOWN') {
      log(`Result: ${result} — closing browser`);
      await browser.close();
      return { isJio: false, browser: null, page: null };
    }

    // Jio confirmed — page is now on verify screen with 6 boxes
    log('Jio confirmed ✅ — verify page open with OTP boxes ready');
    return { isJio: true, browser, page };

  } catch (err) {
    log(`checkIfJio error: ${err.message}`);
    if (browser) await browser.close();
    return { isJio: false, browser: null, page: null };
  }
}

async function completeLoginWithOTP({ browser, page, otp, sessionId, onLog }) {
  const log = (msg) => {
    console.log(`[Session ${sessionId}] ${msg}`);
    if (onLog) onLog(msg);
  };

  try {
    // Make sure OTP boxes are visible
    log('Confirming OTP boxes are visible...');
    await page.waitForSelector('input[maxlength="1"]', { timeout: 10000 });

    // Click ONLY the first box — auto-jump handles the rest
    log(`Entering OTP: ${otp}`);
    const firstBox = await page.$('input[maxlength="1"]');
    await firstBox.click();
    await randomDelay(200, 300);

    // Type all 6 digits one by one — focus auto-jumps to next box after each
    const digits = otp.split('');
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press(digits[i]);
      await randomDelay(100, 200);
    }

    await randomDelay(400, 600);

    // Click Submit
    log('Clicking Submit...');
    const submitBtn = await page.waitForSelector('button:has-text("Submit")', { timeout: 8000 });
    await submitBtn.click();

    // Wait for dashboard
    log('Waiting for dashboard...');
    await page.waitForURL('**/selfcare/dashboard/**', { timeout: 20000 });
    await randomDelay(2000, 3000);
    log('On dashboard ✅');

    // Click Claim now
    log('Looking for Claim now button...');
    const claimBtn = await page.waitForSelector(
      'button:has-text("Claim now"), a:has-text("Claim now")',
      { timeout: 15000 }
    );
    await claimBtn.click();
    log('Clicked Claim now');

    // Wait for googleai page
    log('Waiting for Jio Google AI page...');
    await page.waitForURL('**/selfcare/googleai/**', { timeout: 15000 });
    await randomDelay(1000, 1500);

    // Try auto redirect first, fallback click "Redirecting" button
    log('Waiting for redirect to Google One...');
    const googleRedirect = await Promise.race([
      page.waitForURL('**/one.google.com/**', { timeout: 8000 })
        .then(() => 'AUTO'),
      page.waitForSelector('button:has-text("Redirecting"), a:has-text("Redirecting")', { timeout: 8000 })
        .then(() => 'MANUAL')
    ]).catch(() => 'MANUAL');

    if (googleRedirect === 'MANUAL') {
      log('Clicking Redirecting button manually...');
      const redirectBtn = await page.$('button:has-text("Redirecting"), a:has-text("Redirecting")');
      if (redirectBtn) await redirectBtn.click();
      await page.waitForURL('**/one.google.com/**', { timeout: 15000 });
    }

    await randomDelay(1000, 1500);
    const finalUrl = page.url();
    log(`Got Google One URL: ${finalUrl}`);

    await browser.close();
    return { success: true, geminiUrl: finalUrl };

  } catch (err) {
    log(`completeLogin error: ${err.message}`);
    if (browser) await browser.close();
    return { success: false, error: err.message };
  }
}

async function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { checkIfJioAndRequestOTP, completeLoginWithOTP };
