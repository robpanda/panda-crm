#!/usr/bin/env node
/**
 * Bidirectional ServiceAppointment Sync Script
 *
 * Syncs ServiceAppointment records between Salesforce and PostgreSQL in both directions.
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
 *   node sync-service-appointments.js --pull
 *   node sync-service-appointments.js --push --dry-run
 *   node sync-service-appointments.js --sync --since
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';
import {
  getLastSyncTime,
  saveLastSyncTime,
  buildReverseIdMaps,
  pushToSalesforce
} from './sync-utils.js';

// Salesforce ServiceAppointment fields
const SA_FIELDS = [
  'Id', 'AppointmentNumber', 'ParentRecordId', 'Status',
  'SchedStartTime', 'SchedEndTime', 'ActualStartTime', 'ActualEndTime',
  'DueDate', 'EarliestStartTime', 'ArrivalWindowStartTime', 'ArrivalWindowEndTime',
  'Duration', 'DurationType', 'DurationInMinutes',
  'Description', 'Subject',
  'Street', 'City', 'State', 'PostalCode', 'Country', 'Latitude', 'Longitude',
  'ServiceTerritoryId', 'WorkTypeId',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping: Salesforce → Prisma enum
const STATUS_MAP = {
  'None': 'NONE',
  'Scheduled': 'SCHEDULED',
  'Dispatched': 'DISPATCHED',
  'In Progress': 'IN_PROGRESS',
  'Completed': 'COMPLETED',
  'Cannot Complete': 'CANNOT_COMPLETE',
  'Canceled': 'CANCELED'
};

/**
 * Transform Salesforce ServiceAppointment to Prisma format
 */
function transformServiceAppointment(sfRecord, idMaps) {
  const { workOrderIdMap, userIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    appointmentNumber: sfRecord.AppointmentNumber || null,
    subject: sfRecord.Subject || null,
    description: sfRecord.Description || null,
    status: STATUS_MAP[sfRecord.Status] || 'NONE',

    // Link to WorkOrder (ParentRecordId)
    workOrderId: sfRecord.ParentRecordId ? workOrderIdMap.get(sfRecord.ParentRecordId) || null : null,
    parentRecordSalesforceId: sfRecord.ParentRecordId || null,

    // Scheduling
    scheduledStart: sfRecord.SchedStartTime ? new Date(sfRecord.SchedStartTime) : null,
    scheduledEnd: sfRecord.SchedEndTime ? new Date(sfRecord.SchedEndTime) : null,
    actualStart: sfRecord.ActualStartTime ? new Date(sfRecord.ActualStartTime) : null,
    actualEnd: sfRecord.ActualEndTime ? new Date(sfRecord.ActualEndTime) : null,
    dueDate: sfRecord.DueDate ? new Date(sfRecord.DueDate) : null,
    earliestStart: sfRecord.EarliestStartTime ? new Date(sfRecord.EarliestStartTime) : null,
    arrivalWindowStart: sfRecord.ArrivalWindowStartTime ? new Date(sfRecord.ArrivalWindowStartTime) : null,
    arrivalWindowEnd: sfRecord.ArrivalWindowEndTime ? new Date(sfRecord.ArrivalWindowEndTime) : null,

    // Duration
    durationMinutes: sfRecord.DurationInMinutes || sfRecord.Duration || null,

    // Location
    street: sfRecord.Street || null,
    city: sfRecord.City || null,
    state: sfRecord.State || null,
    postalCode: sfRecord.PostalCode || null,
    country: sfRecord.Country || 'USA',
    latitude: sfRecord.Latitude || null,
    longitude: sfRecord.Longitude || null,

    // Work Type and Territory
    serviceTerritoryId: sfRecord.ServiceTerritoryId || null,
    workTypeSalesforceId: sfRecord.WorkTypeId || null,

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

  const workOrders = await prisma.workOrder.findMany({
    select: { id: true, salesforceId: true }
  });
  const workOrderIdMap = new Map(workOrders.map(w => [w.salesforceId, w.id]));
  console.log(`  WorkOrders: ${workOrderIdMap.size}`);

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  return { workOrderIdMap, userIdMap };
}

/**
 * Pull ServiceAppointments from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL SERVICE APPOINTMENTS: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('ServiceAppointment', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${SA_FIELDS.join(', ')} FROM ServiceAppointment WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} ServiceAppointment records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformServiceAppointment(r, idMaps));

    // Stats
    const withWorkOrder = transformed.filter(r => r.workOrderId).length;
    const byStatus = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    console.log('\nStats:');
    console.log(`  With WorkOrder: ${withWorkOrder}/${transformed.length}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('serviceAppointment', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} ServiceAppointments`);

      // Save sync timestamp
      saveLastSyncTime('ServiceAppointment', 'sf_to_pg');
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
 * Push ServiceAppointments from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH SERVICE APPOINTMENTS: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('ServiceAppointment', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.serviceAppointment.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.serviceAppointment.findMany({ where });
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
      'serviceAppointment',
      'ServiceAppointment',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('ServiceAppointment', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: ServiceAppointments');
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
