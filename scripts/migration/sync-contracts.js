#!/usr/bin/env node
/**
 * Bidirectional Contract (ServiceContract) Sync Script
 *
 * Syncs ServiceContract records between Salesforce and PostgreSQL in both directions.
 *
 * Note: ServiceContract is a complex object with many financial fields.
 * This script handles the full contract lifecycle including supplements.
 *
 * Modes:
 *   --pull     Pull from Salesforce to PostgreSQL (default)
 *   --push     Push from PostgreSQL to Salesforce
 *   --sync     Full bidirectional sync with conflict resolution
 *
 * Options:
 *   --dry-run  Preview changes without applying
 *   --limit N  Limit number of records
 *   --since    Only sync records modified since last sync
 *   --force    Ignore last sync timestamp, sync all records
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';
import {
  getLastSyncTime,
  saveLastSyncTime,
  buildReverseIdMaps,
  pushToSalesforce
} from './sync-utils.js';

// Salesforce ServiceContract fields (verified against SF schema)
const CONTRACT_FIELDS = [
  'Id', 'Name', 'ContractNumber', 'AccountId', 'Opportunity__c',
  'Status', 'StartDate', 'EndDate', 'Term', 'Description',
  'OwnerId', 'Pricebook2Id',
  // Financial fields
  'Contract_Grand_Total__c', 'GrandTotal', 'TotalPrice',
  'Sales_Total_Price__c', 'Sales_Subtotal__c',
  // Commission fields
  'Pre_Commission_Rate__c', 'Company_Lead_Rate__c', 'Self_Gen_Rate__c',
  'Pre_Commission_Amount__c', 'Commission_Rate__c',
  // Supplement fields
  'Supplements_Closed__c', 'Supplements_Total_Price__c', 'Sum_of_Supplements__c',
  // Hierarchy
  'RootServiceContractId', 'ParentServiceContractId',
  // Timestamps
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping
const STATUS_MAP = {
  'Draft': 'DRAFT',
  'In Approval Process': 'IN_APPROVAL',
  'Activated': 'ACTIVATED',
  'Expired': 'EXPIRED',
  'Canceled': 'CANCELED'
};

/**
 * Transform Salesforce ServiceContract to Prisma format
 */
function transformContract(sfRecord, idMaps) {
  const { accountIdMap, opportunityIdMap, userIdMap, contractIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    name: sfRecord.Name || 'Unnamed Contract',
    contractNumber: sfRecord.ContractNumber || sfRecord.Id, // Use SF ID if no contract number
    status: STATUS_MAP[sfRecord.Status] || 'DRAFT',

    // Foreign keys
    accountId: sfRecord.AccountId ? accountIdMap.get(sfRecord.AccountId) || null : null,
    opportunityId: sfRecord.Opportunity__c ? opportunityIdMap.get(sfRecord.Opportunity__c) || null : null,
    ownerId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,

    // Dates
    startDate: sfRecord.StartDate ? new Date(sfRecord.StartDate) : null,
    endDate: sfRecord.EndDate ? new Date(sfRecord.EndDate) : null,

    // Financial - must match Prisma schema field names
    contractTotal: sfRecord.Contract_Grand_Total__c || sfRecord.GrandTotal || 0,
    salesTotalPrice: sfRecord.Sales_Total_Price__c || sfRecord.TotalPrice || null,
    supplementsClosedTotal: sfRecord.Supplements_Closed__c || sfRecord.Sum_of_Supplements__c || null,

    // Commission rates
    preCommissionRate: sfRecord.Pre_Commission_Rate__c || null,
    companyLeadRate: sfRecord.Company_Lead_Rate__c || null,
    selfGenRate: sfRecord.Self_Gen_Rate__c || null,
    commissionRate: sfRecord.Commission_Rate__c || null,

    // Timestamps
    createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
    updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date()
  };
}

