#!/usr/bin/env node
// Update Owner data on already-migrated records
// This script updates ownerId on Accounts, Leads, Opportunities, and WorkOrders
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function buildUserIdMap() {
  const prisma = getPrismaClient();

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
  });

  console.log(`Built user ID map: ${userIdMap.size} users`);
  return userIdMap;
}

async function updateAccountOwners(userIdMap) {
  const prisma = getPrismaClient();
  console.log('\n=== Updating Account Owners ===');

  // Query Salesforce for account owners
  const sfAccounts = await querySalesforce('SELECT Id, OwnerId FROM Account');
  console.log(`Found ${sfAccounts.length} accounts in Salesforce`);

  let updated = 0;
  let notFound = 0;
  let noUser = 0;

  for (const sfAcc of sfAccounts) {
    const ownerId = userIdMap.get(sfAcc.OwnerId);
    if (!ownerId) {
      noUser++;
      continue;
    }

    try {
      await prisma.account.updateMany({
        where: { salesforceId: sfAcc.Id },
        data: { ownerId },
      });
      updated++;
    } catch (e) {
      notFound++;
    }
  }

  console.log(`Updated: ${updated}, No user mapping: ${noUser}, Not found: ${notFound}`);
}

async function updateLeadOwners(userIdMap) {
  const prisma = getPrismaClient();
  console.log('\n=== Updating Lead Owners ===');

  const sfLeads = await querySalesforce('SELECT Id, OwnerId FROM Lead');
  console.log(`Found ${sfLeads.length} leads in Salesforce`);

  let updated = 0;
  let noUser = 0;

  for (const sfLead of sfLeads) {
    const ownerId = userIdMap.get(sfLead.OwnerId);
    if (!ownerId) {
      noUser++;
      continue;
    }

    try {
      await prisma.lead.updateMany({
        where: { salesforceId: sfLead.Id },
        data: { ownerId },
      });
      updated++;
    } catch (e) {
      // Record not found, skip
    }
  }

  console.log(`Updated: ${updated}, No user mapping: ${noUser}`);
}

async function updateOpportunityOwners(userIdMap) {
  const prisma = getPrismaClient();
  console.log('\n=== Updating Opportunity Owners ===');

  const sfOpps = await querySalesforce('SELECT Id, OwnerId FROM Opportunity');
  console.log(`Found ${sfOpps.length} opportunities in Salesforce`);

  let updated = 0;
  let noUser = 0;

  for (const sfOpp of sfOpps) {
    const ownerId = userIdMap.get(sfOpp.OwnerId);
    if (!ownerId) {
      noUser++;
      continue;
    }

    try {
      await prisma.opportunity.updateMany({
        where: { salesforceId: sfOpp.Id },
        data: { ownerId },
      });
      updated++;
    } catch (e) {
      // Record not found, skip
    }
  }

  console.log(`Updated: ${updated}, No user mapping: ${noUser}`);
}

async function updateContactOwners(userIdMap) {
  const prisma = getPrismaClient();
  console.log('\n=== Updating Contact Owners ===');

  const sfContacts = await querySalesforce('SELECT Id, OwnerId FROM Contact');
  console.log(`Found ${sfContacts.length} contacts in Salesforce`);

  let updated = 0;
  let noUser = 0;

  // Check if Contact model has ownerId field
  try {
    for (const sfContact of sfContacts) {
      const ownerId = userIdMap.get(sfContact.OwnerId);
      if (!ownerId) {
        noUser++;
        continue;
      }

      try {
        await prisma.contact.updateMany({
          where: { salesforceId: sfContact.Id },
          data: { ownerId },
        });
        updated++;
      } catch (e) {
        // Record not found or field doesn't exist
      }
    }
    console.log(`Updated: ${updated}, No user mapping: ${noUser}`);
  } catch (e) {
    console.log('Contact model may not have ownerId field - skipping');
  }
}

async function main() {
  console.log('=== Starting Owner Update ===');
  console.log('This will update ownerId on Accounts, Leads, Opportunities, and Contacts\n');

  try {
    const userIdMap = await buildUserIdMap();

    await updateAccountOwners(userIdMap);
    await updateLeadOwners(userIdMap);
    await updateOpportunityOwners(userIdMap);
    await updateContactOwners(userIdMap);

    console.log('\n=== Owner Update Complete ===');
  } catch (error) {
    console.error('Owner update failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { updateAccountOwners, updateLeadOwners, updateOpportunityOwners };
