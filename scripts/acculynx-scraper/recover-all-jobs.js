#!/usr/bin/env node
/**
 * AccuLynx Full Job Recovery
 *
 * Fetches ALL jobs from AccuLynx API (43,424 total) and scrapes messages
 * for any jobs not already processed by screenshot-based recovery.
 *
 * Uses: robwinters@pandaexteriors.com account
 */
import { chromium } from 'playwright';
import { existsSync, appendFileSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  delayBetweenJobs: 1500,
  browserRestartEvery: 50,
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4'
};

const OUTPUT_FILE = path.join(CONFIG.outputDir, 'recovered-messages-all.jsonl');
const PROGRESS_FILE = path.join(CONFIG.outputDir, 'progress-all-jobs.json');

// Load all previously processed job IDs from all sources
function loadAllProcessedIds() {
  const processed = new Set();

  // Load from global progress
  try {
    const globalFile = path.join(CONFIG.outputDir, 'messages-progress.json');
    if (existsSync(globalFile)) {
      const data = JSON.parse(readFileSync(globalFile, 'utf-8'));
      (data.processedIds || []).forEach(id => processed.add(id));
    }
  } catch (e) {}

  // Load from worker progress files
  for (let i = 1; i <= 2; i++) {
    try {
      const workerFile = path.join(CONFIG.outputDir, `progress-worker${i}.json`);
      if (existsSync(workerFile)) {
        const data = JSON.parse(readFileSync(workerFile, 'utf-8'));
        (data.processedIds || []).forEach(id => processed.add(id));
      }
    } catch (e) {}
  }

  // Load from this script's progress
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
      (data.processedIds || []).forEach(id => processed.add(id));
    }
  } catch (e) {}

  // Also check screenshot files (original scraped jobs)
  try {
    const files = readdirSync(CONFIG.outputDir);
    const pattern = /^screenshot-([a-f0-9-]{36})\.png$/;
    files.filter(f => pattern.test(f)).forEach(f => {
      const match = f.match(pattern);
      if (match) processed.add(match[1]);
    });
  } catch (e) {}

  return processed;
}

function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
      return { ...data, processedIds: new Set(data.processedIds || []) };
    }
  } catch (e) {}
  return { processedIds: new Set(), count: 0, apiPage: 0 };
}

function saveProgress(progress) {
  const data = {
    ...progress,
    processedIds: Array.from(progress.processedIds),
    lastUpdate: new Date().toISOString()
  };
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

function saveJob(data) {
  appendFileSync(OUTPUT_FILE, JSON.stringify(data) + '\n');
}

async function fetchAllJobIds() {
  console.log('Fetching all job IDs from AccuLynx API...');
  const allJobs = [];
  let startIndex = 0;
  const pageSize = 25; // API max is 25

  while (true) {
    // AccuLynx API uses pageSize and pageStartIndex (not page number)
    const url = `${CONFIG.apiUrl}/jobs?pageSize=${pageSize}${startIndex > 0 ? `&pageStartIndex=${startIndex}` : ''}`;
    try {
      const resp = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + CONFIG.apiKey }
      });
      if (!resp.ok) {
        console.error(`API error: ${resp.status} - ${await resp.text()}`);
        break;
      }
      const data = await resp.json();
      const items = data.items || [];

      if (items.length === 0) break;

      items.forEach(job => {
        allJobs.push({
          id: job.id,
          jobName: job.jobName,
          jobNumber: job.jobNumber
        });
      });

      const pageNum = Math.floor(startIndex / pageSize) + 1;
      console.log(`  Fetched page ${pageNum}: ${items.length} jobs (total: ${allJobs.length}/${data.count})`);

      if (allJobs.length >= data.count) break;
      startIndex += pageSize;

      // Small delay between API calls
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`API fetch error: ${e.message}`);
      break;
    }
  }

  console.log(`Total jobs from API: ${allJobs.length}`);
  return allJobs;
}

async function createBrowser() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  return { browser, context, page };
}

