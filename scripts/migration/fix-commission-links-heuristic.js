#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links via Heuristic Matching
 *
 * For commissions without Service_Contract in Salesforce, we attempt to match
 * them to Opportunities using:
 *   1. Same owner (ownerId)
 *   2. Commission created date close to Opportunity close date (within 90 days)
 *   3. Commission value matches Opportunity amount (within 5% tolerance)
 *
 * This is a HEURISTIC approach - there may be false matches.
 * We only match if there's exactly ONE candidate opportunity.
 *
 * Usage:
 *   node fix-commission-links-heuristic.js --dry-run
 *   node fix-commission-links-heuristic.js --dry-run --limit 100
 *   node fix-commission-links-heuristic.js
 */

import { prisma, disconnect } from './prisma-client.js';

const DATE_TOLERANCE_DAYS = 90;
const AMOUNT_TOLERANCE_PERCENT = 0.05; // 5%

async function findMatchingOpportunity(commission, opportunities) {
  const commDate = commission.createdAt;
  const commValue = parseFloat(commission.commissionValue) || 0;

  // Filter opportunities by owner
  const ownerOpps = opportunities.filter(o => o.ownerId === commission.ownerId);
  if (ownerOpps.length === 0) return null;

  // Filter by date (within tolerance)
  const dateFiltered = ownerOpps.filter(o => {
    if (!o.closeDate) return false;
    const daysDiff = Math.abs((commDate - o.closeDate) / (1000 * 60 * 60 * 24));
    return daysDiff <= DATE_TOLERANCE_DAYS;
  });
  if (dateFiltered.length === 0) return null;

  // Filter by amount (within tolerance) - commission value should relate to opportunity amount
  // Commission value is often a percentage of the opportunity amount
  // So we look for opportunities where commissionValue could be 1-20% of amount
  const amountFiltered = dateFiltered.filter(o => {
    const oppAmount = parseFloat(o.amount) || 0;
    if (oppAmount === 0) return false;

    // Check if commission value is a reasonable percentage (1-20%) of opportunity amount
    const percentage = commValue / oppAmount;
    return percentage >= 0.01 && percentage <= 0.25;
  });

  // Only return if exactly ONE match
  if (amountFiltered.length === 1) {
    return amountFiltered[0];
  }

  // If multiple matches, try stricter criteria
  if (amountFiltered.length > 1) {
    // Try exact date match (within 7 days)
    const strictDateFiltered = amountFiltered.filter(o => {
      const daysDiff = Math.abs((commDate - o.closeDate) / (1000 * 60 * 60 * 24));
      return daysDiff <= 7;
    });
    if (strictDateFiltered.length === 1) {
      return strictDateFiltered[0];
    }
  }

  return null;
}

async function fixCommissionLinksHeuristic(options = {}) {
  const { dryRun = false, limit = null } = options;

  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS (HEURISTIC)');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');
  console.log('Date tolerance:', DATE_TOLERANCE_DAYS, 'days');
  console.log('Amount tolerance: 1-25% of opportunity amount');
  if (limit) console.log('Limit:', limit);

  // Step 1: Get orphan commissions (no opportunityId, no serviceContractId)
  console.log('\nFetching orphan commissions...');
  let whereClause = {
    opportunityId: null,
    serviceContractId: null
  };

  const orphanCommissions = await prisma.commission.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      ownerId: true,
      commissionValue: true,
      createdAt: true,
      type: true
    },
    take: limit || undefined,
    orderBy: { createdAt: 'desc' }
  });

  console.log('Orphan commissions to process:', orphanCommissions.length);

  if (orphanCommissions.length === 0) {
    console.log('No orphan commissions found!');
    await disconnect();
    return;
  }

  // Step 2: Get all opportunities with amounts (any stage that could have commissions)
  console.log('\nFetching opportunities for matching...');
  const opportunities = await prisma.opportunity.findMany({
    where: {
      amount: { gt: 0 }
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      amount: true,
      closeDate: true,
      createdAt: true
    }
  });

  console.log('Opportunities available for matching:', opportunities.length);

  // Step 3: Match commissions to opportunities
  console.log('\nMatching commissions to opportunities...');
  const updates = [];
  let noMatch = 0;
  let multipleMatches = 0;

  for (let i = 0; i < orphanCommissions.length; i++) {
    const comm = orphanCommissions[i];
    const match = await findMatchingOpportunity(comm, opportunities);

    if (match) {
      updates.push({
        commissionId: comm.id,
        commissionName: comm.name,
        opportunityId: match.id,
        opportunityName: match.name,
        confidence: 'HEURISTIC'
      });
    } else {
      noMatch++;
    }

    // Progress
    if ((i + 1) % 1000 === 0) {
      console.log('  Processed:', i + 1, '/', orphanCommissions.length, 'Matches:', updates.length);
    }
  }

  console.log('\nResults:');
  console.log('  Matched:', updates.length);
  console.log('  No match found:', noMatch);

  // Step 4: Apply updates
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
      console.log('  Commission:', u.commissionName || u.commissionId);
      console.log('    → Opportunity:', u.opportunityName);
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
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIndex = args.indexOf('--limit');
const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) : null;

fixCommissionLinksHeuristic({ dryRun, limit }).catch(console.error);
