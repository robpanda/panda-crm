#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links by Name Matching
 *
 * Many commissions have names like "Panda Ext-127424 Josh Delongis - Pre-Commission"
 * or just the Salesforce ID "a31Ps000000xxxxx".
 *
 * This script:
 * 1. Extracts "Panda Ext-XXXXX" pattern from commission names
 * 2. Matches to opportunities with the same pattern in their name
 *
 * Usage:
 *   node fix-commission-links-by-name.js --dry-run
 *   node fix-commission-links-by-name.js
 */

import { prisma, disconnect } from './prisma-client.js';

// Extract "Panda Ext-XXXXX" pattern from a name
function extractJobNumber(name) {
  if (!name) return null;
  const match = name.match(/Panda\s*Ext-?(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

async function fixCommissionLinksByName(dryRun = false) {
  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS BY NAME');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  // Step 1: Get orphan commissions
  console.log('\nFetching orphan commissions...');
  const orphanCommissions = await prisma.commission.findMany({
    where: {
      opportunityId: null,
      serviceContractId: null
    },
    select: {
      id: true,
      name: true
    }
  });

  console.log('Orphan commissions:', orphanCommissions.length);

  // Step 2: Extract job numbers from commission names
  const commissionsWithJobNumber = [];
  for (const comm of orphanCommissions) {
    const jobNum = extractJobNumber(comm.name);
    if (jobNum) {
      commissionsWithJobNumber.push({
        id: comm.id,
        name: comm.name,
        jobNumber: jobNum
      });
    }
  }

  console.log('Commissions with job number pattern:', commissionsWithJobNumber.length);

  if (commissionsWithJobNumber.length === 0) {
    console.log('No commissions with job number pattern found.');
    await disconnect();
    return;
  }

  // Step 3: Get all opportunities and build job number -> id map
  console.log('\nBuilding opportunity job number map...');
  const opportunities = await prisma.opportunity.findMany({
    select: {
      id: true,
      name: true,
      jobId: true
    }
  });

  // Build map: jobNumber -> opportunityId
  const oppByJobNumber = new Map();
  const oppByJobId = new Map();
  let dupes = 0;

  for (const opp of opportunities) {
    // Try jobId field first (format: "2025-1234")
    if (opp.jobId) {
      const jobIdNum = parseInt(opp.jobId.split('-')[1], 10);
      if (jobIdNum && !oppByJobId.has(jobIdNum)) {
        oppByJobId.set(jobIdNum, opp.id);
      }
    }

    // Also try extracting from name
    const jobNum = extractJobNumber(opp.name);
    if (jobNum) {
      if (oppByJobNumber.has(jobNum)) {
        dupes++;
      } else {
        oppByJobNumber.set(jobNum, opp.id);
      }
    }
  }

  console.log('Opportunities with job numbers:', oppByJobNumber.size);
  console.log('Duplicate job numbers (skipped):', dupes);

  // Step 4: Match commissions to opportunities
  console.log('\nMatching commissions to opportunities...');
  const updates = [];
  let noMatch = 0;

  for (const comm of commissionsWithJobNumber) {
    const oppId = oppByJobNumber.get(comm.jobNumber);
    if (oppId) {
      updates.push({
        commissionId: comm.id,
        commissionName: comm.name,
        opportunityId: oppId,
        jobNumber: comm.jobNumber
      });
    } else {
      noMatch++;
    }
  }

  console.log('\nResults:');
  console.log('  Matched:', updates.length);
  console.log('  No match found:', noMatch);

  // Step 5: Apply updates
  if (updates.length > 0 && !dryRun) {
    console.log('\nApplying updates in batches of 100...');
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);

      await prisma.$transaction(
        batch.map(u =>
          prisma.commission.update({
            where: { id: u.commissionId },
            data: { opportunityId: u.opportunityId }
          })
        )
      );

      updated += batch.length;
      if (updated % 1000 === 0 || updated === updates.length) {
        console.log('  Updated:', updated, '/', updates.length);
      }
    }

    console.log('\nDone! Updated', updated, 'commission records');
  } else if (dryRun) {
    console.log('\nDRY RUN - No changes made');
    console.log('\nSample matches (first 10):');
    updates.slice(0, 10).forEach(u => {
      console.log('  Commission:', u.commissionName);
      console.log('    Job #:', u.jobNumber);
      console.log('    → Opportunity ID:', u.opportunityId);
      console.log('');
    });
  }

  // Final stats
  const finalMissingResult = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM commissions WHERE opportunity_id IS NULL
  `;
  const finalMissing = Number(finalMissingResult[0].count);
  console.log('\nFinal stats:');
  console.log('  Commissions still missing opportunityId:', finalMissing);

  await disconnect();
}

// Parse args
const dryRun = process.argv.includes('--dry-run');
fixCommissionLinksByName(dryRun).catch(console.error);
