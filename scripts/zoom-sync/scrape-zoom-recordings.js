#!/usr/bin/env node

/**
 * Zoom Recording Scraper
 *
 * Scrapes all cloud recordings from Zoom's admin recording management page
 * and uploads them to S3.
 *
 * Prerequisites:
 * - npm install playwright @aws-sdk/client-s3
 * - npx playwright install chromium
 *
 * Usage:
 *   node scrape-zoom-recordings.js                    # Interactive login, scrape all
 *   node scrape-zoom-recordings.js --headless         # Headless mode (after cookies saved)
 *   node scrape-zoom-recordings.js --dry-run          # Preview without downloading
 *   node scrape-zoom-recordings.js --start-date=2024-01-01
 *   node scrape-zoom-recordings.js --end-date=2025-12-31
 */

const { chromium } = require('playwright');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
  s3Bucket: 'panda-zoom-recordings',
  s3Region: 'us-east-2',
  zoomRecordingsUrl: 'https://zoom.us/recording/management',
  cookiesFile: path.join(__dirname, '.zoom-cookies.json'),
  downloadDir: path.join(__dirname, 'downloads'),
  pageLoadTimeout: 60000,
  downloadTimeout: 300000, // 5 minutes per file
};

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    acc[key] = value || true;
  }
  return acc;
}, {});

const DRY_RUN = args['dry-run'] || false;
const HEADLESS = args['headless'] || false;
const START_DATE = args['start-date'] || null;
const END_DATE = args['end-date'] || null;
const VERBOSE = args['verbose'] || true;

// AWS S3 client
const s3Client = new S3Client({ region: CONFIG.s3Region });

// Stats tracking
const stats = {
  meetingsFound: 0,
  filesFound: 0,
  filesDownloaded: 0,
  filesSkipped: 0,
  filesFailed: 0,
  bytesDownloaded: 0,
};

/**
 * Check if file exists in S3
 */
async function fileExistsInS3(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: CONFIG.s3Bucket,
      Key: key,
    }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Upload file to S3
 */
async function uploadToS3(key, body, contentType, metadata = {}) {
  await s3Client.send(new PutObjectCommand({
    Bucket: CONFIG.s3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  }));
}

/**
 * Download file from URL
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, {
      timeout: CONFIG.downloadTimeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Sanitize filename for S3
 */
function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 200);
}

/**
 * Get content type from file extension
 */
