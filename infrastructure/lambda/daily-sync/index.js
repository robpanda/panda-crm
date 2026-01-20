/**
 * Panda CRM Daily Salesforce Sync Lambda
 *
 * Triggered by EventBridge on a schedule to sync Salesforce data to PostgreSQL.
 * Runs incremental sync by default, syncing only records modified since last run.
 */

const { PrismaClient } = require('@prisma/client');
const jsforce = require('jsforce');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// Initialize clients
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const prisma = new PrismaClient();

// Config
const SYNC_STATE_BUCKET = process.env.SYNC_STATE_BUCKET || 'panda-crm-sync-state';
const SYNC_STATE_KEY = 'daily-sync-state.json';

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

// Get Salesforce credentials from environment variables or Secrets Manager
async function getSalesforceCredentials() {
  // First try environment variables (faster, no network call needed)
  if (process.env.SF_USERNAME && process.env.SF_PASSWORD) {
    console.log('Using Salesforce credentials from environment variables');
    return {
      username: process.env.SF_USERNAME,
      password: process.env.SF_PASSWORD,
      securityToken: process.env.SF_SECURITY_TOKEN || '',
      instanceUrl: process.env.SF_INSTANCE_URL || 'https://ability-saas-2460.my.salesforce.com',
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    };
  }

  // Fall back to Secrets Manager
  console.log('Fetching Salesforce credentials from Secrets Manager');
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'panda-crm/salesforce' })
  );
  return JSON.parse(response.SecretString);
}

// Get Salesforce connection
async function getSalesforceConnection() {
  const creds = await getSalesforceCredentials();

  const conn = new jsforce.Connection({
    loginUrl: creds.loginUrl || 'https://login.salesforce.com',
    instanceUrl: creds.instanceUrl,
    accessToken: creds.accessToken,
  });

  // If no access token, login with username/password
  if (!creds.accessToken) {
    await conn.login(creds.username, creds.password + (creds.securityToken || ''));
    console.log('Connected to Salesforce:', conn.instanceUrl);
  }

  return conn;
}

// Query Salesforce with auto-fetch for large result sets
async function querySalesforce(conn, soql) {
  const records = [];
  const query = conn.query(soql).maxFetch(500000);

  return new Promise((resolve, reject) => {
    query.on('record', (record) => records.push(record));
    query.on('end', () => {
      console.log(`Fetched ${records.length} records`);
      resolve(records);
    });
    query.on('error', (err) => reject(err));
    query.run({ autoFetch: true, maxFetch: 500000 });
  });
}

// Get sync state from S3
async function getSyncState() {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: SYNC_STATE_BUCKET,
      Key: SYNC_STATE_KEY,
    }));
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return {};
    }
    console.error('Error getting sync state:', error);
    return {};
  }
}

// Save sync state to S3
async function saveSyncState(state) {
  await s3Client.send(new PutObjectCommand({
    Bucket: SYNC_STATE_BUCKET,
    Key: SYNC_STATE_KEY,
    Body: JSON.stringify(state, null, 2),
    ContentType: 'application/json',
  }));
}

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  const [accounts, contacts, opportunities, users, contracts, workOrders] = await Promise.all([
    prisma.account.findMany({ select: { id: true, salesforceId: true } }),
    prisma.contact.findMany({ select: { id: true, salesforceId: true } }),
    prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }),
    prisma.user.findMany({ select: { id: true, salesforceId: true }, where: { salesforceId: { not: null } } }),
    prisma.serviceContract.findMany({ select: { id: true, salesforceId: true } }),
    prisma.workOrder.findMany({ select: { id: true, salesforceId: true } }),
  ]);

  return {
    accountIdMap: new Map(accounts.map(a => [a.salesforceId, a.id])),
    contactIdMap: new Map(contacts.map(c => [c.salesforceId, c.id])),
    opportunityIdMap: new Map(opportunities.map(o => [o.salesforceId, o.id])),
    userIdMap: new Map(users.map(u => [u.salesforceId, u.id])),
    contractIdMap: new Map(contracts.map(c => [c.salesforceId, c.id])),
    workOrderIdMap: new Map(workOrders.map(w => [w.salesforceId, w.id])),
  };
}

