#!/usr/bin/env node
// Migrate Assigned Resources (Crew Assignments) from Salesforce to PostgreSQL
// This creates the link between ServiceAppointments and ServiceResources
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const ASSIGNED_RESOURCE_FIELDS = [
  'Id',
  'ServiceAppointmentId',
  'ServiceResourceId',
  'ServiceAppointment.AppointmentNumber',
  'ServiceResource.Name',
  'EstimatedTravelTime',
  'ActualTravelTime',
  'CreatedDate',
];

async function migrateAssignedResources() {
  console.log('Starting Assigned Resource migration...');
  const prisma = getPrismaClient();

  // First, build lookup maps for existing data
  console.log('Building lookup maps...');

  // Get all service appointments with their Salesforce IDs
  const appointments = await prisma.serviceAppointment.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const appointmentMap = new Map(appointments.map(a => [a.salesforceId, a.id]));
  console.log(`  Found ${appointments.length} appointments in database`);

  // Get all service resources with their Salesforce IDs
  const resources = await prisma.serviceResource.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const resourceMap = new Map(resources.map(r => [r.salesforceId, r.id]));
  console.log(`  Found ${resources.length} resources in database`);

  if (resources.length === 0) {
    console.error('\nERROR: No service resources found in database!');
    console.log('Please run migrate-service-resources.js first.');
    await disconnect();
    return;
  }

  // Fetch assigned resources from Salesforce
  const query = `
    SELECT ${ASSIGNED_RESOURCE_FIELDS.join(', ')}
    FROM AssignedResource
    ORDER BY CreatedDate DESC
  `;

  console.log('\nFetching Assigned Resources from Salesforce...');
  const sfAssignments = await querySalesforce(query);
  console.log(`Found ${sfAssignments.length} Assigned Resource records`);

  let created = 0;
  let skipped = 0;
  let errors = [];

  // Process in batches
  const batchSize = 100;
  for (let i = 0; i < sfAssignments.length; i += batchSize) {
    const batch = sfAssignments.slice(i, i + batchSize);

    for (const assignment of batch) {
      const appointmentId = appointmentMap.get(assignment.ServiceAppointmentId);
      const resourceId = resourceMap.get(assignment.ServiceResourceId);

      if (!appointmentId) {
        skipped++;
        continue; // Appointment not in database
      }

      if (!resourceId) {
        skipped++;
        continue; // Resource not in database
      }

      try {
        await prisma.assignedResource.upsert({
          where: {
            serviceAppointmentId_serviceResourceId: {
              serviceAppointmentId: appointmentId,
              serviceResourceId: resourceId,
            },
          },
          update: {
            // isPrimaryResource defaults to false, can be manually updated later
          },
          create: {
            serviceAppointmentId: appointmentId,
            serviceResourceId: resourceId,
            isPrimaryResource: false, // SF doesn't have this field, default to false
            createdAt: new Date(assignment.CreatedDate),
          },
        });
        created++;
      } catch (error) {
        errors.push({
          appointment: assignment.ServiceAppointment?.AppointmentNumber,
          resource: assignment.ServiceResource?.Name,
          error: error.message,
        });
      }
    }

    console.log(`Processed ${Math.min(i + batchSize, sfAssignments.length)}/${sfAssignments.length} records`);
  }

  console.log('\nMigration Results:');
  console.log(`  Created/Updated: ${created}`);
  console.log(`  Skipped (missing appointment/resource): ${skipped}`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nFirst 10 errors:');
    errors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.appointment} / ${e.resource}: ${e.error}`);
    });
  }

  await disconnect();
  console.log('\nAssigned Resource migration complete!');
}

migrateAssignedResources().catch(console.error);
