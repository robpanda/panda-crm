#!/usr/bin/env node
/**
 * AccuLynx Document & Photo Recovery
 *
 * Scrapes documents and photos from AccuLynx jobs that don't already exist in Panda CRM.
 * Downloads files to S3 and creates document records in the database.
 *
 * Usage:
 *   node recover-documents.js                    # Process all jobs
 *   node recover-documents.js --dry-run          # Preview without downloading
 *   node recover-documents.js --job-id=xxx       # Process single job
 */
import { chromium } from 'playwright';
import { existsSync, appendFileSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../../shared/node_modules/@prisma/client');
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const CONFIG = {
  baseUrl: 'https://my.acculynx.com',
  apiUrl: 'https://api.acculynx.com/api/v2',
  apiKey: 'OGMyNGZhN2EtMTI3ZS00NzdkLWIyZDktNTZjZmYwMThjYWIyYTQ4Nzc3ODQtMDZiMC00M2Y3LWIyMWItNGFiNDU3MWVhZDNi',
  outputDir: './output',
  delayBetweenJobs: 2000,
  browserRestartEvery: 30,
  username: 'robwinters@pandaexteriors.com',
  password: '@rWSf@F38kv@.w4',
  s3Bucket: 'panda-crm-documents',
  s3Region: 'us-east-2'
};

const OUTPUT_FILE = path.join(CONFIG.outputDir, 'recovered-documents.jsonl');
const PROGRESS_FILE = path.join(CONFIG.outputDir, 'progress-documents.json');

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: CONFIG.s3Region });

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SINGLE_JOB = args.find(a => a.startsWith('--job-id='))?.split('=')[1];

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
  const data = {
    ...progress,
    processedIds: Array.from(progress.processedIds),
    lastUpdate: new Date().toISOString()
  };
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch (e) {}
}

function saveDocumentRecord(data) {
  appendFileSync(OUTPUT_FILE, JSON.stringify(data) + '\n');
}

// Get existing document URLs/hashes from Panda CRM for an opportunity
async function getExistingDocuments(opportunityId) {
  if (!opportunityId) return new Set();

  const existing = await prisma.documentLink.findMany({
    where: { opportunityId },
    include: { document: { select: { id: true, fileName: true, contentUrl: true } } }
  });

  // Return set of filenames for deduplication
  return new Set(existing.map(d => d.document?.fileName?.toLowerCase()).filter(Boolean));
}

// Find Panda CRM opportunity by AccuLynx job number
async function findOpportunityByJobNumber(jobNumber) {
  if (!jobNumber) return null;

  // Try exact match on jobId field
  let opp = await prisma.opportunity.findFirst({
    where: { jobId: jobNumber },
    select: { id: true, accountId: true, name: true }
  });

  if (opp) return opp;

  // Try matching "Panda Ext-XXXXX" pattern in name
  const match = jobNumber.match(/(\d{4,6})/);
  if (match) {
    opp = await prisma.opportunity.findFirst({
      where: {
        OR: [
          { name: { contains: `Panda Ext-${match[1]}` } },
          { jobId: { contains: match[1] } }
        ]
      },
      select: { id: true, accountId: true, name: true }
    });
  }

  return opp;
}

// Upload file to S3
async function uploadToS3(fileBuffer, fileName, contentType, opportunityId) {
  const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
  const ext = path.extname(fileName) || '.bin';
  const s3Key = `acculynx/${opportunityId || 'orphan'}/${fileHash}${ext}`;

  // Check if already exists
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: CONFIG.s3Bucket,
      Key: s3Key
    }));
    console.log(`    [SKIP] Already in S3: ${fileName}`);
    return { exists: true, url: `https://${CONFIG.s3Bucket}.s3.${CONFIG.s3Region}.amazonaws.com/${s3Key}` };
  } catch (e) {
    // File doesn't exist, proceed to upload
  }

  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Would upload: ${fileName} (${fileBuffer.length} bytes)`);
    return { dryRun: true };
  }

  await s3Client.send(new PutObjectCommand({
    Bucket: CONFIG.s3Bucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: contentType || 'application/octet-stream'
  }));

  return {
    uploaded: true,
    url: `https://${CONFIG.s3Bucket}.s3.${CONFIG.s3Region}.amazonaws.com/${s3Key}`,
    s3Key
  };
}

