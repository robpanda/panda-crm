#!/usr/bin/env node
// Migrate Service Appointments from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const SERVICE_APPOINTMENT_FIELDS = [
  'Id',
  'AppointmentNumber',
  'ParentRecordId',
  'ParentRecordType',
  'Subject',
  'Description',
  'Status',
  'Street',
  'City',
  'State',
  'PostalCode',
  'EarliestStartTime',
  'DueDate',
  'SchedStartTime',
  'SchedEndTime',
  'ActualStartTime',
  'ActualEndTime',
  'DurationInMinutes',
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce status to Prisma AppointmentStatus enum
function mapAppointmentStatus(sfStatus) {
  // Valid: NONE, SCHEDULED, DISPATCHED, IN_PROGRESS, COMPLETED, CANNOT_COMPLETE, CANCELED
  const statusMap = {
    'None': 'NONE',
    'Scheduled': 'SCHEDULED',
    'Dispatched': 'DISPATCHED',
    'In Progress': 'IN_PROGRESS',
    'Completed': 'COMPLETED',
    'Cannot Complete': 'CANNOT_COMPLETE',
    'Canceled': 'CANCELED',
    'Cancelled': 'CANCELED',
  };
  return statusMap[sfStatus] || 'NONE';
}

// Generate appointment number if missing
let appointmentCounter = 0;
function generateAppointmentNumber() {
  appointmentCounter++;
  return `SA-MIGRATED-${String(appointmentCounter).padStart(6, '0')}`;
}

function transformServiceAppointment(sfAppointment, workOrderIdMap) {
  // Determine work order ID from parent record if it's a WorkOrder
  let workOrderId = undefined;
  if (sfAppointment.ParentRecordType === 'WorkOrder' && sfAppointment.ParentRecordId) {
    workOrderId = workOrderIdMap.get(sfAppointment.ParentRecordId);
  }

  // Only include fields that exist in the Prisma schema
  const appointment = {
    salesforceId: sfAppointment.Id,
    appointmentNumber: sfAppointment.AppointmentNumber || generateAppointmentNumber(),
    subject: sfAppointment.Subject || undefined,
    description: sfAppointment.Description || undefined,
    status: mapAppointmentStatus(sfAppointment.Status),
    street: sfAppointment.Street || undefined,
    city: sfAppointment.City || undefined,
    state: sfAppointment.State || undefined,
    postalCode: sfAppointment.PostalCode || undefined,
    earliestStart: sfAppointment.EarliestStartTime ? new Date(sfAppointment.EarliestStartTime) : undefined,
    dueDate: sfAppointment.DueDate ? new Date(sfAppointment.DueDate) : undefined,
    scheduledStart: sfAppointment.SchedStartTime ? new Date(sfAppointment.SchedStartTime) : undefined,
    scheduledEnd: sfAppointment.SchedEndTime ? new Date(sfAppointment.SchedEndTime) : undefined,
    actualStart: sfAppointment.ActualStartTime ? new Date(sfAppointment.ActualStartTime) : undefined,
    actualEnd: sfAppointment.ActualEndTime ? new Date(sfAppointment.ActualEndTime) : undefined,
    duration: sfAppointment.DurationInMinutes ? parseInt(sfAppointment.DurationInMinutes) : undefined,
    createdAt: new Date(sfAppointment.CreatedDate),
    updatedAt: new Date(sfAppointment.LastModifiedDate),
  };

  // Only add workOrderId if we have a valid mapping (required field)
  if (workOrderId) {
    appointment.workOrderId = workOrderId;
  }

  return appointment;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  const workOrders = await prisma.workOrder.findMany({
    select: { id: true, salesforceId: true },
  });
  const workOrderIdMap = new Map();
  workOrders.forEach((wo) => {
    if (wo.salesforceId) {
      workOrderIdMap.set(wo.salesforceId, wo.id);
    }
  });

  console.log(`Built ID maps: ${workOrderIdMap.size} work orders`);
  return { workOrderIdMap };
}

async function migrateServiceAppointments() {
  console.log('=== Starting Service Appointment Migration ===');

  try {
    // Build ID maps first
    const { workOrderIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${SERVICE_APPOINTMENT_FIELDS.join(', ')} FROM ServiceAppointment ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce service appointments...');

    const sfAppointments = await querySalesforce(soql);
    console.log(`Found ${sfAppointments.length} service appointments to migrate`);

    // Transform records - filter out those without valid workOrderId (required field)
    const allAppointments = sfAppointments.map((sa) => transformServiceAppointment(sa, workOrderIdMap));
    const appointments = allAppointments.filter((sa) => sa.workOrderId);
    const skippedCount = allAppointments.length - appointments.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} appointments without valid work order mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('serviceAppointment', appointments, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${appointments.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    appointments.forEach((sa) => {
      statusCounts[sa.status] = (statusCounts[sa.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Scheduling stats
    const scheduled = appointments.filter((sa) => sa.scheduledStart).length;
    const completed = appointments.filter((sa) => sa.status === 'COMPLETED').length;
    console.log(`\nScheduled: ${scheduled}`);
    console.log(`Completed: ${completed}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.appointmentNumber}: ${e.error}`);
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
  migrateServiceAppointments()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateServiceAppointments, transformServiceAppointment };
