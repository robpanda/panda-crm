#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links via Customer_Name__c (Account)
 *
 * For commissions without Service_Contract__c in Salesforce, we can link via:
 *   Commission__c.Customer_Name__c (Account) → Account.Opportunities
 *
 * This script:
 *   1. Queries SF for Commission__c.Customer_Name__c (Account ID)
 *   2. Maps SF Account ID → PG Account → PG Opportunity
 *   3. Updates commissions in PostgreSQL
 *
 * Usage:
 *   node fix-commission-links-via-customer-name.js --dry-run
 *   node fix-commission-links-via-customer-name.js
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

async function fixCommissionLinksViaCustomerName(dryRun = false) {
  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS VIA CUSTOMER_NAME__c');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  const conn = await getSalesforceConnection();

  // Step 1: Get PostgreSQL commissions missing opportunityId with their salesforceId
  console.log('\nFetching orphan commissions from PostgreSQL...');
  const pgOrphans = await prisma.$queryRaw`
    SELECT id, salesforce_id, name
    FROM commissions
    WHERE opportunity_id IS NULL AND salesforce_id IS NOT NULL
  `;

  console.log('Orphan commissions with salesforceId:', pgOrphans.length);

  if (pgOrphans.length === 0) {
    console.log('No orphan commissions!');
    await disconnect();
    return;
  }

  // Step 2: Query Salesforce for Commission → Account via Customer_Name__c
  console.log('\nQuerying Salesforce for Commission → Customer_Name (Account)...');

  const sfQuery = `
    SELECT Id, Customer_Name__c
    FROM Commission__c
    WHERE Customer_Name__c != null
  `;

  let sfCommToAccount = new Map();
  try {
    const sfResults = await querySalesforce(conn, sfQuery);
    console.log('Commissions with Customer_Name__c:', sfResults.length);
    for (const r of sfResults) {
      if (r.Customer_Name__c) {
        sfCommToAccount.set(r.Id, r.Customer_Name__c);
      }
    }
  } catch (e) {
    console.log('Error querying Customer_Name__c:', e.message);
    await disconnect();
    return;
  }

  console.log('Commission → Account mappings from SF:', sfCommToAccount.size);

  // Step 3: Build Account → Opportunity map from PostgreSQL
  // Using raw SQL to avoid Prisma null validation issues
  console.log('\nBuilding Account → Opportunity map...');

  const oppsWithAccount = await prisma.$queryRaw`
    SELECT o.id, o.account_id, a.salesforce_id as account_sf_id
    FROM opportunities o
    JOIN accounts a ON o.account_id = a.id
    WHERE o.account_id IS NOT NULL AND a.salesforce_id IS NOT NULL
  `;

  // Map: SF Account ID → PG Opportunity ID (use first opportunity per account)
  const sfAccountToOpp = new Map();
  for (const opp of oppsWithAccount) {
    const sfAccountId = opp.account_sf_id;
    if (sfAccountId && !sfAccountToOpp.has(sfAccountId)) {
      sfAccountToOpp.set(sfAccountId, opp.id);
    }
  }

  console.log('SF Account → PG Opportunity mappings:', sfAccountToOpp.size);

  // Step 4: Match orphan commissions
  console.log('\nMatching commissions...');
  const updates = [];
  let noSfMapping = 0;
  let noAccountOpp = 0;

  for (const pgComm of pgOrphans) {
    const sfAccountId = sfCommToAccount.get(pgComm.salesforce_id);
    if (!sfAccountId) {
      noSfMapping++;
      continue;
    }

    const pgOppId = sfAccountToOpp.get(sfAccountId);
    if (!pgOppId) {
      noAccountOpp++;
      continue;
    }

    updates.push({
      commissionId: pgComm.id,
      commissionName: pgComm.name,
      opportunityId: pgOppId
    });
  }

  console.log('\nResults:');
  console.log('  Can be updated:', updates.length);
  console.log('  No SF Customer_Name mapping:', noSfMapping);
  console.log('  Account not linked to Opp:', noAccountOpp);

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
      console.log('  Commission:', u.commissionName || u.commissionId);
      console.log('    → Opportunity:', u.opportunityId);
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
fixCommissionLinksViaCustomerName(dryRun).catch(console.error);
