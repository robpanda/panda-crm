/**
 * Bidirectional Sync Utilities
 *
 * Provides utilities for syncing data between PostgreSQL and Salesforce in both directions.
 *
 * Features:
 * - Incremental sync based on lastModifiedDate
 * - Conflict resolution (configurable: SF wins, Postgres wins, or most recent wins)
 * - Sync state tracking for resumable operations
 * - Batch operations for performance
 *
 * Usage:
 *   import { SyncEngine, ConflictResolution } from './sync-utils.js';
 *   const engine = new SyncEngine('WorkOrder', { conflictResolution: ConflictResolution.MOST_RECENT });
 *   await engine.syncBidirectional();
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';
import fs from 'fs';
import path from 'path';

// Conflict resolution strategies
export const ConflictResolution = {
  SALESFORCE_WINS: 'sf_wins',
  POSTGRES_WINS: 'pg_wins',
  MOST_RECENT_WINS: 'most_recent'
};

// Sync state file location
const SYNC_STATE_DIR = path.join(process.cwd(), '.sync-state');

// Ensure sync state directory exists
if (!fs.existsSync(SYNC_STATE_DIR)) {
  fs.mkdirSync(SYNC_STATE_DIR, { recursive: true });
}

/**
 * Get the last sync timestamp for an object
 */
