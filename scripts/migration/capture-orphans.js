#!/usr/bin/env node

/**
 * Capture Orphaned Records
 *
 * This script runs AFTER the main migration to identify and record any orphaned records
 * that couldn't be migrated due to missing relationships (null AccountId, OpportunityId, etc.)
 *
 * These records will appear in the Admin UI for manual resolution.
 *
 * Usage:
 *   node capture-orphans.js                    # Capture all orphan types
 *   node capture-orphans.js --objects=workorders,quotes  # Specific objects
 *   node capture-orphans.js --dry-run          # Preview only
 */

import { PrismaClient } from '@prisma/client';
import jsforce from 'jsforce';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const objectsArg = args.find(a => a.startsWith('--objects='));
const OBJECTS_TO_CHECK = objectsArg
  ? objectsArg.replace('--objects=', '').split(',').map(s => s.trim().toLowerCase())
  : ['workorders', 'serviceappointments', 'quotes', 'servicecontracts', 'invoices', 'commissions', 'tasks', 'cases'];

// Track stats
const stats = {
  total: 0,
  recorded: 0,
  skipped: 0,
  errors: 0,
};

// ============================================================================
// SALESFORCE CONNECTION
// ============================================================================

async function getSalesforceConnection() {
  const secretResponse = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' })
  );
  const credentials = JSON.parse(secretResponse.SecretString);

  const conn = new jsforce.Connection({
    loginUrl: credentials.instance_url || 'https://login.salesforce.com',
  });

  await conn.login(
    credentials.username,
    credentials.password + (credentials.security_token || '')
  );

  console.log(`Connected to Salesforce: ${conn.instanceUrl}`);
  return conn;
}

// ============================================================================
// CREATE MIGRATION RUN FOR ORPHAN CAPTURE
// ============================================================================

let migrationRunDbId = null;

async function createMigrationRun() {
  const runId = `orphan-capture-${Date.now()}`;

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would create migration run: ${runId}`);
    return;
  }

  try {
    const migrationRun = await prisma.migrationRun.create({
      data: {
        runId,
        status: 'RUNNING',
        dryRun: DRY_RUN,
        objectsToSync: OBJECTS_TO_CHECK,
      },
    });
    migrationRunDbId = migrationRun.id;
    console.log(`Created migration run: ${runId} (DB ID: ${migrationRunDbId})`);
  } catch (error) {
    console.log(`[INFO] Migration run tracking not available: ${error.message}`);
  }
}

async function updateMigrationRun(status = 'COMPLETED') {
  if (!migrationRunDbId || DRY_RUN) return;

  try {
    await prisma.migrationRun.update({
      where: { id: migrationRunDbId },
      data: {
        status,
        completedAt: new Date(),
        totalRecords: stats.total,
        createdRecords: stats.recorded,
        skippedRecords: stats.skipped,
        errorRecords: stats.errors,
      },
    });
  } catch (error) {
    console.log(`[INFO] Migration run update failed: ${error.message}`);
  }
}

// ============================================================================
// RECORD ORPHAN
// ============================================================================

async function recordOrphan({
  salesforceId,
  salesforceType,
  recordNumber,
  recordName,
  orphanReason,
  missingFieldName,
  missingFieldValue,
  salesforceData,
}) {
  stats.total++;

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would record orphan: ${salesforceType} ${recordNumber || salesforceId} - ${orphanReason}`);
    stats.recorded++;
    return;
  }

  try {
    await prisma.orphanedRecord.upsert({
      where: {
        salesforceId_salesforceType: { salesforceId, salesforceType },
      },
      update: {
        recordNumber,
        recordName,
        orphanReason,
        missingFieldName,
        missingFieldValue,
        salesforceData,
        migrationRunId: migrationRunDbId,
        status: 'PENDING',
        updatedAt: new Date(),
      },
      create: {
        salesforceId,
        salesforceType,
        recordNumber,
        recordName,
        orphanReason,
        missingFieldName,
        missingFieldValue,
        salesforceData,
        migrationRunId: migrationRunDbId,
        status: 'PENDING',
      },
    });
    console.log(`  [ORPHAN] Recorded ${salesforceType} ${recordNumber || salesforceId} - ${orphanReason}`);
    stats.recorded++;
  } catch (error) {
    console.log(`  [ERROR] Failed to record orphan ${salesforceType} ${salesforceId}: ${error.message}`);
    stats.errors++;
  }
}

// ============================================================================
// BUILD ID MAPS
// ============================================================================

