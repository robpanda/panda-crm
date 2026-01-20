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
  const accountId = accountIdMap.get(sfContact.AccountId) || undefined;

  // Build the contact object with only fields that exist in the schema
  const contact = {
    salesforceId: sfContact.Id,
    firstName: sfContact.FirstName || 'Unknown', // firstName is required, default to 'Unknown'
    lastName: sfContact.LastName || 'Contact',   // lastName is required, default to 'Contact'
    email: sfContact.Email || undefined,
    phone: sfContact.Phone || undefined,
    mobilePhone: sfContact.MobilePhone || undefined,
    title: sfContact.Title || undefined,
    mailingStreet: sfContact.MailingStreet || undefined,
    mailingCity: sfContact.MailingCity || undefined,
    mailingState: sfContact.MailingState || undefined,
    mailingPostalCode: sfContact.MailingPostalCode || undefined,
    // Note: mailingCountry, otherStreet, otherCity, otherState, otherPostalCode, otherCountry
    // are not in the schema, so we skip them
    smsNumber: sfContact.Mogli_SMS__Mogli_Number__c || undefined,
    smsOptOut: sfContact.Mogli_SMS__Mogli_Opt_Out__c || false,
    createdAt: new Date(sfContact.CreatedDate),
    updatedAt: new Date(sfContact.LastModifiedDate),
  };

  // Only add accountId if we have a valid mapping
  if (accountId) {
    contact.accountId = accountId;
  }

  return contact;
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
