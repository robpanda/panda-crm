#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links via Account
 *
 * Query Salesforce to get Commission → Account relationships, then
 * find the Opportunity linked to that Account.
 *
 * In Salesforce:
 *   Commission__c.Service_Contract__c → ServiceContract.Account__c
 *   OR Commission__c.Invoice__c → fw1__Invoice__c.fw1__Account__c
 *
 * Then find Opportunity where Account = that Account
 *
 * Usage:
 *   node fix-commission-links-via-account.js --dry-run
 *   node fix-commission-links-via-account.js
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

async function fixCommissionLinksViaAccount(dryRun = false) {
  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS VIA ACCOUNT');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  const conn = await getSalesforceConnection();

  // Step 1: Get PostgreSQL commissions missing opportunityId with their salesforceId
  console.log('\nFetching orphan commissions from PostgreSQL...');
  const pgOrphans = await prisma.commission.findMany({
    where: {
      opportunityId: null,
      salesforceId: { not: null }
    },
    select: {
      id: true,
      salesforceId: true,
      name: true
    }
  });

  console.log('Orphan commissions with salesforceId:', pgOrphans.length);

  if (pgOrphans.length === 0) {
    console.log('No orphan commissions!');
    await disconnect();
    return;
  }

  // Step 2: Query Salesforce for Commission → Account via Service_Contract
  console.log('\nQuerying Salesforce for Commission → Account mappings...');

  // Get all commissions with their ServiceContract's Account
  // Note: ServiceContract uses AccountId (standard field), not Account__c
  const sfQuery1 = `
    SELECT Id, Service_Contract__c, Service_Contract__r.AccountId
    FROM Commission__c
    WHERE Service_Contract__r.AccountId != null
  `;

  let sfCommToAccount = new Map();
  try {
    const sfResults1 = await querySalesforce(conn, sfQuery1);
    console.log('Commissions with Service_Contract.AccountId:', sfResults1.length);
    for (const r of sfResults1) {
      if (r.Service_Contract__r?.AccountId) {
        sfCommToAccount.set(r.Id, r.Service_Contract__r.AccountId);
      }
    }
  } catch (e) {
    console.log('Error querying Service_Contract.AccountId:', e.message);
  }

  // Also try via Invoice → Account
  console.log('\nQuerying Salesforce for Commission → Account via Invoice...');
  const sfQuery2 = `
    SELECT Id, Invoice__c, Invoice__r.fw1__Account__c
    FROM Commission__c
    WHERE Invoice__r.fw1__Account__c != null
  `;

  try {
    const sfResults2 = await querySalesforce(conn, sfQuery2);
    console.log('Commissions with Invoice.Account:', sfResults2.length);
    for (const r of sfResults2) {
      const accId = r.Invoice__r?.fw1__Account__c;
      if (accId && !sfCommToAccount.has(r.Id)) {
        sfCommToAccount.set(r.Id, accId);
      }
    }
  } catch (e) {
    console.log('Error querying Invoice.Account:', e.message);
  }

  console.log('Total Commission → Account mappings from SF:', sfCommToAccount.size);

  // Step 3: Build Account → Opportunity map from PostgreSQL
  // Get opportunities with their account's salesforceId
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
    const sfAccountId = sfCommToAccount.get(pgComm.salesforceId);
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
  console.log('  No SF Account mapping:', noSfMapping);
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
fixCommissionLinksViaAccount(dryRun).catch(console.error);
