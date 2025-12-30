#!/usr/bin/env node
/**
 * Bidirectional Commission Sync Script
 *
 * Syncs Commission__c records between Salesforce and PostgreSQL.
 *
 * Commission types:
 * - Pre-Commission (paid at contract signing)
 * - Back-End Commission (paid when job is collected)
 * - Manager Override (bonus for managers)
 * - Sales Op Commission (Jason Wooten's PandaClaims override)
 * - Supplement Override (supplement-based commission)
 * - Referral, Bonus, Other
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

// Salesforce Commission fields
const COMMISSION_FIELDS = [
  'Id', 'Name', 'OwnerId',
  'Service_Contract__c', 'Invoice__c', 'Account__c',
  'Commission_Type__c', 'Status__c',
  'Commission_Value__c', 'Commission_Rate_of_Pay__c', 'Commission_Amount__c',
  'Approved_By__c', 'Approved_Date__c',
  'Paid_Date__c', 'Payment_Reference__c',
  'Notes__c',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Commission type mapping
const COMMISSION_TYPE_MAP = {
  'Pre-Commission': 'PRE_COMMISSION',
  'Back-End Commission': 'BACK_END_COMMISSION',
  'Manager Override': 'MANAGER_OVERRIDE',
  'Sales Op Commission': 'SALES_OP_COMMISSION',
  'Supplement Override': 'SUPPLEMENT_OVERRIDE',
  'Referral': 'REFERRAL',
  'Bonus': 'BONUS',
  'Other': 'OTHER'
};

// Status mapping
const STATUS_MAP = {
  'Pending': 'PENDING',
  'Requested': 'REQUESTED',
  'Approved': 'APPROVED',
  'Paid': 'PAID',
  'Rejected': 'REJECTED',
  'On Hold': 'ON_HOLD'
};

/**
 * Transform Salesforce Commission to Prisma format
 */
function transformCommission(sfRecord, idMaps) {
  const { userIdMap, contractIdMap, invoiceIdMap, accountIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    name: sfRecord.Name || null,
    notes: sfRecord.Notes__c || null,

    // Type and Status
    commissionType: COMMISSION_TYPE_MAP[sfRecord.Commission_Type__c] || 'OTHER',
    status: STATUS_MAP[sfRecord.Status__c] || 'PENDING',

    // Foreign keys
    ownerId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,
    contractId: sfRecord.Service_Contract__c ? contractIdMap.get(sfRecord.Service_Contract__c) || null : null,
    invoiceId: sfRecord.Invoice__c ? invoiceIdMap.get(sfRecord.Invoice__c) || null : null,
    accountId: sfRecord.Account__c ? accountIdMap.get(sfRecord.Account__c) || null : null,

    // Financial
    commissionValue: sfRecord.Commission_Value__c || null,
    commissionRate: sfRecord.Commission_Rate_of_Pay__c || null,
    commissionAmount: sfRecord.Commission_Amount__c || null,

    // Approval
    approvedById: sfRecord.Approved_By__c ? userIdMap.get(sfRecord.Approved_By__c) || null : null,
    approvedDate: sfRecord.Approved_Date__c ? new Date(sfRecord.Approved_Date__c) : null,

    // Payment
    paidDate: sfRecord.Paid_Date__c ? new Date(sfRecord.Paid_Date__c) : null,
    paymentReference: sfRecord.Payment_Reference__c || null,

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

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  const contracts = await prisma.serviceContract.findMany({
    select: { id: true, salesforceId: true }
  });
  const contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contracts: ${contractIdMap.size}`);

  const invoices = await prisma.invoice.findMany({
    select: { id: true, salesforceId: true }
  });
  const invoiceIdMap = new Map(invoices.map(i => [i.salesforceId, i.id]));
  console.log(`  Invoices: ${invoiceIdMap.size}`);

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true }
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Accounts: ${accountIdMap.size}`);

  return { userIdMap, contractIdMap, invoiceIdMap, accountIdMap };
}

/**
 * Pull Commissions from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL COMMISSIONS: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Commission', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${COMMISSION_FIELDS.join(', ')} FROM Commission__c WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} Commission records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformCommission(r, idMaps));

    // Stats
    const withOwner = transformed.filter(r => r.ownerId).length;
    const withContract = transformed.filter(r => r.contractId).length;
    const byType = {};
    const byStatus = {};
    transformed.forEach(r => {
      byType[r.commissionType] = (byType[r.commissionType] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    const totalAmount = transformed.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

    console.log('\nStats:');
    console.log(`  With Owner: ${withOwner}/${transformed.length}`);
    console.log(`  With Contract: ${withContract}/${transformed.length}`);
    console.log(`  Total Commission Amount: $${totalAmount.toLocaleString()}`);
    console.log('  By Type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('commission', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Commissions`);

      // Save sync timestamp
      saveLastSyncTime('Commission', 'sf_to_pg');
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
 * Push Commissions from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH COMMISSIONS: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Commission', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.commission.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.commission.findMany({ where });
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
      'commission',
      'Commission__c',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Commission', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: Commissions');
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
