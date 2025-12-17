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
  'isPandaClaims__c',
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
  const accountId = accountIdMap.get(sfOpp.AccountId) || null;
  const contactId = contactIdMap.get(sfOpp.ContactId) || null;

  return {
    salesforceId: sfOpp.Id,
    name: sfOpp.Name,
    accountId: accountId,
    contactId: contactId,
    sfAccountId: sfOpp.AccountId,
    sfContactId: sfOpp.ContactId,
    amount: sfOpp.Amount || 0,
    stage: mapOpportunityStage(sfOpp.StageName),
    probability: sfOpp.Probability || 0,
    closeDate: sfOpp.CloseDate ? new Date(sfOpp.CloseDate) : null,
    type: mapOpportunityType(sfOpp.Type),
    leadSource: sfOpp.LeadSource,
    description: sfOpp.Description,
    status: sfOpp.Status__c,
    workType: sfOpp.Work_Type__c,
    isPandaClaims: sfOpp.isPandaClaims__c || false,
    isSelfGen: sfOpp.SelfGen_Lead__c || false,
    isClosed: sfOpp.IsClosed || false,
    isWon: sfOpp.IsWon || false,
    sfOwnerId: sfOpp.OwnerId,
    createdAt: new Date(sfOpp.CreatedDate),
    updatedAt: new Date(sfOpp.LastModifiedDate),
  };
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

    // Transform records
    const opportunities = sfOpps.map((o) => transformOpportunity(o, accountIdMap, contactIdMap));

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('opportunity', opportunities, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${opportunities.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Summary stats
    const open = opportunities.filter((o) => !o.isClosed).length;
    const won = opportunities.filter((o) => o.isWon).length;
    const lost = opportunities.filter((o) => o.isClosed && !o.isWon).length;
    console.log(`Open: ${open}, Won: ${won}, Lost: ${lost}`);

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
