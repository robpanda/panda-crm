#!/usr/bin/env node
// Migrate Tasks from Salesforce to PostgreSQL
// Includes owner assignment data for tracking and reporting

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const TASK_FIELDS = [
  'Id',
  'Subject',
  'Description',
  'Status',
  'Priority',
  'ActivityDate',          // Due date
  'CompletedDateTime',
  'OwnerId',               // Task owner (assigned to)
  'WhoId',                 // Contact/Lead ID
  'WhatId',                // Related to (Account, Opportunity, etc.)
  'CreatedById',
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce status to Prisma TaskStatus enum
function mapTaskStatus(sfStatus) {
  // Valid: NOT_STARTED, IN_PROGRESS, WAITING, COMPLETED, DEFERRED
  const statusMap = {
    'Not Started': 'NOT_STARTED',
    'In Progress': 'IN_PROGRESS',
    'Waiting on someone else': 'WAITING',
    'Completed': 'COMPLETED',
    'Deferred': 'DEFERRED',
  };
  return statusMap[sfStatus] || 'NOT_STARTED';
}

// Map Salesforce priority to Prisma Priority enum
function mapPriority(sfPriority) {
  // Valid: LOW, NORMAL, HIGH, CRITICAL
  const priorityMap = {
    'Low': 'LOW',
    'Normal': 'NORMAL',
    'High': 'HIGH',
  };
  return priorityMap[sfPriority] || 'NORMAL';
}

function transformTask(sfTask, userIdMap, leadIdMap, opportunityIdMap) {
  // Get assignedTo from OwnerId
  const assignedToId = sfTask.OwnerId ? userIdMap.get(sfTask.OwnerId) : undefined;

  // Determine related record from WhatId (Opportunity, Account, etc.) or WhoId (Contact, Lead)
  let leadId = undefined;
  let opportunityId = undefined;

  if (sfTask.WhoId) {
    // WhoId can be Contact (003) or Lead (00Q)
    const prefix = sfTask.WhoId.substring(0, 3);
    if (prefix === '00Q') {
      leadId = leadIdMap.get(sfTask.WhoId);
    }
  }

  if (sfTask.WhatId) {
    // WhatId can be Account (001), Opportunity (006), etc.
    const prefix = sfTask.WhatId.substring(0, 3);
    if (prefix === '006') {
      opportunityId = opportunityIdMap.get(sfTask.WhatId);
    }
  }

  const task = {
    salesforceId: sfTask.Id,
    subject: sfTask.Subject || 'Untitled Task',
    description: sfTask.Description || undefined,
    status: mapTaskStatus(sfTask.Status),
    priority: mapPriority(sfTask.Priority),
    dueDate: sfTask.ActivityDate ? new Date(sfTask.ActivityDate) : undefined,
    completedDate: sfTask.CompletedDateTime ? new Date(sfTask.CompletedDateTime) : undefined,
    createdAt: new Date(sfTask.CreatedDate),
    updatedAt: new Date(sfTask.LastModifiedDate),
  };

  // Add optional foreign keys if valid
  if (assignedToId) {
    task.assignedToId = assignedToId;
  }
  if (leadId) {
    task.leadId = leadId;
  }
  if (opportunityId) {
    task.opportunityId = opportunityId;
  }

  return task;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
  });

  // Get leads
  const leads = await prisma.lead.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const leadIdMap = new Map();
  leads.forEach((l) => {
    leadIdMap.set(l.salesforceId, l.id);
  });

  // Get opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const opportunityIdMap = new Map();
  opportunities.forEach((o) => {
    opportunityIdMap.set(o.salesforceId, o.id);
  });

  console.log(`Built ID maps: ${userIdMap.size} users, ${leadIdMap.size} leads, ${opportunityIdMap.size} opportunities`);
  return { userIdMap, leadIdMap, opportunityIdMap };
}

async function migrateTasks() {
  console.log('=== Starting Task Migration ===');

  try {
    // Build ID maps first
    const { userIdMap, leadIdMap, opportunityIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${TASK_FIELDS.join(', ')} FROM Task ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce tasks...');

    const sfTasks = await querySalesforce(soql);
    console.log(`Found ${sfTasks.length} tasks to migrate`);

    // Transform records
    const tasks = sfTasks.map((t) => transformTask(t, userIdMap, leadIdMap, opportunityIdMap));

    // Count with owner assignment
    const withOwner = tasks.filter((t) => t.assignedToId).length;
    console.log(`Tasks with owner assignment: ${withOwner}/${tasks.length}`);

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('task', tasks, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${tasks.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    tasks.forEach((t) => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Priority breakdown
    const priorityCounts = {};
    tasks.forEach((t) => {
      priorityCounts[t.priority] = (priorityCounts[t.priority] || 0) + 1;
    });
    console.log('Priority breakdown:');
    Object.entries(priorityCounts).forEach(([priority, count]) => {
      console.log(`  ${priority}: ${count}`);
    });

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.subject}: ${e.error}`);
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
  migrateTasks()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateTasks, transformTask };