async function buildIdMaps() {
  console.log('\nBuilding ID maps for orphan detection...');

  const [accounts, opportunities, contacts, users, workOrders] = await Promise.all([
    prisma.account.findMany({ select: { id: true, salesforceId: true } }),
    prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }),
    prisma.contact.findMany({ select: { id: true, salesforceId: true } }),
    prisma.user.findMany({ select: { id: true, salesforceId: true } }),
    prisma.workOrder.findMany({ select: { id: true, salesforceId: true } }),
  ]);

  const maps = {
    accounts: new Map(accounts.filter(a => a.salesforceId).map(a => [a.salesforceId, a.id])),
    opportunities: new Map(opportunities.filter(o => o.salesforceId).map(o => [o.salesforceId, o.id])),
    contacts: new Map(contacts.filter(c => c.salesforceId).map(c => [c.salesforceId, c.id])),
    users: new Map(users.filter(u => u.salesforceId).map(u => [u.salesforceId, u.id])),
    workOrders: new Map(workOrders.filter(w => w.salesforceId).map(w => [w.salesforceId, w.id])),
  };

  console.log(`  Accounts: ${maps.accounts.size}, Opps: ${maps.opportunities.size}, Contacts: ${maps.contacts.size}, Users: ${maps.users.size}, WorkOrders: ${maps.workOrders.size}`);
  return maps;
}

// ============================================================================
// CAPTURE ORPHANED WORK ORDERS
// ============================================================================

async function captureOrphanedWorkOrders(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED WORK ORDERS');
  console.log('══════════════════════════════════════════════════════════════');

  // Query WorkOrders that have null AccountId or null Opportunity__c
  const query = `
    SELECT Id, WorkOrderNumber, Subject, AccountId, Opportunity__c, ContactId, Status
    FROM WorkOrder
    WHERE AccountId = null OR Opportunity__c = null
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} WorkOrders with null Account or Opportunity`);

  for (const wo of result.records) {
    // Check if already migrated
    if (maps.workOrders.has(wo.Id)) {
      stats.skipped++;
      continue;
    }

    let orphanReason = 'NULL_ACCOUNT_ID';
    let missingFieldName = 'AccountId';
    let missingFieldValue = wo.AccountId;

    if (!wo.Opportunity__c) {
      orphanReason = 'NULL_OPPORTUNITY_ID';
      missingFieldName = 'Opportunity__c';
      missingFieldValue = wo.Opportunity__c;
    }

    await recordOrphan({
      salesforceId: wo.Id,
      salesforceType: 'WorkOrder',
      recordNumber: wo.WorkOrderNumber,
      recordName: wo.Subject,
      orphanReason,
      missingFieldName,
      missingFieldValue: String(missingFieldValue || 'null'),
      salesforceData: wo,
    });
  }
}

// ============================================================================
// CAPTURE ORPHANED SERVICE APPOINTMENTS
// ============================================================================

async function captureOrphanedServiceAppointments(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED SERVICE APPOINTMENTS');
  console.log('══════════════════════════════════════════════════════════════');

  // Get existing SA salesforceIds
  const existingSAs = await prisma.serviceAppointment.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingSAIds = new Set(existingSAs.map(sa => sa.salesforceId));

  // Query SAs that have null ParentRecordId (WorkOrder)
  const query = `
    SELECT Id, AppointmentNumber, Subject, ParentRecordId, AccountId, ContactId, Status
    FROM ServiceAppointment
    WHERE ParentRecordId = null
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} ServiceAppointments with null ParentRecordId`);

  for (const sa of result.records) {
    if (existingSAIds.has(sa.Id)) {
      stats.skipped++;
      continue;
    }

    await recordOrphan({
      salesforceId: sa.Id,
      salesforceType: 'ServiceAppointment',
      recordNumber: sa.AppointmentNumber,
      recordName: sa.Subject,
      orphanReason: 'NULL_WORK_ORDER_ID',
      missingFieldName: 'ParentRecordId',
      missingFieldValue: String(sa.ParentRecordId || 'null'),
      salesforceData: sa,
    });
  }
}

// ============================================================================
// CAPTURE ORPHANED QUOTES
// ============================================================================

async function captureOrphanedQuotes(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED QUOTES');
  console.log('══════════════════════════════════════════════════════════════');

  const existingQuotes = await prisma.quote.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingQuoteIds = new Set(existingQuotes.map(q => q.salesforceId));

  const query = `
    SELECT Id, QuoteNumber, Name, AccountId, OpportunityId, ContactId, Status
    FROM Quote
    WHERE OpportunityId = null OR AccountId = null
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} Quotes with null Opportunity or Account`);

  for (const quote of result.records) {
    if (existingQuoteIds.has(quote.Id)) {
      stats.skipped++;
      continue;
    }

    let orphanReason = 'NULL_OPPORTUNITY_ID';
    let missingFieldName = 'OpportunityId';
    let missingFieldValue = quote.OpportunityId;

    if (!quote.AccountId) {
      orphanReason = 'NULL_ACCOUNT_ID';
      missingFieldName = 'AccountId';
      missingFieldValue = quote.AccountId;
    }

    await recordOrphan({
      salesforceId: quote.Id,
      salesforceType: 'Quote',
      recordNumber: quote.QuoteNumber,
      recordName: quote.Name,
      orphanReason,
      missingFieldName,
      missingFieldValue: String(missingFieldValue || 'null'),
      salesforceData: quote,
    });
  }
}

// ============================================================================
// CAPTURE ORPHANED INVOICES
// ============================================================================

