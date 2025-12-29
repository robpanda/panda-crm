#!/usr/bin/env node
// Update owner data on Accounts that are missing it

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function updateAccountOwners() {
  console.log('=== Updating Account Owners ===');

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

  // Get accounts without owner
  const accountsWithoutOwner = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
    where: {
      salesforceId: { not: null },
      ownerId: null,
    },
  });
  console.log(`Found ${accountsWithoutOwner.length} accounts without owner`);

  if (accountsWithoutOwner.length === 0) {
    console.log('All accounts have owners assigned!');
    await disconnect();
    return;
  }

  // Get salesforce IDs to query
  const sfIds = accountsWithoutOwner.map((a) => a.salesforceId);

  // Query Salesforce for owner data in batches
  const batchSize = 200;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < sfIds.length; i += batchSize) {
    const batch = sfIds.slice(i, i + batchSize);
    const idList = batch.map((id) => `'${id}'`).join(',');
    const soql = `SELECT Id, OwnerId FROM Account WHERE Id IN (${idList})`;

    try {
      const sfAccounts = await querySalesforce(soql);

      for (const sfAccount of sfAccounts) {
        const ownerId = userIdMap.get(sfAccount.OwnerId);
        if (ownerId) {
          await prisma.account.updateMany({
            where: { salesforceId: sfAccount.Id },
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

updateAccountOwners().catch(console.error);
