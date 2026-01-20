#!/usr/bin/env node
/**
 * Recover Scraped Data from Screenshots
 *
 * The original scraper saves screenshots for each job but only saves
 * message data at the END. This script:
 * 1. Finds all screenshot files (contains AccuLynx job UUIDs)
 * 2. Fetches job metadata from AccuLynx API
 * 3. Re-scrapes the comments page for each job
 * 4. Saves data incrementally to a JSONL file
 *
 * Usage:
 *   ACCULYNX_USERNAME=email ACCULYNX_PASSWORD=pass node recover-scraped-data.js
 *   node recover-scraped-data.js --api-only   # Only fetch API data, skip web scraping
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import path from 'path';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  delayBetweenJobs: 500,
};

const OUTPUT_FILE = path.join(CONFIG.outputDir, 'recovered-jobs.jsonl');
const PROGRESS_FILE = path.join(CONFIG.outputDir, 'recovery-progress.json');

const args = process.argv.slice(2);
const apiOnly = args.includes('--api-only');

/**
 * Extract job IDs from screenshot filenames
 */
async function getScrapedJobIds() {
  const files = readdirSync(CONFIG.outputDir);
  const jobIds = new Set();

  // Pattern: screenshot-{uuid}.png
  const pattern = /^screenshot-([a-f0-9-]{36})\.png$/;

  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      jobIds.add(match[1]);
    }
  }

  console.log(`Found ${jobIds.size} job IDs from screenshots`);
  return Array.from(jobIds);
}

/**
 * Load recovery progress
 */
