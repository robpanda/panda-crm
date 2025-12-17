#!/usr/bin/env node
// Migrate Contacts from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const CONTACT_FIELDS = [
  'Id',
  'FirstName',
  'LastName',
  'Email',
  'Phone',
  'MobilePhone',
  'Title',
  'AccountId',
  'MailingStreet',
  'MailingCity',
  'MailingState',
  'MailingPostalCode',
  'MailingCountry',
  'OtherStreet',
  'OtherCity',
  'OtherState',
  'OtherPostalCode',
  'OtherCountry',
  'Description',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate',
  'LeadSource',
  'Mogli_SMS__Mogli_Number__c',
  'Mogli_SMS__Mogli_Opt_Out__c',
];

function transformContact(sfContact, accountIdMap) {
  // Look up internal account ID from Salesforce ID
  const accountId = accountIdMap.get(sfContact.AccountId) || null;

  return {
    salesforceId: sfContact.Id,
    firstName: sfContact.FirstName,
    lastName: sfContact.LastName,
    email: sfContact.Email,
    phone: sfContact.Phone,
    mobilePhone: sfContact.MobilePhone,
    title: sfContact.Title,
    accountId: accountId,
    sfAccountId: sfContact.AccountId,
    mailingStreet: sfContact.MailingStreet,
    mailingCity: sfContact.MailingCity,
    mailingState: sfContact.MailingState,
    mailingPostalCode: sfContact.MailingPostalCode,
    mailingCountry: sfContact.MailingCountry || 'USA',
    otherStreet: sfContact.OtherStreet,
    otherCity: sfContact.OtherCity,
    otherState: sfContact.OtherState,
    otherPostalCode: sfContact.OtherPostalCode,
    otherCountry: sfContact.OtherCountry,
    description: sfContact.Description,
    leadSource: sfContact.LeadSource,
    smsNumber: sfContact.Mogli_SMS__Mogli_Number__c,
    smsOptOut: sfContact.Mogli_SMS__Mogli_Opt_Out__c || false,
    sfOwnerId: sfContact.OwnerId,
    createdAt: new Date(sfContact.CreatedDate),
    updatedAt: new Date(sfContact.LastModifiedDate),
  };
}

async function buildAccountIdMap() {
  const prisma = getPrismaClient();
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });

  const map = new Map();
  accounts.forEach((acc) => {
    if (acc.salesforceId) {
      map.set(acc.salesforceId, acc.id);
    }
  });

  console.log(`Built account ID map with ${map.size} entries`);
  return map;
}

async function migrateContacts() {
  console.log('=== Starting Contact Migration ===');

  try {
    // Build account ID map first
    const accountIdMap = await buildAccountIdMap();

    // Query Salesforce
    const soql = `SELECT ${CONTACT_FIELDS.join(', ')} FROM Contact ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce contacts...');

    const sfContacts = await querySalesforce(soql);
    console.log(`Found ${sfContacts.length} contacts to migrate`);

    // Transform records
    const contacts = sfContacts.map((c) => transformContact(c, accountIdMap));

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('contact', contacts, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${contacts.length}`);
    console.log(`Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.firstName} ${e.record.lastName}: ${e.error}`);
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
  migrateContacts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateContacts, transformContact };
