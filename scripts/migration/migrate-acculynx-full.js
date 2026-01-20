#!/usr/bin/env node
/**
 * AccuLynx Full Data Migration Script
 *
 * Migrates ALL data from AccuLynx scraper output into Panda CRM:
 * - Comments/messages → Note and Activity records
 * - Contact info → Updates existing Contact records
 * - Address details → Updates existing Account/Opportunity records
 *
 * Supports both JSON arrays and JSONL (one JSON per line) formats.
 *
 * Usage:
 *   node migrate-acculynx-full.js [options]
 *
 * Options:
 *   --dry-run        Preview changes without updating the database
 *   --file <path>    Specific file to process (JSON or JSONL)
 *   --comments-only  Only import comments/messages, skip contact/address updates
 *   --stats-only     Just show stats, don't process
 *   --batch <size>   Batch size for processing (default: 100)
 *   --skip <n>       Skip first N records
 */

// Set DATABASE_URL before importing Prisma
process.env.DATABASE_URL = 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm';

import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Map employee names to user IDs (will be populated at runtime)
let userNameMap = new Map();
let opportunityCache = new Map(); // Cache opportunity lookups

/**
 * Parse arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    commentsOnly: args.includes('--comments-only'),
    statsOnly: args.includes('--stats-only'),
    filePath: null,
    batchSize: 100,
    skip: 0,
  };

  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && args[fileIndex + 1]) {
    options.filePath = args[fileIndex + 1];
  }

  const batchIndex = args.indexOf('--batch');
  if (batchIndex !== -1 && args[batchIndex + 1]) {
    options.batchSize = parseInt(args[batchIndex + 1]);
  }

  const skipIndex = args.indexOf('--skip');
  if (skipIndex !== -1 && args[skipIndex + 1]) {
    options.skip = parseInt(args[skipIndex + 1]);
  }

  return options;
}

/**
 * Read JSONL file line by line
 */
async function* readJsonLines(filePath) {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        yield JSON.parse(line);
      } catch (e) {
        console.error(`  Skipping invalid JSON line: ${line.substring(0, 50)}...`);
      }
    }
  }
}

/**
 * Build map of user names to IDs
 */
