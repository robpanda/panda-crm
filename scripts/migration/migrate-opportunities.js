#!/usr/bin/env node
// Migrate Opportunities from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const OPPORTUNITY_FIELDS = [
  'Id',
  'Name',
  'AccountId',
  'ContactId',
  'Amount',
  'StageName',
  'Probability',
  'CloseDate',
  'Type',
  'LeadSource',
  'Description',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate',
  'IsClosed',
  'IsWon',
  'Status__c',
  'Work_Type__c',
  'isSureClaims__c',
  'SelfGen_Lead__c',
];

function mapOpportunityStage(sfStage) {
  const stageMap = {
    'Lead Unassigned': 'LEAD_UNASSIGNED',
    'Lead Assigned': 'LEAD_ASSIGNED',
    'Scheduled': 'SCHEDULED',
    'Inspected': 'INSPECTED',
    'Claim Filed': 'CLAIM_FILED',
    'Approved': 'APPROVED',
    'Contract Signed': 'CONTRACT_SIGNED',
    'In Production': 'IN_PRODUCTION',
    'Completed': 'COMPLETED',
    'Closed Won': 'CLOSED_WON',
    'Closed Lost': 'CLOSED_LOST',
  };
  return stageMap[sfStage] || 'LEAD_UNASSIGNED';
}

function mapOpportunityType(sfType) {
  const typeMap = {
    'Insurance': 'INSURANCE',
    'Retail': 'RETAIL',
    'Commercial': 'COMMERCIAL',
  };
  return typeMap[sfType] || 'INSURANCE';
}

function transformOpportunity(sfOpp, accountIdMap, contactIdMap) {
  const accountId = accountIdMap.get(sfOpp.AccountId) || undefined;
  const contactId = contactIdMap.get(sfOpp.ContactId) || undefined;

  // Only include fields that exist in the Prisma schema
  const opp = {
    salesforceId: sfOpp.Id,
    name: sfOpp.Name || 'Unnamed Opportunity',
    amount: sfOpp.Amount || undefined,
    stage: mapOpportunityStage(sfOpp.StageName),
    probability: sfOpp.Probability || 0,
    closeDate: sfOpp.CloseDate ? new Date(sfOpp.CloseDate) : undefined,
    type: mapOpportunityType(sfOpp.Type),
    leadSource: sfOpp.LeadSource || undefined,
    description: sfOpp.Description || undefined,
    status: sfOpp.Status__c || undefined,
    workType: sfOpp.Work_Type__c || undefined,
    isPandaClaims: sfOpp.isSureClaims__c || false,
    isSelfGen: sfOpp.SelfGen_Lead__c || false,
    createdAt: new Date(sfOpp.CreatedDate),
    updatedAt: new Date(sfOpp.LastModifiedDate),
  };

  // Only add accountId if we have a valid mapping (required field)
  if (accountId) {
    opp.accountId = accountId;
  }

  // Only add contactId if we have a valid mapping (optional)
  if (contactId) {
    opp.contactId = contactId;
  }

  return opp;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map();
  accounts.forEach((acc) => {
    if (acc.salesforceId) {
      accountIdMap.set(acc.salesforceId, acc.id);
    }
  });

  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
  });
  const contactIdMap = new Map();
  contacts.forEach((c) => {
    if (c.salesforceId) {
      contactIdMap.set(c.salesforceId, c.id);
    }
  });

  console.log(`Built ID maps: ${accountIdMap.size} accounts, ${contactIdMap.size} contacts`);
  return { accountIdMap, contactIdMap };
}

async function migrateOpportunities() {
  console.log('=== Starting Opportunity Migration ===');

  try {
    // Build ID maps first
    const { accountIdMap, contactIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${OPPORTUNITY_FIELDS.join(', ')} FROM Opportunity ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce opportunities...');

    const sfOpps = await querySalesforce(soql);
    console.log(`Found ${sfOpps.length} opportunities to migrate`);

    // Transform records - filter out those without valid accountId
    const allOpportunities = sfOpps.map((o) => transformOpportunity(o, accountIdMap, contactIdMap));
    const opportunities = allOpportunities.filter((o) => o.accountId);
    const skippedCount = allOpportunities.length - opportunities.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} opportunities without valid account mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('opportunity', opportunities, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${opportunities.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Summary stats based on stage
    const closedWon = opportunities.filter((o) => o.stage === 'CLOSED_WON').length;
    const closedLost = opportunities.filter((o) => o.stage === 'CLOSED_LOST').length;
    const open = opportunities.length - closedWon - closedLost;
    console.log(`Open: ${open}, Won: ${closedWon}, Lost: ${closedLost}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.name}: ${e.error}`);
      });
    }

    return results;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateOpportunities()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateOpportunities, transformOpportunity };
