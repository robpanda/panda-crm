#!/usr/bin/env node

/**
 * Zoom Interactive Login
 *
 * Opens a browser window for you to log into Zoom manually.
 * Saves cookies so the main scraper can run headless.
 *
 * Usage:
 *   node zoom-login.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const COOKIES_FILE = path.join(__dirname, '.zoom-cookies.json');
const ZOOM_URL = 'https://zoom.us/recording/management';

async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('          ZOOM LOGIN - Save Cookies for Scraper');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('This will open a browser window. Please:');
  console.log('  1. Log in to Zoom with your admin credentials');
  console.log('  2. Navigate to the recording management page');
  console.log('  3. Come back here and press ENTER when done');
  console.log('');

  // Launch browser
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--start-maximized',
    ],
  });

  const context = await browser.newContext({
    viewport: null, // Use full window size
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    // Navigate to Zoom recordings
    console.log('Navigating to Zoom recordings page...');
    await page.goto(ZOOM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  Browser opened! Please log in to Zoom.                       ║');
    console.log('║                                                               ║');
    console.log('║  Once you are on the recordings management page,              ║');
    console.log('║  come back to this terminal and press ENTER.                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    // Wait for user to press enter
    await promptUser('Press ENTER when you have logged in and are on the recordings page...');

    // Check current URL
    const currentUrl = page.url();
    console.log(`\nCurrent URL: ${currentUrl}`);

    if (!currentUrl.includes('recording')) {
      console.log('\n⚠️  Warning: You may not be on the recordings page.');
      console.log('    The cookies will still be saved, but the scraper may need to navigate.');
    }

    // Save cookies
    const cookies = await context.cookies();
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
    console.log(`\n✅ Cookies saved to ${COOKIES_FILE}`);
    console.log(`   ${cookies.length} cookies saved`);

    // List zoom-related cookies
    const zoomCookies = cookies.filter(c => c.domain.includes('zoom'));
    console.log(`   ${zoomCookies.length} Zoom-specific cookies saved`);

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  You can now run the scraper with:');
    console.log('    node scrape-zoom-recordings.js --headless');
    console.log('═══════════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    console.log('\nClosing browser...');
    await browser.close();
  }
}

main().catch(console.error);
