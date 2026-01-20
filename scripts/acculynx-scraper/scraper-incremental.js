/**
 * AccuLynx Message Scraper (Incremental Save Version)
 *
 * IMPROVED: Saves data incrementally after each job to prevent data loss.
 *
 * Data is saved to:
 *   - output/scraped-jobs.jsonl  (one JSON object per line, append-only)
 *   - output/progress.json       (tracks which jobs have been scraped)
 *
 * Usage:
 *   node scraper-incremental.js --all                     # Scrape all jobs
 *   node scraper-incremental.js --since 2024-01-01        # Scrape jobs modified since date
 *   node scraper-incremental.js --resume                  # Resume from last position
 *   node scraper-incremental.js --job <jobId>             # Scrape single job
 *   node scraper-incremental.js --test                    # Test with single job
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import { createWriteStream, existsSync, readFileSync } from 'fs';
import path from 'path';

// Configuration
const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  loginUrl: 'https://identity.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  pageSize: 25,
  delayBetweenJobs: 800, // ms delay between jobs
  saveEvery: 1, // Save after every job (previously would only save at end)
};

// Output files
const SCRAPED_FILE = path.join(CONFIG.outputDir, 'scraped-jobs.jsonl');
const PROGRESS_FILE = path.join(CONFIG.outputDir, 'progress.json');

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const singleJobId = args.includes('--job') ? args[args.indexOf('--job') + 1] : null;
const scrapeAll = args.includes('--all');
const resumeMode = args.includes('--resume');
const sinceDate = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;

/**
 * Load or initialize progress tracking
 */
