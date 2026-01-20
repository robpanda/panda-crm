/**
 * Case Migration Script
 * Migrates Case records from Salesforce to PostgreSQL
 *
 * Prerequisites:
 * - Accounts must be migrated first (migrate-accounts.js)
 * - Contacts must be migrated first (migrate-contacts.js)
 * - Opportunities must be migrated first (migrate-opportunities.js)
 *
 * Usage: node migrate-cases.js [--limit N] [--dry-run]
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';

// Salesforce fields to query
const CASE_FIELDS = [
  'Id',
  'CaseNumber',
  'AccountId',
  'ContactId',
  'Opportunity__c',
  'ParentId',
  'Subject',
  'Description',
  'Type',
  'Status',
  'Priority',
  'Origin',
  'Reason',
  'IsClosed',
  'IsEscalated',
  'ClosedDate',
  'SuppliedName',
  'SuppliedEmail',
  'SuppliedPhone',
  'SuppliedCompany',
  'SlaStartDate',
  'SlaExitDate',
  'StopStartDate',
  'MilestoneStatus',
  'In_Progress_Date__c',
  'SureClaims_Status__c',
  'Account_Owner_Email__c',
  'Account_Owners_Manager__c',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate'
];

// Map Salesforce status to Prisma CaseStatus enum
function mapCaseStatus(sfStatus) {
  const statusMap = {
    'New': 'NEW',
    'Open': 'OPEN',
    'Working': 'WORKING',
    'In Progress': 'IN_PROGRESS',
    'Waiting on Customer': 'WAITING_ON_CUSTOMER',
    'Waiting on Third Party': 'WAITING_ON_THIRD_PARTY',
    'Escalated': 'ESCALATED',
    'Resolved': 'RESOLVED',
    'Closed': 'CLOSED'
  };
  return statusMap[sfStatus] || 'NEW';
}

// Map Salesforce priority to Prisma Priority enum
// Note: Prisma uses LOW, NORMAL, HIGH, CRITICAL (not MEDIUM)
function mapPriority(sfPriority) {
  const priorityMap = {
    'Low': 'LOW',
    'Medium': 'NORMAL',
    'Normal': 'NORMAL',
    'High': 'HIGH',
    'Critical': 'CRITICAL'
  };
  return priorityMap[sfPriority] || 'NORMAL';
}

// Map Salesforce origin to Prisma CaseOrigin enum
function mapCaseOrigin(sfOrigin) {
  const originMap = {
    'Phone': 'PHONE',
    'Email': 'EMAIL',
    'Web': 'WEB',
    'Chat': 'CHAT',
    'Social': 'SOCIAL',
    'In Person': 'IN_PERSON',
    'Other': 'OTHER'
  };
  return originMap[sfOrigin] || 'OTHER';
}

// Transform Salesforce Case to Prisma format (simplified to match actual schema)
function transformCase(sfCase, accountIdMap, contactIdMap, opportunityIdMap, userIdMap) {
  return {
    salesforceId: sfCase.Id,
    caseNumber: sfCase.CaseNumber,
    subject: sfCase.Subject || 'No Subject',
    description: sfCase.Description || null,
    type: sfCase.Type || null,
    status: mapCaseStatus(sfCase.Status),
    priority: mapPriority(sfCase.Priority),

    // Foreign keys - resolve from ID maps
    accountId: sfCase.AccountId ? accountIdMap.get(sfCase.AccountId) || null : null,

    // Timestamps
    createdAt: sfCase.CreatedDate ? new Date(sfCase.CreatedDate) : new Date(),
    updatedAt: sfCase.LastModifiedDate ? new Date(sfCase.LastModifiedDate) : new Date(),
    closedAt: sfCase.ClosedDate ? new Date(sfCase.ClosedDate) : null,
  };
}

// Note: Parent case references not supported in current schema
// The resolveParentCases function was removed as the schema doesn't have parentCaseId field

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  // Get accounts
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Loaded ${accountIdMap.size} accounts`);

  // Get contacts
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
  });
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Loaded ${contactIdMap.size} contacts`);

  // Get opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Loaded ${opportunityIdMap.size} opportunities`);

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, contactIdMap, opportunityIdMap, userIdMap };
}

// Main migration function
async function migrateCases(options = {}) {
  const { limit, dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('CASE MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} records`);
  console.log('');

  try {
    // Connect to Salesforce
    const conn = await getSalesforceConnection();

    // Build ID maps
    const { accountIdMap, contactIdMap, opportunityIdMap, userIdMap } = await buildIdMaps();

    // Build query
    const fields = CASE_FIELDS.join(', ');
    let query = `SELECT ${fields} FROM Case WHERE IsDeleted = false`;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce for Case records...');
    const cases = await querySalesforce(conn, query);
    console.log(`Found ${cases.length} Case records`);

    // Transform records
    console.log('Transforming records...');
    const transformedRecords = cases.map(c =>
      transformCase(c, accountIdMap, contactIdMap, opportunityIdMap, userIdMap)
    );

    // Stats
    const withAccount = transformedRecords.filter(r => r.accountId).length;
    const withClosedAt = transformedRecords.filter(r => r.closedAt).length;

    // Count by type
    const typeCount = {};
    transformedRecords.forEach(r => {
      const type = r.type || 'Unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    // Count by status
    const statusCount = {};
    transformedRecords.forEach(r => {
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
    });

    console.log('');
    console.log('Transformation stats:');
    console.log(`  With Account: ${withAccount}/${transformedRecords.length}`);
    console.log(`  Closed (has closedAt): ${withClosedAt}/${transformedRecords.length}`);
    console.log('');
    console.log('By Case Type:');
    Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('');
    console.log('By Status:');
    Object.entries(statusCount).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log('');

    if (dryRun) {
      console.log('DRY RUN - Skipping database insert');
      console.log('Sample transformed record:');
      console.log(JSON.stringify(transformedRecords[0], null, 2));
    } else {
      // Upsert records
      console.log('Upserting records to PostgreSQL...');
      await batchUpsert('case', transformedRecords, 'salesforceId', 100);
      console.log(`Successfully migrated ${transformedRecords.length} cases`);
    }

    return transformedRecords.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

// Run if called directly
const options = parseArgs();
migrateCases(options)
  .then(count => {
    console.log(`\nMigration complete. Processed ${count} records.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { migrateCases };