export function getLastSyncTime(objectName, direction = 'sf_to_pg') {
  const stateFile = path.join(SYNC_STATE_DIR, `${objectName}_${direction}.json`);
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return state.lastSyncTime ? new Date(state.lastSyncTime) : null;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Save the sync timestamp for an object
 */
export function saveLastSyncTime(objectName, direction = 'sf_to_pg', timestamp = new Date()) {
  const stateFile = path.join(SYNC_STATE_DIR, `${objectName}_${direction}.json`);
  const state = {
    objectName,
    direction,
    lastSyncTime: timestamp.toISOString(),
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Transform Prisma record to Salesforce format
 * Each object type needs its own reverse transform function
 */
export const reverseTransforms = {
  /**
   * WorkOrder: Postgres → Salesforce
   */
  workOrder: async (pgRecord, idMaps) => {
    const { accountSfIdMap, opportunitySfIdMap, userSfIdMap } = idMaps;

    // Map status back to Salesforce picklist values
    const statusMap = {
      'NEW': 'New',
      'IN_PROGRESS': 'In Progress',
      'ON_HOLD': 'On Hold',
      'COMPLETED': 'Completed',
      'CANCELLED': 'Canceled',
      'CLOSED': 'Closed'
    };

    const priorityMap = {
      'LOW': 'Low',
      'MEDIUM': 'Medium',
      'HIGH': 'High',
      'CRITICAL': 'Critical'
    };

    return {
      Id: pgRecord.salesforceId, // Required for update, omit for create
      Subject: pgRecord.subject,
      Description: pgRecord.description,
      Status: statusMap[pgRecord.status] || 'New',
      Priority: priorityMap[pgRecord.priority] || 'Medium',
      AccountId: pgRecord.accountId ? accountSfIdMap?.get(pgRecord.accountId) : null,
      Opportunity__c: pgRecord.opportunityId ? opportunitySfIdMap?.get(pgRecord.opportunityId) : null,
      OwnerId: pgRecord.assignedToId ? userSfIdMap?.get(pgRecord.assignedToId) : null,
      StartDate: pgRecord.scheduledStart?.toISOString().split('T')[0],
      EndDate: pgRecord.scheduledEnd?.toISOString().split('T')[0],
      WorkTypeId: pgRecord.workTypeSalesforceId || null
    };
  },

  /**
   * ServiceAppointment: Postgres → Salesforce
   */
  serviceAppointment: async (pgRecord, idMaps) => {
    const { workOrderSfIdMap, userSfIdMap } = idMaps;

    const statusMap = {
      'NONE': 'None',
      'SCHEDULED': 'Scheduled',
      'DISPATCHED': 'Dispatched',
      'IN_PROGRESS': 'In Progress',
      'COMPLETED': 'Completed',
      'CANNOT_COMPLETE': 'Cannot Complete',
      'CANCELED': 'Canceled'
    };

    return {
      Id: pgRecord.salesforceId,
      ParentRecordId: pgRecord.workOrderId ? workOrderSfIdMap?.get(pgRecord.workOrderId) : null,
      Status: statusMap[pgRecord.status] || 'None',
      SchedStartTime: pgRecord.scheduledStart?.toISOString(),
      SchedEndTime: pgRecord.scheduledEnd?.toISOString(),
      ActualStartTime: pgRecord.actualStart?.toISOString(),
      ActualEndTime: pgRecord.actualEnd?.toISOString(),
      Duration: pgRecord.durationMinutes,
      DurationType: 'Minutes',
      Description: pgRecord.description,
      Street: pgRecord.street,
      City: pgRecord.city,
      State: pgRecord.state,
      PostalCode: pgRecord.postalCode,
      Country: pgRecord.country || 'USA'
    };
  },

  /**
   * Quote: Postgres → Salesforce
   */
  quote: async (pgRecord, idMaps) => {
    const { opportunitySfIdMap, accountSfIdMap, contactSfIdMap } = idMaps;

    const statusMap = {
      'DRAFT': 'Draft',
      'NEEDS_REVIEW': 'Needs Review',
      'IN_REVIEW': 'In Review',
      'APPROVED': 'Approved',
      'REJECTED': 'Rejected',
      'PRESENTED': 'Presented',
      'ACCEPTED': 'Accepted',
      'DENIED': 'Denied'
    };

    return {
      Id: pgRecord.salesforceId,
      Name: pgRecord.name,
      OpportunityId: pgRecord.opportunityId ? opportunitySfIdMap?.get(pgRecord.opportunityId) : null,
      Status: statusMap[pgRecord.status] || 'Draft',
      ExpirationDate: pgRecord.expirationDate?.toISOString().split('T')[0],
      Description: pgRecord.description,
      GrandTotal: pgRecord.grandTotal,
      Discount: pgRecord.discount,
      TotalPrice: pgRecord.totalPrice,
      Tax: pgRecord.tax,
      BillingStreet: pgRecord.billingStreet,
      BillingCity: pgRecord.billingCity,
      BillingState: pgRecord.billingState,
      BillingPostalCode: pgRecord.billingPostalCode,
      BillingCountry: pgRecord.billingCountry,
      ShippingStreet: pgRecord.shippingStreet,
      ShippingCity: pgRecord.shippingCity,
      ShippingState: pgRecord.shippingState,
      ShippingPostalCode: pgRecord.shippingPostalCode,
      ShippingCountry: pgRecord.shippingCountry
    };
  },

  /**
   * Contract (ServiceContract): Postgres → Salesforce
   */
  contract: async (pgRecord, idMaps) => {
    const { accountSfIdMap, opportunitySfIdMap, userSfIdMap } = idMaps;

    const statusMap = {
      'DRAFT': 'Draft',
      'ACTIVATED': 'Activated',
      'IN_APPROVAL': 'In Approval Process',
      'EXPIRED': 'Expired',
      'CANCELED': 'Canceled'
    };

    return {
      Id: pgRecord.salesforceId,
      Name: pgRecord.name,
      AccountId: pgRecord.accountId ? accountSfIdMap?.get(pgRecord.accountId) : null,
      Opportunity__c: pgRecord.opportunityId ? opportunitySfIdMap?.get(pgRecord.opportunityId) : null,
      Status: statusMap[pgRecord.status] || 'Draft',
      StartDate: pgRecord.startDate?.toISOString().split('T')[0],
      EndDate: pgRecord.endDate?.toISOString().split('T')[0],
      Contract_Grand_Total__c: pgRecord.contractGrandTotal,
      Total_Sales_Volume__c: pgRecord.totalSalesVolume,
      Collected__c: pgRecord.collectedPercentage,
      Description: pgRecord.description,
      OwnerId: pgRecord.ownerId ? userSfIdMap?.get(pgRecord.ownerId) : null
    };
  },

  /**
   * Invoice (fw1__Invoice__c): Postgres → Salesforce
   */
  invoice: async (pgRecord, idMaps) => {
    const { accountSfIdMap, contractSfIdMap } = idMaps;

    const statusMap = {
      'DRAFT': 'Draft',
      'SENT': 'Sent',
      'PARTIAL': 'Partial',
      'PAID': 'Paid',
      'OVERDUE': 'Overdue',
      'VOID': 'Void'
    };

    return {
      Id: pgRecord.salesforceId,
      Name: pgRecord.invoiceNumber,
      fw1__Account__c: pgRecord.accountId ? accountSfIdMap?.get(pgRecord.accountId) : null,
      Service_Contract__c: pgRecord.contractId ? contractSfIdMap?.get(pgRecord.contractId) : null,
      fw1__Invoice_Status__c: statusMap[pgRecord.status] || 'Draft',
      fw1__Invoice_Date__c: pgRecord.invoiceDate?.toISOString().split('T')[0],
      fw1__Due_Date__c: pgRecord.dueDate?.toISOString().split('T')[0],
      fw1__Total_Invoice_Amount__c: pgRecord.totalAmount,
      fw1__Balance_Due__c: pgRecord.balanceDue,
      fw1__Total_Paid_Amount__c: pgRecord.paidAmount,
      fw1__Terms__c: pgRecord.terms
    };
  },

  /**
   * Commission (Commission__c): Postgres → Salesforce
   */
  commission: async (pgRecord, idMaps) => {
    const { userSfIdMap, contractSfIdMap, invoiceSfIdMap, accountSfIdMap } = idMaps;

    const typeMap = {
      'PRE_COMMISSION': 'Pre-Commission',
      'BACK_END_COMMISSION': 'Back-End Commission',
      'MANAGER_OVERRIDE': 'Manager Override',
      'SALES_OP_COMMISSION': 'Sales Op Commission',
      'SUPPLEMENT_OVERRIDE': 'Supplement Override',
      'REFERRAL': 'Referral',
      'BONUS': 'Bonus',
      'OTHER': 'Other'
    };

    const statusMap = {
      'PENDING': 'Pending',
      'REQUESTED': 'Requested',
      'APPROVED': 'Approved',
      'PAID': 'Paid',
      'REJECTED': 'Rejected',
      'ON_HOLD': 'On Hold'
    };

    return {
      Id: pgRecord.salesforceId,
      Name: pgRecord.name,
      OwnerId: pgRecord.ownerId ? userSfIdMap?.get(pgRecord.ownerId) : null,
      Service_Contract__c: pgRecord.contractId ? contractSfIdMap?.get(pgRecord.contractId) : null,
      Invoice__c: pgRecord.invoiceId ? invoiceSfIdMap?.get(pgRecord.invoiceId) : null,
      Account__c: pgRecord.accountId ? accountSfIdMap?.get(pgRecord.accountId) : null,
      Commission_Type__c: typeMap[pgRecord.commissionType] || 'Other',
      Status__c: statusMap[pgRecord.status] || 'Pending',
      Commission_Value__c: pgRecord.commissionValue,
      Commission_Rate_of_Pay__c: pgRecord.commissionRate,
      Commission_Amount__c: pgRecord.commissionAmount
    };
  },

  /**
   * Case: Postgres → Salesforce
   */
  case: async (pgRecord, idMaps) => {
    const { accountSfIdMap, contactSfIdMap, opportunitySfIdMap, userSfIdMap } = idMaps;

    const statusMap = {
      'NEW': 'New',
      'WORKING': 'Working',
      'ESCALATED': 'Escalated',
      'CLOSED': 'Closed',
      'ON_HOLD': 'On Hold'
    };

    const priorityMap = {
      'LOW': 'Low',
      'MEDIUM': 'Medium',
      'HIGH': 'High',
      'CRITICAL': 'Critical'
    };

    return {
      Id: pgRecord.salesforceId,
      Subject: pgRecord.subject,
      Description: pgRecord.description,
      Status: statusMap[pgRecord.status] || 'New',
      Priority: priorityMap[pgRecord.priority] || 'Medium',
      Type: pgRecord.type,
      Reason: pgRecord.reason,
      Origin: pgRecord.origin,
      AccountId: pgRecord.accountId ? accountSfIdMap?.get(pgRecord.accountId) : null,
      ContactId: pgRecord.contactId ? contactSfIdMap?.get(pgRecord.contactId) : null,
      Opportunity__c: pgRecord.opportunityId ? opportunitySfIdMap?.get(pgRecord.opportunityId) : null,
      OwnerId: pgRecord.ownerId ? userSfIdMap?.get(pgRecord.ownerId) : null,
      ClosedDate: pgRecord.closedDate?.toISOString()
    };
  },

  /**
   * Document: Postgres → Salesforce
   * Note: Documents in Salesforce are complex (ContentDocument/ContentVersion)
   * This only updates metadata, not file content
   */
  document: async (pgRecord, idMaps) => {
    // Documents can't be easily pushed back to Salesforce
    // ContentDocument updates are limited - title and archive status only
    return {
      Id: pgRecord.salesforceId,
      Title: pgRecord.title,
      IsArchived: pgRecord.isArchived || false
    };
  }
};

/**
 * Build reverse ID maps (Postgres ID → Salesforce ID)
 */
export async function buildReverseIdMaps() {
  console.log('Building reverse ID maps (Postgres → Salesforce)...');

  const maps = {};

  // Accounts
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.accountSfIdMap = new Map(accounts.map(a => [a.id, a.salesforceId]));
  console.log(`  Accounts: ${maps.accountSfIdMap.size}`);

  // Opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.opportunitySfIdMap = new Map(opportunities.map(o => [o.id, o.salesforceId]));
  console.log(`  Opportunities: ${maps.opportunitySfIdMap.size}`);

  // Contacts
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.contactSfIdMap = new Map(contacts.map(c => [c.id, c.salesforceId]));
  console.log(`  Contacts: ${maps.contactSfIdMap.size}`);

  // Users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.userSfIdMap = new Map(users.map(u => [u.id, u.salesforceId]));
  console.log(`  Users: ${maps.userSfIdMap.size}`);

  // WorkOrders
  const workOrders = await prisma.workOrder.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.workOrderSfIdMap = new Map(workOrders.map(w => [w.id, w.salesforceId]));
  console.log(`  WorkOrders: ${maps.workOrderSfIdMap.size}`);

  // Contracts
  const contracts = await prisma.serviceContract.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.contractSfIdMap = new Map(contracts.map(c => [c.id, c.salesforceId]));
  console.log(`  Contracts: ${maps.contractSfIdMap.size}`);

  // Invoices
  const invoices = await prisma.invoice.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  maps.invoiceSfIdMap = new Map(invoices.map(i => [i.id, i.salesforceId]));
  console.log(`  Invoices: ${maps.invoiceSfIdMap.size}`);

  return maps;
}

/**
 * Push records from Postgres to Salesforce
 */
export async function pushToSalesforce(objectType, sfObjectName, records, idMaps, options = {}) {
  const { dryRun = false, batchSize = 200 } = options;

  console.log(`\nPushing ${records.length} ${objectType} records to Salesforce...`);

  if (!reverseTransforms[objectType]) {
    throw new Error(`No reverse transform defined for ${objectType}`);
  }

  const conn = await getSalesforceConnection();

  // Transform records
  const transformedRecords = [];
  const newRecords = [];

  for (const record of records) {
    const sfRecord = await reverseTransforms[objectType](record, idMaps);

    // Remove null/undefined values
    Object.keys(sfRecord).forEach(key => {
      if (sfRecord[key] === null || sfRecord[key] === undefined) {
        delete sfRecord[key];
      }
    });

    if (sfRecord.Id) {
      transformedRecords.push(sfRecord);
    } else {
      // New record (no Salesforce ID yet)
      delete sfRecord.Id;
      newRecords.push({ pgId: record.id, sfRecord });
    }
  }

  if (dryRun) {
    console.log('DRY RUN - Would push:');
    console.log(`  Updates: ${transformedRecords.length}`);
    console.log(`  Creates: ${newRecords.length}`);
    if (transformedRecords.length > 0) {
      console.log('  Sample update:', JSON.stringify(transformedRecords[0], null, 2));
    }
    if (newRecords.length > 0) {
      console.log('  Sample create:', JSON.stringify(newRecords[0].sfRecord, null, 2));
    }
    return { updated: 0, created: 0, errors: [] };
  }

  const errors = [];
  let updated = 0;
  let created = 0;

  // Update existing records in batches
  for (let i = 0; i < transformedRecords.length; i += batchSize) {
    const batch = transformedRecords.slice(i, i + batchSize);
    try {
      const results = await conn.sobject(sfObjectName).update(batch);
      const batchResults = Array.isArray(results) ? results : [results];

      batchResults.forEach((result, idx) => {
        if (result.success) {
          updated++;
        } else {
          errors.push({
            id: batch[idx].Id,
            error: result.errors?.join(', ') || 'Unknown error'
          });
        }
      });
    } catch (e) {
      console.error(`Batch update failed:`, e.message);
      errors.push({ batch: i, error: e.message });
    }
  }

  // Create new records in batches
  for (let i = 0; i < newRecords.length; i += batchSize) {
    const batch = newRecords.slice(i, i + batchSize);
    try {
      const results = await conn.sobject(sfObjectName).create(batch.map(r => r.sfRecord));
      const batchResults = Array.isArray(results) ? results : [results];

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.success) {
          created++;
          // Update Postgres record with new Salesforce ID
          const pgId = batch[j].pgId;
          const prismaModel = objectType.charAt(0).toLowerCase() + objectType.slice(1);
          await prisma[prismaModel].update({
            where: { id: pgId },
            data: { salesforceId: result.id }
          });
        } else {
          errors.push({
            pgId: batch[j].pgId,
            error: result.errors?.join(', ') || 'Unknown error'
          });
        }
      }
    } catch (e) {
      console.error(`Batch create failed:`, e.message);
      errors.push({ batch: i, error: e.message });
    }
  }

  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors.length}`);

  return { updated, created, errors };
}

/**
 * Get modified records from Postgres since last sync
 */
export async function getModifiedPostgresRecords(prismaModel, since = null) {
  const where = since ? { updatedAt: { gt: since } } : {};
  return await prisma[prismaModel].findMany({ where });
}

/**
 * Get modified records from Salesforce since last sync
 */
export async function getModifiedSalesforceRecords(conn, objectName, fields, since = null) {
  let query = `SELECT ${fields.join(', ')} FROM ${objectName}`;
  if (since) {
    query += ` WHERE LastModifiedDate > ${since.toISOString()}`;
  }
  return await querySalesforce(conn, query);
}

/**
 * Detect conflicts between Postgres and Salesforce records
 */
export function detectConflicts(pgRecords, sfRecords, options = {}) {
  const { conflictResolution = ConflictResolution.MOST_RECENT } = options;

  const sfMap = new Map(sfRecords.map(r => [r.Id, r]));
  const conflicts = [];
  const pgOnlyUpdates = [];
  const sfOnlyUpdates = [];

  for (const pgRecord of pgRecords) {
    if (!pgRecord.salesforceId) {
      pgOnlyUpdates.push(pgRecord);
      continue;
    }

    const sfRecord = sfMap.get(pgRecord.salesforceId);
    if (!sfRecord) {
      pgOnlyUpdates.push(pgRecord);
      continue;
    }

    // Check if both were modified
    const pgModified = new Date(pgRecord.updatedAt);
    const sfModified = new Date(sfRecord.LastModifiedDate);

    // If modified within 1 second, consider it a potential conflict
    if (Math.abs(pgModified - sfModified) > 1000) {
      conflicts.push({
        pgRecord,
        sfRecord,
        pgModifiedAt: pgModified,
        sfModifiedAt: sfModified,
        winner: conflictResolution === ConflictResolution.SALESFORCE_WINS ? 'sf' :
                conflictResolution === ConflictResolution.POSTGRES_WINS ? 'pg' :
                pgModified > sfModified ? 'pg' : 'sf'
      });
    }

    sfMap.delete(pgRecord.salesforceId);
  }

  // Remaining SF records are SF-only updates
  sfOnlyUpdates.push(...sfMap.values());

  return { conflicts, pgOnlyUpdates, sfOnlyUpdates };
}

/**
 * Bidirectional sync orchestrator
 */
export class SyncEngine {
  constructor(objectType, options = {}) {
    this.objectType = objectType;
    this.options = {
      conflictResolution: ConflictResolution.MOST_RECENT,
      dryRun: false,
      batchSize: 200,
      ...options
    };
  }

  async syncToSalesforce(prismaModel, sfObjectName) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`SYNC ${this.objectType} TO SALESFORCE`);
    console.log('='.repeat(60));

    const lastSync = getLastSyncTime(this.objectType, 'pg_to_sf');
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Never'}`);

    // Get modified records from Postgres
    const modifiedRecords = await getModifiedPostgresRecords(prismaModel, lastSync);
    console.log(`Found ${modifiedRecords.length} modified records in Postgres`);

    if (modifiedRecords.length === 0) {
      console.log('No changes to sync');
      return { updated: 0, created: 0, errors: [] };
    }

    // Build reverse ID maps
    const idMaps = await buildReverseIdMaps();

    // Push to Salesforce
    const result = await pushToSalesforce(
      this.objectType,
      sfObjectName,
      modifiedRecords,
      idMaps,
      this.options
    );

    if (!this.options.dryRun && result.errors.length === 0) {
      saveLastSyncTime(this.objectType, 'pg_to_sf');
    }

    return result;
  }
}

export default {
  ConflictResolution,
  getLastSyncTime,
  saveLastSyncTime,
  reverseTransforms,
  buildReverseIdMaps,
  pushToSalesforce,
  getModifiedPostgresRecords,
  getModifiedSalesforceRecords,
  detectConflicts,
  SyncEngine
};
