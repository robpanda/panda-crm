/**
 * AccuLynx Message Scraper (Playwright version)
 *
 * Scrapes job messages/comments from AccuLynx and exports them for import into Panda CRM.
 *
 * Usage:
 *   node scraper-playwright.js --test                    # Test with single job
 *   node scraper-playwright.js --job <jobId>             # Scrape single job
 *   node scraper-playwright.js --all                     # Scrape all jobs (paginated)
 *   node scraper-playwright.js --since 2024-01-01        # Scrape jobs modified since date
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

// Configuration
const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  loginUrl: 'https://identity.acculynx.com', // OAuth login endpoint
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  pageSize: 25, // API max is 25
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
  const messages = [];

  try {
    // Navigate to job comments page
    const url = `${CONFIG.baseUrl}/jobs/${jobId}/comments`;
    console.log(`  Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Check if we need to login (redirected to login page)
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
      console.log('  No message container found, may be empty or different structure');
    }

    // Extract messages - AccuLynx specific extraction
    const extractedMessages = await page.evaluate(() => {
      const messages = [];

      // AccuLynx comments page structure analysis:
      // The page has a white card layout in the center column
      // Each comment appears to be a distinct block with:
      // - User avatar (blue circle with initials)
      // - User name
      // - Timestamp
      // - Message content

      // Strategy 1: Find the main scrollable content area and look for repeated patterns
      // The comments are in the center column, likely within a specific container

      // Get all elements and analyze them
      const allElements = document.querySelectorAll('*');
      const candidates = [];

      // Look for elements that contain typical comment patterns
      allElements.forEach((el) => {
        const text = el.innerText?.trim() || '';
        const html = el.innerHTML || '';

        // Skip if too short or too long
        if (text.length < 20 || text.length > 10000) return;

        // Skip navigation, headers, footers
        if (el.tagName === 'NAV' || el.tagName === 'HEADER' || el.tagName === 'FOOTER') return;

        // Look for patterns that suggest this is a comment:
        // - Contains a date/time pattern (AM/PM, ago, etc.)
        // - Has user-like content
        const hasTimePattern = /(\d{1,2}:\d{2}\s*(AM|PM)|ago|yesterday|today|\d{1,2}\/\d{1,2}\/\d{2,4})/i.test(text);
        const looksLikeComment = hasTimePattern && text.length > 30 && text.length < 3000;

        if (looksLikeComment) {
          // Check if this element's parent is already captured (avoid duplicates)
          const parentText = el.parentElement?.innerText?.trim() || '';
          if (parentText === text) return; // Skip if parent has same text

          candidates.push({
            text: text,
            html: html.substring(0, 500),
            tagName: el.tagName,
            className: el.className,
            textLength: text.length,
          });
        }
      });

      // Deduplicate and filter
      const seen = new Set();
      candidates.forEach(c => {
        // Create a key from first 100 chars
        const key = c.text.substring(0, 100).replace(/\s+/g, ' ');
        if (!seen.has(key)) {
          seen.add(key);
          messages.push(c);
        }
      });

      // Sort by text length (longer = more likely to be complete comment)
      messages.sort((a, b) => b.textLength - a.textLength);

      // If we have too many, filter to keep only the best ones
      // Look for messages that don't contain other messages
      const filtered = [];
      const usedTexts = new Set();

      for (const msg of messages) {
        // Check if this message text is contained in another message we've added
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

      // Strategy 2: Get the full page text and try to parse it
      const pageText = document.body.innerText;

      return {
        messages: filtered.slice(0, 100), // Limit to 100 messages
        debug: {
          totalCandidates: candidates.length,
          totalFiltered: filtered.length,
          totalDivs: document.querySelectorAll('div').length,
          pageTextLength: pageText.length,
          // Include first 2000 chars of page text for debugging
          pageTextSample: pageText.substring(0, 3000),
        }
      };
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

    // Take a screenshot for debugging
    const screenshotPath = path.join(CONFIG.outputDir, `screenshot-${jobId}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  Screenshot saved: ${screenshotPath}`);

    // Log what we found
    const messageCount = extractedMessages.messages?.length || 0;
    console.log(`  Found ${messageCount} message blocks`);
    if (extractedMessages.debug) {
      console.log(`  Debug: ${extractedMessages.debug.totalDivs} total divs on page`);
    }

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

    // Go to main site - it will redirect to OAuth login
    await page.goto(`${CONFIG.baseUrl}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });

    // Take screenshot of current page
    await page.screenshot({ path: path.join(CONFIG.outputDir, 'login-page.png') });
    console.log(`  Current URL: ${page.url()}`);

    // Check if we're on the login page (could be various URLs)
    if (page.url().includes('identity.acculynx.com') || page.url().includes('securelogin') || page.url().includes('signin') || page.url().includes('login')) {
      console.log('  On login page, filling credentials...');

      // Wait for the form to be visible - try multiple selectors
      try {
        await page.waitForSelector('input[type="email"], input[name="Email"], input[placeholder="Email"], #Email', { timeout: 10000 });
      } catch (e) {
        console.log('  Could not find email input, checking page structure...');
        await page.screenshot({ path: path.join(CONFIG.outputDir, 'login-debug.png') });
      }

      // Fill login form using various possible selectors
      console.log(`  Entering email: ${username}`);
      const emailSelectors = ['input[type="email"]', 'input[name="Email"]', 'input[placeholder="Email"]', '#Email', 'input[id*="email" i]'];
      for (const selector of emailSelectors) {
        try {
          const emailInput = await page.$(selector);
          if (emailInput) {
            await emailInput.fill(username);
            console.log(`    Used selector: ${selector}`);
            break;
          }
        } catch (e) {}
      }

      console.log('  Entering password...');
      const passwordSelectors = ['input[type="password"]', 'input[name="Password"]', 'input[placeholder="Password"]', '#Password', 'input[id*="password" i]'];
      for (const selector of passwordSelectors) {
        try {
          const passwordInput = await page.$(selector);
          if (passwordInput) {
            await passwordInput.fill(password);
            console.log(`    Used selector: ${selector}`);
            break;
          }
        } catch (e) {}
      }

      // Small delay to ensure form is ready
      await page.waitForTimeout(500);

      // Take screenshot before clicking
      await page.screenshot({ path: path.join(CONFIG.outputDir, 'before-submit.png') });

      // Click the SIGN IN submit button (not Google/Microsoft buttons)
      console.log('  Clicking SIGN IN button...');
      // The main Sign In button has specific text "SIGN IN" or contains the form submit
      try {
        // Try to find the button with exact "SIGN IN" text first
        const signInBtn = await page.$('button:has-text("SIGN IN")');
        if (signInBtn) {
          await signInBtn.click();
          console.log('    Clicked SIGN IN button');
        } else {
          // Fallback - find button within the login form that's not Google/Microsoft
          const formSubmit = await page.$('form button[type="submit"]:not(:has-text("Google")):not(:has-text("Microsoft"))');
          if (formSubmit) {
            await formSubmit.click();
            console.log('    Clicked form submit button');
          } else {
            // Last resort - press Enter in the password field
            await page.press('input[type="password"]', 'Enter');
            console.log('    Pressed Enter in password field');
          }
        }
      } catch (e) {
        console.log('  Could not find submit button, pressing Enter...');
        await page.press('input[type="password"]', 'Enter');
      }

      // Wait for navigation
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 });
      } catch (e) {
        console.log('  Navigation timeout - checking page state...');
      }
    }

    // Take screenshot after login attempt
    await page.screenshot({ path: path.join(CONFIG.outputDir, 'after-login.png') });

    // Check for error messages on the page
    const errorText = await page.evaluate(() => {
      const errorEl = document.querySelector('.error, .alert-danger, [class*="error"], [class*="Error"], .validation-summary-errors');
      return errorEl ? errorEl.textContent : null;
    });

    if (errorText && !errorText.includes('404')) {
      console.log(`  Login error message: ${errorText.trim().substring(0, 200)}`);
    }

    // Check if login was successful
    const currentUrl = page.url();
    console.log(`  Current URL after login: ${currentUrl}`);

    // Success if we're on the dashboard or any my.acculynx.com page that's not login
    if (currentUrl.includes('my.acculynx.com') && !currentUrl.includes('login') && !currentUrl.includes('404')) {
      console.log('Login successful!');
      return true;
    }

    // Still on login page
    if (currentUrl.includes('identity') || currentUrl.includes('login') || currentUrl.includes('signin')) {
      const pageContent = await page.content();
      if (pageContent.includes('incorrect') || pageContent.includes('Invalid')) {
        throw new Error('Login failed - invalid credentials');
      }
      if (pageContent.includes('verification') || pageContent.includes('2FA') || pageContent.includes('code')) {
        console.log('  2FA or verification may be required');
      }
      throw new Error('Login failed - still on login page');
    }

    console.log('Login successful!');
    return true;

  } finally {
    await page.close();
  }
}

/**
 * Main scraper function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('AccuLynx Message Scraper (Playwright)');
  console.log('═══════════════════════════════════════════════════════════');

  // Ensure output directory exists
  await fs.mkdir(CONFIG.outputDir, { recursive: true });

  // Get credentials from environment or prompt
  const username = process.env.ACCULYNX_USERNAME;
  const password = process.env.ACCULYNX_PASSWORD;

  if (!username || !password) {
    console.log('\nPlease set environment variables:');
    console.log('  export ACCULYNX_USERNAME="your-email"');
    console.log('  export ACCULYNX_PASSWORD=\'your-password\'');
    console.log('\nOr run with:');
    console.log('  ACCULYNX_USERNAME=email ACCULYNX_PASSWORD=\'pass\' node scraper-playwright.js --test');
    process.exit(1);
  }

  // Launch browser
  console.log('\nLaunching browser...');
  const browser = await chromium.launch({
    headless: true, // Run headless for stability
    slowMo: 50, // Slight delay for stability
  });

  // Create a persistent context (keeps cookies/session)
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  try {
    // Login first
    await login(context, username, password);

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

    // Scrape each job
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < jobsToScrape.length; i++) {
      const job = jobsToScrape[i];
      console.log(`\n[${i + 1}/${jobsToScrape.length}] Scraping: ${job.jobName || job.id}`);

      const result = await scrapeJobMessages(context, job.id, job.jobName);

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
