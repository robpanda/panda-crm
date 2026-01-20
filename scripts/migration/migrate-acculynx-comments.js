#!/usr/bin/env node
/**
 * AccuLynx Comments Migration Script
 *
 * Migrates comments and messages from AccuLynx scraper output into Panda CRM.
 * Matches jobs by jobNumber (e.g., "Panda Ext-15405") to Opportunities.
 *
 * Creates:
 * - Note records for internal employee comments
 * - Activity records for email correspondence (with type EMAIL)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node migrate-acculynx-comments.js [--dry-run] [--file path/to/messages.json]
 *
 * Options:
 *   --dry-run    Preview changes without updating the database
 *   --file       Specific JSON file to process (otherwise processes all in acculynx-scraper/output)
 */

import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// System user ID for imported records (or null to skip createdBy)
const SYSTEM_USER_ID = null; // Will try to match by employee name

// Map employee names to user IDs (will be populated at runtime)
let userNameMap = new Map();

/**
 * Parse a date from AccuLynx message text
 * Formats: "6/25/25 9:40 AM", "12/6/24 2:26 PM"
 */
function parseMessageDate(text) {
  // Pattern 1: "Jun 24, 2022 6:21 AM" or "Aug 20, 2024 2:16 PM"
  const monthNamePattern = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(AM|PM))?/i);
  if (monthNamePattern) {
    const monthStr = monthNamePattern[1];
    const day = monthNamePattern[2];
    const year = monthNamePattern[3];
    const timeStr = monthNamePattern[4] || '12:00 PM';
    const fullDateStr = `${monthStr} ${day}, ${year} ${timeStr}`;
    const parsed = new Date(fullDateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Pattern 2: "June 24th, 2022" or "April 23rd, 2024"
  const longMonthPattern = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (longMonthPattern) {
    const monthStr = longMonthPattern[1];
    const day = longMonthPattern[2];
    const year = longMonthPattern[3];
    const fullDateStr = `${monthStr} ${day}, ${year}`;
    const parsed = new Date(fullDateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // Pattern 3: "6/25/25 9:40 AM" or "12/6/24"
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(\d{1,2}:\d{2}\s*(AM|PM))?/i);
  if (dateMatch) {
    let dateStr = dateMatch[1];
    const timeStr = dateMatch[2] || '12:00 PM';

    // Convert 2-digit year to 4-digit
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
 * Format: "Jason San Martin  6/25/25 9:40 AM" or "Brian Ayers replied a year ago"
 */
function parseSenderName(text) {
  // Pattern 1: "Name  Date Time"
  const pattern1 = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (pattern1) {
    return pattern1[1].trim();
  }

  // Pattern 2: "Name replied X ago"
  const pattern2 = text.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+replied/);
  if (pattern2) {
    return pattern2[1].trim();
  }

  // Pattern 3: Just initials and date "JM\n\n6/25/25"
  const pattern3 = text.match(/^([A-Z]{2})\n+\n*(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (pattern3) {
    return pattern3[1]; // Return initials
  }

  return null;
}

/**
 * Extract clean message content from scraped text
 */
function extractMessageContent(text) {
  // Remove the "Reply" button text at end
  let content = text.replace(/\nReply$/i, '').trim();

  // Remove "View Message" links
  content = content.replace(/\nView Message\n?/g, '\n');
  content = content.replace(/View \d+ more replies\s*/g, '');

  return content.trim();
}

/**
 * Determine if a message is an email (has Subject line) or internal comment
 */
function isEmailMessage(text) {
  return text.includes('Subject:');
}

/**
 * Extract email subject from message
 */
function extractEmailSubject(text) {
  const match = text.match(/Subject:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
}

/**
 * Extract email recipients from message
 */
function extractEmailRecipients(text) {
  const match = text.match(/To:\s*([^\n]+)/);
  return match ? match[1].trim() : null;
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
    const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
    userNameMap.set(fullName, user.id);

    // Also map by first name only for "Jason" -> "Jason Daniel" type matches
    if (user.firstName) {
      userNameMap.set(user.firstName.toLowerCase(), user.id);
    }
  }

  console.log(`  Mapped ${userNameMap.size} user name variations`);
  return userNameMap;
}

/**
 * Find user ID by name
 */
function findUserByName(name) {
  if (!name) return null;

  const nameLower = name.toLowerCase().trim();

  // Direct match
  if (userNameMap.has(nameLower)) {
    return userNameMap.get(nameLower);
  }

  // Try first name only
  const firstName = nameLower.split(' ')[0];
  if (userNameMap.has(firstName)) {
    return userNameMap.get(firstName);
  }

  return null;
}

/**
 * Process a single scraped job record
 */
async function processJobRecord(jobRecord, options = {}) {
  const { dryRun = false } = options;
  const results = { notes: 0, activities: 0, errors: [] };

  const jobNumber = jobRecord.jobNumber; // e.g., "Panda Ext-15405"
  if (!jobNumber) {
    results.errors.push({ job: jobRecord.jobId, error: 'No job number' });
    return results;
  }

  // Find the opportunity by name matching the job number
  const opportunity = await prisma.opportunity.findFirst({
    where: {
      name: { contains: jobNumber },
    },
    select: { id: true, name: true, accountId: true },
  });

  if (!opportunity) {
    results.errors.push({ job: jobNumber, error: 'Opportunity not found' });
    return results;
  }

  console.log(`  Matched ${jobNumber} to Opportunity: ${opportunity.id}`);

  // Process each message
  for (const msg of jobRecord.messages || []) {
    try {
      // Messages can be strings or objects with .text property
      const msgText = typeof msg === 'string' ? msg : (msg.text || msg.html || '');
      if (!msgText || msgText.length < 10) continue;

      const content = extractMessageContent(msgText);
      const senderName = parseSenderName(msgText);
      const messageDate = parseMessageDate(msgText);
      const userId = findUserByName(senderName);

      if (isEmailMessage(msgText)) {
        // Create Activity record for email
        const subject = extractEmailSubject(msgText);
        const recipients = extractEmailRecipients(msgText);

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
                originalText: msgText.substring(0, 1000),
              },
            },
          });
        }
        results.activities++;
      } else {
        // Create Note record for internal comment
        if (!dryRun && userId) {
          // Only create notes if we can identify the creator
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
          // No user found - create as Activity instead (doesn't require createdById)
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
          // Dry run - count as note
          results.notes++;
        }
      }
    } catch (err) {
      const msgPreview = typeof msg === 'string' ? msg.substring(0, 100) : (msg?.text || '').substring(0, 100);
      results.errors.push({ job: jobNumber, message: msgPreview, error: err.message });
    }
  }

  return results;
}

