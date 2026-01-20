#!/usr/bin/env node
/**
 * Test AccuLynx session with different page access order
 */
import { chromium } from 'playwright';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4'
};

async function test() {
  console.log('=== AccuLynx Session Order Test ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Login
  console.log('1. Logging in...');
  await page.goto(CONFIG.baseUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });

  if (page.url().includes('signin')) {
    const emailEl = await page.$('input[type="email"], input[name="Email"], #Email');
    if (emailEl) await emailEl.fill(CONFIG.username);
    const passEl = await page.$('input[type="password"]');
    if (passEl) await passEl.fill(CONFIG.password);
    await page.waitForTimeout(500);
    const btn = await page.$('button:has-text("SIGN IN")');
    if (btn) await btn.click();
    else await page.keyboard.press('Enter');
    await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  const loginOk = !page.url().includes('signin');
  console.log('   Login:', loginOk ? 'SUCCESS' : 'FAILED');
  if (!loginOk) {
    await browser.close();
    return;
  }

  const testJobId = 'ca39a06e-e029-46ac-b6f5-9f96835fb69c';

  // Test 1: Go directly to documents FIRST
  console.log('\n2. Testing DOCUMENTS page FIRST (before communications)...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}/documents`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   URL:', page.url());
  const docsOk = !page.url().includes('signin');
  console.log('   Result:', docsOk ? 'SUCCESS' : 'FAILED');

  // Test 2: Then try communications
  console.log('\n3. Testing COMMUNICATIONS after documents...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}/communications`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   URL:', page.url());
  const commOk = !page.url().includes('signin');
  console.log('   Result:', commOk ? 'SUCCESS' : 'FAILED');

  // Test 3: Try main job page
  console.log('\n4. Testing MAIN JOB page...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   URL:', page.url());
  const jobOk = !page.url().includes('signin');
  console.log('   Result:', jobOk ? 'SUCCESS' : 'FAILED');

  console.log('\n=== Summary ===');
  console.log('Documents (first):', docsOk ? '✓' : '✗');
  console.log('Communications (second):', commOk ? '✓' : '✗');
  console.log('Main Job (third):', jobOk ? '✓' : '✗');

  await browser.close();
}

test().catch(console.error);
