#!/usr/bin/env node
/**
 * Bidirectional Invoice Sync Script
 *
 * Syncs Invoice records (fw1__Invoice__c) between Salesforce and PostgreSQL.
 *
 * Note: Invoices use the FinanceWhiz managed package custom object fw1__Invoice__c.
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

// Salesforce Invoice fields (fw1__Invoice__c) - verified against SF schema
const INVOICE_FIELDS = [
  'Id', 'Name',
  'fw1__Account__c', 'Service_Contract__c',
  'fw1__Status__c', 'fw1__Invoice_Date__c', 'fw1__Due_Date__c',
  'fw1__Total_Invoice_Amount__c', 'fw1__Balance_Due__c', 'fw1__Total_Paid_Amount__c',
  'PM_Invoice__c',
  'OwnerId',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping
const STATUS_MAP = {
  'Draft': 'DRAFT',
  'Sent': 'SENT',
  'Partial': 'PARTIAL',
  'Paid': 'PAID',
  'Overdue': 'OVERDUE',
  'Void': 'VOID'
};

/**
 * Transform Salesforce Invoice to Prisma format
 */
function transformInvoice(sfRecord, idMaps) {
  const { accountIdMap, contractIdMap, userIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    invoiceNumber: sfRecord.Name || null,
    status: STATUS_MAP[sfRecord.fw1__Status__c] || 'DRAFT',

    // Foreign keys
    accountId: sfRecord.fw1__Account__c ? accountIdMap.get(sfRecord.fw1__Account__c) || null : null,
    contractId: sfRecord.Service_Contract__c ? contractIdMap.get(sfRecord.Service_Contract__c) || null : null,
    ownerId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,

    // Dates
    invoiceDate: sfRecord.fw1__Invoice_Date__c ? new Date(sfRecord.fw1__Invoice_Date__c) : null,
    dueDate: sfRecord.fw1__Due_Date__c ? new Date(sfRecord.fw1__Due_Date__c) : null,

    // Financial
    totalAmount: sfRecord.fw1__Total_Invoice_Amount__c || null,
    balanceDue: sfRecord.fw1__Balance_Due__c || null,
    paidAmount: sfRecord.fw1__Total_Paid_Amount__c || null,

    // PM Invoice flag
    isPmInvoice: sfRecord.PM_Invoice__c || false,

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

  const contracts = await prisma.serviceContract.findMany({
    select: { id: true, salesforceId: true }
  });
  const contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contracts: ${contractIdMap.size}`);

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  return { accountIdMap, contractIdMap, userIdMap };
}

/**
 * Pull Invoices from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL INVOICES: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Invoice', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${INVOICE_FIELDS.join(', ')} FROM fw1__Invoice__c WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} Invoice records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformInvoice(r, idMaps));

    // Stats
    const withAccount = transformed.filter(r => r.accountId).length;
    const withContract = transformed.filter(r => r.contractId).length;
    const byStatus = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    const totalAmount = transformed.reduce((sum, i) => sum + (i.totalAmount || 0), 0);
    const totalBalance = transformed.reduce((sum, i) => sum + (i.balanceDue || 0), 0);

    console.log('\nStats:');
    console.log(`  With Account: ${withAccount}/${transformed.length}`);
    console.log(`  With Contract: ${withContract}/${transformed.length}`);
    console.log(`  Total Invoice Amount: $${totalAmount.toLocaleString()}`);
    console.log(`  Total Balance Due: $${totalBalance.toLocaleString()}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('invoice', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Invoices`);

      // Save sync timestamp
      saveLastSyncTime('Invoice', 'sf_to_pg');
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
 * Push Invoices from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH INVOICES: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Invoice', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.invoice.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.invoice.findMany({ where });
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
      'invoice',
      'fw1__Invoice__c',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Invoice', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: Invoices');
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