// Create document record in Panda CRM
async function createDocumentRecord(docData, opportunityId, accountId) {
  if (DRY_RUN) {
    console.log(`    [DRY-RUN] Would create document: ${docData.fileName}`);
    return null;
  }

  const document = await prisma.document.create({
    data: {
      title: docData.title || docData.fileName,
      fileName: docData.fileName,
      fileType: docData.fileType,
      fileExtension: docData.fileExtension,
      contentSize: docData.contentSize,
      contentUrl: docData.contentUrl,
      sourceType: 'ACCULYNX_IMPORT',
      metadata: {
        acculynxJobId: docData.acculynxJobId,
        acculynxDocId: docData.acculynxDocId,
        importedAt: new Date().toISOString()
      }
    }
  });

  // Create link to opportunity if available
  if (opportunityId) {
    await prisma.documentLink.create({
      data: {
        documentId: document.id,
        opportunityId,
        accountId,
        linkedRecordType: 'OPPORTUNITY'
      }
    });
  }

  return document;
}

async function fetchAllJobIds() {
  if (SINGLE_JOB) {
    return [{ id: SINGLE_JOB, jobNumber: SINGLE_JOB }];
  }

  console.log('Fetching all job IDs from AccuLynx API...');
  const allJobs = [];
  let startIndex = 0;
  const pageSize = 25;

  while (true) {
    const url = `${CONFIG.apiUrl}/jobs?pageSize=${pageSize}${startIndex > 0 ? `&pageStartIndex=${startIndex}` : ''}`;
    try {
      const resp = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + CONFIG.apiKey }
      });
      if (!resp.ok) break;
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
      if (pageNum % 50 === 0) {
        console.log(`  Fetched page ${pageNum}: ${allJobs.length}/${data.count}`);
      }

      if (allJobs.length >= data.count) break;
      startIndex += pageSize;
      await new Promise(r => setTimeout(r, 50));
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
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    acceptDownloads: true
  });
  const page = await context.newPage();
  return { browser, context, page };
}

