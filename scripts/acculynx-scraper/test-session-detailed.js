#!/usr/bin/env node
/**
 * Detailed AccuLynx Session Test
 * Tests login and both communications (known working) vs documents (failing)
 */
import { chromium } from 'playwright';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4'
};

async function test() {
  console.log('=== AccuLynx Session Test ===\n');

  const browser = await chromium.launch({ headless: false }); // Non-headless to see
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Step 1: Go to dashboard (should redirect to signin)
  console.log('1. Navigating to dashboard...');
  await page.goto(CONFIG.baseUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  console.log('   Current URL:', page.url());

  // Step 2: Check if we need to login
  if (page.url().includes('identity') || page.url().includes('signin')) {
    console.log('\n2. On login page, filling credentials...');

    // Wait for form to be ready
    await page.waitForSelector('input[type="email"], input[name="Email"], #Email', { timeout: 10000 });

    // Fill email
    const emailEl = await page.$('input[type="email"], input[name="Email"], #Email');
    if (emailEl) {
      await emailEl.fill(CONFIG.username);
      console.log('   Filled email');
    }

    // Fill password
    const passEl = await page.$('input[type="password"]');
    if (passEl) {
      await passEl.fill(CONFIG.password);
      console.log('   Filled password');
    }

    // Small delay before clicking
    await page.waitForTimeout(500);

    // Find and click sign in button
    console.log('   Looking for sign in button...');
    const btn = await page.$('button:has-text("SIGN IN"), button[type="submit"]');
    if (btn) {
      console.log('   Found button, clicking...');
      await btn.click();
    } else {
      console.log('   No button found, pressing Enter...');
      await page.keyboard.press('Enter');
    }

    // Wait for navigation
    console.log('   Waiting for navigation...');
    try {
      await page.waitForNavigation({ timeout: 15000 });
      console.log('   Navigation completed');
    } catch (e) {
      console.log('   Navigation timeout (may be OK)');
    }

    // Extra wait for any redirects
    await page.waitForTimeout(3000);
    console.log('   Final URL after login:', page.url());
  }

  // Step 3: Check login success
  const loginOk = page.url().includes('my.acculynx.com') && !page.url().includes('signin') && !page.url().includes('identity');
  console.log('\n3. Login status:', loginOk ? 'SUCCESS' : 'FAILED');

  if (!loginOk) {
    console.log('\n   Login failed. Checking page content...');
    const pageTitle = await page.title();
    console.log('   Page title:', pageTitle);

    // Check for any error messages
    const errorEl = await page.$('.validation-summary-errors, .error-message, .alert-danger');
    if (errorEl) {
      const errorText = await errorEl.innerText();
      console.log('   Error message:', errorText);
    }

    // Take a screenshot for debugging
    await page.screenshot({ path: './output/login-failed.png' });
    console.log('   Screenshot saved to output/login-failed.png');

    await browser.close();
    return;
  }

  // Step 4: Test communications page (known working pattern)
  const testJobId = 'ca39a06e-e029-46ac-b6f5-9f96835fb69c';
  console.log('\n4. Testing COMMUNICATIONS page (known working)...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}/communications`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Communications URL:', page.url());
  const commOk = !page.url().includes('signin') && !page.url().includes('identity');
  console.log('   Communications access:', commOk ? 'SUCCESS' : 'FAILED (redirected to signin)');

  // Step 5: Test documents page
  console.log('\n5. Testing DOCUMENTS page...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}/documents`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Documents URL:', page.url());
  const docsOk = !page.url().includes('signin') && !page.url().includes('identity');
  console.log('   Documents access:', docsOk ? 'SUCCESS' : 'FAILED (redirected to signin)');

  // Step 6: Test photos page
  console.log('\n6. Testing PHOTOS page...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}/photos`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Photos URL:', page.url());
  const photosOk = !page.url().includes('signin') && !page.url().includes('identity');
  console.log('   Photos access:', photosOk ? 'SUCCESS' : 'FAILED (redirected to signin)');

  // Step 7: Test main job page
  console.log('\n7. Testing MAIN JOB page...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Job page URL:', page.url());
  const jobOk = !page.url().includes('signin') && !page.url().includes('identity');
  console.log('   Job page access:', jobOk ? 'SUCCESS' : 'FAILED (redirected to signin)');

  console.log('\n=== Summary ===');
  console.log('Login:', loginOk ? '✓' : '✗');
  console.log('Communications:', commOk ? '✓' : '✗');
  console.log('Documents:', docsOk ? '✓' : '✗');
  console.log('Photos:', photosOk ? '✓' : '✗');
  console.log('Main Job:', jobOk ? '✓' : '✗');

  // Leave browser open for manual inspection
  console.log('\n[Browser will close in 10 seconds for inspection]');
  await page.waitForTimeout(10000);

  await browser.close();
}

test().catch(console.error);
