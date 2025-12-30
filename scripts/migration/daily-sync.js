#!/usr/bin/env node
/**
 * Daily Salesforce to PostgreSQL Sync
 *
 * Runs incremental sync for all objects modified since last sync.
 * Designed to run via cron job in late evening hours.
 *
 * Usage:
 *   node daily-sync.js                    # Incremental sync (since last run)
 *   node daily-sync.js --force            # Full sync (ignore timestamps)
 *   node daily-sync.js --dry-run          # Preview without applying
 *   node daily-sync.js --objects=contracts,invoices  # Sync specific objects only
 *
 * Cron example (run at 2 AM daily):
 *   0 2 * * * cd /path/to/scripts/migration && NODE_TLS_REJECT_UNAUTHORIZED=0 node daily-sync.js >> /var/log/panda-sync.log 2>&1
 */

import { prisma, disconnect } from './prisma-client.js';
import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sync timestamp file
const SYNC_STATE_FILE = path.join(__dirname, '.sync-state.json');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    force: false,
    dryRun: false,
    objects: null, // null = all objects
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--force') {
      options.force = true;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i].startsWith('--objects=')) {
      options.objects = args[i].replace('--objects=', '').split(',');
    }
  }

  return options;
}

// Get last sync time for an object
function getLastSyncTime(objectName) {
  try {
    if (fs.existsSync(SYNC_STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
      if (state[objectName]) {
        return new Date(state[objectName]);
      }
    }
  } catch (error) {
    console.error(`Error reading sync state: ${error.message}`);
  }
  return null;
}

// Save last sync time for an object
function saveLastSyncTime(objectName, timestamp = new Date()) {
  try {
    let state = {};
    if (fs.existsSync(SYNC_STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
    }
    state[objectName] = timestamp.toISOString();
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`Error saving sync state: ${error.message}`);
  }
}

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  const [accounts, contacts, opportunities, users, contracts] = await Promise.all([
    prisma.account.findMany({ select: { id: true, salesforceId: true } }),
    prisma.contact.findMany({ select: { id: true, salesforceId: true } }),
    prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }),
    prisma.user.findMany({ select: { id: true, salesforceId: true }, where: { salesforceId: { not: null } } }),
    prisma.serviceContract.findMany({ select: { id: true, salesforceId: true } }),
  ]);

  return {
    accountIdMap: new Map(accounts.map(a => [a.salesforceId, a.id])),
    contactIdMap: new Map(contacts.map(c => [c.salesforceId, c.id])),
    opportunityIdMap: new Map(opportunities.map(o => [o.salesforceId, o.id])),
    userIdMap: new Map(users.map(u => [u.salesforceId, u.id])),
    contractIdMap: new Map(contracts.map(c => [c.salesforceId, c.id])),
  };
}

// Status mappings
const CONTRACT_STATUS_MAP = {
  'Draft': 'DRAFT',
  'In Approval Process': 'IN_APPROVAL',
  'Activated': 'ACTIVATED',
  'Expired': 'EXPIRED',
  'Canceled': 'CANCELED',
};

const INVOICE_STATUS_MAP = {
  'Draft': 'DRAFT',
  'Sent': 'SENT',
  'Partial': 'PARTIAL',
  'Paid': 'PAID',
  'Overdue': 'OVERDUE',
  'Void': 'VOID',
};

const WORKORDER_STATUS_MAP = {
  'New': 'NEW',
  'In Progress': 'IN_PROGRESS',
  'On Hold': 'ON_HOLD',
  'Completed': 'COMPLETED',
  'Canceled': 'CANCELLED',
  'Closed': 'CLOSED',
};

const PRIORITY_MAP = {
  'Low': 'LOW',
  'Medium': 'MEDIUM',
  'High': 'HIGH',
  'Critical': 'CRITICAL',
};