/**
 * Main migration function
 */
async function migrateAccuLynxComments(options = {}) {
  const { dryRun = false, filePath = null } = options;

  console.log('═'.repeat(60));
  console.log('AccuLynx Comments Migration');
  console.log('═'.repeat(60));
  console.log(`Dry Run: ${dryRun}`);
  console.log('');

  try {
    // Build user lookup map
    await buildUserMap();

    // Find JSON files to process
    let jsonFiles = [];
    if (filePath) {
      jsonFiles = [filePath];
    } else {
      // Look for all JSON files in acculynx-scraper/output
      const outputDir = path.join(__dirname, '../acculynx-scraper/output');
      const files = await fs.readdir(outputDir);
      jsonFiles = files
        .filter(f => f.endsWith('.json') && f.startsWith('messages-'))
        .map(f => path.join(outputDir, f));
    }

    console.log(`Found ${jsonFiles.length} JSON file(s) to process`);

    // Track overall results
    const totals = { jobs: 0, notes: 0, activities: 0, errors: [] };

    // Process each file
    for (const file of jsonFiles) {
      console.log(`\nProcessing: ${path.basename(file)}`);

      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      const jobs = Array.isArray(data) ? data : [data];

      console.log(`  Contains ${jobs.length} job(s)`);

      for (const job of jobs) {
        console.log(`\nJob: ${job.jobNumber || job.jobName || job.jobId}`);
        const results = await processJobRecord(job, { dryRun });

        totals.jobs++;
        totals.notes += results.notes;
        totals.activities += results.activities;
        totals.errors.push(...results.errors);

        console.log(`  Notes: ${results.notes}, Activities: ${results.activities}, Errors: ${results.errors.length}`);
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Jobs processed: ${totals.jobs}`);
    console.log(`Notes created: ${totals.notes}`);
    console.log(`Activities created: ${totals.activities}`);
    console.log(`Errors: ${totals.errors.length}`);

    if (totals.errors.length > 0) {
      console.log('\nSample errors:');
      totals.errors.slice(0, 10).forEach(e => {
        console.log(`  - ${e.job}: ${e.error}`);
      });
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No changes were made. Run without --dry-run to apply.');
    }

    return totals;

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    filePath: null,
  };

  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1 && args[fileIndex + 1]) {
    options.filePath = args[fileIndex + 1];
  }

  return options;
}

// Run if called directly
const options = parseArgs();
migrateAccuLynxComments(options)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { migrateAccuLynxComments };
