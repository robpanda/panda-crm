import { chromium } from 'playwright';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4'
};

async function testSession() {
  const browser = await chromium.launch({ headless: false }); // Non-headless to see what's happening
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();

  // Login
  console.log('1. Going to dashboard...');
  await page.goto(CONFIG.baseUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  console.log('   URL:', page.url());

  if (page.url().includes('identity') || page.url().includes('signin')) {
    console.log('2. Filling in credentials...');
    const emailEl = await page.$('input[type="email"], input[name="Email"], #Email');
    if (emailEl) await emailEl.fill(CONFIG.username);
    const passEl = await page.$('input[type="password"]');
    if (passEl) await passEl.fill(CONFIG.password);
    await page.waitForTimeout(500);
    const btn = await page.$('button:has-text("SIGN IN")');
    if (btn) await btn.click();
    else await page.keyboard.press('Enter');
    await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  console.log('3. After login, URL:', page.url());

  // Check cookies
  const cookies = await context.cookies();
  console.log('4. Cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', '));

  // Navigate to a job
  const testJobId = 'ca39a06e-e029-46ac-b6f5-9f96835fb69c';
  console.log('5. Navigating to job page...');
  await page.goto(`${CONFIG.baseUrl}/jobs/${testJobId}`, { waitUntil: 'networkidle', timeout: 45000 });
  console.log('   URL after job navigation:', page.url());

  // Wait to see the page
  await page.waitForTimeout(5000);
  
  // Take a screenshot for debugging
  await page.screenshot({ path: './output/debug-job-page.png' });
  console.log('6. Screenshot saved to output/debug-job-page.png');

  // Check if we can see any tabs
  const html = await page.content();
  const hasDocumentsTab = html.includes('Documents') || html.includes('documents');
  const hasPhotosTab = html.includes('Photos') || html.includes('photos');
  console.log('7. Page has Documents tab:', hasDocumentsTab);
  console.log('   Page has Photos tab:', hasPhotosTab);

  // Print the page title
  const title = await page.title();
  console.log('8. Page title:', title);

  await browser.close();
}

testSession().catch(console.error);
