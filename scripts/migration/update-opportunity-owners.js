#!/usr/bin/env node
// Update owner data on Opportunities that are missing it

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function updateOpportunityOwners() {
  console.log('=== Updating Opportunity Owners ===');

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

  // Get opportunities without owner
  const oppsWithoutOwner = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
    where: {
      salesforceId: { not: null },
      ownerId: null,
    },
  });
  console.log(`Found ${oppsWithoutOwner.length} opportunities without owner`);

  if (oppsWithoutOwner.length === 0) {
    console.log('All opportunities have owners assigned!');
    await disconnect();
    return;
  }

  // Get salesforce IDs to query
  const sfIds = oppsWithoutOwner.map((o) => o.salesforceId);

  // Query Salesforce for owner data in batches
  const batchSize = 200;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < sfIds.length; i += batchSize) {
    const batch = sfIds.slice(i, i + batchSize);
    const idList = batch.map((id) => `'${id}'`).join(',');
    const soql = `SELECT Id, OwnerId FROM Opportunity WHERE Id IN (${idList})`;

    try {
      const sfOpps = await querySalesforce(soql);

      for (const sfOpp of sfOpps) {
        const ownerId = userIdMap.get(sfOpp.OwnerId);
        if (ownerId) {
          await prisma.opportunity.updateMany({
            where: { salesforceId: sfOpp.Id },
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

updateOpportunityOwners().catch(console.error);
