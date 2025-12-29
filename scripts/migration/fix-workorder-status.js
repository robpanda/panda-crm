// Fix Work Order statuses from Salesforce
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Correct status mapping based on actual Salesforce values
const STATUS_MAPPING = {
  'New': 'NEW',
  'Ready to Schedule': 'READY_TO_SCHEDULE',
  'Scheduled': 'SCHEDULED',
  'In Progress': 'IN_PROGRESS',
  'On Hold': 'ON_HOLD',
  'Completed': 'COMPLETED',
  'Cancelled': 'CANCELLED',
  'Canceled': 'CANCELED',
};

async function fixWorkOrderStatuses() {
  console.log('Fixing Work Order statuses from Salesforce...\n');

  try {
    // Query all work orders from Salesforce with their status
    const query = `
      SELECT Id, WorkOrderNumber, Status
      FROM WorkOrder
    `;

    console.log('Fetching work orders from Salesforce...');
    const sfWorkOrders = await querySalesforce(query);
    console.log('Found ' + sfWorkOrders.length + ' work orders in Salesforce\n');

    // Build a map of Salesforce ID to status
    const statusMap = {};
    sfWorkOrders.forEach(wo => {
      statusMap[wo.Id] = wo.Status;
    });

    // Get all work orders from our database that have a Salesforce ID
    const dbWorkOrders = await prisma.workOrder.findMany({
      where: {
        salesforceId: { not: null }
      },
      select: {
        id: true,
        salesforceId: true,
        status: true,
      }
    });

    console.log('Found ' + dbWorkOrders.length + ' work orders in database\n');

    // Track updates by status
    const updates = {
      'READY_TO_SCHEDULE': 0,
      'SCHEDULED': 0,
      'IN_PROGRESS': 0,
      'ON_HOLD': 0,
      'COMPLETED': 0,
      'NEW': 0,
      'CANCELLED': 0,
      'CANCELED': 0,
      'skipped': 0,
      'errors': 0,
    };

    // Update each work order
    let processed = 0;
    for (const wo of dbWorkOrders) {
      const sfStatus = statusMap[wo.salesforceId];

      if (!sfStatus) {
        updates.skipped++;
        continue;
      }

      const newStatus = STATUS_MAPPING[sfStatus];

      if (!newStatus) {
        console.log('Unknown status: ' + sfStatus + ' for WO ' + wo.salesforceId);
        updates.skipped++;
        continue;
      }

      // Only update if status is different
      if (wo.status !== newStatus) {
        try {
          await prisma.workOrder.update({
            where: { id: wo.id },
            data: { status: newStatus }
          });
          updates[newStatus]++;
        } catch (error) {
          console.error('Error updating ' + wo.salesforceId + ': ' + error.message);
          updates.errors++;
        }
      }

      processed++;
      if (processed % 5000 === 0) {
        console.log('Processed ' + processed + '/' + dbWorkOrders.length + ' work orders...');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('WORK ORDER STATUS FIX SUMMARY');
    console.log('='.repeat(50));
    console.log('Updated to READY_TO_SCHEDULE: ' + updates.READY_TO_SCHEDULE);
    console.log('Updated to SCHEDULED: ' + updates.SCHEDULED);
    console.log('Updated to IN_PROGRESS: ' + updates.IN_PROGRESS);
    console.log('Updated to ON_HOLD: ' + updates.ON_HOLD);
    console.log('Updated to COMPLETED: ' + updates.COMPLETED);
    console.log('Updated to NEW: ' + updates.NEW);
    console.log('Updated to CANCELLED: ' + updates.CANCELLED);
    console.log('Skipped (no SF match): ' + updates.skipped);
    console.log('Errors: ' + updates.errors);

    // Verify final distribution
    console.log('\n\nFinal Status Distribution in Database:');
    console.log('='.repeat(50));
    const finalCounts = await prisma.workOrder.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    finalCounts.forEach(s => console.log('  ' + s.status + ': ' + s._count.status));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixWorkOrderStatuses();
