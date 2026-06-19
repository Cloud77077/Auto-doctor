const { chromium } = require('playwright');

// STEP 1: Open Jio, enter number, click Generate OTP
// If Jio → keep browser open ON verify page with 6 boxes already visible
// If non-Jio → close browser immediately
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

    // Detect outcome — non-Jio error OR verify page with OTP boxes
    log('Detecting if Jio or non-Jio...');
    const result = await Promise.race([
      page.waitForSelector('text=non-Jio number', { timeout: 10000 })
        .then(() => 'NOT_JIO'),
      page.waitForSelector('input[maxlength="1"]', { timeout: 10000 })
        .then(() => 'JIO')
    ]).catch(() => 'UNKNOWN');

    if (result === 'NOT_JIO') {
      log('Non-Jio number — closing instantly');
      await browser.close();
      return { isJio: false, browser: null, page: null };
    }

    if (result === 'UNKNOWN') {
      log('Unknown result — treating as non-Jio');
      await browser.close();
      return { isJio: false, browser: null, page: null };
    }

    // JIO confirmed — browser is now ON the verify page with 6 boxes visible
    // Get the boxes right now while they are visible
    const otpBoxes = await page.$$('input[maxlength="1"]');
    log(`Jio confirmed — verify page open with ${otpBoxes.length} OTP boxes ready`);

    return { isJio: true, browser, page, otpBoxes };

  } catch (err) {
    log(`checkIfJio error: ${err.message}`);
    if (browser) await browser.close();
    return { isJio: false, browser: null, page: null };
  }
}

// STEP 2: OTP already received — fill the boxes that are already visible on page
async function completeLoginWithOTP({ browser, page, otpBoxes, otp, sessionId, onLog }) {
  const log = (msg) => {
    console.log(`[Session ${sessionId}] ${msg}`);
    if (onLog) onLog(msg);
  };

  try {
    if (!otpBoxes || otpBoxes.length < 6) {
      // Fallback: try to find boxes again
      log('Re-finding OTP boxes...');
      await page.waitForSelector('input[maxlength="1"]', { timeout: 10000 });
      otpBoxes = await page.$$('input[maxlength="1"]');
    }

    if (!otpBoxes || otpBoxes.length < 6) {
      log(`Only found ${otpBoxes?.length} OTP boxes`);
      await browser.close();
      return { success: false, error: 'OTP boxes not found' };
    }

    // Enter OTP digit by digit into already visible boxes
    log(`Entering OTP: ${otp}`);
    const digits = otp.split('');
    for (let i = 0; i < 6; i++) {
      await otpBoxes[i].click();
      await randomDelay(80, 150);
      await otpBoxes[i].fill(digits[i]);
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
    log('Logged in successfully ✅');

    // Click Claim now banner
    log('Looking for Claim now button...');
    const claimBtn = await page.waitForSelector(
      'button:has-text("Claim now"), a:has-text("Claim now")',
      { timeout: 15000 }
    );
    await claimBtn.click();
    log('Clicked Claim now');

    // Wait for Jio Google AI page
    log('Waiting for Jio Google AI page...');
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
