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
// Note: User_Profle__c is the owner field (typo exists in Salesforce)
// Note: No Commission_Amount__c - calculated field, use Paid_Amount__c instead
// Note: RequestedAmount__c (not Requested_Amount__c - both exist, using without underscore)
// Note: Service_Contract__r.Opportunity__c to get Opportunity ID via Service Contract relationship
const COMMISSION_FIELDS = [
  'Id', 'Name', 'User_Profle__c',
  'Service_Contract__c', 'Service_Contract__r.Opportunity__c', 'Invoice__c',
  'Commission_Type__c', 'Status__c',
  'Commission_Value__c', 'Commission_Rate_of_Pay__c',
  'Paid_Amount__c', 'Paid_Date__c',
  'Request_Date__c', 'RequestedAmount__c',
  'isCompanyLead__c', 'isSelfGen__c',
  'Notes__c',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Commission type mapping (from Salesforce)
// Salesforce values: null, Pre-Commission, Commission, Override, Supplement Override,
//                    Sales Op Commission, Pre-Supplements, Payroll Adjustment, Bonus, Sales Flip
// Prisma enum: PRE_COMMISSION, BACK_END, SALES_OP, SUPPLEMENT_OVERRIDE, PM_COMMISSION,
//              MANAGER_OVERRIDE, REGIONAL_MANAGER_OVERRIDE, DIRECTOR_OVERRIDE, EXECUTIVE_OVERRIDE,
//              SALES_FLIP, PAYROLL_ADJUSTMENT, COMPANY_LEAD, SELF_GEN
const COMMISSION_TYPE_MAP = {
  'Pre-Commission': 'PRE_COMMISSION',
  'Commission': 'BACK_END',
  'Back-End Commission': 'BACK_END',
  'Override': 'MANAGER_OVERRIDE',
  'Manager Override': 'MANAGER_OVERRIDE',
  'Sales Op Commission': 'SALES_OP',
  'Supplement Override': 'SUPPLEMENT_OVERRIDE',
  'Pre-Supplements': 'PRE_COMMISSION',
  'Payroll Adjustment': 'PAYROLL_ADJUSTMENT',
  'Bonus': 'BACK_END', // No bonus type, map to BACK_END
  'Sales Flip': 'SALES_FLIP',
  'Referral': 'BACK_END', // No referral type, map to BACK_END
  'Other': 'BACK_END'
};

// Status mapping (from Salesforce)
// Salesforce values: Paid, Requested, Hold, Denied, Clawedback, New
// Prisma enum: NEW, REQUESTED, APPROVED, HOLD, PAID, DENIED
const STATUS_MAP = {
  'New': 'NEW',
  'Pending': 'NEW',
  'Requested': 'REQUESTED',
  'Approved': 'APPROVED',
  'Paid': 'PAID',
  'Denied': 'DENIED',
  'Rejected': 'DENIED',
  'Hold': 'HOLD',
  'On Hold': 'HOLD',
  'Clawedback': 'DENIED' // Map clawedback to DENIED for now
};

/**
 * Transform Salesforce Commission to Prisma format
 */
function transformCommission(sfRecord, idMaps) {
  const { userIdMap, contractIdMap, opportunityIdMap } = idMaps;

  // Map Salesforce status to our status - handle null as NEW
  const sfStatus = sfRecord.Status__c || 'New';
  const mappedStatus = STATUS_MAP[sfStatus] || 'NEW';

  // Map commission type - null means legacy/general commission
  const sfType = sfRecord.Commission_Type__c || 'Commission';
  const mappedType = COMMISSION_TYPE_MAP[sfType] || 'BACK_END';

  // Get ownerId - must be valid for required field
  const ownerId = sfRecord.User_Profle__c ? userIdMap.get(sfRecord.User_Profle__c) : null;

  // Skip records without owner - ownerId is required in schema
  if (!ownerId) {
    return null;
  }

  // Get opportunityId from Service_Contract__r.Opportunity__c relationship
  const sfOpportunityId = sfRecord.Service_Contract__r?.Opportunity__c;
  const opportunityId = sfOpportunityId ? opportunityIdMap.get(sfOpportunityId) || null : null;

  return {
    salesforceId: sfRecord.Id,
    name: sfRecord.Name || null,
    notes: sfRecord.Notes__c || null,

    // Type and Status (Prisma field is 'type' not 'commissionType')
    type: mappedType,
    status: mappedStatus,

    // Foreign keys - User_Profle__c is the owner field (typo in Salesforce)
    ownerId: ownerId,
    serviceContractId: sfRecord.Service_Contract__c ? contractIdMap.get(sfRecord.Service_Contract__c) || null : null,
    opportunityId: opportunityId,

    // Financial - all Decimal fields, use 0 as default
    commissionValue: sfRecord.Commission_Value__c || 0,
    commissionRate: sfRecord.Commission_Rate_of_Pay__c || 0,
    commissionAmount: sfRecord.Paid_Amount__c || 0, // Use Paid_Amount as the amount

    // Request info
    requestedAmount: sfRecord.RequestedAmount__c || null,
    requestedDate: sfRecord.Request_Date__c ? new Date(sfRecord.Request_Date__c) : null,

    // Lead type flags
    isCompanyLead: sfRecord.isCompanyLead__c || false,
    isSelfGen: sfRecord.isSelfGen__c || false,

    // Payment
    paidDate: sfRecord.Paid_Date__c ? new Date(sfRecord.Paid_Date__c) : null,
    paidAmount: sfRecord.Paid_Amount__c || null,

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

  // Try to get contracts if the table exists
  let contractIdMap = new Map();
  try {
    const contracts = await prisma.serviceContract.findMany({
      select: { id: true, salesforceId: true },
      where: { salesforceId: { not: null } }
    });
    contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));
    console.log(`  Contracts: ${contractIdMap.size}`);
  } catch (e) {
    console.log(`  Contracts: 0 (table may not exist)`);
  }

  // Try to get opportunities for linking commissions to jobs
  let opportunityIdMap = new Map();
  try {
    const opportunities = await prisma.opportunity.findMany({
      select: { id: true, salesforceId: true },
      where: { salesforceId: { not: null } }
    });
    opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
    console.log(`  Opportunities: ${opportunityIdMap.size}`);
  } catch (e) {
    console.log(`  Opportunities: 0 (table may not exist)`);
  }

  return { userIdMap, contractIdMap, opportunityIdMap };
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

    // Transform records - filter out nulls (records without valid owner)
    console.log('Transforming records...');
    const allTransformed = sfRecords.map(r => transformCommission(r, idMaps));
    const transformed = allTransformed.filter(r => r !== null);
    const skipped = allTransformed.length - transformed.length;

    console.log(`  Transformed: ${transformed.length}, Skipped (no owner): ${skipped}`);

    if (transformed.length === 0) {
      console.log('No records with valid owners to sync');
      return { synced: 0, errors: 0, skipped };
    }

    // Stats
    const withOwner = transformed.filter(r => r.ownerId).length;
    const withContract = transformed.filter(r => r.serviceContractId).length;
    const withOpportunity = transformed.filter(r => r.opportunityId).length;
    const byType = {};
    const byStatus = {};
    transformed.forEach(r => {
      byType[r.type] = (byType[r.type] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    const totalAmount = transformed.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);

    console.log('\nStats:');
    console.log(`  With Owner: ${withOwner}/${transformed.length}`);
    console.log(`  With Contract: ${withContract}/${transformed.length}`);
    console.log(`  With Opportunity: ${withOpportunity}/${transformed.length}`);
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
      console.log(`Successfully synced ${transformed.length} Commissions (skipped ${skipped})`);

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
