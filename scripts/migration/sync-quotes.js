#!/usr/bin/env node
/**
 * Bidirectional Quote Sync Script
 *
 * Syncs Quote records between Salesforce and PostgreSQL in both directions.
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

// Salesforce Quote fields
const QUOTE_FIELDS = [
  'Id', 'Name', 'QuoteNumber', 'OpportunityId', 'AccountId', 'ContactId',
  'Status', 'ExpirationDate', 'Description',
  'GrandTotal', 'TotalPrice', 'Subtotal', 'Discount', 'Tax',
  'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry',
  'ShippingStreet', 'ShippingCity', 'ShippingState', 'ShippingPostalCode', 'ShippingCountry',
  'OwnerId', 'IsSyncing',
  'CreatedDate', 'LastModifiedDate', 'IsDeleted'
];

// Status mapping: Salesforce → Prisma enum
const STATUS_MAP = {
  'Draft': 'DRAFT',
  'Needs Review': 'NEEDS_REVIEW',
  'In Review': 'IN_REVIEW',
  'Approved': 'APPROVED',
  'Rejected': 'REJECTED',
  'Presented': 'PRESENTED',
  'Accepted': 'ACCEPTED',
  'Denied': 'DENIED'
};

/**
 * Transform Salesforce Quote to Prisma format
 */
function transformQuote(sfRecord, idMaps) {
  const { opportunityIdMap, accountIdMap, contactIdMap, userIdMap } = idMaps;

  return {
    salesforceId: sfRecord.Id,
    name: sfRecord.Name || null,
    quoteNumber: sfRecord.QuoteNumber || null,
    description: sfRecord.Description || null,
    status: STATUS_MAP[sfRecord.Status] || 'DRAFT',

    // Foreign keys
    opportunityId: sfRecord.OpportunityId ? opportunityIdMap.get(sfRecord.OpportunityId) || null : null,
    accountId: sfRecord.AccountId ? accountIdMap.get(sfRecord.AccountId) || null : null,
    contactId: sfRecord.ContactId ? contactIdMap.get(sfRecord.ContactId) || null : null,
    ownerId: sfRecord.OwnerId ? userIdMap.get(sfRecord.OwnerId) || null : null,

    // Dates
    expirationDate: sfRecord.ExpirationDate ? new Date(sfRecord.ExpirationDate) : null,

    // Pricing
    grandTotal: sfRecord.GrandTotal || null,
    totalPrice: sfRecord.TotalPrice || null,
    subtotal: sfRecord.Subtotal || null,
    discount: sfRecord.Discount || null,
    tax: sfRecord.Tax || null,

    // Billing Address
    billingStreet: sfRecord.BillingStreet || null,
    billingCity: sfRecord.BillingCity || null,
    billingState: sfRecord.BillingState || null,
    billingPostalCode: sfRecord.BillingPostalCode || null,
    billingCountry: sfRecord.BillingCountry || null,

    // Shipping Address
    shippingStreet: sfRecord.ShippingStreet || null,
    shippingCity: sfRecord.ShippingCity || null,
    shippingState: sfRecord.ShippingState || null,
    shippingPostalCode: sfRecord.ShippingPostalCode || null,
    shippingCountry: sfRecord.ShippingCountry || null,

    // Sync status
    isSyncing: sfRecord.IsSyncing || false,

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

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true }
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Opportunities: ${opportunityIdMap.size}`);

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

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  return { opportunityIdMap, accountIdMap, contactIdMap, userIdMap };
}

/**
 * Pull Quotes from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL QUOTES: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Quote', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Build query
    let query = `SELECT ${QUOTE_FIELDS.join(', ')} FROM Quote WHERE IsDeleted = false`;
    if (lastSync) {
      query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce...');
    const sfRecords = await querySalesforce(conn, query);
    console.log(`Found ${sfRecords.length} Quote records`);

    if (sfRecords.length === 0) {
      console.log('No new records to sync');
      return { synced: 0, errors: 0 };
    }

    // Transform records
    console.log('Transforming records...');
    const transformed = sfRecords.map(r => transformQuote(r, idMaps));

    // Stats
    const withOpportunity = transformed.filter(r => r.opportunityId).length;
    const byStatus = {};
    transformed.forEach(r => {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });

    console.log('\nStats:');
    console.log(`  With Opportunity: ${withOpportunity}/${transformed.length}`);
    console.log('  By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    // Calculate total quote value
    const totalValue = transformed.reduce((sum, q) => sum + (q.grandTotal || 0), 0);
    console.log(`  Total Quote Value: $${totalValue.toLocaleString()}`);

    if (!dryRun) {
      console.log('\nUpserting to PostgreSQL...');
      await batchUpsert('quote', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Quotes`);

      // Save sync timestamp
      saveLastSyncTime('Quote', 'sf_to_pg');
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
 * Push Quotes from PostgreSQL to Salesforce
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH QUOTES: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Quote', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres
    let where = lastSync ? { updatedAt: { gt: lastSync } } : {};
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.quote.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.quote.findMany({ where });
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
      'quote',
      'Quote',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Quote', 'pg_to_sf');
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
  console.log('BIDIRECTIONAL SYNC: Quotes');
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
