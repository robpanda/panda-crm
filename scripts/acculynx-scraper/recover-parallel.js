#!/usr/bin/env node
/**
 * Parallel AccuLynx Message Recovery
 *
 * Run multiple instances with different worker IDs:
 *   WORKER=1 TOTAL_WORKERS=4 node recover-parallel.js
 *   WORKER=2 TOTAL_WORKERS=4 node recover-parallel.js
 *   etc.
 */
import { chromium } from 'playwright';
import { existsSync, readdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const WORKER_ID = parseInt(process.env.WORKER || '1');
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '4');

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  delayBetweenJobs: 1500,
  browserRestartEvery: 50,
};

const OUTPUT_FILE = path.join(CONFIG.outputDir, `recovered-messages-worker${WORKER_ID}.jsonl`);
const PROGRESS_FILE = path.join(CONFIG.outputDir, `progress-worker${WORKER_ID}.json`);
const GLOBAL_PROGRESS_FILE = path.join(CONFIG.outputDir, 'messages-progress.json');

function getJobIds() {
  const files = readdirSync(CONFIG.outputDir);
  const pattern = /^screenshot-([a-f0-9-]{36})\.png$/;
  return files.filter(f => pattern.test(f)).map(f => f.match(pattern)[1]).sort();
}

function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
      return { ...data, processedIds: new Set(data.processedIds || []) };
    }
  } catch (e) {}
  return { processedIds: new Set(), count: 0 };
}

function loadGlobalProgress() {
  try {
    if (existsSync(GLOBAL_PROGRESS_FILE)) {
      const data = JSON.parse(readFileSync(GLOBAL_PROGRESS_FILE, 'utf-8'));
      return new Set(data.processedIds || []);
    }
  } catch (e) {}
  return new Set();
}

function saveProgress(progress) {
  const data = { ...progress, processedIds: Array.from(progress.processedIds) };
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

function saveJob(data) {
  appendFileSync(OUTPUT_FILE, JSON.stringify(data) + '\n');
}

async function getJobInfo(jobId) {
  try {
    const resp = await fetch(CONFIG.apiUrl + '/jobs/' + jobId, {
      headers: { 'Authorization': 'Bearer ' + CONFIG.apiKey }
    });
    if (!resp.ok) return null;
    const job = await resp.json();
    return { jobName: job.jobName, jobNumber: job.jobNumber };
  } catch (e) { return null; }
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

async function doLogin(page, username, password) {
  console.log(`[W${WORKER_ID}] Logging in...`);
  await page.goto(CONFIG.baseUrl + '/dashboard', { waitUntil: 'networkidle', timeout: 60000 });
  if (page.url().includes('identity') || page.url().includes('signin')) {
    const emailEl = await page.$('input[type="email"], input[name="Email"], #Email');
    if (emailEl) await emailEl.fill(username);
    const passEl = await page.$('input[type="password"]');
    if (passEl) await passEl.fill(password);
    await page.waitForTimeout(500);
    const btn = await page.$('button:has-text("SIGN IN")');
    if (btn) await btn.click();
    else await page.keyboard.press('Enter');
    await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  const ok = page.url().includes('my.acculynx.com') && !page.url().includes('signin');
  console.log(`[W${WORKER_ID}] ${ok ? 'Login successful!' : 'Login failed: ' + page.url()}`);
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

async function processJob(page, jobId, username, password) {
  const info = await getJobInfo(jobId);
  const name = (info?.jobName || info?.jobNumber || 'Unknown').substring(0,35).padEnd(35);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const messages = await scrapeMessages(page, jobId);
      console.log(`[W${WORKER_ID}] ${name} ${messages.length} msgs`);
      saveJob({
        jobId,
        jobName: info?.jobName,
        jobNumber: info?.jobNumber,
        messages: messages,
        recoveredAt: new Date().toISOString(),
        worker: WORKER_ID
      });
      return { success: true };
    } catch (e) {
      if (e.message === 'NEEDS_LOGIN') {
        console.log(`[W${WORKER_ID}] ${name} (relogin)`);
        await doLogin(page, username, password);
        continue;
      }
      if (e.message.includes('closed') || e.message.includes('Target')) {
        return { needsRestart: true };
      }
      console.log(`[W${WORKER_ID}] ${name} ERR`);
      return { error: true };
    }
  }
  return { skipped: true };
}

async function main() {
  console.log('═'.repeat(50));
  console.log(`Worker ${WORKER_ID} of ${TOTAL_WORKERS}`);
  console.log('═'.repeat(50));

  const username = process.env.ACCULYNX_USERNAME;
  const password = process.env.ACCULYNX_PASSWORD;
  if (!username || !password) {
    console.log('Set ACCULYNX_USERNAME and ACCULYNX_PASSWORD');
    process.exit(1);
  }

  const allJobIds = getJobIds();
  console.log(`Total jobs: ${allJobIds.length}`);

  // Get already processed from global + this worker
  const globalProcessed = loadGlobalProgress();
  const localProgress = loadProgress();
  const allProcessed = new Set([...globalProcessed, ...localProgress.processedIds]);

  // Filter to unprocessed jobs
  const unprocessedJobs = allJobIds.filter(id => !allProcessed.has(id));
  console.log(`Already processed globally: ${allProcessed.size}`);
  console.log(`Unprocessed: ${unprocessedJobs.length}`);

  // Divide jobs among workers
  const myJobs = unprocessedJobs.filter((_, i) => i % TOTAL_WORKERS === (WORKER_ID - 1));
  console.log(`This worker's share: ${myJobs.length} jobs`);

  if (myJobs.length === 0) {
    console.log('No jobs to process!');
    return;
  }

  let browserState = null;
  let jobsSinceBrowserStart = 0;
  let stats = { success: 0, errors: 0 };

  const startBrowser = async () => {
    if (browserState) {
      try { await browserState.browser.close(); } catch (e) {}
    }
    console.log(`[W${WORKER_ID}] New browser session`);
    browserState = await createBrowser();
    await doLogin(browserState.page, username, password);
    jobsSinceBrowserStart = 0;
  };

  await startBrowser();

  for (let i = 0; i < myJobs.length; i++) {
    const jobId = myJobs[i];

    if (jobsSinceBrowserStart >= CONFIG.browserRestartEvery) {
      await startBrowser();
    }

    const result = await processJob(browserState.page, jobId, username, password);

    if (result.needsRestart) {
      await startBrowser();
      const retryResult = await processJob(browserState.page, jobId, username, password);
      if (retryResult.success) stats.success++;
      else stats.errors++;
    } else if (result.success) {
      stats.success++;
    } else {
      stats.errors++;
    }

    localProgress.processedIds.add(jobId);
    localProgress.count++;
    jobsSinceBrowserStart++;

    if (localProgress.count % 10 === 0) {
      saveProgress(localProgress);
      console.log(`[W${WORKER_ID}] Progress: ${i+1}/${myJobs.length}`);
    }

    await new Promise(r => setTimeout(r, CONFIG.delayBetweenJobs));
  }

  saveProgress(localProgress);
  if (browserState) {
    try { await browserState.browser.close(); } catch (e) {}
  }

  console.log(`\n[W${WORKER_ID}] Complete! Success: ${stats.success}, Errors: ${stats.errors}`);
}

main().catch(e => {
  console.error(`[W${WORKER_ID}] Fatal:`, e.message);
  process.exit(1);
});
