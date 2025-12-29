/**
 * Migrate Missing Work Orders
 * Finds and migrates Work Orders that exist in Salesforce but not in Panda CRM
 */

import jsforce from 'jsforce';
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// Map Salesforce status to Prisma WorkOrderStatus enum
function mapWorkOrderStatus(sfStatus) {
  const statusMap = {
    'New': 'NEW',
    'Ready to Schedule': 'READY_TO_SCHEDULE',
    'Scheduled': 'SCHEDULED',
    'In Progress': 'IN_PROGRESS',
    'On Hold': 'ON_HOLD',
    'Completed': 'COMPLETED',
    'Closed': 'COMPLETED',
    'Canceled': 'CANCELLED',
    'Cancelled': 'CANCELLED',
    'Cannot Complete': 'CANCELLED'
  };
  return statusMap[sfStatus] || 'NEW';
}

// Map Salesforce priority to Prisma Priority enum
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

async function getConnection() {
  const connection = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });
  await connection.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  console.log('Connected to Salesforce:', connection.instanceUrl);
  return connection;
}

async function migrateMissingWorkOrders() {
  console.log('='.repeat(60));
  console.log('MIGRATE MISSING WORK ORDERS');
  console.log('='.repeat(60));
  console.log('');

  try {
    const conn = await getConnection();

    // Step 1: Get existing Salesforce IDs from our database
    console.log('Loading existing Work Order Salesforce IDs...');
    const existingWOs = await prisma.workOrder.findMany({
      where: { salesforceId: { not: null } },
      select: { salesforceId: true }
    });
    const existingIds = new Set(existingWOs.map(wo => wo.salesforceId));
    console.log('Existing Work Orders in CRM:', existingIds.size);

    // Step 2: Build ID maps for foreign key resolution
    console.log('\nBuilding ID maps for foreign key resolution...');

    const accounts = await prisma.account.findMany({
      select: { id: true, salesforceId: true },
    });
    const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
    console.log('  Loaded', accountIdMap.size, 'accounts');

    const opportunities = await prisma.opportunity.findMany({
      select: { id: true, salesforceId: true },
    });
    const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
    console.log('  Loaded', opportunityIdMap.size, 'opportunities');

    const contacts = await prisma.contact.findMany({
      select: { id: true, salesforceId: true },
    });
    const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
    console.log('  Loaded', contactIdMap.size, 'contacts');

    const users = await prisma.user.findMany({
      select: { id: true, salesforceId: true },
      where: { salesforceId: { not: null } },
    });
    const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
    console.log('  Loaded', userIdMap.size, 'users');

    // Step 3: Fetch ALL Work Orders from Salesforce
    console.log('\nFetching ALL Work Orders from Salesforce...');

    let allSfWorkOrders = [];
    const result = await conn.query(`
      SELECT Id, WorkOrderNumber, Subject, Description, Status, Priority,
             AccountId, ContactId, Opportunity__c, WorkTypeId,
             Street, City, State, PostalCode, Country, Latitude, Longitude,
             StartDate, EndDate, Duration, DurationType,
             Tax, Subtotal, Discount, TotalPrice, GrandTotal,
             Contract_Total__c, Labor_Order_Total__c, Material_Order_Total__c,
             Crew_Instructions__c, Roof_SQ__c, Project_Manager__c,
             Decking_Inspection__c, Work_Completed__c,
             companycam__ProjectID__c, CompanyCam_Project_Link__c,
             Crew_Assinged__c, Crew_Lead_Assigned__c,
             OwnerId, CreatedDate, LastModifiedDate
      FROM WorkOrder
      WHERE IsDeleted = false
      ORDER BY CreatedDate DESC
    `);

    allSfWorkOrders = result.records;
    let nextRecordsUrl = result.nextRecordsUrl;

    while (nextRecordsUrl) {
      console.log('  Fetching more... total so far:', allSfWorkOrders.length);
      const moreResult = await conn.queryMore(nextRecordsUrl);
      allSfWorkOrders = allSfWorkOrders.concat(moreResult.records);
      nextRecordsUrl = moreResult.nextRecordsUrl;
    }

    console.log('Total Work Orders in Salesforce:', allSfWorkOrders.length);

    // Step 4: Filter to only missing ones
    const missingWOs = allSfWorkOrders.filter(wo => !existingIds.has(wo.Id));
    console.log('\nMissing Work Orders to migrate:', missingWOs.length);

    if (missingWOs.length === 0) {
      console.log('No missing Work Orders found. All synced!');
      await prisma.$disconnect();
      return;
    }

    // Step 5: Filter to only those WITH a valid accountId (required field)
    const migratable = missingWOs.filter(wo => {
      const accountId = wo.AccountId ? accountIdMap.get(wo.AccountId) : null;
      return accountId !== null && accountId !== undefined;
    });

    const skippedNoAccount = missingWOs.length - migratable.length;
    console.log('  Work Orders with valid Account:', migratable.length);
    console.log('  Skipped (no Account in CRM):', skippedNoAccount);

    // Step 6: Transform and insert missing records
    console.log('\nTransforming and inserting missing records...');

    let inserted = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < migratable.length; i += batchSize) {
      const batch = migratable.slice(i, i + batchSize);

      for (const wo of batch) {
        try {
          // accountId is REQUIRED - we already filtered for this
          const accountId = accountIdMap.get(wo.AccountId);

          const data = {
            salesforceId: wo.Id,
            workOrderNumber: wo.WorkOrderNumber,
            subject: wo.Subject || null,
            description: wo.Description || null,
            status: mapWorkOrderStatus(wo.Status),
            priority: mapPriority(wo.Priority),

            // Foreign keys - accountId is REQUIRED
            accountId: accountId,
            opportunityId: wo.Opportunity__c ? opportunityIdMap.get(wo.Opportunity__c) || null : null,

            // Dates
            startDate: wo.StartDate ? new Date(wo.StartDate) : null,
            endDate: wo.EndDate ? new Date(wo.EndDate) : null,

            // Timestamps
            createdAt: wo.CreatedDate ? new Date(wo.CreatedDate) : new Date(),
            updatedAt: wo.LastModifiedDate ? new Date(wo.LastModifiedDate) : new Date()
          };

          await prisma.workOrder.create({ data });
          inserted++;
        } catch (err) {
          errors++;
          if (errors <= 5) {
            console.error('Error inserting', wo.WorkOrderNumber + ':', err.message);
          }
        }
      }

      if ((i + batchSize) % 1000 === 0 || i + batchSize >= migratable.length) {
        console.log('  Processed', Math.min(i + batchSize, migratable.length), '/', migratable.length,
                    '- Inserted:', inserted, 'Errors:', errors);
      }
    }

    // Step 7: Summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log('Total missing Work Orders found:', missingWOs.length);
    console.log('  With valid Account (migratable):', migratable.length);
    console.log('  Without Account (skipped):', skippedNoAccount);
    console.log('Successfully inserted:', inserted);
    console.log('Errors:', errors);

    // Final count
    const finalCount = await prisma.workOrder.count();
    console.log('\nFinal Work Order count in database:', finalCount);

    // Status distribution
    const statusDist = await prisma.workOrder.groupBy({
      by: ['status'],
      _count: { status: true }
    });
    console.log('\nFinal Status Distribution:');
    statusDist.forEach(s => {
      console.log('  ' + s.status + ': ' + s._count.status);
    });

    await prisma.$disconnect();

  } catch (error) {
    console.error('Migration failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

migrateMissingWorkOrders();
