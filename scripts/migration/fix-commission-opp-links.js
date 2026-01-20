#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links
 *
 * Commissions link to Opportunities via ServiceContract.
 * This script finds commissions missing opportunityId and populates it from their ServiceContract.
 *
 * Usage:
 *   node fix-commission-opp-links.js --dry-run
 *   node fix-commission-opp-links.js
 */

import { prisma, disconnect } from './prisma-client.js';

async function fixCommissionLinks(dryRun = false) {
  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  // Step 1: Count commissions missing opportunityId
  const totalComms = await prisma.commission.count();
  console.log('\nTotal commissions:', totalComms);

  // Use raw query to count nulls since Prisma is complaining
  const missingOppResult = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM commissions WHERE opportunity_id IS NULL
  `;
  const missingOpp = Number(missingOppResult[0].count);
  console.log('Commissions missing opportunityId:', missingOpp);

  const hasContract = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM commissions WHERE service_contract_id IS NOT NULL
  `;
  console.log('Commissions with serviceContractId:', Number(hasContract[0].count));

  const needsUpdate = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM commissions
    WHERE opportunity_id IS NULL AND service_contract_id IS NOT NULL
  `;
  console.log('Commissions that can be fixed:', Number(needsUpdate[0].count));

  if (Number(needsUpdate[0].count) === 0) {
    console.log('\nNo commissions need fixing via ServiceContract link.');

    // But we still have 37k missing - they don't have service_contract_id either
    // These need to be fixed by querying Salesforce for the relationship
    console.log('\nCommissions without ServiceContract need Salesforce re-sync.');
    await disconnect();
    return;
  }

  // Step 2: Get the commissions that need updating, with their ServiceContract
  console.log('\nFetching commissions to update...');
  const commissionsToFix = await prisma.commission.findMany({
    where: {
      opportunityId: null,
      serviceContractId: { not: null }
    },
    select: {
      id: true,
      name: true,
      serviceContractId: true,
      serviceContract: {
        select: {
          opportunityId: true
        }
      }
    }
  });

  console.log('Found', commissionsToFix.length, 'commissions to update');

  // Step 3: Build updates
  const updates = [];
  for (const comm of commissionsToFix) {
    if (comm.serviceContract?.opportunityId) {
      updates.push({
        id: comm.id,
        opportunityId: comm.serviceContract.opportunityId
      });
    }
  }

  console.log('Updates ready:', updates.length);

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
            where: { id: u.id },
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
    console.log('Sample updates (first 5):');
    updates.slice(0, 5).forEach(u => {
      console.log('  Commission', u.id, '→ Opportunity', u.opportunityId);
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
fixCommissionLinks(dryRun).catch(console.error);