async function loadProgress() {
  try {
    if (existsSync(PROGRESS_FILE)) {
      const data = readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.log('  Could not load progress file, starting fresh');
  }
  return {
    scrapedJobIds: new Set(),
    lastPageStart: 0,
    totalJobs: 0,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Save progress
 */
async function saveProgress(progress) {
  const toSave = {
    ...progress,
    scrapedJobIds: Array.from(progress.scrapedJobIds),
    lastSaved: new Date().toISOString(),
  };
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(toSave, null, 2));
}

/**
 * Append a scraped job result to the JSONL file
 */
async function appendScrapedJob(result) {
  const line = JSON.stringify(result) + '\n';
  await fs.appendFile(SCRAPED_FILE, line);
}

/**
 * Fetch jobs from AccuLynx API
 */
async function fetchJobs(pageStart = 0, modifiedSince = null) {
  let url = `${CONFIG.apiUrl}/jobs?pageSize=${CONFIG.pageSize}&pageStartIndex=${pageStart}`;

  if (modifiedSince) {
    url += `&modifiedDateStart=${modifiedSince}`;
  }

  console.log(`  Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.apiKey}`,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.log(`  Error body: ${errorBody}`);
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Scrape messages from a single job page
 */
async function scrapeJobMessages(context, jobId, jobName) {
  const page = await context.newPage();

  try {
    const url = `${CONFIG.baseUrl}/jobs/${jobId}/comments`;
    console.log(`  Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Check if we need to login
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      console.log('  Session expired, need to re-login');
      return { messages: [], needsLogin: true };
    }

    // Wait for messages to load
    try {
      await page.waitForSelector('.message-container, .comment-container, .conversation-item, [class*="message"], [class*="comment"]', {
        timeout: 10000
      });
    } catch (e) {
      // May be empty
    }

    // Extract messages
    const extractedMessages = await page.evaluate(() => {
      const messages = [];
      const allElements = document.querySelectorAll('*');
      const candidates = [];

      allElements.forEach((el) => {
        const text = el.innerText?.trim() || '';
        const html = el.innerHTML || '';

        if (text.length < 20 || text.length > 10000) return;
        if (el.tagName === 'NAV' || el.tagName === 'HEADER' || el.tagName === 'FOOTER') return;

        const hasTimePattern = /(\d{1,2}:\d{2}\s*(AM|PM)|ago|yesterday|today|\d{1,2}\/\d{1,2}\/\d{2,4})/i.test(text);
        const looksLikeComment = hasTimePattern && text.length > 30 && text.length < 3000;

        if (looksLikeComment) {
          const parentText = el.parentElement?.innerText?.trim() || '';
          if (parentText === text) return;

          candidates.push({
            text: text,
            html: html.substring(0, 500),
            tagName: el.tagName,
            className: el.className,
            textLength: text.length,
          });
        }
      });

      // Deduplicate
      const seen = new Set();
      candidates.forEach(c => {
        const key = c.text.substring(0, 100).replace(/\s+/g, ' ');
        if (!seen.has(key)) {
          seen.add(key);
          messages.push(c);
        }
      });

      messages.sort((a, b) => b.textLength - a.textLength);

      // Filter out subsets
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

      return {
        messages: filtered.slice(0, 100),
        debug: {
          totalCandidates: candidates.length,
          totalFiltered: filtered.length,
        }
      };
    });

    // Get SMS messages if any
    const smsMessages = await page.evaluate(() => {
      const sms = [];
      const smsElements = document.querySelectorAll('[class*="sms"], [class*="text-message"], .outgoing-message, .incoming-message');
      smsElements.forEach(el => {
        sms.push({
          text: el.innerText,
          direction: el.classList.contains('outgoing') || el.classList.contains('sent') ? 'outgoing' : 'incoming',
          timestamp: el.querySelector('time, [class*="time"]')?.textContent,
        });
      });
      return sms;
    });

    const messageCount = extractedMessages.messages?.length || 0;
    console.log(`  Found ${messageCount} message blocks`);

    return {
      messages: extractedMessages.messages || [],
      smsMessages: smsMessages,
      debug: extractedMessages.debug,
      pageUrl: page.url(),
      needsLogin: false,
    };

  } catch (error) {
    console.error(`  Error scraping job ${jobId}:`, error.message);
    return { messages: [], error: error.message };
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

    if (page.url().includes('identity.acculynx.com') || page.url().includes('login') || page.url().includes('signin')) {
      console.log('  On login page, filling credentials...');

      try {
        await page.waitForSelector('input[type="email"], input[name="Email"], #Email', { timeout: 10000 });
      } catch (e) {
        console.log('  Could not find email input');
      }

      // Fill email
      const emailSelectors = ['input[type="email"]', 'input[name="Email"]', '#Email', 'input[id*="email" i]'];
      for (const selector of emailSelectors) {
        try {
          const emailInput = await page.$(selector);
          if (emailInput) {
            await emailInput.fill(username);
            break;
          }
        } catch (e) {}
      }

      // Fill password
      const passwordSelectors = ['input[type="password"]', 'input[name="Password"]', '#Password'];
      for (const selector of passwordSelectors) {
        try {
          const passwordInput = await page.$(selector);
          if (passwordInput) {
            await passwordInput.fill(password);
            break;
          }
        } catch (e) {}
      }

      await page.waitForTimeout(500);

      // Submit
      try {
        const signInBtn = await page.$('button:has-text("SIGN IN")');
        if (signInBtn) {
          await signInBtn.click();
        } else {
          await page.press('input[type="password"]', 'Enter');
        }
      } catch (e) {
        await page.press('input[type="password"]', 'Enter');
      }

      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        console.log('  Navigation timeout - checking page state...');
      }
    }

    const currentUrl = page.url();
    console.log(`  Current URL after login: ${currentUrl}`);

    if (currentUrl.includes('my.acculynx.com') && !currentUrl.includes('login')) {
      console.log('Login successful!');
      return true;
    }

    throw new Error('Login failed - still on login page');

  } finally {
    await page.close();
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('AccuLynx Message Scraper (Incremental Save)');
  console.log('═══════════════════════════════════════════════════════════');

  // Ensure output directory exists
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Load progress
  const progress = await loadProgress();
  if (resumeMode) {
    console.log(`\nResuming from previous run:`);
    console.log(`  - Already scraped: ${progress.scrapedJobIds?.length || 0} jobs`);
    console.log(`  - Last page start: ${progress.lastPageStart}`);
    progress.scrapedJobIds = new Set(progress.scrapedJobIds || []);
  } else {
    progress.scrapedJobIds = new Set();
  }

  // Get credentials
  const username = process.env.ACCULYNX_USERNAME;
  const password = process.env.ACCULYNX_PASSWORD;

  if (!username || !password) {
    console.log('\nPlease set environment variables:');
    console.log('  export ACCULYNX_USERNAME="your-email"');
    console.log('  export ACCULYNX_PASSWORD=\'your-password\'');
    process.exit(1);
  }

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await chromium.launch({
    headless: true,
    slowMo: 50,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });

  try {
    // Login
    await login(context, username, password);

    // Determine which jobs to scrape
    let jobsToScrape = [];

    if (isTest || singleJobId) {
      const testJobId = singleJobId || 'd737c120-e133-42e1-b17c-ec75343a0f17';
      console.log(`\nTest mode: scraping single job ${testJobId}`);

      const response = await fetch(`${CONFIG.apiUrl}/jobs/${testJobId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
      });
      const job = await response.json();
      jobsToScrape.push(job);

    } else if (scrapeAll || sinceDate || resumeMode) {
      console.log(`\nFetching jobs from API${sinceDate ? ` (modified since ${sinceDate})` : ''}...`);

      let pageStart = resumeMode ? (progress.lastPageStart || 0) : 0;
      let totalFetched = 0;

      while (true) {
        const data = await fetchJobs(pageStart, sinceDate);
        jobsToScrape.push(...data.items);
        totalFetched += data.items.length;

        console.log(`  Fetched ${totalFetched} of ${data.count} jobs`);
        progress.totalJobs = data.count;

        if (totalFetched >= data.count || data.items.length < CONFIG.pageSize) {
          break;
        }

        pageStart += CONFIG.pageSize;
      }
    }

    // Filter out already scraped jobs if resuming
    if (resumeMode && progress.scrapedJobIds.size > 0) {
      const beforeFilter = jobsToScrape.length;
      jobsToScrape = jobsToScrape.filter(j => !progress.scrapedJobIds.has(j.id));
      console.log(`  Filtered out ${beforeFilter - jobsToScrape.length} already-scraped jobs`);
    }

    console.log(`\nScraping messages from ${jobsToScrape.length} jobs...`);
    console.log(`  Output file: ${SCRAPED_FILE}`);

    // Scrape each job
    let successCount = 0;
    let errorCount = 0;
    let needsRelogin = false;

    for (let i = 0; i < jobsToScrape.length; i++) {
      const job = jobsToScrape[i];

      // Re-login if needed
      if (needsRelogin) {
        console.log('\n  Re-logging in...');
        await login(context, username, password);
        needsRelogin = false;
      }

      console.log(`\n[${i + 1}/${jobsToScrape.length}] Scraping: ${job.jobName || job.id}`);

      const result = await scrapeJobMessages(context, job.id, job.jobName);

      if (result.needsLogin) {
        needsRelogin = true;
        i--; // Retry this job
        continue;
      }

      // Build the result object
      const scrapedJob = {
        jobId: job.id,
        jobName: job.jobName,
        jobNumber: job.jobNumber,
        address: job.locationAddress,
        contacts: job.contacts,
        messages: result.messages,
        smsMessages: result.smsMessages,
        messageCount: result.messages?.length || 0,
        scrapedAt: new Date().toISOString(),
        error: result.error,
      };

      // Save immediately (incremental)
      await appendScrapedJob(scrapedJob);

      // Update progress
      progress.scrapedJobIds.add(job.id);
      progress.lastPageStart = Math.floor(i / CONFIG.pageSize) * CONFIG.pageSize;

      if (result.error) {
        errorCount++;
      } else {
        successCount++;
      }

      // Save progress periodically
      if ((i + 1) % 10 === 0) {
        await saveProgress(progress);
        console.log(`  [Progress saved: ${progress.scrapedJobIds.size} jobs]`);
      }

      // Rate limiting delay
      if (i < jobsToScrape.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenJobs));
      }
    }

    // Final save
    await saveProgress(progress);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Scraping Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total jobs scraped: ${progress.scrapedJobIds.size}`);
    console.log(`  This run: ${successCount + errorCount}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Output: ${SCRAPED_FILE}`);
    console.log(`  Progress: ${PROGRESS_FILE}`);

  } finally {
    await browser.close();
  }
}

// Run
main().catch(console.error);