// Sync ServiceContracts
async function syncContracts(conn, idMaps, state, force = false) {
  console.log('Syncing ServiceContracts...');

  const lastSync = force ? null : state.ServiceContract;
  console.log(`  Last sync: ${lastSync || 'Full sync'}`);

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
    query += ` AND LastModifiedDate > ${lastSync}`;
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

      await prisma.serviceContract.upsert({
        where: { salesforceId: sfRecord.Id },
        update: data,
        create: {
          ...data,
          createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
        },
      });
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing contract ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Sync Invoices
async function syncInvoices(conn, idMaps, state, force = false) {
  console.log('Syncing Invoices...');

  const lastSync = force ? null : state.Invoice;
  console.log(`  Last sync: ${lastSync || 'Full sync'}`);

  const fields = [
    'Id', 'Name', 'fw1__Account__c', 'Service_Contract__c',
    'fw1__Status__c', 'fw1__Invoice_Date__c', 'fw1__Due_Date__c',
    'fw1__Total_Invoice_Amount__c', 'fw1__Balance_Due__c', 'fw1__Total_Paid_Amount__c',
    'PM_Invoice__c', 'OwnerId',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM fw1__Invoice__c WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync}`;
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

      await prisma.invoice.upsert({
        where: { salesforceId: sfRecord.Id },
        update: data,
        create: {
          ...data,
          createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
        },
      });
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing invoice ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Sync WorkOrders
async function syncWorkOrders(conn, idMaps, state, force = false) {
  console.log('Syncing WorkOrders...');

  const lastSync = force ? null : state.WorkOrder;
  console.log(`  Last sync: ${lastSync || 'Full sync'}`);

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
    query += ` AND LastModifiedDate > ${lastSync}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    const accountId = sfRecord.AccountId ? idMaps.accountIdMap.get(sfRecord.AccountId) : null;
    if (!accountId) continue;

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

      await prisma.workOrder.upsert({
        where: { salesforceId: sfRecord.Id },
        update: data,
        create: {
          ...data,
          createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
        },
      });
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing work order ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Sync ServiceAppointments
async function syncServiceAppointments(conn, idMaps, state, force = false) {
  console.log('Syncing ServiceAppointments...');

  const lastSync = force ? null : state.ServiceAppointment;
  console.log(`  Last sync: ${lastSync || 'Full sync'}`);

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
    query += ` AND LastModifiedDate > ${lastSync}`;
  }

  const records = await querySalesforce(conn, query);
  console.log(`  Found ${records.length} modified records`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  let synced = 0, errors = 0;

  for (const sfRecord of records) {
    const workOrderId = sfRecord.ParentRecordId ? idMaps.workOrderIdMap.get(sfRecord.ParentRecordId) : null;
    if (!workOrderId) continue;

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

      await prisma.serviceAppointment.upsert({
        where: { salesforceId: sfRecord.Id },
        update: data,
        create: {
          ...data,
          createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
        },
      });
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing appointment ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Sync Quotes
async function syncQuotes(conn, idMaps, state, force = false) {
  console.log('Syncing Quotes...');

  const lastSync = force ? null : state.Quote;
  console.log(`  Last sync: ${lastSync || 'Full sync'}`);

  const fields = [
    'Id', 'Name', 'QuoteNumber', 'OpportunityId', 'AccountId', 'ContactId',
    'Status', 'ExpirationDate', 'Description',
    'TotalPrice', 'Subtotal', 'Tax', 'Discount', 'GrandTotal',
    'CreatedDate', 'LastModifiedDate', 'IsDeleted',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Quote WHERE IsDeleted = false`;
  if (lastSync) {
    query += ` AND LastModifiedDate > ${lastSync}`;
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

      await prisma.quote.upsert({
        where: { salesforceId: sfRecord.Id },
        update: data,
        create: {
          ...data,
          createdAt: sfRecord.CreatedDate ? new Date(sfRecord.CreatedDate) : new Date(),
        },
      });
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error syncing quote ${sfRecord.Id}: ${error.message}`);
      }
    }
  }

  console.log(`  Synced: ${synced}, Errors: ${errors}`);
  return { synced, errors };
}

// Lambda handler
exports.handler = async (event) => {
  const startTime = Date.now();
  const force = event.force || false;

  // Handle admin actions
  if (event.action === 'admin') {
    try {
      if (event.query === 'findUser') {
        const users = await prisma.user.findMany({
          where: {
            OR: [
              { firstName: { contains: event.search, mode: 'insensitive' } },
              { lastName: { contains: event.search, mode: 'insensitive' } }
            ]
          },
          select: { id: true, email: true, firstName: true, lastName: true },
          take: 10
        });
        return { statusCode: 200, body: JSON.stringify({ users }) };
      }
      if (event.query === 'assignOwner') {
        const updated = await prisma.opportunity.update({
          where: { id: event.opportunityId },
          data: { ownerId: event.ownerId },
          select: { id: true, name: true, ownerId: true }
        });
        return { statusCode: 200, body: JSON.stringify({ updated }) };
      }
      if (event.query === 'getOpportunity') {
        const opp = await prisma.opportunity.findUnique({
          where: { id: event.opportunityId },
          select: { id: true, name: true, ownerId: true, owner: { select: { firstName: true, lastName: true } } }
        });
        return { statusCode: 200, body: JSON.stringify({ opportunity: opp }) };
      }
      if (event.query === 'rawSql') {
        // Execute raw SQL - use carefully!
        const result = await prisma.$executeRawUnsafe(event.sql);
        return { statusCode: 200, body: JSON.stringify({ result }) };
      }
      if (event.query === 'addDraftEnum') {
        // Add DRAFT to WorkOrderStatus enum if it doesn't exist
        try {
          await prisma.$executeRawUnsafe(`ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'DRAFT' BEFORE 'NEW'`);
          return { statusCode: 200, body: JSON.stringify({ success: true, message: 'DRAFT enum value added' }) };
        } catch (error) {
          // Might already exist
          return { statusCode: 200, body: JSON.stringify({ success: true, message: 'DRAFT may already exist', error: error.message }) };
        }
      }
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown admin query' }) };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
  }

  console.log('═'.repeat(60));
  console.log('PANDA CRM DAILY SALESFORCE SYNC');
  console.log('═'.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${force ? 'FULL' : 'INCREMENTAL'}`);

  try {
    const conn = await getSalesforceConnection();
    const state = await getSyncState();
    const idMaps = await buildIdMaps();

    const results = {};
    const now = new Date().toISOString();

    // Run all syncs
    results.contracts = await syncContracts(conn, idMaps, state, force);
    state.ServiceContract = now;

    results.invoices = await syncInvoices(conn, idMaps, state, force);
    state.Invoice = now;

    results.workorders = await syncWorkOrders(conn, idMaps, state, force);
    state.WorkOrder = now;

    results.appointments = await syncServiceAppointments(conn, idMaps, state, force);
    state.ServiceAppointment = now;

    results.quotes = await syncQuotes(conn, idMaps, state, force);
    state.Quote = now;

    // Save sync state
    await saveSyncState(state);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('═'.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Duration: ${elapsed}s`);

    const totalSynced = Object.values(results).reduce((sum, r) => sum + r.synced, 0);
    const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

    console.log(`Total Synced: ${totalSynced}, Total Errors: ${totalErrors}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        duration: elapsed,
        results,
        totalSynced,
        totalErrors,
      }),
    };

  } catch (error) {
    console.error('Sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
};