async function buildUserMap() {
  console.log('Building user name lookup map...');
  const users = await prisma.user.findMany({
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  for (const user of users) {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().trim();
    if (fullName) userNameMap.set(fullName, user.id);
    if (user.firstName) userNameMap.set(user.firstName.toLowerCase(), user.id);
  }

  console.log(`  Mapped ${userNameMap.size} user name variations`);
}

/**
 * Find user ID by name
 */
function findUserByName(name) {
  if (!name) return null;
  const nameLower = name.toLowerCase().trim();
  if (userNameMap.has(nameLower)) return userNameMap.get(nameLower);
  const firstName = nameLower.split(' ')[0];
  if (userNameMap.has(firstName)) return userNameMap.get(firstName);
  return null;
}

/**
 * Find opportunity by job number with caching
 */
async function findOpportunity(jobNumber) {
  if (!jobNumber) return null;

  // Check cache first
  if (opportunityCache.has(jobNumber)) {
    return opportunityCache.get(jobNumber);
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: {
      OR: [
        { name: { contains: jobNumber } },
        { jobId: jobNumber.replace('Panda Ext-', '') },
      ]
    },
    select: { id: true, name: true, accountId: true, jobId: true },
  });

  // Cache result (even if null)
  opportunityCache.set(jobNumber, opportunity);
  return opportunity;
}

/**
 * Parse date from message text
 */
function parseMessageDate(text) {
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(\d{1,2}:\d{2}\s*(AM|PM))?/i);
  if (dateMatch) {
    let dateStr = dateMatch[1];
    const timeStr = dateMatch[2] || '12:00 PM';

    const dateParts = dateStr.split('/');
    if (dateParts[2].length === 2) {
      const year = parseInt(dateParts[2]);
      dateParts[2] = year > 50 ? `19${dateParts[2]}` : `20${dateParts[2]}`;
    }
    dateStr = dateParts.join('/');

    const fullDateStr = `${dateStr} ${timeStr}`;
    const parsed = new Date(fullDateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

/**
 * Parse sender name from message text
 */
function parseSenderName(text) {
  const pattern1 = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (pattern1) return pattern1[1].trim();

  const pattern2 = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+replied/);
  if (pattern2) return pattern2[1].trim();

  return null;
}

/**
 * Extract clean message content
 */
function extractMessageContent(text) {
  let content = text.replace(/\nReply$/i, '').trim();
  content = content.replace(/\nView Message\n?/g, '\n');
  content = content.replace(/View \d+ more replies\s*/g, '');
  return content.trim();
}

/**
 * Check if message is email
 */
function isEmailMessage(text) {
  return text.includes('Subject:');
}

/**
 * Extract email subject
 */
function extractEmailSubject(text) {
  const match = text.match(/Subject:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract email recipients
 */
function extractEmailRecipients(text) {
  const match = text.match(/To:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Process comments for a job
 */
async function processComments(jobRecord, opportunity, options) {
  const { dryRun = false } = options;
  const results = { notes: 0, activities: 0, errors: [] };

  for (const msg of jobRecord.messages || []) {
    try {
      const content = extractMessageContent(msg.text);
      const senderName = parseSenderName(msg.text);
      const messageDate = parseMessageDate(msg.text);
      const userId = findUserByName(senderName);

      if (isEmailMessage(msg.text)) {
        const subject = extractEmailSubject(msg.text);
        const recipients = extractEmailRecipients(msg.text);

        if (!dryRun) {
          await prisma.activity.create({
            data: {
              type: 'EMAIL_SENT',
              subType: 'OUTBOUND',
              subject: subject || 'Email correspondence',
              description: content.substring(0, 500),
              body: content,
              status: 'SENT',
              sourceType: 'ACCULYNX_IMPORT',
              opportunityId: opportunity.id,
              accountId: opportunity.accountId,
              userId: userId,
              externalEmail: recipients,
              externalName: senderName,
              occurredAt: messageDate || new Date(jobRecord.scrapedAt),
              metadata: {
                acculynxJobId: jobRecord.jobId,
                importedFrom: 'acculynx-scraper',
              },
            },
          });
        }
        results.activities++;
      } else {
        if (!dryRun && userId) {
          await prisma.note.create({
            data: {
              title: senderName ? `Comment by ${senderName}` : 'Internal Note',
              body: content,
              opportunityId: opportunity.id,
              accountId: opportunity.accountId,
              createdById: userId,
              createdAt: messageDate || new Date(jobRecord.scrapedAt),
            },
          });
          results.notes++;
        } else if (!dryRun) {
          await prisma.activity.create({
            data: {
              type: 'NOTE_ADDED',
              subject: senderName ? `Comment by ${senderName}` : 'Internal Note',
              description: content.substring(0, 500),
              body: content,
              sourceType: 'ACCULYNX_IMPORT',
              opportunityId: opportunity.id,
              accountId: opportunity.accountId,
              externalName: senderName,
              occurredAt: messageDate || new Date(jobRecord.scrapedAt),
              metadata: {
                acculynxJobId: jobRecord.jobId,
                importedFrom: 'acculynx-scraper',
              },
            },
          });
          results.activities++;
        } else {
          results.notes++;
        }
      }
    } catch (err) {
      results.errors.push({ message: msg.text?.substring(0, 50), error: err.message });
    }
  }

  return results;
}

/**
 * Process a single job record
 */
async function processJobRecord(jobRecord, options) {
  const { dryRun = false, commentsOnly = false } = options;
  const results = { matched: false, notes: 0, activities: 0, errors: [] };

  const jobNumber = jobRecord.jobNumber;
  if (!jobNumber) {
    results.errors.push({ error: 'No job number' });
    return results;
  }

  // Find opportunity
  const opportunity = await findOpportunity(jobNumber);
  if (!opportunity) {
    results.errors.push({ error: 'Opportunity not found' });
    return results;
  }

  results.matched = true;

  // Process comments
  const commentResults = await processComments(jobRecord, opportunity, options);
  results.notes += commentResults.notes;
  results.activities += commentResults.activities;
  results.errors.push(...commentResults.errors);

  // TODO: Update contact info, address details if !commentsOnly

  return results;
}

/**
 * Show file stats
 */
async function showFileStats(filePath) {
  console.log(`\nAnalyzing: ${path.basename(filePath)}`);

  let totalJobs = 0;
  let totalMessages = 0;
  let jobsWithMessages = 0;
  let jobNumbers = new Set();

  const isJsonl = filePath.endsWith('.jsonl');

  if (isJsonl) {
    for await (const job of readJsonLines(filePath)) {
      totalJobs++;
      if (job.jobNumber) jobNumbers.add(job.jobNumber);
      const msgCount = job.messages?.length || 0;
      totalMessages += msgCount;
      if (msgCount > 0) jobsWithMessages++;
    }
  } else {
    const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const jobs = Array.isArray(data) ? data : [data];
    for (const job of jobs) {
      totalJobs++;
      if (job.jobNumber) jobNumbers.add(job.jobNumber);
      const msgCount = job.messages?.length || 0;
      totalMessages += msgCount;
      if (msgCount > 0) jobsWithMessages++;
    }
  }

  console.log(`  Total jobs: ${totalJobs}`);
  console.log(`  Unique job numbers: ${jobNumbers.size}`);
  console.log(`  Jobs with messages: ${jobsWithMessages}`);
  console.log(`  Total messages: ${totalMessages}`);
  console.log(`  Avg messages per job: ${(totalMessages / Math.max(totalJobs, 1)).toFixed(1)}`);

  return { totalJobs, totalMessages, jobsWithMessages };
}

/**
 * Main migration function
 */
async function migrate(options) {
  console.log('═'.repeat(60));
  console.log('AccuLynx Full Data Migration');
  console.log('═'.repeat(60));
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Comments only: ${options.commentsOnly}`);
  console.log('');

  try {
    // Build user map
    await buildUserMap();

    // Find files to process
    let files = [];
    if (options.filePath) {
      files = [options.filePath];
    } else {
      const outputDir = path.join(__dirname, '../acculynx-scraper/output');
      const allFiles = await fs.readdir(outputDir);
      files = allFiles
        .filter(f => (f.endsWith('.json') && f.startsWith('messages-')) || f.endsWith('.jsonl'))
        .map(f => path.join(outputDir, f));
    }

    if (files.length === 0) {
      console.log('No files found to process.');
      console.log('Looking in: scripts/acculynx-scraper/output/');
      console.log('Expected: messages-*.json or *.jsonl files');
      return;
    }

    console.log(`Found ${files.length} file(s) to process`);

    // Stats only mode
    if (options.statsOnly) {
      for (const file of files) {
        await showFileStats(file);
      }
      return;
    }

    // Process files
    const totals = { processed: 0, matched: 0, notes: 0, activities: 0, errors: [] };
    let skipped = 0;

    for (const file of files) {
      console.log(`\nProcessing: ${path.basename(file)}`);

      const isJsonl = file.endsWith('.jsonl');
      let jobIterator;

      if (isJsonl) {
        jobIterator = readJsonLines(file);
      } else {
        const data = JSON.parse(await fs.readFile(file, 'utf8'));
        jobIterator = (Array.isArray(data) ? data : [data])[Symbol.iterator]();
      }

      for await (const job of jobIterator) {
        // Skip if needed
        if (skipped < options.skip) {
          skipped++;
          if (skipped % 1000 === 0) console.log(`  Skipped ${skipped} records...`);
          continue;
        }

        totals.processed++;
        const jobNum = job.jobNumber || job.jobName || job.jobId;

        if (totals.processed % 100 === 0) {
          console.log(`  Processed ${totals.processed} jobs (matched: ${totals.matched}, notes: ${totals.notes}, activities: ${totals.activities})`);
        }

        const results = await processJobRecord(job, options);

        if (results.matched) totals.matched++;
        totals.notes += results.notes;
        totals.activities += results.activities;

        if (results.errors.length > 0) {
          totals.errors.push({ job: jobNum, errors: results.errors });
        }

        // Clear cache periodically to avoid memory issues
        if (totals.processed % 1000 === 0) {
          opportunityCache.clear();
        }
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Jobs processed: ${totals.processed}`);
    console.log(`Jobs matched to CRM: ${totals.matched}`);
    console.log(`Notes created: ${totals.notes}`);
    console.log(`Activities created: ${totals.activities}`);
    console.log(`Jobs with errors: ${totals.errors.length}`);

    if (totals.errors.length > 0 && totals.errors.length <= 20) {
      console.log('\nError details:');
      totals.errors.forEach(e => {
        console.log(`  ${e.job}: ${e.errors.map(x => x.error).join(', ')}`);
      });
    }

    if (options.dryRun) {
      console.log('\n[DRY RUN] No changes were made.');
    }

    return totals;

  } finally {
    await prisma.$disconnect();
  }
}

// Run
const options = parseArgs();
migrate(options)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