async function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return {
        ...parsed,
        processedIds: new Set(parsed.processedIds || []),
      };
    }
  } catch (e) {
    console.log('Starting fresh recovery');
  }
  return {
    processedIds: new Set(),
    totalProcessed: 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Save recovery progress
 */
async function saveProgress(progress) {
  const toSave = {
    ...progress,
    processedIds: Array.from(progress.processedIds),
    lastSaved: new Date().toISOString(),
  };
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

/**
 * Append job data to JSONL file
 */
async function appendJob(jobData) {
  await fs.appendFile(OUTPUT_FILE, JSON.stringify(jobData) + '\n');
}

/**
 * Fetch job details from API
 */
async function fetchJobDetails(jobId) {
  try {
    const response = await fetch(`${CONFIG.apiUrl}/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
    });

    if (!response.ok) {
      console.log(`  API error for ${jobId}: ${response.status}`);
      return null;
    }

    return response.json();
  } catch (e) {
    console.log(`  Failed to fetch ${jobId}: ${e.message}`);
    return null;
  }
}

/**
 * Scrape messages from job comments page
 */
async function scrapeJobMessages(context, jobId) {
  const page = await context.newPage();

  try {
    const url = `${CONFIG.baseUrl}/jobs/${jobId}/comments`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for login redirect
    if (page.url().includes('login') || page.url().includes('signin')) {
      return { messages: [], needsLogin: true };
    }

    // Wait for content
    try {
      await page.waitForSelector('[class*="comment"], [class*="message"]', { timeout: 5000 });
    } catch (e) {
      // May be empty
    }

    // Extract messages
    const result = await page.evaluate(() => {
      const messages = [];
      const seen = new Set();

      document.querySelectorAll('*').forEach(el => {
        const text = el.innerText?.trim() || '';
        if (text.length < 20 || text.length > 5000) return;
        if (el.tagName === 'NAV' || el.tagName === 'HEADER' || el.tagName === 'FOOTER') return;

        const hasTime = /(\d{1,2}:\d{2}\s*(AM|PM)|ago|\d{1,2}\/\d{1,2}\/\d{2,4})/i.test(text);
        if (!hasTime) return;

        const key = text.substring(0, 100).replace(/\s+/g, ' ');
        if (seen.has(key)) return;
        seen.add(key);

        messages.push({
          text: text,
          className: el.className,
          textLength: text.length,
        });
      });

      // Sort by length and deduplicate
      messages.sort((a, b) => b.textLength - a.textLength);
      const filtered = [];
      const usedTexts = new Set();

      for (const msg of messages) {
        let isSubset = false;
        for (const used of usedTexts) {
          if (used.includes(msg.text) || msg.text.includes(used)) {
            if (used.length > msg.text.length) {
              isSubset = true;
              break;
            }
          }
        }
        if (!isSubset) {
          filtered.push(msg);
          usedTexts.add(msg.text);
        }
      }

      return filtered.slice(0, 100);
    });

    return { messages: result, needsLogin: false };

  } catch (e) {
    return { messages: [], error: e.message };
  } finally {
    await page.close();
  }
}

/**
 * Login to AccuLynx
 */
async function login(context, username, password) {
  const page = await context.newPage();

  try {
    console.log('Logging into AccuLynx...');
    await page.goto(`${CONFIG.baseUrl}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });

    if (page.url().includes('identity') || page.url().includes('login')) {
      await page.waitForSelector('input[type="email"], input[name="Email"]', { timeout: 10000 });

      for (const sel of ['input[type="email"]', 'input[name="Email"]', '#Email']) {
        const el = await page.$(sel);
        if (el) { await el.fill(username); break; }
      }

      for (const sel of ['input[type="password"]', 'input[name="Password"]']) {
        const el = await page.$(sel);
        if (el) { await el.fill(password); break; }
      }

      await page.waitForTimeout(500);

      const signIn = await page.$('button:has-text("SIGN IN")');
      if (signIn) await signIn.click();
      else await page.press('input[type="password"]', 'Enter');

      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    }

    if (page.url().includes('my.acculynx.com') && !page.url().includes('login')) {
      console.log('Login successful!');
      return true;
    }

    throw new Error('Login failed');
  } finally {
    await page.close();
  }
}

/**
 * Main function
 */
async function main() {
  console.log('═'.repeat(60));
  console.log('AccuLynx Data Recovery from Screenshots');
  console.log('═'.repeat(60));
  console.log(`Mode: ${apiOnly ? 'API Only' : 'Full (API + Web Scraping)'}`);
  console.log('');

  // Get job IDs from screenshots
  const jobIds = await getScrapedJobIds();
  if (jobIds.length === 0) {
    console.log('No screenshots found to recover from.');
    return;
  }

  // Load progress
  const progress = await loadProgress();
  console.log(`Already processed: ${progress.processedIds.size} jobs`);

  // Filter out already processed
  const toProcess = jobIds.filter(id => !progress.processedIds.has(id));
  console.log(`Remaining to process: ${toProcess.length} jobs`);

  if (toProcess.length === 0) {
    console.log('All jobs already recovered!');
    return;
  }

  let context = null;
  let browser = null;

  if (!apiOnly) {
    const username = process.env.ACCULYNX_USERNAME;
    const password = process.env.ACCULYNX_PASSWORD;

    if (!username || !password) {
      console.log('\nFor full recovery (with messages), set:');
      console.log('  export ACCULYNX_USERNAME="your-email"');
      console.log('  export ACCULYNX_PASSWORD="your-password"');
      console.log('\nOr use --api-only for metadata only.');
      process.exit(1);
    }

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    });

    await login(context, username, password);
  }

  try {
    let successCount = 0;
    let errorCount = 0;
    let needsRelogin = false;

    for (let i = 0; i < toProcess.length; i++) {
      const jobId = toProcess[i];

      if (needsRelogin && context) {
        const username = process.env.ACCULYNX_USERNAME;
        const password = process.env.ACCULYNX_PASSWORD;
        await login(context, username, password);
        needsRelogin = false;
      }

      console.log(`\n[${i + 1}/${toProcess.length}] Processing: ${jobId}`);

      // Fetch job metadata from API
      const jobData = await fetchJobDetails(jobId);
      if (!jobData) {
        errorCount++;
        continue;
      }

      console.log(`  Job: ${jobData.jobName || jobData.jobNumber || 'Unknown'}`);

      // Scrape messages if not API-only
      let messages = [];
      if (!apiOnly && context) {
        const scrapeResult = await scrapeJobMessages(context, jobId);
        if (scrapeResult.needsLogin) {
          needsRelogin = true;
          i--; // Retry
          continue;
        }
        messages = scrapeResult.messages || [];
        console.log(`  Messages: ${messages.length}`);
      }

      // Build result
      const result = {
        jobId: jobData.id,
        jobName: jobData.jobName,
        jobNumber: jobData.jobNumber,
        address: jobData.locationAddress,
        contacts: jobData.contacts,
        messages: messages,
        messageCount: messages.length,
        recoveredAt: new Date().toISOString(),
      };

      // Save immediately
      await appendJob(result);

      // Update progress
      progress.processedIds.add(jobId);
      progress.totalProcessed++;
      successCount++;

      // Save progress every 50 jobs
      if ((i + 1) % 50 === 0) {
        await saveProgress(progress);
        console.log(`\n  [Progress saved: ${progress.processedIds.size} jobs]`);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, CONFIG.delayBetweenJobs));
    }

    // Final save
    await saveProgress(progress);

    console.log('\n' + '═'.repeat(60));
    console.log('Recovery Complete!');
    console.log('═'.repeat(60));
    console.log(`Total recovered: ${progress.processedIds.size}`);
    console.log(`This run: ${successCount} success, ${errorCount} errors`);
    console.log(`Output: ${OUTPUT_FILE}`);

  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
