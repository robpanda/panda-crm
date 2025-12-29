#!/usr/bin/env node
// Migrate WorkOrders from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const WORKORDER_FIELDS = [
  'Id',
  'WorkOrderNumber',
  'Subject',
  'Description',
  'Status',
  'Priority',
  'AccountId',
  'ContactId',
  'Opportunity__c',
  'Street',
  'City',
  'State',
  'PostalCode',
  'Country',
  'StartDate',
  'EndDate',
  'CreatedDate',
  'LastModifiedDate',
  // Custom fields
  'Contract_Total__c',
  'Labor_Order_Total__c',
  'Material_Order_Total__c',
  'Crew_Instructions__c',
  'Roof_SQ__c',
  'Project_Manager__c',
  'Decking_Inspection__c',
  'Work_Completed__c',
  'CompanyCam_Project_ID__c',
  'CompanyCam_Project_Link__c',
  'Crew_Assinged__c',
  'Crew_Lead_Assigned__c',
  'fw10__Total_Invoice_Amount__c',
  'fw10__Total_Paid_Amount__c',
  'fw10__Total_Balance_Amount__c',
];

// Map Salesforce status to Prisma WorkOrderStatus enum
function mapWorkOrderStatus(sfStatus) {
  // Valid: NEW, READY_TO_SCHEDULE, SCHEDULED, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED, CANCELED
  const statusMap = {
    'New': 'NEW',
    'In Progress': 'IN_PROGRESS',
    'On Hold': 'ON_HOLD',
    'Completed': 'COMPLETED',
    'Closed': 'COMPLETED',
    'Canceled': 'CANCELED',
    'Cancelled': 'CANCELLED',
    'Cannot Complete': 'CANCELLED',
    'Ready to Schedule': 'READY_TO_SCHEDULE',
    'Scheduled': 'SCHEDULED',
  };
  return statusMap[sfStatus] || 'NEW';
}

// Map Salesforce priority to Prisma Priority enum
function mapPriority(sfPriority) {
  // Valid: LOW, NORMAL, HIGH, URGENT
  const priorityMap = {
    'Low': 'LOW',
    'Medium': 'NORMAL',
    'Normal': 'NORMAL',
    'High': 'HIGH',
    'Critical': 'URGENT',
  };
  return priorityMap[sfPriority] || 'NORMAL';
}

// Generate work order number if missing
let workOrderCounter = 0;
function generateWorkOrderNumber() {
  workOrderCounter++;
  return `WO-MIGRATED-${String(workOrderCounter).padStart(6, '0')}`;
}

function transformWorkOrder(sfWorkOrder, accountIdMap, opportunityIdMap) {
  const accountId = accountIdMap.get(sfWorkOrder.AccountId) || undefined;
  const opportunityId = opportunityIdMap.get(sfWorkOrder.Opportunity__c) || undefined;

  // Only include fields that exist in the Prisma schema
  const workOrder = {
    salesforceId: sfWorkOrder.Id,
    workOrderNumber: sfWorkOrder.WorkOrderNumber || generateWorkOrderNumber(),
    subject: sfWorkOrder.Subject || undefined,
    description: sfWorkOrder.Description || undefined,
    status: mapWorkOrderStatus(sfWorkOrder.Status),
    priority: mapPriority(sfWorkOrder.Priority),
    startDate: sfWorkOrder.StartDate ? new Date(sfWorkOrder.StartDate) : undefined,
    endDate: sfWorkOrder.EndDate ? new Date(sfWorkOrder.EndDate) : undefined,
    createdAt: new Date(sfWorkOrder.CreatedDate),
    updatedAt: new Date(sfWorkOrder.LastModifiedDate),
  };

  // Only add accountId if we have a valid mapping (required field)
  if (accountId) {
    workOrder.accountId = accountId;
  }

  // Only add opportunityId if we have a valid mapping (optional)
  if (opportunityId) {
    workOrder.opportunityId = opportunityId;
  }

  return workOrder;
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

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map();
  opportunities.forEach((opp) => {
    if (opp.salesforceId) {
      opportunityIdMap.set(opp.salesforceId, opp.id);
    }
  });

  console.log(`Built ID maps: ${accountIdMap.size} accounts, ${opportunityIdMap.size} opportunities`);
  return { accountIdMap, opportunityIdMap };
}

async function migrateWorkOrders() {
  console.log('=== Starting WorkOrder Migration ===');

  try {
    // Build ID maps first
    const { accountIdMap, opportunityIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${WORKORDER_FIELDS.join(', ')} FROM WorkOrder ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce work orders...');

    const sfWorkOrders = await querySalesforce(soql);
    console.log(`Found ${sfWorkOrders.length} work orders to migrate`);

    // Transform records - filter out those without valid accountId (required field)
    const allWorkOrders = sfWorkOrders.map((wo) => transformWorkOrder(wo, accountIdMap, opportunityIdMap));
    const workOrders = allWorkOrders.filter((wo) => wo.accountId);
    const skippedCount = allWorkOrders.length - workOrders.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} work orders without valid account mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('workOrder', workOrders, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${workOrders.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    workOrders.forEach((wo) => {
      statusCounts[wo.status] = (statusCounts[wo.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.workOrderNumber}: ${e.error}`);
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
  migrateWorkOrders()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateWorkOrders, transformWorkOrder };