async function captureOrphanedInvoices(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED INVOICES');
  console.log('══════════════════════════════════════════════════════════════');

  const existingInvoices = await prisma.invoice.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingInvoiceIds = new Set(existingInvoices.map(i => i.salesforceId));

  // fw1__Invoice__c is the custom invoice object
  const query = `
    SELECT Id, Name, fw1__Account__c, fw1__Opportunity__c, fw1__Status__c, fw1__Invoice_Total__c
    FROM fw1__Invoice__c
    WHERE fw1__Account__c = null
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} Invoices with null Account`);

  for (const inv of result.records) {
    if (existingInvoiceIds.has(inv.Id)) {
      stats.skipped++;
      continue;
    }

    await recordOrphan({
      salesforceId: inv.Id,
      salesforceType: 'Invoice',
      recordNumber: inv.Name,
      recordName: inv.Name,
      orphanReason: 'NULL_ACCOUNT_ID',
      missingFieldName: 'fw1__Account__c',
      missingFieldValue: String(inv.fw1__Account__c || 'null'),
      salesforceData: inv,
    });
  }
}

// ============================================================================
// CAPTURE ORPHANED COMMISSIONS
// ============================================================================

async function captureOrphanedCommissions(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED COMMISSIONS');
  console.log('══════════════════════════════════════════════════════════════');

  const existingCommissions = await prisma.commission.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingCommIds = new Set(existingCommissions.map(c => c.salesforceId));

  // Commission__c with null required fields
  const query = `
    SELECT Id, Name, Customer_Name__c, Service_Contract__c, User_Profle__c, Commission_Type__c, Status__c
    FROM Commission__c
    WHERE Customer_Name__c = null AND Service_Contract__c = null
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} Commissions with null Customer and Service Contract`);

  for (const comm of result.records) {
    if (existingCommIds.has(comm.Id)) {
      stats.skipped++;
      continue;
    }

    await recordOrphan({
      salesforceId: comm.Id,
      salesforceType: 'Commission',
      recordNumber: comm.Name,
      recordName: comm.Name,
      orphanReason: 'NULL_ACCOUNT_ID',
      missingFieldName: 'Customer_Name__c',
      missingFieldValue: String(comm.Customer_Name__c || 'null'),
      salesforceData: comm,
    });
  }
}

// ============================================================================
// CAPTURE ORPHANED TASKS
// ============================================================================

async function captureOrphanedTasks(conn, maps) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('CAPTURING ORPHANED TASKS');
  console.log('══════════════════════════════════════════════════════════════');

  const existingTasks = await prisma.task.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingTaskIds = new Set(existingTasks.map(t => t.salesforceId));

  // Tasks with null WhatId (related record) and null WhoId (related person)
  const query = `
    SELECT Id, Subject, WhatId, WhoId, OwnerId, Status, Priority
    FROM Task
    WHERE WhatId = null AND WhoId = null
    LIMIT 5000
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} Tasks with null WhatId and WhoId`);

  for (const task of result.records) {
    if (existingTaskIds.has(task.Id)) {
      stats.skipped++;
      continue;
    }

    await recordOrphan({
      salesforceId: task.Id,
      salesforceType: 'Task',
      recordNumber: task.Id,
      recordName: task.Subject,
      orphanReason: 'NULL_OPPORTUNITY_ID',
      missingFieldName: 'WhatId',
      missingFieldValue: String(task.WhatId || 'null'),
      salesforceData: task,
    });
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          PANDA CRM - ORPHAN CAPTURE SCRIPT                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Objects: ${OBJECTS_TO_CHECK.join(', ')}`);
  console.log('');

  try {
    const conn = await getSalesforceConnection();
    await createMigrationRun();
    const maps = await buildIdMaps();

    // Run capture for each object type
    if (OBJECTS_TO_CHECK.includes('workorders')) {
      await captureOrphanedWorkOrders(conn, maps);
    }
    if (OBJECTS_TO_CHECK.includes('serviceappointments')) {
      await captureOrphanedServiceAppointments(conn, maps);
    }
    if (OBJECTS_TO_CHECK.includes('quotes')) {
      await captureOrphanedQuotes(conn, maps);
    }
    if (OBJECTS_TO_CHECK.includes('invoices')) {
      await captureOrphanedInvoices(conn, maps);
    }
    if (OBJECTS_TO_CHECK.includes('commissions')) {
      await captureOrphanedCommissions(conn, maps);
    }
    if (OBJECTS_TO_CHECK.includes('tasks')) {
      await captureOrphanedTasks(conn, maps);
    }

    await updateMigrationRun('COMPLETED');

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('ORPHAN CAPTURE COMPLETE');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`Total orphans found: ${stats.total}`);
    console.log(`Recorded: ${stats.recorded}`);
    console.log(`Skipped (already migrated): ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);

    if (!DRY_RUN && stats.recorded > 0) {
      console.log(`\nOrphaned records are now available in the Admin UI for manual resolution.`);
      console.log(`Go to: https://crm.pandaadmin.com/admin/orphans`);
    }

  } catch (error) {
    console.error('Fatal error:', error);
    await updateMigrationRun('FAILED');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
