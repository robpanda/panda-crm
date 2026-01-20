/**
 * Import GTR Advocates into Champions table
 *
 * This script imports the GTR referral advocates from the exported CSV
 * and creates Champion records, avoiding duplicates by email.
 *
 * Usage:
 *   node import-gtr-champions.js [--dry-run] [--file path/to/file.csv]
 */

import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

// Configuration
const DEFAULT_CSV_PATH = '/Users/robwinters/Downloads/exportData (6).csv';

function generateReferralCode() {
  // Generate a unique referral code like "PANDA-XXXXX"
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PANDA-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function normalizeState(state) {
  if (!state) return null;

  // Map common variations to standard 2-letter codes
  const stateMap = {
    'north carolina': 'NC',
    'south carolina': 'SC',
    'north carolila': 'NC', // typo in data
    'maryland': 'MD',
    'delaware': 'DE',
    'virginia': 'VA',
    'new jersey': 'NJ',
    'florida': 'FL',
    'tennessee': 'TN',
    'georgia': 'GA',
    'pennsylvania': 'PA',
  };

  const normalized = state.trim().toLowerCase();
  if (stateMap[normalized]) {
    return stateMap[normalized];
  }

  // Already a 2-letter code
  if (state.trim().length === 2) {
    return state.trim().toUpperCase();
  }

  return state.trim();
}

function parsePhoneNumber(phone) {
  if (!phone) return null;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return phone;
}

function parseCurrency(value) {
  if (!value) return 0;
  // Remove $ and commas
  const cleaned = value.replace(/[$,]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

async function importChampions(csvPath, isDryRun = false) {
  console.log('═'.repeat(60));
  console.log('GTR CHAMPIONS IMPORT');
  console.log('═'.repeat(60));
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`File: ${csvPath}`);
  console.log('');

  // Read and parse CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true, // Allow variable column counts
  });

  console.log(`Found ${records.length} records in CSV`);
  console.log('');

  // Get existing champions by email to avoid duplicates
  const existingChampions = await prisma.champion.findMany({
    select: { email: true, id: true },
  });
  const existingEmails = new Set(existingChampions.map(c => c.email.toLowerCase()));
  console.log(`Found ${existingEmails.size} existing champions in database`);

  // Also check for matching contacts (to link later)
  const existingContacts = await prisma.contact.findMany({
    where: {
      email: { not: null },
    },
    select: { id: true, email: true },
  });
  const contactsByEmail = new Map(existingContacts.map(c => [c.email.toLowerCase(), c.id]));
  console.log(`Found ${contactsByEmail.size} contacts with emails`);
  console.log('');

  const stats = {
    total: records.length,
    created: 0,
    skipped_duplicate: 0,
    skipped_no_email: 0,
    skipped_unsubscribed: 0,
    errors: 0,
    also_contact: 0,
  };

  const championsToCreate = [];

  for (const record of records) {
    const email = record['Email ID']?.trim()?.toLowerCase();

    // Skip records without email
    if (!email) {
      stats.skipped_no_email++;
      continue;
    }

    // Skip if already exists
    if (existingEmails.has(email)) {
      stats.skipped_duplicate++;
      continue;
    }

    // Skip unsubscribed users
    if (record['Unsubscribed At']?.trim()) {
      stats.skipped_unsubscribed++;
      continue;
    }

    // Parse name
    const { firstName, lastName } = parseName(record['Name']);

    // Generate unique referral code
    let referralCode;
    let attempts = 0;
    do {
      referralCode = generateReferralCode();
      attempts++;
    } while (attempts < 10 && await prisma.champion.findUnique({ where: { referralCode } }));

    const championData = {
      email,
      firstName: firstName || 'Unknown',
      lastName: lastName || '',
      phone: parsePhoneNumber(record['Phone']),
      street: record['Street1'] || null,
      city: record['City'] || null,
      state: normalizeState(record['State']),
      zipCode: record['Zip'] || null,
      referralCode,
      status: 'ACTIVE',
      totalReferrals: parseInt(record['Total Referrals Submitted']) || 0,
      totalEarnings: parseCurrency(record['Total Paid']),
      paidEarnings: parseCurrency(record['Total Paid']),
      createdAt: record['Registered On'] ? new Date(record['Registered On']) : new Date(),
    };

    // Check if this person is also a contact
    if (contactsByEmail.has(email)) {
      stats.also_contact++;
    }

    championsToCreate.push(championData);
    existingEmails.add(email); // Prevent duplicates within the batch
  }

  console.log('─'.repeat(60));
  console.log('IMPORT SUMMARY');
  console.log('─'.repeat(60));
  console.log(`Total records in CSV:     ${stats.total}`);
  console.log(`To be created:            ${championsToCreate.length}`);
  console.log(`Skipped (duplicate):      ${stats.skipped_duplicate}`);
  console.log(`Skipped (no email):       ${stats.skipped_no_email}`);
  console.log(`Skipped (unsubscribed):   ${stats.skipped_unsubscribed}`);
  console.log(`Also existing contacts:   ${stats.also_contact}`);
  console.log('');

  if (isDryRun) {
    console.log('DRY RUN - No changes made');
    console.log('');
    console.log('Sample of champions to be created:');
    championsToCreate.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.firstName} ${c.lastName} <${c.email}> - ${c.city}, ${c.state}`);
    });
    if (championsToCreate.length > 5) {
      console.log(`  ... and ${championsToCreate.length - 5} more`);
    }
  } else {
    console.log('Creating champions...');

    // Batch create in chunks of 100
    const batchSize = 100;
    for (let i = 0; i < championsToCreate.length; i += batchSize) {
      const batch = championsToCreate.slice(i, i + batchSize);

      for (const championData of batch) {
        try {
          await prisma.champion.create({
            data: championData,
          });
          stats.created++;
        } catch (error) {
          console.error(`Error creating champion ${championData.email}:`, error.message);
          stats.errors++;
        }
      }

      console.log(`  Created ${Math.min(i + batchSize, championsToCreate.length)} of ${championsToCreate.length}`);
    }

    console.log('');
    console.log('═'.repeat(60));
    console.log('IMPORT COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Created:  ${stats.created}`);
    console.log(`Errors:   ${stats.errors}`);
  }

  await prisma.$disconnect();
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const fileIndex = args.indexOf('--file');
const csvPath = fileIndex !== -1 && args[fileIndex + 1]
  ? args[fileIndex + 1]
  : DEFAULT_CSV_PATH;

// Check if file exists
if (!fs.existsSync(csvPath)) {
  console.error(`Error: File not found: ${csvPath}`);
  process.exit(1);
}

importChampions(csvPath, isDryRun).catch(console.error);
