#!/usr/bin/env node
/**
 * Bidirectional WorkOrder Sync Script
 *
 * Syncs WorkOrder records between Salesforce and PostgreSQL in both directions.
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
 *
 * Usage:
 *   node sync-workorders.js --pull
 *   node sync-workorders.js --push --dry-run
 *   node sync-workorders.js --sync --since
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';
import {
  SyncEngine,
  ConflictResolution,
  getLastSyncTime,
  saveLastSyncTime,
  buildReverseIdMaps,
  pushToSalesforce,
  getModifiedPostgresRecords
} from './sync-utils.js';

// Salesforce WorkOrder fields
const WORKORDER_FIELDS = [
  'Id', 'WorkOrderNumber', 'Subject', 'Description', 'Status', 'Priority',
  'AccountId', 'ContactId', 'Opportunity__c', 'WorkTypeId',
  'StartDate', 'EndDate', 'DurationInMinutes', 'Duration', 'DurationType',
  'Street', 'City', 'State', 'PostalCode', 'Country', 'Latitude', 'Longitude',
  'ServiceTerritoryId', 'OwnerId',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping: Salesforce → Prisma enum
const STATUS_MAP = {
  'New': 'NEW',
  'In Progress': 'IN_PROGRESS',
  'On Hold': 'ON_HOLD',
  'Completed': 'COMPLETED',
  'Canceled': 'CANCELLED',
  'Closed': 'CLOSED'
};

// Priority mapping
const PRIORITY_MAP = {
  'Low': 'LOW',
  'Medium': 'MEDIUM',
  'High': 'HIGH',
  'Critical': 'CRITICAL'
};

/**
 * Transform Salesforce WorkOrder to Prisma format
 */
function transformWorkOrder(sfRecord, idMaps) {
  const { accountIdMap, contactIdMap, opportunityIdMap, userIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    workOrderNumber: sfRecord.WorkOrderNumber || null,
    subject: sfRecord.Subject || null,
    description: sfRecord.Description || null,
    status: STATUS_MAP[sfRecord.Status] || 'NEW',
    priority: PRIORITY_MAP[sfRecord.Priority] || 'MEDIUM',

    // Foreign keys
    accountId: sfRecord.AccountId ? accountIdMap.get(sfRecord.AccountId) || null : null,
    contactId: sfRecord.ContactId ? contactIdMap.get(sfRecord.ContactId) || null : null,
    opportunityId: sfRecord.Opportunity__c ? opportunityIdMap.get(sfRecord.Opportunity__c) || null : null,
    assignedToId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,

    // Work Type
    workTypeSalesforceId: sfRecord.WorkTypeId || null,

    // Schedule
    scheduledStart: sfRecord.StartDate ? new Date(sfRecord.StartDate) : null,
    scheduledEnd: sfRecord.EndDate ? new Date(sfRecord.EndDate) : null,
    durationMinutes: sfRecord.DurationInMinutes || sfRecord.Duration || null,

    // Location
    street: sfRecord.Street || null,
    city: sfRecord.City || null,
    state: sfRecord.State || null,
    postalCode: sfRecord.PostalCode || null,
    country: sfRecord.Country || 'USA',
    latitude: sfRecord.Latitude || null,
    longitude: sfRecord.Longitude || null,

    // Service Territory
    serviceTerritoryId: sfRecord.ServiceTerritoryId || null,

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

  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true }
  });
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contacts: ${contactIdMap.size}`);

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

  return { accountIdMap, contactIdMap, opportunityIdMap, userIdMap };
}

/**
 * Pull WorkOrders from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL WORKORDERS: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('WorkOrder', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${WORKORDER_FIELDS.join(', ')} FROM WorkOrder WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} WorkOrder records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformWorkOrder(r, idMaps));

    // Stats
    const withAccount = transformed.filter(r => r.accountId).length;
    const withOpportunity = transformed.filter(r => r.opportunityId).length;
    const byStatus = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    console.log('\nStats:');
    console.log(`  With Account: ${withAccount}/${transformed.length}`);
    console.log(`  With Opportunity: ${withOpportunity}/${transformed.length}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('workOrder', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} WorkOrders`);

      // Save sync timestamp
      saveLastSyncTime('WorkOrder', 'sf_to_pg');
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
 * Push WorkOrders from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH WORKORDERS: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('WorkOrder', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    if (limit) {
      var modifiedRecords = await prisma.workOrder.findMany({
        where,
        take: limit
      });
    } else {
      var modifiedRecords = await prisma.workOrder.findMany({ where });
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
      'workOrder',
      'WorkOrder',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('WorkOrder', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: WorkOrders');
  console.log('='.repeat(60));

  // First pull from Salesforce (source of truth for most data)
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
    mode: 'pull', // default mode
    dryRun: false,
    limit: null,
    since: false,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pull':
        options.mode = 'pull';
        break;
      case '--push':
        options.mode = 'push';
        break;
      case '--sync':
        options.mode = 'sync';
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--since':
        options.since = true;
        break;
      case '--force':
        options.force = true;
        break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    switch (options.mode) {
      case 'pull':
        await pullFromSalesforce(options);
        break;
      case 'push':
        await pushToSalesforceSync(options);
        break;
      case 'sync':
        await syncBidirectional(options);
        break;
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