async function doLogin(page) {
  console.log('Logging in...');
  await page.goto(CONFIG.baseUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  if (page.url().includes('identity') || page.url().includes('signin')) {
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
  const ok = page.url().includes('my.acculynx.com') && !page.url().includes('signin');
  console.log(ok ? 'Login successful!' : 'Login failed: ' + page.url());
  return ok;
}

async function scrapeMessages(page, jobId) {
  await page.goto(CONFIG.baseUrl + '/jobs/' + jobId + '/communications', {
    waitUntil: 'networkidle', timeout: 45000
  });

  if (page.url().includes('signin')) {
    throw new Error('NEEDS_LOGIN');
  }

  await page.waitForTimeout(2500);

  const messages = await page.evaluate(() => {
    const results = [];
    const bodyText = document.body?.innerText || '';
    const chunks = bodyText.split(/\nReply\n/);
    const msgPattern = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(\d{1,2}:\d{2}\s*(?:AM|PM)|\d{1,2}\/\d{1,2}\/\d{2,4})/m;
    for (const chunk of chunks) {
      const t = chunk.trim();
      if (t.length < 10) continue;
      if (msgPattern.test(t)) {
        let clean = t.replace(/^(Home|Jobs|Leads|Contacts|Inbox|Calendar|Reports|Search).*?\n/gm, '')
          .replace(/View \d+ more replies/g, '').replace(/View Message/g, '').trim();
        if (clean.length > 20) results.push(clean);
      }
    }
    const seen = new Set();
    return results.filter(m => {
      const k = m.substring(0,100).replace(/\s+/g,' ');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 200);
  });
  return messages;
}

async function processJob(page, job) {
  const name = (job.jobName || job.jobNumber || 'Unknown').substring(0,40).padEnd(40);

  let loginAttempts = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const messages = await scrapeMessages(page, job.id);
      console.log(`[OK] ${name} ${messages.length} msgs`);
      saveJob({
        jobId: job.id,
        jobName: job.jobName,
        jobNumber: job.jobNumber,
        messages: messages,
        recoveredAt: new Date().toISOString(),
        source: 'api-full'
      });
      return { success: true };
    } catch (e) {
      if (e.message === 'NEEDS_LOGIN') {
        loginAttempts++;
        if (loginAttempts >= 2) {
          console.log(`[RESTRICTED] ${name}`);
          saveJob({
            jobId: job.id,
            jobName: job.jobName,
            jobNumber: job.jobNumber,
            messages: [],
            restricted: true,
            recoveredAt: new Date().toISOString(),
            source: 'api-full'
          });
          return { success: true };
        }
        console.log(`[RELOGIN] ${name}`);
        await doLogin(page);
        continue;
      }
      if (e.message.includes('closed') || e.message.includes('Target')) {
        return { needsRestart: true };
      }
      console.log(`[ERR] ${name} ${e.message.substring(0, 30)}`);
      return { error: true };
    }
  }
  return { skipped: true };
}

async function main() {
  console.log('═'.repeat(60));
  console.log('AccuLynx FULL Job Recovery (API-based)');
  console.log('═'.repeat(60));

  // Fetch all jobs from API
  const allJobs = await fetchAllJobIds();

  // Load all previously processed IDs
  const alreadyProcessed = loadAllProcessedIds();
  console.log(`Already processed (all sources): ${alreadyProcessed.size}`);

  // Filter to unprocessed jobs
  const toProcess = allJobs.filter(job => !alreadyProcessed.has(job.id));
  console.log(`New jobs to process: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('All jobs already processed!');
    return;
  }

  const progress = loadProgress();
  let browserState = null;
  let jobsSinceBrowserStart = 0;
  let stats = { success: 0, errors: 0 };

  const startBrowser = async () => {
    if (browserState) {
      try { await browserState.browser.close(); } catch (e) {}
    }
    console.log('\nStarting new browser session...');
    browserState = await createBrowser();
    await doLogin(browserState.page);
    jobsSinceBrowserStart = 0;
  };

  await startBrowser();

  for (let i = 0; i < toProcess.length; i++) {
    const job = toProcess[i];

    if (jobsSinceBrowserStart >= CONFIG.browserRestartEvery) {
      await startBrowser();
    }

    process.stdout.write(`[${i+1}/${toProcess.length}] `);
    const result = await processJob(browserState.page, job);

    if (result.needsRestart) {
      console.log('Browser crashed, restarting...');
      await startBrowser();
      const retryResult = await processJob(browserState.page, job);
      if (retryResult.success) stats.success++;
      else stats.errors++;
    } else if (result.success) {
      stats.success++;
    } else {
      stats.errors++;
    }

    progress.processedIds.add(job.id);
    progress.count++;
    jobsSinceBrowserStart++;

    if (progress.count % 10 === 0) {
      saveProgress(progress);
      const pct = ((i + 1) / toProcess.length * 100).toFixed(1);
      console.log(`Progress: ${i+1}/${toProcess.length} (${pct}%)`);
    }

    await new Promise(r => setTimeout(r, CONFIG.delayBetweenJobs));
  }

  saveProgress(progress);
  if (browserState) {
    try { await browserState.browser.close(); } catch (e) {}
  }

  console.log('\n' + '═'.repeat(60));
  console.log('Recovery Complete!');
  console.log('═'.repeat(60));
  console.log(`Success: ${stats.success}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Total new jobs processed: ${progress.processedIds.size}`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