async function doLogin(page) {
  console.log('Logging in to AccuLynx...');
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

async function scrapeDocumentsPage(page, jobId, jobNumber) {
  const documents = [];

  // First navigate to the main job page to ensure session is valid
  await page.goto(`${CONFIG.baseUrl}/jobs/${jobId}`, {
    waitUntil: 'networkidle',
    timeout: 45000
  });

  const mainUrl = page.url();
  console.log(`      Job page URL: ${mainUrl}`);

  if (mainUrl.includes('signin') || mainUrl.includes('identity')) {
    throw new Error('NEEDS_LOGIN');
  }

  // Wait a moment then navigate to documents tab
  await page.waitForTimeout(1000);

  // Try clicking the Documents tab if it exists
  const docsTab = await page.$('a[href*="documents"], button:has-text("Documents"), [data-tab="documents"]');
  if (docsTab) {
    console.log('      Clicking Documents tab...');
    await docsTab.click();
    await page.waitForTimeout(2000);
  } else {
    // Try direct navigation to documents
    await page.goto(`${CONFIG.baseUrl}/jobs/${jobId}/documents`, {
      waitUntil: 'networkidle',
      timeout: 45000
    });

    if (page.url().includes('signin') || page.url().includes('identity')) {
      throw new Error('NEEDS_LOGIN');
    }
  }

  await page.waitForTimeout(1000);

  // Extract document information from the page
  const docData = await page.evaluate(() => {
    const docs = [];

    // Look for document rows/cards
    const docElements = document.querySelectorAll('[data-document-id], .document-row, .document-item, tr[data-id]');
    docElements.forEach(el => {
      const name = el.querySelector('.document-name, .file-name, a')?.innerText?.trim();
      const link = el.querySelector('a[href*="download"], a[href*="document"]')?.href;
      const size = el.querySelector('.file-size, .size')?.innerText?.trim();
      const date = el.querySelector('.date, .created-date, .modified-date')?.innerText?.trim();
      const docId = el.getAttribute('data-document-id') || el.getAttribute('data-id');

      if (name || link) {
        docs.push({ name, link, size, date, docId });
      }
    });

    // Also look for download links in general
    const downloadLinks = document.querySelectorAll('a[href*="/download"], a[download]');
    downloadLinks.forEach(el => {
      const name = el.innerText?.trim() || el.getAttribute('download') || 'unknown';
      const link = el.href;
      if (link && !docs.find(d => d.link === link)) {
        docs.push({ name, link });
      }
    });

    return docs;
  });

  return docData;
}

async function scrapePhotosPage(page, jobId, jobNumber) {
  const photos = [];

  // Try clicking the Photos tab if we're already on the job page
  const photosTab = await page.$('a[href*="photos"], button:has-text("Photos"), [data-tab="photos"]');
  if (photosTab) {
    console.log('      Clicking Photos tab...');
    await photosTab.click();
    await page.waitForTimeout(2000);
  } else {
    // Navigate to job photos page
    await page.goto(`${CONFIG.baseUrl}/jobs/${jobId}/photos`, {
      waitUntil: 'networkidle',
      timeout: 45000
    });

    if (page.url().includes('signin') || page.url().includes('identity')) {
      throw new Error('NEEDS_LOGIN');
    }
  }

  await page.waitForTimeout(1000);

  // Extract photo information
  const photoData = await page.evaluate(() => {
    const photos = [];

    // Look for image elements
    const imgElements = document.querySelectorAll('img[src*="photo"], img[src*="image"], .photo-thumbnail img, .gallery-item img');
    imgElements.forEach(el => {
      const src = el.src;
      const fullSrc = el.getAttribute('data-full-src') || el.getAttribute('data-original') || src;
      const alt = el.alt || '';
      const title = el.title || '';

      if (src && !src.includes('placeholder') && !src.includes('avatar')) {
        photos.push({
          thumbnail: src,
          fullSize: fullSrc,
          name: alt || title || 'photo',
          photoId: el.getAttribute('data-id') || el.getAttribute('data-photo-id')
        });
      }
    });

    // Look for photo gallery links
    const galleryLinks = document.querySelectorAll('a[href*="photo"], a[data-photo-id]');
    galleryLinks.forEach(el => {
      const href = el.href;
      const img = el.querySelector('img');
      if (href && !photos.find(p => p.fullSize === href)) {
        photos.push({
          fullSize: href,
          thumbnail: img?.src,
          name: el.title || el.innerText?.trim() || 'photo'
        });
      }
    });

    return photos;
  });

  return photoData;
}

async function downloadFile(page, url) {
  try {
    // Use page context to download (maintains session)
    const response = await page.request.get(url);
    if (response.ok()) {
      const buffer = await response.body();
      const contentType = response.headers()['content-type'] || 'application/octet-stream';
      return { buffer, contentType };
    }
  } catch (e) {
    console.log(`    Download error: ${e.message}`);
  }
  return null;
}

async function processJob(page, job, existingFilenames) {
  const jobLabel = (job.jobNumber || job.jobName || job.id).substring(0, 40).padEnd(40);
  const results = { documents: 0, photos: 0, skipped: 0, errors: 0 };

  // Find matching opportunity in Panda CRM
  const opportunity = await findOpportunityByJobNumber(job.jobNumber || job.jobName);
  const oppId = opportunity?.id;
  const accId = opportunity?.accountId;

  try {
    // Scrape documents
    console.log(`  [DOCS] ${jobLabel}`);
    const docs = await scrapeDocumentsPage(page, job.id, job.jobNumber);

    for (const doc of docs) {
      const fileName = doc.name?.toLowerCase();
      if (existingFilenames.has(fileName)) {
        results.skipped++;
        continue;
      }

      if (doc.link) {
        const fileData = await downloadFile(page, doc.link);
        if (fileData) {
          const ext = path.extname(doc.name) || '.pdf';
          const s3Result = await uploadToS3(fileData.buffer, doc.name, fileData.contentType, oppId);

          if (s3Result.uploaded || s3Result.dryRun) {
            await createDocumentRecord({
              title: doc.name,
              fileName: doc.name,
              fileType: fileData.contentType.split('/')[0],
              fileExtension: ext.replace('.', ''),
              contentSize: fileData.buffer.length,
              contentUrl: s3Result.url,
              acculynxJobId: job.id,
              acculynxDocId: doc.docId
            }, oppId, accId);
            results.documents++;
          }
        }
      }
    }

    // Scrape photos
    console.log(`  [PHOTOS] ${jobLabel}`);
    const photos = await scrapePhotosPage(page, job.id, job.jobNumber);

    for (const photo of photos) {
      const photoUrl = photo.fullSize || photo.thumbnail;
      if (!photoUrl) continue;

      const fileName = `${photo.name || 'photo'}_${photo.photoId || Date.now()}.jpg`;
      if (existingFilenames.has(fileName.toLowerCase())) {
        results.skipped++;
        continue;
      }

      const fileData = await downloadFile(page, photoUrl);
      if (fileData) {
        const s3Result = await uploadToS3(fileData.buffer, fileName, fileData.contentType, oppId);

        if (s3Result.uploaded || s3Result.dryRun) {
          await createDocumentRecord({
            title: photo.name || 'Photo',
            fileName: fileName,
            fileType: 'image',
            fileExtension: 'jpg',
            contentSize: fileData.buffer.length,
            contentUrl: s3Result.url,
            acculynxJobId: job.id,
            acculynxDocId: photo.photoId
          }, oppId, accId);
          results.photos++;
        }
      }
    }

    console.log(`  [OK] ${jobLabel} - Docs: ${results.documents}, Photos: ${results.photos}, Skipped: ${results.skipped}`);

    saveDocumentRecord({
      jobId: job.id,
      jobNumber: job.jobNumber,
      opportunityId: oppId,
      documentsFound: docs.length,
      photosFound: photos.length,
      documentsImported: results.documents,
      photosImported: results.photos,
      skipped: results.skipped,
      processedAt: new Date().toISOString()
    });

    return { success: true, results };

  } catch (e) {
    if (e.message === 'NEEDS_LOGIN') {
      throw e; // Re-throw for login handling
    }
    console.log(`  [ERR] ${jobLabel} - ${e.message}`);
    results.errors++;
    return { error: true, results };
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('AccuLynx Document & Photo Recovery');
  console.log('═'.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no downloads)' : 'LIVE'}`);
  if (SINGLE_JOB) console.log(`Single job: ${SINGLE_JOB}`);
  console.log('');

  // Fetch all jobs
  const allJobs = await fetchAllJobIds();

  // Load progress
  const progress = loadProgress();
  console.log(`Previously processed: ${progress.processedIds.size}`);

  // Filter to unprocessed jobs
  const toProcess = allJobs.filter(job => !progress.processedIds.has(job.id));
  console.log(`Jobs to process: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('All jobs already processed!');
    await prisma.$disconnect();
    return;
  }

  let browserState = null;
  let jobsSinceBrowserStart = 0;
  let totals = { documents: 0, photos: 0, skipped: 0, errors: 0 };

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

    console.log(`\n[${i + 1}/${toProcess.length}] Processing ${job.jobNumber || job.jobName || job.id}`);

    // Get existing documents for this job's opportunity
    const opportunity = await findOpportunityByJobNumber(job.jobNumber || job.jobName);
    const existingFilenames = await getExistingDocuments(opportunity?.id);

    try {
      const result = await processJob(browserState.page, job, existingFilenames);

      if (result.results) {
        totals.documents += result.results.documents;
        totals.photos += result.results.photos;
        totals.skipped += result.results.skipped;
        totals.errors += result.results.errors;
      }
    } catch (e) {
      if (e.message === 'NEEDS_LOGIN') {
        console.log('Session expired, re-logging in...');
        await doLogin(browserState.page);
        i--; // Retry this job
        continue;
      }
      totals.errors++;
    }

    progress.processedIds.add(job.id);
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

  await prisma.$disconnect();

  console.log('\n' + '═'.repeat(70));
  console.log('Recovery Complete!');
  console.log('═'.repeat(70));
  console.log(`Documents imported: ${totals.documents}`);
  console.log(`Photos imported: ${totals.photos}`);
  console.log(`Skipped (already exist): ${totals.skipped}`);
  console.log(`Errors: ${totals.errors}`);
  console.log(`Total jobs processed: ${progress.processedIds.size}`);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  prisma.$disconnect();
  process.exit(1);
});
