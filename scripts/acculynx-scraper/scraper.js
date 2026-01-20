/**
 * AccuLynx Message Scraper
 *
 * Scrapes job messages/comments from AccuLynx and exports them for import into Panda CRM.
 *
 * Usage:
 *   node scraper.js --test                    # Test with single job
 *   node scraper.js --job <jobId>             # Scrape single job
 *   node scraper.js --all                     # Scrape all jobs (paginated)
 *   node scraper.js --since 2024-01-01        # Scrape jobs modified since date
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  pageSize: 100,
  delayBetweenJobs: 1000, // ms delay between jobs to avoid rate limiting
};

// Parse command line arguments
const args = process.argv.slice(2);
const isTest = args.includes('--test');
const singleJobId = args.includes('--job') ? args[args.indexOf('--job') + 1] : null;
const scrapeAll = args.includes('--all');
const sinceDate = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;

/**
 * Fetch jobs from AccuLynx API
 */
async function fetchJobs(pageStart = 0, modifiedSince = null) {
  let url = `${CONFIG.apiUrl}/jobs?pageSize=${CONFIG.pageSize}&pageStartIndex=${pageStart}`;

  if (modifiedSince) {
    url += `&modifiedDateStart=${modifiedSince}`;
  }

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${CONFIG.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Scrape messages from a single job page
 */
async function scrapeJobMessages(browser, jobId, jobName) {
  const page = await browser.newPage();
  const messages = [];

  try {
    // Navigate to job comments page
    const url = `${CONFIG.baseUrl}/jobs/${jobId}/comments`;
    console.log(`  Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Check if we need to login (redirected to login page)
    if (page.url().includes('login') || page.url().includes('signin')) {
      console.log('  Session expired, need to re-login');
      return { messages: [], needsLogin: true };
    }

    // Wait for messages to load
    await page.waitForSelector('.message-container, .comment-container, .conversation-item, [class*="message"], [class*="comment"]', {
      timeout: 10000
    }).catch(() => {
      console.log('  No message container found, may be empty or different structure');
    });

    // Extract messages - try multiple selector strategies
    const extractedMessages = await page.evaluate(() => {
      const messages = [];

      // Strategy 1: Look for common message/comment containers
      const messageSelectors = [
        '.message-item',
        '.comment-item',
        '.conversation-message',
        '[data-message-id]',
        '.feed-item',
        '.activity-item',
        '.timeline-item',
      ];

      for (const selector of messageSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          elements.forEach(el => {
            const message = {
              text: el.innerText || el.textContent,
              html: el.innerHTML,
              timestamp: el.querySelector('time, [class*="date"], [class*="time"]')?.textContent,
              author: el.querySelector('[class*="author"], [class*="user"], [class*="name"]')?.textContent,
              selector: selector,
            };
            messages.push(message);
          });
          break;
        }
      }

      // Strategy 2: If no specific containers, get all text content from main area
      if (messages.length === 0) {
        const mainContent = document.querySelector('main, .main-content, #content, [role="main"]');
        if (mainContent) {
          messages.push({
            text: mainContent.innerText,
            html: mainContent.innerHTML,
            selector: 'main-content-fallback',
          });
        }
      }

      return messages;
    });

    // Also try to capture any conversation/SMS threads
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

    return {
      messages: extractedMessages,
      smsMessages: smsMessages,
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
async function login(browser, username, password) {
  const page = await browser.newPage();

  try {
    console.log('Logging into AccuLynx...');
    await page.goto(`${CONFIG.baseUrl}/login`, { waitUntil: 'networkidle2' });

    // Fill login form - adjust selectors based on actual page structure
    await page.type('input[name="email"], input[type="email"], #email', username);
    await page.type('input[name="password"], input[type="password"], #password', password);

    // Click login button
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"], input[type="submit"], .login-button'),
    ]);

    // Check if login was successful
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      throw new Error('Login failed - still on login page');
    }

    console.log('Login successful!');

    // Get cookies for session persistence
    const cookies = await page.cookies();
    return cookies;

  } finally {
    await page.close();
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('AccuLynx Message Scraper');
  console.log('═══════════════════════════════════════════════════════════');

  // Ensure output directory exists
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Get credentials from environment or prompt
  const username = process.env.ACCULYNX_USERNAME;
  const password = process.env.ACCULYNX_PASSWORD;

  if (!username || !password) {
    console.log('\nPlease set environment variables:');
    console.log('  export ACCULYNX_USERNAME="your-email"');
    console.log('  export ACCULYNX_PASSWORD="your-password"');
    console.log('\nOr run with:');
    console.log('  ACCULYNX_USERNAME=email ACCULYNX_PASSWORD=pass node scraper.js --test');
    process.exit(1);
  }

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Use visible browser for debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
    defaultViewport: { width: 1920, height: 1080 },
    timeout: 60000,
  });

  try {
    // Login first
    const cookies = await login(browser, username, password);

    // Determine which jobs to scrape
    let jobsToScrape = [];

    if (isTest || singleJobId) {
      // Test mode or single job
      const testJobId = singleJobId || 'd737c120-e133-42e1-b17c-ec75343a0f17';
      console.log(`\nTest mode: scraping single job ${testJobId}`);

      const response = await fetch(`${CONFIG.apiUrl}/jobs/${testJobId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.apiKey}` },
      });
      const job = await response.json();
      jobsToScrape.push(job);

    } else if (scrapeAll || sinceDate) {
      // Fetch all jobs (paginated)
      console.log(`\nFetching jobs from API${sinceDate ? ` (modified since ${sinceDate})` : ''}...`);

      let pageStart = 0;
      let totalFetched = 0;

      while (true) {
        const data = await fetchJobs(pageStart, sinceDate);
        jobsToScrape.push(...data.items);
        totalFetched += data.items.length;

        console.log(`  Fetched ${totalFetched} of ${data.count} jobs`);

        if (totalFetched >= data.count || data.items.length < CONFIG.pageSize) {
          break;
        }

        pageStart += CONFIG.pageSize;
      }
    }

    console.log(`\nScraping messages from ${jobsToScrape.length} jobs...`);

    // Set cookies in new pages
    const page = await browser.newPage();
    await page.setCookie(...cookies);
    await page.close();

    // Scrape each job
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < jobsToScrape.length; i++) {
      const job = jobsToScrape[i];
      console.log(`\n[${i + 1}/${jobsToScrape.length}] Scraping: ${job.jobName || job.id}`);

      const result = await scrapeJobMessages(browser, job.id, job.jobName);

      results.push({
        jobId: job.id,
        jobName: job.jobName,
        jobNumber: job.jobNumber,
        address: job.locationAddress,
        contacts: job.contacts,
        ...result,
        scrapedAt: new Date().toISOString(),
      });

      if (result.error) {
        errorCount++;
      } else {
        successCount++;
      }

      // Rate limiting delay
      if (i < jobsToScrape.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenJobs));
      }
    }

    // Save results
    const outputFile = path.join(CONFIG.outputDir, `messages-${Date.now()}.json`);
    await fs.writeFile(outputFile, JSON.stringify(results, null, 2));

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('Scraping Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total jobs: ${jobsToScrape.length}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);
    console.log(`  Output: ${outputFile}`);

    return results;

  } finally {
    await browser.close();
  }
}

// Run
main().catch(console.error);