function getContentType(ext) {
  const types = {
    'mp4': 'video/mp4',
    'm4a': 'audio/mp4',
    'vtt': 'text/vtt',
    'txt': 'text/plain',
    'json': 'application/json',
    'cc': 'text/vtt',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Save cookies for future sessions
 */
async function saveCookies(context) {
  const cookies = await context.cookies();
  fs.writeFileSync(CONFIG.cookiesFile, JSON.stringify(cookies, null, 2));
  console.log('Cookies saved for future sessions');
}

/**
 * Load cookies from file
 */
async function loadCookies(context) {
  if (fs.existsSync(CONFIG.cookiesFile)) {
    const cookies = JSON.parse(fs.readFileSync(CONFIG.cookiesFile, 'utf8'));
    await context.addCookies(cookies);
    console.log('Loaded saved cookies');
    return true;
  }
  return false;
}

/**
 * Wait for user to complete login
 */
async function waitForLogin(page) {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Please log in to Zoom in the browser window                  ║');
  console.log('║  The script will continue once you reach the recordings page  ║');
  console.log('║  (You have 5 minutes to complete login)                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Poll for the recordings management page instead of using waitForURL
  const maxWaitTime = 300000; // 5 minutes
  const pollInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const currentUrl = page.url();
      console.log(`  Waiting for login... Current URL: ${currentUrl.substring(0, 60)}...`);

      if (currentUrl.includes('recording/management') && !currentUrl.includes('signin')) {
        console.log('\nLogin successful! Proceeding with scraping...\n');
        return;
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (err) {
      // Page might be navigating, just continue
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error('Login timeout - did not reach recordings page within 5 minutes');
}

/**
 * Extract recording data from the page
 */
async function extractRecordings(page) {
  // Wait for the table to load
  await page.waitForSelector('.recording-list-table, [class*="recording"], table', { timeout: 30000 }).catch(() => {});

  // Give it a moment to fully render
  await page.waitForTimeout(3000);

  // Extract recording data
  const recordings = await page.evaluate(() => {
    const results = [];

    // Try multiple selectors to find recordings
    const rows = document.querySelectorAll('tr[class*="recording"], .recording-item, [data-recording-id]');

    if (rows.length === 0) {
      // Alternative: look for any table rows with recording info
      const tableRows = document.querySelectorAll('table tbody tr');
      tableRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const topicCell = cells[0];
          const dateCell = cells[1] || cells[0];

          // Look for download links
          const downloadLinks = row.querySelectorAll('a[href*="download"], a[href*="recording"]');

          if (downloadLinks.length > 0) {
            const files = [];
            downloadLinks.forEach(link => {
              files.push({
                url: link.href,
                name: link.textContent?.trim() || 'recording',
                type: link.href.includes('.mp4') ? 'MP4' :
                      link.href.includes('.m4a') ? 'M4A' :
                      link.href.includes('.vtt') ? 'VTT' : 'UNKNOWN'
              });
            });

            results.push({
              topic: topicCell?.textContent?.trim() || 'Untitled',
              date: dateCell?.textContent?.trim() || '',
              files: files
            });
          }
        }
      });
    }

    return results;
  });

  return recordings;
}

/**
 * Navigate to recordings page via sidebar and wait for load
 */
async function navigateToRecordings(page) {
  console.log('Looking for Recordings link in sidebar...');

  // Wait for sidebar to load
  await page.waitForTimeout(3000);

  // Look for Recordings & Transcripts link in sidebar
  const recordingsLink = await page.$('a[href*="recording"], span:has-text("Recordings"), div:has-text("Recordings & Transcripts")');

  if (recordingsLink) {
    console.log('Found recordings link, clicking...');
    await recordingsLink.click();
    await page.waitForTimeout(3000);
  }

  // Wait for recordings content to load
  console.log('Waiting for recordings list to load...');
  await page.waitForSelector('[class*="recording"], table, [class*="list"]', { timeout: 30000 }).catch(() => {
    console.log('Could not find recording list selector, continuing anyway...');
  });

  await page.waitForTimeout(3000);
}

/**
 * Navigate through all pages of recordings
 */
async function scrapeAllPages(page) {
  const allRecordings = [];
  let pageNum = 1;
  let hasNextPage = true;

  // First navigate to recordings if needed
  const currentUrl = page.url();
  if (!currentUrl.includes('recording')) {
    await navigateToRecordings(page);
  }

  // Wait for page to fully load
  await page.waitForTimeout(5000);

  // Take a debug screenshot
  await page.screenshot({ path: path.join(CONFIG.downloadDir, 'recordings-page.png') });
  console.log('Debug screenshot saved to recordings-page.png');

  while (hasNextPage) {
    console.log(`\nScraping page ${pageNum}...`);

    // Wait for content to load
    await page.waitForTimeout(3000);

    // The Zoom Recording Management page has a table structure
    // Looking at the screenshot, recordings are in a table with columns:
    // Thumbnail | Topic | Meeting ID | Host | Start time | Size
    // The table body contains tr elements with the actual recording data

    // First, wait for the recording table to be present
    await page.waitForSelector('table tbody tr', { timeout: 10000 }).catch(() => {});

    // Get all table rows in the recording list
    // We need to filter to only rows that have recording data (not header rows, not pagination)
    const recordingRows = await page.$$('table tbody tr');

    console.log(`Found ${recordingRows.length} table rows`);

    // Filter to rows that actually contain recording data
    const validRecordings = [];

    for (let i = 0; i < recordingRows.length; i++) {
      const row = recordingRows[i];

      try {
        // Extract data from the row
        const rowData = await row.evaluate(el => {
          const cells = el.querySelectorAll('td');
          if (cells.length < 4) return null; // Not a valid recording row

          // Column structure based on screenshot:
          // 0: Thumbnail (has img)
          // 1: Topic (meeting title with duration)
          // 2: Meeting ID
          // 3: Host
          // 4: Start time
          // 5: Size (optional)

          // Check if this looks like a recording row (has thumbnail image or meeting ID)
          const thumbnailCell = cells[0];
          const topicCell = cells[1];
          const meetingIdCell = cells[2];
          const hostCell = cells[3];
          const startTimeCell = cells[4];

          // Get topic text - it's usually in the first column or second column
          let topic = '';
          let meetingId = '';
          let host = '';
          let startTime = '';
          let duration = '';

          // Topic is usually in column 1 (after thumbnail)
          if (topicCell) {
            // The topic might be in a link or span
            const topicLink = topicCell.querySelector('a');
            const topicSpan = topicCell.querySelector('span');
            topic = topicLink?.textContent?.trim() || topicSpan?.textContent?.trim() || topicCell.textContent?.trim() || '';

            // Extract duration if present (usually in parentheses or separate span)
            const durationMatch = topicCell.textContent?.match(/(\d+:\d+:\d+|\d+\s*min)/);
            if (durationMatch) {
              duration = durationMatch[1];
            }
          }

          // Meeting ID from column 2
          if (meetingIdCell) {
            meetingId = meetingIdCell.textContent?.trim()?.replace(/\s+/g, '') || '';
          }

          // Host from column 3
          if (hostCell) {
            host = hostCell.textContent?.trim() || '';
          }

          // Start time from column 4
          if (startTimeCell) {
            startTime = startTimeCell.textContent?.trim() || '';
          }

          // Skip if this doesn't look like a recording (no topic or no meeting ID pattern)
          if (!topic && !meetingId) return null;
          if (meetingId && !/^\d{9,11}$/.test(meetingId.replace(/\s/g, ''))) {
            // Meeting IDs are typically 9-11 digits
            // But some might have dashes, so also check for that pattern
            if (!/^\d{3}[\s-]?\d{3,4}[\s-]?\d{3,4}$/.test(meetingId)) {
              // Could still be valid, continue
            }
          }

          return {
            topic: topic.substring(0, 200) || 'Untitled',
            meetingId: meetingId,
            host: host,
            startTime: startTime,
            duration: duration,
          };
        });

        if (rowData && rowData.topic) {
          validRecordings.push({ row, rowData });
        }

      } catch (err) {
        // Skip this row
      }
    }

    console.log(`Found ${validRecordings.length} valid recording rows`);

    // Process each recording
    for (let i = 0; i < validRecordings.length; i++) {
      const { row, rowData } = validRecordings[i];

      try {
        console.log(`  Processing: ${rowData.topic} (${rowData.startTime || rowData.meetingId})`);

        // Click on the row to expand it and show download options
        // In Zoom's UI, clicking the row or topic usually expands to show files
        const clickTarget = await row.$('td:nth-child(2) a, td:nth-child(2)');
        if (clickTarget) {
          await clickTarget.click();
        } else {
          await row.click();
        }
        await page.waitForTimeout(2000);

        // Look for the expanded recording detail panel or download buttons
        // Zoom typically shows download options in an expanded panel or popup
        // Download links usually contain 'download' in URL or have download attribute

        // First try to find download links in an expanded section
        let downloadLinks = await page.$$eval(
          // Look for actual recording download links, NOT navigation links
          '[class*="recording-file"] a[href*="download"], ' +
          '[class*="file-list"] a[href*="download"], ' +
          '[class*="download-btn"] a, ' +
          'a[href*="rec/download"], ' +
          'a[href*="recording/download"], ' +
          'button[class*="download"]',
          links => links.map(l => ({
            url: l.href || l.getAttribute('data-url') || '',
            text: l.textContent?.trim() || l.getAttribute('title') || '',
            download: l.getAttribute('download') || ''
          })).filter(l => {
            // Filter out navigation/app download links
            if (!l.url) return false;
            if (l.url.includes('zoom.us/download')) return false;  // App download page
            if (l.url.includes('/client/')) return false;  // Client download
            if (l.text.includes('Zoom Workplace')) return false;
            if (l.text.includes('Browser Extension')) return false;
            if (l.text.includes('Download Center')) return false;
            return l.url.startsWith('http');
          })
        );

        // If no downloads found in expanded section, try looking for file type specific links
        if (downloadLinks.length === 0) {
          downloadLinks = await page.$$eval(
            // Look for file-type specific elements that might contain download links
            '[data-file-type] a, ' +
            '[class*="video-file"] a, ' +
            '[class*="audio-file"] a, ' +
            '[class*="transcript"] a, ' +
            'a[href*=".mp4"], ' +
            'a[href*=".m4a"], ' +
            'a[href*=".vtt"]',
            links => links.map(l => ({
              url: l.href || '',
              text: l.textContent?.trim() || l.getAttribute('aria-label') || '',
              download: l.getAttribute('download') || ''
            })).filter(l => {
              if (!l.url) return false;
              if (l.url.includes('zoom.us/download')) return false;
              if (l.url.includes('/client/')) return false;
              return l.url.startsWith('http');
            })
          );
        }

        // If still no download links, try clicking a "Download" button if present
        if (downloadLinks.length === 0) {
          const downloadBtn = await page.$('button:has-text("Download"), a:has-text("Download"):not([href*="zoom.us/download"])');
          if (downloadBtn) {
            console.log('    Found Download button, clicking...');
            await downloadBtn.click();
            await page.waitForTimeout(2000);

            // Now look for download options that appeared
            downloadLinks = await page.$$eval(
              '[class*="dropdown"] a[href*="download"], ' +
              '[class*="menu"] a[href*="download"], ' +
              '[class*="popover"] a[href*="download"]',
              links => links.map(l => ({
                url: l.href || '',
                text: l.textContent?.trim() || '',
                download: l.getAttribute('download') || ''
              })).filter(l => l.url && l.url.startsWith('http') && !l.url.includes('zoom.us/download'))
            );
          }
        }

        if (downloadLinks.length > 0) {
          // Parse the date from startTime
          let dateStr = new Date().toISOString().substring(0, 10);
          if (rowData.startTime) {
            // Try to parse date from formats like "Jan 15, 2026 01:08 AM"
            const dateMatch = rowData.startTime.match(/([A-Za-z]+)\s+(\d+),?\s+(\d{4})/);
            if (dateMatch) {
              const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                              Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
              const month = months[dateMatch[1]] || '01';
              const day = dateMatch[2].padStart(2, '0');
              const year = dateMatch[3];
              dateStr = `${year}-${month}-${day}`;
            }
          }

          allRecordings.push({
            topic: rowData.topic,
            id: rowData.meetingId,
            date: dateStr,
            host: rowData.host,
            files: downloadLinks
          });
          stats.meetingsFound++;
          stats.filesFound += downloadLinks.length;
          console.log(`    Found ${downloadLinks.length} downloadable files`);
          downloadLinks.forEach(l => console.log(`      - ${l.text || l.url.substring(0, 60)}`));
        } else {
          console.log(`    No download links found for this recording`);
        }

        // Close any expanded section or go back
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);

        // If we navigated away, go back to the list
        if (!page.url().includes('recording/management')) {
          await page.goBack();
          await page.waitForTimeout(2000);
        }

      } catch (err) {
        console.log(`    Error processing row: ${err.message}`);
      }
    }

    // Check for next page - look for pagination
    const nextButton = await page.$(
      'button.ant-pagination-next:not([disabled]), ' +
      '.pagination-next:not(.disabled), ' +
      '[aria-label="Next"]:not([disabled]), ' +
      'li.ant-pagination-next:not(.ant-pagination-disabled), ' +
      '[class*="pagination"] [class*="next"]:not([disabled])'
    );

    if (nextButton) {
      const isDisabled = await nextButton.evaluate(el =>
        el.disabled ||
        el.classList.contains('disabled') ||
        el.classList.contains('ant-pagination-disabled') ||
        el.getAttribute('aria-disabled') === 'true'
      );
      if (!isDisabled) {
        console.log('Clicking next page...');
        await nextButton.click();
        await page.waitForTimeout(3000);
        pageNum++;
      } else {
        console.log('Next button is disabled, reached last page');
        hasNextPage = false;
      }
    } else {
      console.log('No next page button found');
      hasNextPage = false;
    }

    // Safety limit
    if (pageNum > 100) {
      console.log('Reached page limit (100)');
      break;
    }
  }

  return allRecordings;
}

/**
 * Download and upload a single recording file
 */
async function processFile(file, meetingTopic, meetingDate, meetingId) {
  const dateStr = meetingDate || new Date().toISOString().substring(0, 10);
  const safeTopic = sanitizeFilename(meetingTopic);
  const safeId = sanitizeFilename(meetingId || 'unknown');

  // Determine file extension from URL or name
  let ext = 'mp4';
  if (file.url.includes('.m4a') || file.text?.toLowerCase().includes('audio')) ext = 'm4a';
  else if (file.url.includes('.vtt') || file.text?.toLowerCase().includes('transcript')) ext = 'vtt';
  else if (file.url.includes('.txt')) ext = 'txt';
  else if (file.url.includes('.json')) ext = 'json';

  const fileType = file.text?.replace(/\s+/g, '_') || ext;
  const s3Key = `${dateStr}/${safeTopic}_${safeId}_${fileType}.${ext}`;

  // Check if already exists
  if (await fileExistsInS3(s3Key)) {
    if (VERBOSE) console.log(`    Skipping (exists): ${s3Key}`);
    stats.filesSkipped++;
    return;
  }

  if (DRY_RUN) {
    console.log(`    Would download: ${s3Key}`);
    return;
  }

  try {
    console.log(`    Downloading: ${s3Key}`);
    const fileData = await downloadFile(file.url);

    await uploadToS3(s3Key, fileData, getContentType(ext), {
      'zoom-topic': meetingTopic.substring(0, 1024),
      'zoom-date': dateStr,
    });

    console.log(`    Uploaded: ${s3Key} (${formatBytes(fileData.length)})`);
    stats.filesDownloaded++;
    stats.bytesDownloaded += fileData.length;

  } catch (error) {
    console.log(`    Failed: ${error.message}`);
    stats.filesFailed++;
  }
}

/**
 * Main scraping function
 */
async function scrapeRecordings() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('          ZOOM RECORDING SCRAPER → S3');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Headless: ${HEADLESS}`);
  console.log(`S3 Bucket: ${CONFIG.s3Bucket}`);
  if (START_DATE) console.log(`Start Date: ${START_DATE}`);
  if (END_DATE) console.log(`End Date: ${END_DATE}`);
  console.log('───────────────────────────────────────────────────────────────────');

  // Create download directory
  if (!fs.existsSync(CONFIG.downloadDir)) {
    fs.mkdirSync(CONFIG.downloadDir, { recursive: true });
  }

  // Launch browser with more stable settings
  const browser = await chromium.launch({
    headless: HEADLESS,
    slowMo: 50,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  try {
    // Try to load existing cookies
    const hasCookies = await loadCookies(context);

    // Navigate to recordings page
    console.log('\nNavigating to Zoom recordings...');
    await page.goto(CONFIG.zoomRecordingsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: CONFIG.pageLoadTimeout
    });

    // Give the page a moment to settle
    await page.waitForTimeout(2000);

    // Check if we need to login
    const currentUrl = page.url();
    if (currentUrl.includes('signin') || currentUrl.includes('login')) {
      if (HEADLESS && !hasCookies) {
        console.error('\nError: Headless mode requires saved cookies. Run without --headless first to log in.');
        process.exit(1);
      }
      await waitForLogin(page);
      await saveCookies(context);
    }

    // Apply date filters if specified
    if (START_DATE || END_DATE) {
      console.log('\nApplying date filters...');
      // Look for date filter inputs
      const dateInputs = await page.$$('input[type="date"], .ant-picker-input input, [placeholder*="date"]');
      if (dateInputs.length >= 2) {
        if (START_DATE) {
          await dateInputs[0].fill(START_DATE);
        }
        if (END_DATE) {
          await dateInputs[1].fill(END_DATE);
        }
        // Click search/apply button
        await page.click('button:has-text("Search"), button:has-text("Apply"), [class*="search-btn"]').catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    // Take a screenshot for debugging
    await page.screenshot({ path: path.join(CONFIG.downloadDir, 'page-screenshot.png') });
    console.log('Screenshot saved to downloads/page-screenshot.png');

    // Scrape all pages
    console.log('\nStarting to scrape recordings...');
    const recordings = await scrapeAllPages(page);

    console.log(`\nFound ${recordings.length} recordings with ${stats.filesFound} files total`);

    // Process each recording
    for (const recording of recordings) {
      console.log(`\nProcessing: ${recording.topic}`);

      for (const file of recording.files) {
        await processFile(file, recording.topic, recording.date, recording.id);
      }
    }

  } catch (error) {
    console.error('\nError during scraping:', error.message);

    // Take error screenshot
    await page.screenshot({ path: path.join(CONFIG.downloadDir, 'error-screenshot.png') });
    console.log('Error screenshot saved');

  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         SCRAPE COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Meetings Found: ${stats.meetingsFound}`);
  console.log(`Files Found: ${stats.filesFound}`);
  console.log(`Files Downloaded: ${stats.filesDownloaded}`);
  console.log(`Files Skipped: ${stats.filesSkipped}`);
  console.log(`Files Failed: ${stats.filesFailed}`);
  console.log(`Total Downloaded: ${formatBytes(stats.bytesDownloaded)}`);
  console.log('═══════════════════════════════════════════════════════════════════');
}

// Run the scraper
scrapeRecordings().catch(error => {
  console.error('\nFATAL ERROR:', error.message);
  process.exit(1);
});