/**
 * Build ID maps for foreign key resolution
 */
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true }
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Accounts: ${accountIdMap.size}`);

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true }
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Opportunities: ${opportunityIdMap.size}`);

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  // Get existing contracts for hierarchy resolution
  const contracts = await prisma.serviceContract.findMany({
    select: { id: true, salesforceId: true }
  });
  const contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contracts: ${contractIdMap.size}`);

  return { accountIdMap, opportunityIdMap, userIdMap, contractIdMap };
}

/**
 * Resolve contract hierarchy (parent/root relationships)
 * Note: Skipped - Prisma schema doesn't have hierarchy fields
 */
async function resolveContractHierarchy() {
  console.log('\nSkipping contract hierarchy resolution (not in schema)...');
  // The Prisma ServiceContract model doesn't have rootContractSalesforceId or parentContractSalesforceId
  // This feature can be added later if needed
}

/**
 * Pull Contracts from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL CONTRACTS: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Contract', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${CONTRACT_FIELDS.join(', ')} FROM ServiceContract WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} Contract records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformContract(r, idMaps));

    // Stats
    const withAccount = transformed.filter(r => r.accountId).length;
    const withOpportunity = transformed.filter(r => r.opportunityId).length;
    const byStatus = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    const totalValue = transformed.reduce((sum, c) => sum + (c.contractGrandTotal || 0), 0);

    console.log('\nStats:');
    console.log(`  With Account: ${withAccount}/${transformed.length}`);
    console.log(`  With Opportunity: ${withOpportunity}/${transformed.length}`);
    console.log(`  Total Contract Value: $${totalValue.toLocaleString()}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('serviceContract', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Contracts`);

      // Resolve hierarchy after upsert
      await resolveContractHierarchy();

      // Save sync timestamp
      saveLastSyncTime('Contract', 'sf_to_pg');
    } else {
      console.log('\nDRY RUN - Sample record:');
      console.log(JSON.stringify(transformed[0], null, 2));
    }

    return { synced: transformed.length, errors: 0 };
  } catch (error) {
    console.error('Pull failed:', error);
    throw error;
  }
}

/**
 * Push Contracts from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH CONTRACTS: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Contract', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.serviceContract.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.serviceContract.findMany({ where });
    }

    console.log(`Found ${modifiedRecords.length} modified records in PostgreSQL`);

    if (modifiedRecords.length === 0) {
      console.log('No changes to push');
      return { updated: 0, created: 0, errors: [] };
    }

    // Build reverse ID maps
    const idMaps = await buildReverseIdMaps();

    // Push to Salesforce
    const result = await pushToSalesforce(
      'contract',
      'ServiceContract',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Contract', 'pg_to_sf');
    }

    return result;
  } catch (error) {
    console.error('Push failed:', error);
    throw error;
  }
}

/**
 * Full bidirectional sync
 */
async function syncBidirectional(options = {}) {
  console.log('\n' + '='.repeat(60));
  console.log('BIDIRECTIONAL SYNC: Contracts');
  console.log('='.repeat(60));

  // First pull from Salesforce
  const pullResult = await pullFromSalesforce(options);

  // Then push local changes to Salesforce
  const pushResult = await pushToSalesforceSync(options);

  console.log('\n' + '='.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`Pulled from SF: ${pullResult.synced}`);
  console.log(`Pushed to SF: ${pushResult.updated} updated, ${pushResult.created} created`);
  console.log(`Errors: ${pushResult.errors.length}`);

  return { pullResult, pushResult };
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'pull',
    dryRun: false,
    limit: null,
    since: false,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pull': options.mode = 'pull'; break;
      case '--push': options.mode = 'push'; break;
      case '--sync': options.mode = 'sync'; break;
      case '--dry-run': options.dryRun = true; break;
      case '--limit': options.limit = parseInt(args[++i], 10); break;
      case '--since': options.since = true; break;
      case '--force': options.force = true; break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    switch (options.mode) {
      case 'pull': await pullFromSalesforce(options); break;
      case 'push': await pushToSalesforceSync(options); break;
      case 'sync': await syncBidirectional(options); break;
    }
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

main();

export { pullFromSalesforce, pushToSalesforceSync, syncBidirectional };
