const { chromium } = require('playwright');

async function loginAndExtractGemini({ phone, otp, sessionId, onLog }) {
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

    await randomDelay(1000, 2000);

    // Enter phone number (strip 91 country code if present)
    log(`Entering phone number: ${phone}`);
    const phoneInput = await page.waitForSelector('input[type="tel"]', { timeout: 15000 });
    await phoneInput.click();
    await randomDelay(300, 600);
    await phoneInput.fill(phone.replace(/^91/, ''));

    await randomDelay(800, 1200);

    // Click Generate OTP
    log('Clicking Generate OTP...');
    const otpBtn = await page.waitForSelector('button:has-text("Generate OTP")', { timeout: 10000 });
    await otpBtn.click();

    await randomDelay(1500, 2500);

    // Check for non-Jio error message
    const bodyText = await page.textContent('body');
    if (bodyText.includes('non-Jio number')) {
      log('Non-Jio number detected');
      await browser.close();
      return { success: false, error: 'Non-Jio number', notJio: true };
    }

    // Wait for 6-digit OTP input boxes
    log('Waiting for OTP input boxes...');
    await page.waitForSelector('input[maxlength="1"]', { timeout: 15000 });
    const otpBoxes = await page.$$('input[maxlength="1"]');

    if (otpBoxes.length < 6) {
      log(`Expected 6 OTP boxes but found ${otpBoxes.length}`);
      await browser.close();
      return { success: false, error: 'OTP input not found', notJio: false };
    }

    // Enter OTP digit by digit
    log(`Entering OTP: ${otp}`);
    const digits = otp.split('');
    for (let i = 0; i < 6; i++) {
      await otpBoxes[i].click();
      await randomDelay(80, 180);
      await otpBoxes[i].fill(digits[i]);
    }

    await randomDelay(500, 800);

    // FIX: Jio does NOT auto-submit — must click Submit button
    log('Clicking Submit...');
    const submitBtn = await page.waitForSelector('button:has-text("Submit")', { timeout: 8000 });
    await submitBtn.click();

    // Wait for navigation to dashboard
    log('Waiting for dashboard...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 3000);

    // Verify login succeeded
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      log('Still on login page — OTP rejected or expired');
      await browser.close();
      return { success: false, error: 'OTP rejected or expired', notJio: false };
    }

    log('Logged in successfully, looking for Gemini banner...');

    // FIX: Click "Claim now" banner and capture the final redirected URL
    const claimUrl = await clickClaimAndGetUrl(page, context, log);

    await browser.close();

    if (claimUrl) {
      log(`Claim URL captured: ${claimUrl}`);
      return { success: true, geminiUrl: claimUrl };
    } else {
      log('No Gemini banner found on dashboard');
      return { success: false, error: 'No Gemini banner found', notJio: false };
    }

  } catch (err) {
    log(`Error: ${err.message}`);
    if (browser) await browser.close();
    return { success: false, error: err.message, notJio: false };
  }
}

async function clickClaimAndGetUrl(page, context, log) {
  try {
    // Wait a moment for banner to render
    await randomDelay(1500, 2500);

    // Strategy 1: Find and click "Claim now" button on dashboard
    const claimBtn = await page.$('button:has-text("Claim now"), a:has-text("Claim now"), [class*="claim"]');
    if (claimBtn) {
      log('Found Claim now button, clicking...');

      // Listen for new page/tab that opens after click
      const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 10000 }).catch(() => null),
        claimBtn.click()
      ]);

      if (newPage) {
        // Opened in new tab
        await newPage.waitForLoadState('domcontentloaded');
        await randomDelay(2000, 3000);
        const finalUrl = newPage.url();
        log(`New tab URL: ${finalUrl}`);
        await newPage.close();
        return finalUrl;
      }

      // Opened in same tab
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomDelay(1500, 2500);

      // May redirect multiple times — wait for final URL
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      const finalUrl = page.url();
      log(`Final URL after claim: ${finalUrl}`);

      if (finalUrl.includes('google.com') || finalUrl.includes('gemini') || finalUrl.includes('one.google')) {
        return finalUrl;
      }
    }

    // Strategy 2: Look for the Gemini banner link directly
    const geminiLink = await page.$('a[href*="google.com"], a[href*="gemini"], a[href*="one.google"]');
    if (geminiLink) {
      const href = await geminiLink.getAttribute('href');
      log(`Found direct Gemini link: ${href}`);
      return href;
    }

    // Strategy 3: Scan page source for Google One / Gemini claim URLs
    const content = await page.content();
    const patterns = [
      /https?:\/\/one\.google\.com\/[^\s"'<>]*/gi,
      /https?:\/\/[^\s"'<>]*gemini[^\s"'<>]*/gi,
      /https?:\/\/jio\.com\/selfcare\/goog[^\s"'<>]*/gi
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match.length > 0) {
        log(`Found URL via page scan: ${match[0]}`);
        return match[0];
      }
    }

    return null;

  } catch (err) {
    log(`clickClaimAndGetUrl error: ${err.message}`);
    return null;
  }
}

async function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { loginAndExtractGemini };
