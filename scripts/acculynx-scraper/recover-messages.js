#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'fs/promises';
import { existsSync, readdirSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  delayBetweenJobs: 1500,
  browserRestartEvery: 50,
};

const OUTPUT_FILE = path.join(CONFIG.outputDir, 'recovered-messages.jsonl');
const PROGRESS_FILE = path.join(CONFIG.outputDir, 'messages-progress.json');
const FAILED_FILE = path.join(CONFIG.outputDir, 'failed-jobs.json');

function getJobIds() {
  const files = readdirSync(CONFIG.outputDir);
  const pattern = /^screenshot-([a-f0-9-]{36})\.png$/;
  return files.filter(f => pattern.test(f)).map(f => f.match(pattern)[1]);
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

function saveProgress(progress) {
  const data = { ...progress, processedIds: Array.from(progress.processedIds) };
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

function saveFailedJob(jobId, reason) {
  try {
    const failed = existsSync(FAILED_FILE) ? JSON.parse(readFileSync(FAILED_FILE, 'utf-8')) : [];
    if (!failed.find(f => f.jobId === jobId)) {
      failed.push({ jobId, reason, timestamp: new Date().toISOString() });
      writeFileSync(FAILED_FILE, JSON.stringify(failed, null, 2));
    }
  } catch (e) {}
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
  console.log('Logging in...');
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

async function processJob(browser, page, jobId, username, password) {
  const info = await getJobInfo(jobId);
  const name = (info?.jobName || info?.jobNumber || 'Unknown').substring(0,40).padEnd(40);

  let loginAttempts = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const messages = await scrapeMessages(page, jobId);
      console.log('[OK] ' + name + ' ' + messages.length + ' msgs');
      saveJob({
        jobId,
        jobName: info?.jobName,
        jobNumber: info?.jobNumber,
        messages: messages,
        recoveredAt: new Date().toISOString()
      });
      return { success: true };
    } catch (e) {
      if (e.message === 'NEEDS_LOGIN') {
        loginAttempts++;
        if (loginAttempts >= 2) {
          // This job requires login even after reauth - it's restricted/deleted
          console.log('[RESTRICTED] ' + name);
          saveJob({ jobId, jobName: info?.jobName, jobNumber: info?.jobNumber, messages: [], restricted: true, recoveredAt: new Date().toISOString() });
          return { success: true };
        }
        console.log('[RELOGIN] ' + name);
        await doLogin(page, username, password);
        continue;
      }
      if (e.message.includes('closed') || e.message.includes('Target')) {
        console.log('[RESTART] ' + name + ' (browser crashed)');
        return { needsRestart: true };
      }
      console.log('[ERR] ' + name + ' ' + e.message.substring(0, 40));
      return { error: true };
    }
  }
  console.log('[SKIP] ' + name);
  return { skipped: true };
}

async function main() {
  console.log('═'.repeat(60));
  console.log('AccuLynx Message Recovery');
  console.log('═'.repeat(60));

  const username = process.env.ACCULYNX_USERNAME;
  const password = process.env.ACCULYNX_PASSWORD;
  if (!username || !password) {
    console.log('Set ACCULYNX_USERNAME and ACCULYNX_PASSWORD');
    process.exit(1);
  }

  const allJobIds = getJobIds();
  console.log('Found ' + allJobIds.length + ' jobs from screenshots');

  const progress = loadProgress();
  console.log('Already processed: ' + progress.processedIds.size);

  const toProcess = allJobIds.filter(id => !progress.processedIds.has(id));
  console.log('Remaining: ' + toProcess.length);

  if (toProcess.length === 0) {
    console.log('All done!');
    return;
  }

  let stats = { success: 0, errors: 0, skipped: 0 };
  let browserState = null;
  let jobsSinceBrowserStart = 0;

  const startBrowser = async () => {
    if (browserState) {
      try { await browserState.browser.close(); } catch (e) {}
    }
    console.log('\n[NEW BROWSER SESSION]');
    browserState = await createBrowser();
    await doLogin(browserState.page, username, password);
    jobsSinceBrowserStart = 0;
  };

  await startBrowser();

  for (let i = 0; i < toProcess.length; i++) {
    const jobId = toProcess[i];

    // Proactively restart browser every N jobs
    if (jobsSinceBrowserStart >= CONFIG.browserRestartEvery) {
      await startBrowser();
    }

    process.stdout.write('[' + (i+1) + '/' + toProcess.length + '] ');
    const result = await processJob(browserState.browser, browserState.page, jobId, username, password);

    if (result.needsRestart) {
      await startBrowser();
      // Retry this job after restart
      const retryResult = await processJob(browserState.browser, browserState.page, jobId, username, password);
      if (retryResult.success) stats.success++;
      else if (retryResult.error) stats.errors++;
      else stats.skipped++;
    } else if (result.success) {
      stats.success++;
    } else if (result.error) {
      stats.errors++;
    } else {
      stats.skipped++;
    }

    progress.processedIds.add(jobId);
    progress.count++;
    jobsSinceBrowserStart++;

    if (progress.count % 10 === 0) {
      saveProgress(progress);
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
  console.log('Success: ' + stats.success);
  console.log('Errors: ' + stats.errors);
  console.log('Skipped: ' + stats.skipped);
  console.log('Total processed: ' + progress.processedIds.size);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
