#!/usr/bin/env node
/**
 * Backfill Job IDs for Historical Opportunities
 *
 * This script assigns Job IDs to existing opportunities that don't have one.
 * Job IDs are assigned sequentially per year based on the opportunity's creation date.
 *
 * Format: YYYY-NNNN (e.g., 2024-1000, 2024-1001, 2025-1000)
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node backfill-job-ids.js [--dry-run] [--year YYYY]
 *
 * Options:
 *   --dry-run    Preview changes without updating the database
 *   --year YYYY  Only process opportunities from a specific year
 */

import { PrismaClient, Prisma } from '../../shared/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

// Job ID configuration - same as in other files
const JOB_ID_STARTING_NUMBER = 999; // First job will be 1000

async function backfillJobIds(options = {}) {
  const { dryRun = false, targetYear = null } = options;

  console.log('='.repeat(60));
  console.log('Job ID Backfill Script');
  console.log('='.repeat(60));
  console.log(`Dry Run: ${dryRun}`);
  console.log(`Target Year: ${targetYear || 'All years'}`);
  console.log('');

  try {
    // Build where clause
    const whereClause = {
      jobId: null, // Only opportunities without a Job ID
    };

    if (targetYear) {
      const startDate = new Date(`${targetYear}-01-01T00:00:00Z`);
      const endDate = new Date(`${parseInt(targetYear) + 1}-01-01T00:00:00Z`);
      whereClause.createdAt = {
        gte: startDate,
        lt: endDate,
      };
    }

    // Get all opportunities without Job IDs, ordered by creation date
    const opportunities = await prisma.opportunity.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        jobId: true,
      },
    });

    console.log(`Found ${opportunities.length} opportunities without Job IDs`);

    if (opportunities.length === 0) {
      console.log('No opportunities to process.');
      return { processed: 0, byYear: {} };
    }

    // Group opportunities by year
    const opportunitiesByYear = {};
    for (const opp of opportunities) {
      const year = new Date(opp.createdAt).getFullYear();
      if (!opportunitiesByYear[year]) {
        opportunitiesByYear[year] = [];
      }
      opportunitiesByYear[year].push(opp);
    }

    console.log('\nOpportunities by year:');
    for (const [year, opps] of Object.entries(opportunitiesByYear).sort()) {
      console.log(`  ${year}: ${opps.length} opportunities`);
    }

    if (dryRun) {
      console.log('\n[DRY RUN] No changes will be made.');
      console.log('\nSample Job ID assignments:');
    } else {
      console.log('\nAssigning Job IDs...');
    }

    const results = {
      processed: 0,
      byYear: {},
    };

    // Process each year
    for (const [yearStr, yearOpps] of Object.entries(opportunitiesByYear).sort()) {
      const year = parseInt(yearStr);
      console.log(`\nProcessing year ${year}...`);

      // Get the current sequence for this year (if any)
      let currentSequence = await prisma.jobIdSequence.findUnique({
        where: { year },
      });

      let startNumber;
      if (currentSequence) {
        // Continue from existing sequence
        startNumber = currentSequence.lastNumber + 1;
        console.log(`  Continuing from existing sequence: ${year}-${startNumber}`);
      } else {
        // Start fresh for this year
        startNumber = JOB_ID_STARTING_NUMBER + 1; // 1000
        console.log(`  Starting new sequence: ${year}-${startNumber}`);
      }

      // Assign Job IDs
      let assigned = 0;
      for (let i = 0; i < yearOpps.length; i++) {
        const opp = yearOpps[i];
        const jobId = `${year}-${startNumber + i}`;

        if (dryRun) {
          // Show sample assignments
          if (i < 3 || i === yearOpps.length - 1) {
            console.log(`  ${jobId} -> ${opp.name} (${opp.id})`);
          } else if (i === 3) {
            console.log(`  ... (${yearOpps.length - 4} more)`);
          }
        } else {
          // Actually update the opportunity
          try {
            await prisma.opportunity.update({
              where: { id: opp.id },
              data: { jobId },
            });
            assigned++;

            // Progress indicator
            if ((i + 1) % 100 === 0 || i === yearOpps.length - 1) {
              console.log(`  Assigned ${i + 1}/${yearOpps.length} (${jobId})`);
            }
          } catch (err) {
            console.error(`  Error assigning ${jobId} to ${opp.id}: ${err.message}`);
          }
        }
      }

      // Update the sequence table
      const newLastNumber = startNumber + yearOpps.length - 1;
      if (!dryRun) {
        if (currentSequence) {
          await prisma.jobIdSequence.update({
            where: { year },
            data: { lastNumber: newLastNumber },
          });
        } else {
          await prisma.jobIdSequence.create({
            data: {
              year,
              lastNumber: newLastNumber,
            },
          });
        }
        console.log(`  Updated sequence: ${year}-${newLastNumber}`);
      }

      results.byYear[year] = {
        count: yearOpps.length,
        firstJobId: `${year}-${startNumber}`,
        lastJobId: `${year}-${newLastNumber}`,
      };
      results.processed += yearOpps.length;
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total opportunities processed: ${results.processed}`);
    console.log('\nBy year:');
    for (const [year, data] of Object.entries(results.byYear).sort()) {
      console.log(`  ${year}: ${data.count} opportunities (${data.firstJobId} to ${data.lastJobId})`);
    }

    if (dryRun) {
      console.log('\n[DRY RUN] Run without --dry-run to apply changes.');
    }

    return results;

  } catch (error) {
    console.error('Backfill failed:', error);
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
    targetYear: null,
  };

  const yearIndex = args.indexOf('--year');
  if (yearIndex !== -1 && args[yearIndex + 1]) {
    options.targetYear = args[yearIndex + 1];
  }

  return options;
}

// Run if called directly
const options = parseArgs();
backfillJobIds(options)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { backfillJobIds };
