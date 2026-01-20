#!/usr/bin/env node
// Update owner data on Contacts that are missing it

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function updateContactOwners() {
  console.log('=== Updating Contact Owners ===');

  const prisma = getPrismaClient();

  // Get user ID map
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
  });
  console.log(`Loaded ${userIdMap.size} users`);

  // Get contacts without owner
  const contactsWithoutOwner = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
    where: {
      salesforceId: { not: null },
      ownerId: null,
    },
  });
  console.log(`Found ${contactsWithoutOwner.length} contacts without owner`);

  if (contactsWithoutOwner.length === 0) {
    console.log('All contacts have owners assigned!');
    await disconnect();
    return;
  }

  // Get salesforce IDs to query
  const sfIds = contactsWithoutOwner.map((c) => c.salesforceId);

  // Query Salesforce for owner data in batches
  const batchSize = 200;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < sfIds.length; i += batchSize) {
    const batch = sfIds.slice(i, i + batchSize);
    const idList = batch.map((id) => `'${id}'`).join(',');
    const soql = `SELECT Id, OwnerId FROM Contact WHERE Id IN (${idList})`;

    try {
      const sfContacts = await querySalesforce(soql);

      for (const sfContact of sfContacts) {
        const ownerId = userIdMap.get(sfContact.OwnerId);
        if (ownerId) {
          await prisma.contact.updateMany({
            where: { salesforceId: sfContact.Id },
            data: { ownerId: ownerId, updatedAt: new Date() },
          });
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`Processed ${Math.min(i + batchSize, sfIds.length)}/${sfIds.length} - Updated: ${updated}, Skipped (no user): ${skipped}`);
    } catch (error) {
      console.error(`Error processing batch: ${error.message}`);
    }
  }

  console.log('=== Update Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (owner not in system): ${skipped}`);

  await disconnect();
}

updateContactOwners().catch(console.error);
