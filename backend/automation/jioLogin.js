const { chromium } = require('playwright');

// STEP 1: Just check if number is Jio and trigger OTP send
// Returns: { isJio: true/false, browser, page, context }
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

    await randomDelay(1500, 2000);

    // Enter phone number
    const cleanPhone = phone.replace(/^91/, '');
    log(`Entering number: ${cleanPhone}`);
    const phoneInput = await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await phoneInput.click();
    await randomDelay(300, 500);
    await phoneInput.fill(cleanPhone);
    await randomDelay(800, 1200);

    // Click Generate OTP
    log('Clicking Generate OTP...');
    const otpBtn = await page.waitForSelector('button:has-text("Generate OTP")', { timeout: 10000 });
    await otpBtn.click();

    // Wait and immediately check for non-Jio error
    await randomDelay(2000, 3000);
    const bodyText = await page.textContent('body');

    if (bodyText.includes('non-Jio number')) {
      log('Non-Jio number — skipping immediately');
      await browser.close();
      return { isJio: false, browser: null, page: null, context: null };
    }

    // Check again after short wait
    await randomDelay(1000, 1500);
    const bodyText2 = await page.textContent('body');
    if (bodyText2.includes('non-Jio number')) {
      log('Non-Jio number — skipping immediately');
      await browser.close();
      return { isJio: false, browser: null, page: null, context: null };
    }

    // Jio confirmed — OTP boxes should be appearing
    log('Jio number confirmed — OTP sent by Jio');
    return { isJio: true, browser, page, context };

  } catch (err) {
    log(`checkIfJio error: ${err.message}`);
    if (browser) await browser.close();
    return { isJio: false, browser: null, page: null, context: null };
  }
}

// STEP 2: Complete login after OTP received
async function completeLoginWithOTP({ browser, page, context, otp, sessionId, onLog }) {
  const log = (msg) => {
    console.log(`[Session ${sessionId}] ${msg}`);
    if (onLog) onLog(msg);
  };

  try {
    // Wait for 6 OTP input boxes
    log('Waiting for OTP input boxes...');
    await page.waitForSelector('input[maxlength="1"]', { timeout: 25000 });
    const otpBoxes = await page.$$('input[maxlength="1"]');

    if (otpBoxes.length < 6) {
      log(`Expected 6 OTP boxes, found ${otpBoxes.length}`);
      await browser.close();
      return { success: false, error: 'OTP boxes not found' };
    }

    // Enter OTP digit by digit
    log(`Entering OTP: ${otp}`);
    const digits = otp.split('');
    for (let i = 0; i < 6; i++) {
      await otpBoxes[i].click();
      await randomDelay(100, 200);
      await otpBoxes[i].fill(digits[i]);
    }

    await randomDelay(500, 800);

    // Click Submit
    log('Clicking Submit...');
    const submitBtn = await page.waitForSelector('button:has-text("Submit")', { timeout: 8000 });
    await submitBtn.click();

    // Wait for dashboard
    log('Waiting for dashboard...');
    await page.waitForURL('**/selfcare/dashboard/**', { timeout: 20000 });
    await randomDelay(2000, 3000);
    log('Logged in successfully');

    // Click Claim now
    log('Looking for Claim now button...');
    const claimBtn = await page.waitForSelector(
      'button:has-text("Claim now"), a:has-text("Claim now")',
      { timeout: 15000 }
    );
    await claimBtn.click();
    log('Clicked Claim now');

    // Wait for Jio Google AI page
    log('Waiting for Jio redirect page...');
    await page.waitForURL('**/selfcare/googleai/**', { timeout: 15000 });

    // Wait for auto redirect to one.google.com
    log('Waiting for Google One redirect...');
    await page.waitForURL('**/one.google.com/**', { timeout: 20000 });
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
