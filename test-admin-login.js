#!/usr/bin/env node
/**
 * Admin Panel Login Test Script
 * Tests the admin login on http://127.0.0.1:5500/vlx-admin-2026.html
 */

const { chromium } = require('playwright');

async function testAdminLogin() {
  console.log('🎭 Starting Playwright Admin Panel Test\n');

  let browser;
  try {
    // Launch browser with visual display for debugging
    console.log('🚀 Launching Chromium browser...');
    browser = await chromium.launch({
      headless: false, // Show the browser for debugging
      slowMo: 500, // Slow down actions to see them
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console messages
    const consoleLogs = [];
    page.on('console', (msg) => {
      const entry = `[${msg.type().toUpperCase()}] ${msg.text()}`;
      consoleLogs.push(entry);
      console.log(entry);
    });

    page.on('error', (err) => {
      console.error('❌ Page Error:', err);
    });

    // Navigate to admin panel
    const adminUrl = 'http://127.0.0.1:5500/vlx-admin-2026.html';
    console.log(`\n📍 Navigating to ${adminUrl}...`);
    await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
    console.log('✅ Page loaded\n');

    // Wait for JS to be ready
    console.log('⏳ Waiting for JavaScript to initialize...');
    await page.waitForTimeout(2000);
    console.log('✓ JavaScript ready\n');

    // Check login screen
    const loginScreenVisible = await page.locator('#login-screen').isVisible();
    console.log(`🔐 Login screen visible: ${loginScreenVisible}\n`);

    if (!loginScreenVisible) {
      console.log('⚠️ Login screen not visible, page may already be authenticated');
      await page.screenshot({ path: 'screenshot-login.png' });
      await browser.close();
      return;
    }

    // Verify form elements exist
    const userInput = await page.locator('#login-user');
    const passInput = await page.locator('#login-pass');
    const submitBtn = await page.locator('#login-submit');

    const userExists = await userInput.count() > 0;
    const passExists = await passInput.count() > 0;
    const btnExists = await submitBtn.count() > 0;

    console.log('📝 Form Elements Check:');
    console.log(`  Username input exists: ${userExists}`);
    console.log(`  Password input exists: ${passExists}`);
    console.log(`  Submit button exists: ${btnExists}\n`);

    if (!userExists || !passExists || !btnExists) {
      console.log('❌ Form elements not found!');
      await page.screenshot({ path: 'screenshot-form-error.png' });
      await browser.close();
      return;
    }

    // Test login
    console.log('📝 Filling login credentials...');
    await userInput.fill('owner');
    console.log('  ✓ Username filled: "owner"');

    await passInput.fill('owner123');
    console.log('  ✓ Password filled: "owner123"\n');

    // Verify values
    const userValue = await userInput.inputValue();
    const passValue = await passInput.inputValue();
    console.log('✓ Verification:');
    console.log(`  Username value: "${userValue}"`);
    console.log(`  Password value: "${passValue}"\n`);

    // Click login button
    console.log('🔘 Clicking "Initialize Session" button...');
    
    // Try multiple click methods
    try {
      // Method 1: Standard click
      await submitBtn.click();
      console.log('✓ Method 1: Standard click done');
      
      // Method 2: Dispatch click event directly
      await page.evaluate(() => {
        const btn = document.getElementById('login-submit');
        if (btn) {
          btn.click();
          console.log('[EVAL] Direct button.click() called');
        }
      });
      console.log('✓ Method 2: Direct button.click() executed\n');
    } catch (e) {
      console.log(`⚠️ Click methods had issues: ${e.message}\n`);
    }

    // Check what's actually available in page scope
    console.log('🔍 Checking page scope...');
    try {
      const scopeCheck = await page.evaluate(() => {
        return {
          hasUtils: typeof Utils !== 'undefined',
          hasStorage: typeof Storage !== 'undefined',
          hasHandleLogin: typeof handleLogin !== 'undefined',
          hasShowToast: typeof showToast !== 'undefined',
          hasWindow: typeof window !== 'undefined',
          windowKeys: Object.keys(window).filter(k => k.includes('handle') || k.includes('show')).slice(0, 5)
        };
      });
      console.log('  Scope Status:');
      console.log(`    Utils available: ${scopeCheck.hasUtils}`);
      console.log(`    Storage available: ${scopeCheck.hasStorage}`);
      console.log(`    handleLogin available: ${scopeCheck.hasHandleLogin}`);
      console.log(`    showToast available: ${scopeCheck.hasShowToast}`);
      console.log(`    Matching window keys: ${scopeCheck.windowKeys.join(', ')}\n`);
    } catch (e) {
      console.log(`⚠️ Scope check failed: ${e.message}\n`);
    }

    // Try directly calling handleLogin if available
    console.log('🔧 Attempting direct function call...');
    try {
      const result = await page.evaluate(() => {
        if (typeof handleLogin === 'function') {
          handleLogin({ preventDefault: () => {} });
          return 'handleLogin called successfully';
        } else {
          return 'handleLogin not found - trying alternate method';
        }
      });
      console.log(`✓ ${result}\n`);
    } catch (e) {
      console.log(`⚠️ Direct call failed: ${e.message}\n`);
    }

    // Wait for response - longer this time
    console.log('⏳ Waiting for login response (3 seconds)...');
    await page.waitForTimeout(3000);

    // Check results
    const dashboardVisible = await page.locator('#admin-layout').isVisible().catch(() => false);
    const loginStillVisible = await page.locator('#login-screen').isVisible().catch(() => false);

    console.log('\n📊 Login Result:');
    console.log(`  Dashboard Visible: ${dashboardVisible}`);
    console.log(`  Login Screen Still Visible: ${loginStillVisible}`);

    if (dashboardVisible) {
      console.log('\n✅ LOGIN SUCCESSFUL! 🎉\n');
      console.log('The admin panel is now accessible.');
    } else if (loginStillVisible) {
      console.log('\n❌ LOGIN FAILED\n');
      console.log('The login screen is still visible.');
      console.log('Debugging info:');
      
      // Try to get page title
      const title = await page.title();
      console.log(`  Page title: ${title}`);
      
      // Try to evaluate sessionStorage
      try {
        const sessionData = await page.evaluate(() => sessionStorage.getItem('admin_auth'));
        console.log(`  sessionStorage admin_auth: ${sessionData}`);
      } catch (e) {
        console.log(`  sessionStorage check failed: ${e.message}`);
      }
      
      console.log('\nPossible issues:');
      console.log('  • Invalid credentials');
      console.log('  • JavaScript error on login');
      console.log('  • sessionStorage not working');
      console.log('  • Event handler not properly attached\n');
    } else {
      console.log('\n⚠️ UNKNOWN STATE\n');
      console.log('Neither dashboard nor login screen is visible.');
    }

    // Take screenshot
    console.log('📸 Taking screenshot...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `screenshot-${timestamp}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✓ Screenshot saved to ${screenshotPath}\n`);

    // Print console logs collected
    if (consoleLogs.length > 0) {
      console.log('📋 Console Messages:');
      consoleLogs.forEach((log) => console.log(`  ${log}`));
    }

    console.log('\n⏱️  Keeping browser open for 10 seconds for inspection...');
    console.log('   (Browser will auto-close after timeout)\n');
    await page.waitForTimeout(10000);

    await context.close();
    await browser.close();
    console.log('🏁 Test completed');
  } catch (error) {
    console.error('❌ Test Error:', error);
    if (browser) await browser.close();
    process.exit(1);
  }
}

testAdminLogin();
