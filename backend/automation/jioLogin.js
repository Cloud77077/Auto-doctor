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

    // Random human-like delay
    await randomDelay(1000, 2500);

    // Enter phone number
    log(`Entering phone number: ${phone}`);
    const phoneInput = await page.waitForSelector(
      'input[type="tel"], input[placeholder*="number"], input[placeholder*="mobile"], input[name*="mobile"], input[name*="phone"]',
      { timeout: 15000 }
    );
    await phoneInput.click();
    await randomDelay(300, 700);
    await phoneInput.fill(phone.replace(/^91/, '')); // Remove 91 country code if present

    await randomDelay(500, 1000);

    // Click Generate OTP button
    log('Clicking Generate OTP...');
    const otpBtn = await page.waitForSelector(
      'button:has-text("Generate OTP"), button:has-text("Get OTP"), button:has-text("Send OTP")',
      { timeout: 10000 }
    );
    await otpBtn.click();

    await randomDelay(1000, 2000);

    // Enter OTP
    log(`Entering OTP: ${otp}`);
    const otpInput = await page.waitForSelector(
      'input[type="tel"][maxlength], input[placeholder*="OTP"], input[placeholder*="otp"], input[name*="otp"]',
      { timeout: 15000 }
    );

    // Some Jio pages have separate digit boxes
    const otpBoxes = await page.$$('input[maxlength="1"]');
    if (otpBoxes.length >= 4) {
      log('Detected digit-by-digit OTP input');
      const digits = otp.split('');
      for (let i = 0; i < otpBoxes.length && i < digits.length; i++) {
        await otpBoxes[i].click();
        await randomDelay(100, 300);
        await otpBoxes[i].fill(digits[i]);
      }
    } else {
      await otpInput.click();
      await randomDelay(300, 600);
      await otpInput.fill(otp);
    }

    await randomDelay(500, 1000);

    // Submit / Verify
    log('Submitting OTP...');
    const submitBtn = await page.waitForSelector(
      'button:has-text("Verify"), button:has-text("Login"), button:has-text("Submit"), button:has-text("Confirm")',
      { timeout: 10000 }
    );
    await submitBtn.click();

    // Wait for dashboard to load
    log('Waiting for dashboard...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 });
    await randomDelay(2000, 4000);

    // Check if login was successful (not still on login page)
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/selfcare/login')) {
      log('Login failed or stuck on login page');
      await browser.close();
      return { success: false, error: 'Login failed', notJio: false };
    }

    // Look for Gemini banner/link
    log('Searching for Gemini link...');
    const geminiUrl = await findGeminiUrl(page, log);

    await browser.close();

    if (geminiUrl) {
      log(`Gemini URL found: ${geminiUrl}`);
      return { success: true, geminiUrl };
    } else {
      log('No Gemini URL found on dashboard');
      return { success: false, error: 'No Gemini URL found' };
    }

  } catch (err) {
    log(`Error: ${err.message}`);
    if (browser) await browser.close();

    // Check if it's a non-Jio number error
    const notJio = err.message.includes('not a Jio') ||
                   err.message.includes('invalid') ||
                   err.message.includes('not registered');

    return { success: false, error: err.message, notJio };
  }
}

async function findGeminiUrl(page, log) {
  // Try multiple strategies to find Gemini URL

  // Strategy 1: Find direct link to gemini.google.com
  const links = await page.$$eval('a', anchors =>
    anchors.map(a => a.href).filter(href =>
      href.includes('gemini.google.com') ||
      href.includes('gemini') ||
      href.toLowerCase().includes('gemini')
    )
  );
  if (links.length > 0) return links[0];

  // Strategy 2: Find buttons/banners with Gemini text and extract href
  const geminiElements = await page.$$('[href*="gemini"], [data-url*="gemini"]');
  if (geminiElements.length > 0) {
    const href = await geminiElements[0].getAttribute('href') ||
                 await geminiElements[0].getAttribute('data-url');
    if (href) return href;
  }

  // Strategy 3: Look for redeem/claim links near Gemini text
  const pageText = await page.content();
  if (pageText.toLowerCase().includes('gemini')) {
    log('Gemini text found on page, searching deeper...');
    // Extract URLs from page source that include gemini
    const urlMatch = pageText.match(/https?:\/\/[^\s"'<>]*gemini[^\s"'<>]*/gi);
    if (urlMatch && urlMatch.length > 0) return urlMatch[0];
  }

  return null;
}

async function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { loginAndExtractGemini };

