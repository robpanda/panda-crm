#!/usr/bin/env node
/**
 * Fix Commission → Opportunity Links via Salesforce Query
 *
 * For commissions without Service_Contract__c in Salesforce, we need to find
 * the opportunity another way. In Salesforce, Commissions without Service_Contract
 * might be linked via:
 *   1. Invoice__c → fw1__Account__c → look up Opportunity by Account
 *   2. User_Profle__c (owner) → look up recent Opportunity by owner and date
 *
 * This script queries Salesforce to get all Commission → Opportunity mappings
 * and updates PostgreSQL.
 *
 * Usage:
 *   node fix-commission-links-via-salesforce.js --dry-run
 *   node fix-commission-links-via-salesforce.js
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

async function fixCommissionLinks(dryRun = false) {
  console.log('='.repeat(60));
  console.log('FIX COMMISSION → OPPORTUNITY LINKS VIA SALESFORCE');
  console.log('='.repeat(60));
  console.log('Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  const conn = await getSalesforceConnection();

  // Step 1: Query all commissions from Salesforce with Service_Contract → Opportunity relationship
  console.log('\nQuerying Salesforce for Commission → Opportunity mappings...');

  const query = `
    SELECT Id, Name, Service_Contract__c, Service_Contract__r.Opportunity__c
    FROM Commission__c
    WHERE Service_Contract__r.Opportunity__c != null
  `;

  const sfCommissions = await querySalesforce(conn, query);
  console.log('Found', sfCommissions.length, 'commissions with Service_Contract → Opportunity in SF');

  // Build map: salesforceId -> sfOpportunityId
  const sfCommToOpp = new Map();
  for (const comm of sfCommissions) {
    const sfOppId = comm.Service_Contract__r?.Opportunity__c;
    if (sfOppId) {
      sfCommToOpp.set(comm.Id, sfOppId);
    }
  }
  console.log('SF Commission → Opportunity mappings:', sfCommToOpp.size);

  // Step 2: Get Opportunity salesforceId → id map from PostgreSQL
  console.log('\nBuilding Opportunity ID map...');
  const opportunities = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true }
  });
  const oppMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log('Opportunities in PostgreSQL:', oppMap.size);

  // Step 3: Get commissions in PostgreSQL that need opportunityId
  console.log('\nFetching PostgreSQL commissions missing opportunityId...');
  const pgCommissions = await prisma.commission.findMany({
    where: {
      opportunityId: null,
      salesforceId: { not: null }
    },
    select: {
      id: true,
      salesforceId: true
    }
  });
  console.log('PostgreSQL commissions missing opportunityId:', pgCommissions.length);

  // Step 4: Match and build updates
  const updates = [];
  let noMatch = 0;
  let noOppInPg = 0;

  for (const pgComm of pgCommissions) {
    const sfOppId = sfCommToOpp.get(pgComm.salesforceId);
    if (sfOppId) {
      const pgOppId = oppMap.get(sfOppId);
      if (pgOppId) {
        updates.push({
          id: pgComm.id,
          opportunityId: pgOppId
        });
      } else {
        noOppInPg++;
      }
    } else {
      noMatch++;
    }
  }

  console.log('\nResults:');
  console.log('  Can be updated:', updates.length);
  console.log('  No SF mapping found:', noMatch);
  console.log('  SF mapping exists but Opp not in PG:', noOppInPg);

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
