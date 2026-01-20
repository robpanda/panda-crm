#!/usr/bin/env node
/**
 * Test if communications is the ONLY page type that works
 */
import { chromium } from 'playwright';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4'
};

async function test() {
  console.log('=== Test Communications-Only Access ===\n');

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

  console.log('   Login URL:', page.url());
  console.log('   Login:', !page.url().includes('signin') ? 'SUCCESS' : 'FAILED');

  // Test multiple jobs - communications only
  const testJobs = [
    'ca39a06e-e029-46ac-b6f5-9f96835fb69c',
    'd737c120-e133-42e1-b17c-ec75343a0f17', // From JSONL output
    'c4cede9f-841b-4980-b0d7-3e158763af2a'  // Latest from progress
  ];

  console.log('\n2. Testing multiple jobs (communications only)...');
  for (const jobId of testJobs) {
    await page.goto(`${CONFIG.baseUrl}/jobs/${jobId}/communications`, {
      waitUntil: 'networkidle',
      timeout: 45000
    });
    const ok = !page.url().includes('signin');
    console.log(`   Job ${jobId.substring(0,8)}: ${ok ? '✓' : '✗'}`);

    if (!ok) break;
    await page.waitForTimeout(1000);
  }

  // Now test if dashboard still works
  console.log('\n3. Testing dashboard after job access...');
  await page.goto(`${CONFIG.baseUrl}/dashboard`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Dashboard URL:', page.url());
  console.log('   Dashboard:', !page.url().includes('signin') ? '✓' : '✗');

  // Test jobs list page
  console.log('\n4. Testing jobs list page...');
  await page.goto(`${CONFIG.baseUrl}/jobs`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });
  console.log('   Jobs list URL:', page.url());
  console.log('   Jobs list:', !page.url().includes('signin') ? '✓' : '✗');

  await browser.close();
}

test().catch(console.error);