// Sync functions for each object type
async function syncContracts(conn, idMaps, options) {
  const { force, dryRun } = options;
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing ServiceContracts...');

  const lastSync = force ? null : getLastSyncTime('ServiceContract');
  console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

  const fields = [
    'Id', 'Name', 'ContractNumber', 'AccountId', 'Opportunity__c',
    'Status', 'StartDate', 'EndDate', 'OwnerId',
    'Contract_Grand_Total__c', 'GrandTotal', 'TotalPrice',
    'Sales_Total_Price__c', 'Supplements_Closed__c', 'Sum_of_Supplements__c',
    'Pre_Commission_Rate__c', 'Company_Lead_Rate__c', 'Self_Gen_Rate__c', 'Commission_Rate__c',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM ServiceContract WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    try {
      const data = {
        salesforceId: sfRecord.Id,
        name: sfRecord.Name || 'Unnamed Contract',
        contractNumber: sfRecord.ContractNumber || sfRecord.Id,
        status: CONTRACT_STATUS_MAP[sfRecord.Status] || 'DRAFT',
        accountId: sfRecord.AccountId ? idMaps.accountIdMap.get(sfRecord.AccountId) || null : null,
        opportunityId: sfRecord.Opportunity__c ? idMaps.opportunityIdMap.get(sfRecord.Opportunity__c) || null : null,
        ownerId: sfRecord.OwnerId ? idMaps.userIdMap.get(sfRecord.OwnerId) || null : null,
        startDate: sfRecord.StartDate ? new Date(sfRecord.StartDate) : null,
        endDate: sfRecord.EndDate ? new Date(sfRecord.EndDate) : null,
        contractTotal: sfRecord.Contract_Grand_Total__c || sfRecord.GrandTotal || 0,
        salesTotalPrice: sfRecord.Sales_Total_Price__c || sfRecord.TotalPrice || null,
        supplementsClosedTotal: sfRecord.Supplements_Closed__c || sfRecord.Sum_of_Supplements__c || null,
        preCommissionRate: sfRecord.Pre_Commission_Rate__c || null,
        companyLeadRate: sfRecord.Company_Lead_Rate__c || null,
        selfGenRate: sfRecord.Self_Gen_Rate__c || null,
        commissionRate: sfRecord.Commission_Rate__c || null,
        updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date(),
      };

      if (!dryRun) {
        await prisma.serviceContract.upsert({
          where: { salesforceId: sfRecord.Id },
          update: data,
          create: {
            ...data,
            createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing contract ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  if (!dryRun) {
    saveLastSyncTime('ServiceContract');
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

async function syncInvoices(conn, idMaps, options) {
  const { force, dryRun } = options;
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Invoices...');

  const lastSync = force ? null : getLastSyncTime('Invoice');
  console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

  const fields = [
    'Id', 'Name', 'fw1__Account__c', 'Service_Contract__c',
    'fw1__Status__c', 'fw1__Invoice_Date__c', 'fw1__Due_Date__c',
    'fw1__Total_Invoice_Amount__c', 'fw1__Balance_Due__c', 'fw1__Total_Paid_Amount__c',
    'PM_Invoice__c', 'OwnerId',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM fw1__Invoice__c WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    try {
      const data = {
        salesforceId: sfRecord.Id,
        invoiceNumber: sfRecord.Name || null,
        status: INVOICE_STATUS_MAP[sfRecord.fw1__Status__c] || 'DRAFT',
        accountId: sfRecord.fw1__Account__c ? idMaps.accountIdMap.get(sfRecord.fw1__Account__c) || null : null,
        serviceContractId: sfRecord.Service_Contract__c ? idMaps.contractIdMap.get(sfRecord.Service_Contract__c) || null : null,
        ownerId: sfRecord.OwnerId ? idMaps.userIdMap.get(sfRecord.OwnerId) || null : null,
        invoiceDate: sfRecord.fw1__Invoice_Date__c ? new Date(sfRecord.fw1__Invoice_Date__c) : null,
        dueDate: sfRecord.fw1__Due_Date__c ? new Date(sfRecord.fw1__Due_Date__c) : null,
        total: sfRecord.fw1__Total_Invoice_Amount__c || null,
        balanceDue: sfRecord.fw1__Balance_Due__c || null,
        amountPaid: sfRecord.fw1__Total_Paid_Amount__c || null,
        updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date(),
      };

      if (!dryRun) {
        await prisma.invoice.upsert({
          where: { salesforceId: sfRecord.Id },
          update: data,
          create: {
            ...data,
            createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing invoice ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  if (!dryRun) {
    saveLastSyncTime('Invoice');
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

async function syncWorkOrders(conn, idMaps, options) {
  const { force, dryRun } = options;
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing WorkOrders...');

  const lastSync = force ? null : getLastSyncTime('WorkOrder');
  console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

  const fields = [
    'Id', 'WorkOrderNumber', 'Subject', 'Description', 'Status', 'Priority',
    'AccountId', 'ContactId', 'Opportunity__c', 'WorkTypeId',
    'StartDate', 'EndDate', 'DurationInMinutes',
    'Street', 'City', 'State', 'PostalCode', 'Country', 'Latitude', 'Longitude',
    'ServiceTerritoryId', 'OwnerId',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM WorkOrder WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    // Skip records without account (required in schema)
    const accountId = sfRecord.AccountId ? idMaps.accountIdMap.get(sfRecord.AccountId) : null;
    if (!accountId) {
      continue; // Skip - required field missing
    }

    try {
      const data = {
        salesforceId: sfRecord.Id,
        workOrderNumber: sfRecord.WorkOrderNumber,
        subject: sfRecord.Subject || null,
        description: sfRecord.Description || null,
        status: WORKORDER_STATUS_MAP[sfRecord.Status] || 'NEW',
        priority: PRIORITY_MAP[sfRecord.Priority] || 'NORMAL',
        accountId,
        contactId: sfRecord.ContactId ? idMaps.contactIdMap.get(sfRecord.ContactId) || null : null,
        opportunityId: sfRecord.Opportunity__c ? idMaps.opportunityIdMap.get(sfRecord.Opportunity__c) || null : null,
        startDate: sfRecord.StartDate ? new Date(sfRecord.StartDate) : null,
        endDate: sfRecord.EndDate ? new Date(sfRecord.EndDate) : null,
        street: sfRecord.Street || null,
        city: sfRecord.City || null,
        state: sfRecord.State || null,
        postalCode: sfRecord.PostalCode || null,
        country: sfRecord.Country || null,
        updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date(),
      };

      if (!dryRun) {
        await prisma.workOrder.upsert({
          where: { salesforceId: sfRecord.Id },
          update: data,
          create: {
            ...data,
            createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing work order ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  if (!dryRun) {
    saveLastSyncTime('WorkOrder');
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

async function syncServiceAppointments(conn, idMaps, options) {
  const { force, dryRun } = options;
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing ServiceAppointments...');

  const lastSync = force ? null : getLastSyncTime('ServiceAppointment');
  console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

  // Get work order ID map
  const workOrders = await prisma.workOrder.findMany({ select: { id: true, salesforceId: true } });
  const workOrderIdMap = new Map(workOrders.map(w => [w.salesforceId, w.id]));

  const fields = [
    'Id', 'AppointmentNumber', 'Subject', 'Description', 'Status',
    'ParentRecordId', 'ContactId',
    'SchedStartTime', 'SchedEndTime', 'ActualStartTime', 'ActualEndTime',
    'DurationInMinutes', 'Duration', 'DurationType',
    'Street', 'City', 'State', 'PostalCode', 'Country', 'Latitude', 'Longitude',
    'ServiceTerritoryId', 'WorkTypeId',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM ServiceAppointment WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    // Skip records without work order (required relation)
    const workOrderId = sfRecord.ParentRecordId ? workOrderIdMap.get(sfRecord.ParentRecordId) : null;
    if (!workOrderId) {
      continue; // Skip - required field missing
    }

    try {
      const data = {
        salesforceId: sfRecord.Id,
        appointmentNumber: sfRecord.AppointmentNumber,
        subject: sfRecord.Subject || null,
        description: sfRecord.Description || null,
        status: sfRecord.Status || 'None',
        workOrderId,
        contactId: sfRecord.ContactId ? idMaps.contactIdMap.get(sfRecord.ContactId) || null : null,
        scheduledStart: sfRecord.SchedStartTime ? new Date(sfRecord.SchedStartTime) : null,
        scheduledEnd: sfRecord.SchedEndTime ? new Date(sfRecord.SchedEndTime) : null,
        actualStart: sfRecord.ActualStartTime ? new Date(sfRecord.ActualStartTime) : null,
        actualEnd: sfRecord.ActualEndTime ? new Date(sfRecord.ActualEndTime) : null,
        durationMinutes: sfRecord.DurationInMinutes || null,
        street: sfRecord.Street || null,
        city: sfRecord.City || null,
        state: sfRecord.State || null,
        postalCode: sfRecord.PostalCode || null,
        country: sfRecord.Country || null,
        latitude: sfRecord.Latitude || null,
        longitude: sfRecord.Longitude || null,
        updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date(),
      };

      if (!dryRun) {
        await prisma.serviceAppointment.upsert({
          where: { salesforceId: sfRecord.Id },
          update: data,
          create: {
            ...data,
            createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing appointment ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  if (!dryRun) {
    saveLastSyncTime('ServiceAppointment');
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

async function syncQuotes(conn, idMaps, options) {
  const { force, dryRun } = options;
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Quotes...');

  const lastSync = force ? null : getLastSyncTime('Quote');
  console.log(`  Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

  const fields = [
    'Id', 'Name', 'QuoteNumber', 'OpportunityId', 'AccountId', 'ContactId',
    'Status', 'ExpirationDate', 'Description',
    'TotalPrice', 'Subtotal', 'Tax', 'Discount', 'GrandTotal',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Quote WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    try {
      const data = {
        salesforceId: sfRecord.Id,
        name: sfRecord.Name || null,
        quoteNumber: sfRecord.QuoteNumber || null,
        opportunityId: sfRecord.OpportunityId ? idMaps.opportunityIdMap.get(sfRecord.OpportunityId) || null : null,
        accountId: sfRecord.AccountId ? idMaps.accountIdMap.get(sfRecord.AccountId) || null : null,
        contactId: sfRecord.ContactId ? idMaps.contactIdMap.get(sfRecord.ContactId) || null : null,
        status: sfRecord.Status || 'Draft',
        expirationDate: sfRecord.ExpirationDate ? new Date(sfRecord.ExpirationDate) : null,
        description: sfRecord.Description || null,
        subtotal: sfRecord.Subtotal || null,
        tax: sfRecord.Tax || null,
        discount: sfRecord.Discount || null,
        total: sfRecord.GrandTotal || sfRecord.TotalPrice || null,
        updatedAt: sfRecord.LastModifiedDate ? new Date(sfRecord.LastModifiedDate) : new Date(),
      };

      if (!dryRun) {
        await prisma.quote.upsert({
          where: { salesforceId: sfRecord.Id },
          update: data,
          create: {
            ...data,
            createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing quote ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  if (!dryRun) {
    saveLastSyncTime('Quote');
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Main execution
async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('\n' + '═'.repeat(60));
  console.log('PANDA CRM DAILY SALESFORCE SYNC');
  console.log('═'.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Sync Type: ${options.force ? 'FULL' : 'INCREMENTAL'}`);
  if (options.objects) {
    console.log(`Objects: ${options.objects.join(', ')}`);
  }

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    const results = {};
    const objectsToSync = options.objects || ['contracts', 'invoices', 'workorders', 'appointments', 'quotes'];

    for (const obj of objectsToSync) {
      switch (obj.toLowerCase()) {
        case 'contracts':
          results.contracts = await syncContracts(conn, idMaps, options);
          break;
        case 'invoices':
          results.invoices = await syncInvoices(conn, idMaps, options);
          break;
        case 'workorders':
          results.workorders = await syncWorkOrders(conn, idMaps, options);
          break;
        case 'appointments':
          results.appointments = await syncServiceAppointments(conn, idMaps, options);
          break;
        case 'quotes':
          results.quotes = await syncQuotes(conn, idMaps, options);
          break;
        default:
          console.log(`Unknown object type: ${obj}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '═'.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Duration: ${elapsed}s`);
    console.log('\nResults:');
    for (const [obj, result] of Object.entries(results)) {
      console.log(`  ${obj.padEnd(15)} Synced: ${result.synced}, Errors: ${result.errors}`);
    }

    const totalSynced = Object.values(results).reduce((sum, r) => sum + r.synced, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);
    console.log(`\n  TOTAL          Synced: ${totalSynced}, Errors: ${totalErrors}`);

  } catch (error) {
    console.error('\nSync failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

main();
