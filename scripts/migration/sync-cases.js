#!/usr/bin/env node
/**
 * Bidirectional Case Sync Script
 *
 * Syncs Case records between Salesforce and PostgreSQL.
 *
 * Cases can be linked to Accounts, Contacts, and Opportunities.
 * They support parent-child hierarchies for related cases.
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

// Salesforce Case fields
const CASE_FIELDS = [
  'Id', 'CaseNumber', 'Subject', 'Description',
  'Status', 'Priority', 'Origin', 'Type', 'Reason',
  'AccountId', 'ContactId', 'Opportunity__c',
  'OwnerId', 'ParentId',
  'IsClosed', 'ClosedDate',
  'SlaStartDate', 'SlaExitDate', 'IsStopped',
  'StopStartDate', 'IsEscalated',
  'SureClaims_Status__c',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping
const STATUS_MAP = {
  'New': 'NEW',
  'Working': 'WORKING',
  'Escalated': 'ESCALATED',
  'Closed': 'CLOSED',
  'On Hold': 'ON_HOLD'
};

// Priority mapping
const PRIORITY_MAP = {
  'Low': 'LOW',
  'Medium': 'MEDIUM',
  'High': 'HIGH',
  'Critical': 'CRITICAL'
};

/**
 * Transform Salesforce Case to Prisma format
 */
function transformCase(sfRecord, idMaps) {
  const { accountIdMap, contactIdMap, opportunityIdMap, userIdMap, caseIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    caseNumber: sfRecord.CaseNumber || null,
    subject: sfRecord.Subject || null,
    description: sfRecord.Description || null,
    status: STATUS_MAP[sfRecord.Status] || 'NEW',
    priority: PRIORITY_MAP[sfRecord.Priority] || 'MEDIUM',
    origin: sfRecord.Origin || null,
    type: sfRecord.Type || null,
    reason: sfRecord.Reason || null,

    // Foreign keys
    accountId: sfRecord.AccountId ? accountIdMap.get(sfRecord.AccountId) || null : null,
    contactId: sfRecord.ContactId ? contactIdMap.get(sfRecord.ContactId) || null : null,
    opportunityId: sfRecord.Opportunity__c ? opportunityIdMap.get(sfRecord.Opportunity__c) || null : null,
    ownerId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,

    // Parent case (resolved after initial load)
    parentCaseSalesforceId: sfRecord.ParentId || null,

    // Closed status
    isClosed: sfRecord.IsClosed || false,
    closedDate: sfRecord.ClosedDate ? new Date(sfRecord.ClosedDate) : null,

    // SLA fields
    slaStartDate: sfRecord.SlaStartDate ? new Date(sfRecord.SlaStartDate) : null,
    slaExitDate: sfRecord.SlaExitDate ? new Date(sfRecord.SlaExitDate) : null,
    isStopped: sfRecord.IsStopped || false,
    stopStartDate: sfRecord.StopStartDate ? new Date(sfRecord.StopStartDate) : null,
    isEscalated: sfRecord.IsEscalated || false,

    // Custom fields
    sureClaimsStatus: sfRecord.SureClaims_Status__c || null,

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

  // Get existing cases for parent resolution
  const cases = await prisma.case.findMany({
    select: { id: true, salesforceId: true }
  });
  const caseIdMap = new Map(cases.map(c => [c.salesforceId, c.id]));
  console.log(`  Cases: ${caseIdMap.size}`);

  return { accountIdMap, contactIdMap, opportunityIdMap, userIdMap, caseIdMap };
}

/**
 * Resolve case parent hierarchy
 */
async function resolveCaseHierarchy() {
  console.log('\nResolving case hierarchy...');

  const cases = await prisma.case.findMany({
    select: { id: true, salesforceId: true, parentCaseSalesforceId: true }
  });

  const sfIdToId = new Map(cases.map(c => [c.salesforceId, c.id]));

  let updated = 0;
  for (const caseRecord of cases) {
    if (caseRecord.parentCaseSalesforceId) {
      const parentId = sfIdToId.get(caseRecord.parentCaseSalesforceId);
      if (parentId) {
        await prisma.case.update({
          where: { id: caseRecord.id },
          data: { parentCaseId: parentId }
        });
        updated++;
      }
    }
  }

  console.log(`  Resolved ${updated} parent case relationships`);
}

/**
 * Pull Cases from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL CASES: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Case', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${CASE_FIELDS.join(', ')} FROM Case WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} Case records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformCase(r, idMaps));

    // Stats
    const withAccount = transformed.filter(r => r.accountId).length;
    const withOpportunity = transformed.filter(r => r.opportunityId).length;
    const closed = transformed.filter(r => r.isClosed).length;
    const byStatus = {};
    const byType = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.type) byType[r.type] = (byType[r.type] || 0) + 1;
    });

    console.log('\nStats:');
    console.log(`  With Account: ${withAccount}/${transformed.length}`);
    console.log(`  With Opportunity: ${withOpportunity}/${transformed.length}`);
    console.log(`  Closed: ${closed}/${transformed.length}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });
    console.log('  By Type (top 10):');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('case', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Cases`);

      // Resolve hierarchy after upsert
      await resolveCaseHierarchy();

      // Save sync timestamp
      saveLastSyncTime('Case', 'sf_to_pg');
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
 * Push Cases from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH CASES: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Case', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.case.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.case.findMany({ where });
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
      'case',
      'Case',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Case', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: Cases');
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
