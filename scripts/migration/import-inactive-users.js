#!/usr/bin/env node
// Import inactive/missing users from Salesforce
// These are former employees whose records still exist as owners

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

async function importInactiveUsers() {
  console.log('=== Importing Inactive/Missing Users ===');

  const prisma = getPrismaClient();

  // Get existing user salesforce IDs
  const existingUsers = await prisma.user.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingUserIds = new Set(existingUsers.map((u) => u.salesforceId));
  console.log(`Existing users in CRM: ${existingUserIds.size}`);

  // Query ALL users from Salesforce (active and inactive)
  const soql = `SELECT Id, Name, FirstName, LastName, Email, Username, IsActive,
                       Phone, MobilePhone, Department, Title,
                       CreatedDate, LastModifiedDate
                FROM User
                WHERE UserType = 'Standard'
                ORDER BY Name`;

  console.log('Querying all Salesforce users...');
  const sfUsers = await querySalesforce(soql);
  console.log(`Found ${sfUsers.length} users in Salesforce`);

  // Filter to only users not already imported
  const missingUsers = sfUsers.filter((u) => !existingUserIds.has(u.Id));
  console.log(`Missing users to import: ${missingUsers.length}`);

  if (missingUsers.length === 0) {
    console.log('No missing users to import!');
    await disconnect();
    return;
  }

  // Transform users
  const users = missingUsers.map((sfUser) => ({
    salesforceId: sfUser.Id,
    email: sfUser.Email || `inactive_${sfUser.Id}@panda.local`,
    firstName: sfUser.FirstName || '',
    lastName: sfUser.LastName || sfUser.Name || 'Unknown',
    fullName: sfUser.Name || `${sfUser.FirstName || ''} ${sfUser.LastName || ''}`.trim(),
    phone: sfUser.Phone || undefined,
    mobilePhone: sfUser.MobilePhone || undefined,
    department: sfUser.Department || undefined,
    title: sfUser.Title || undefined,
    isActive: sfUser.IsActive || false,
    createdAt: new Date(sfUser.CreatedDate),
    updatedAt: new Date(sfUser.LastModifiedDate),
  }));

  // Count active vs inactive
  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;
  console.log(`Active users: ${activeCount}, Inactive users: ${inactiveCount}`);

  // Upsert users
  console.log('Upserting users to PostgreSQL...');
  const results = await batchUpsert('user', users, 'salesforceId', 100);

  console.log('=== Import Complete ===');
  console.log(`Processed: ${users.length}`);
  console.log(`Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('Sample errors:');
    results.errors.slice(0, 5).forEach((e) => {
      console.log(`  - ${e.record.fullName}: ${e.error}`);
    });
  }

  await disconnect();
}

importInactiveUsers().catch(console.error);
