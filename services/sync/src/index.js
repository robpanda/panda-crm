/**
 * Panda CRM Bidirectional Sync Service
 *
 * This Lambda handles:
 * 1. Daily scheduled sync: Salesforce → CRM (all entities modified since last sync)
 * 2. Real-time push: CRM → Salesforce (new leads created in CRM)
 *
 * Trigger Types:
 * - EventBridge Schedule: Daily SF → CRM sync
 * - API Gateway: CRM → SF lead push (called when lead is created in CRM)
 */

const jsforce = require('jsforce');
const { Client } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');

// Configuration
const SF_LOGIN_URL = 'https://login.salesforce.com';
const BATCH_SIZE = 200;
const DATABASE_URL = process.env.DATABASE_URL;

// AWS Clients
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });
const dynamoClient = new DynamoDBClient({ region: 'us-east-2' });

// Database connection
let db = null;

async function getDbConnection() {
  if (!db) {
    db = new Client({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await db.connect();
  }
  return db;
}

// Get Salesforce credentials
async function getSalesforceCredentials() {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' })
  );
  return JSON.parse(response.SecretString);
}

// Connect to Salesforce
async function connectToSalesforce() {
  const creds = await getSalesforceCredentials();
  const conn = new jsforce.Connection({ loginUrl: SF_LOGIN_URL });
  await conn.login(creds.username, creds.password + creds.security_token);
  console.log('Connected to Salesforce:', conn.instanceUrl);
  return conn;
}

// Get last sync timestamp from DynamoDB
async function getLastSyncTime(entity) {
  try {
    const response = await dynamoClient.send(new GetItemCommand({
      TableName: 'panda-crm-sync-state',
      Key: { entity: { S: entity } }
    }));
    if (response.Item && response.Item.lastSync) {
      return new Date(response.Item.lastSync.S);
    }
  } catch (error) {
    console.log(`No previous sync time found for ${entity}`);
  }
  // Default to 24 hours ago for first run
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// Save last sync timestamp to DynamoDB
async function saveLastSyncTime(entity) {
  await dynamoClient.send(new PutItemCommand({
    TableName: 'panda-crm-sync-state',
    Item: {
      entity: { S: entity },
      lastSync: { S: new Date().toISOString() }
    }
  }));
}

// Generate CUID-like ID
function generateId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `c${timestamp}${randomPart}`;
}

// ============================================================================
// MAPPING FUNCTIONS
// ============================================================================

const mapAccountType = (sfType) => {
  const mapping = {
    'Residential': 'RESIDENTIAL',
    'Commercial': 'COMMERCIAL',
    'Property Management': 'PROPERTY_MANAGEMENT',
    'Government': 'GOVERNMENT'
  };
  return mapping[sfType] || 'RESIDENTIAL';
};

const mapAccountStatus = (sfStatus) => {
  const mapping = {
    'New': 'NEW',
    'Lead': 'NEW',
    'Lead Assigned': 'NEW',
    'Lead Unassigned': 'NEW',
    'Customer - Active': 'ACTIVE',
    'Customer': 'ACTIVE',
    'Active': 'ACTIVE',
    'Onboarding': 'ONBOARDING',
    'In Production': 'IN_PRODUCTION',
    'Closed - Paid': 'COMPLETED',
    'Closed - Won': 'COMPLETED',
    'Closed Won': 'COMPLETED',
    'Completed': 'COMPLETED',
    'Closed - Lost': 'INACTIVE',
    'Closed Lost': 'INACTIVE',
    'Inactive': 'INACTIVE',
    'Dead': 'INACTIVE'
  };
  return mapping[sfStatus] || 'NEW';
};

const mapOpportunityStage = (sfStage) => {
  const mapping = {
    'Lead Unassigned': 'LEAD_UNASSIGNED',
    'Lead Assigned': 'LEAD_ASSIGNED',
    'Scheduled': 'SCHEDULED',
    'Inspected': 'INSPECTED',
    'Claim Filed': 'CLAIM_FILED',
    'Approved': 'APPROVED',
    'Contract Signed': 'CONTRACT_SIGNED',
    'In Production': 'IN_PRODUCTION',
    'Completed': 'COMPLETED',
    'Closed Won': 'CLOSED_WON',
    'Closed - Won': 'CLOSED_WON',
    'Closed Lost': 'CLOSED_LOST',
    'Closed - Lost': 'CLOSED_LOST'
  };
  return mapping[sfStage] || 'LEAD_UNASSIGNED';
};

const mapOpportunityType = (sfType) => {
  const mapping = {
    'Insurance': 'INSURANCE',
    'Retail': 'RETAIL',
    'Commercial': 'COMMERCIAL'
  };
  return mapping[sfType] || 'INSURANCE';
};

const mapLeadStatus = (sfStatus) => {
  const mapping = {
    'New': 'NEW',
    'Open - Not Contacted': 'NEW',
    'Working - Contacted': 'CONTACTED',
    'Contacted': 'CONTACTED',
    'Qualified': 'QUALIFIED',
    'Unqualified': 'UNQUALIFIED',
    'Nurturing': 'NURTURING',
    'Closed - Converted': 'CONVERTED',
    'Closed - Not Converted': 'UNQUALIFIED'
  };
  return mapping[sfStatus] || 'NEW';
};

const mapLeadRating = (sfRating) => {
  const mapping = { 'Hot': 'HOT', 'Warm': 'WARM', 'Cold': 'COLD' };
  return mapping[sfRating] || null;
};

// Reverse mappings for CRM → Salesforce
const reverseLeadStatus = (crmStatus) => {
  const mapping = {
    'NEW': 'Open - Not Contacted',
    'CONTACTED': 'Working - Contacted',
    'QUALIFIED': 'Qualified',
    'UNQUALIFIED': 'Unqualified',
    'NURTURING': 'Nurturing',
    'CONVERTED': 'Closed - Converted'
  };
  return mapping[crmStatus] || 'Open - Not Contacted';
};

const reverseLeadRating = (crmRating) => {
  const mapping = { 'HOT': 'Hot', 'WARM': 'Warm', 'COLD': 'Cold' };
  return mapping[crmRating] || null;
};

// ============================================================================
// SALESFORCE → CRM SYNC (Incremental)
// ============================================================================

async function syncUsersIncremental(conn, lastSync) {
  const db = await getDbConnection();
  console.log(`\n=== Syncing Users modified since ${lastSync.toISOString()} ===`);

  const query = `
    SELECT Id, Email, FirstName, LastName, Name, Phone, MobilePhone, IsActive,
           Department, Division, Title, EmployeeNumber, Street, City, State, PostalCode, Country,
           Company_Lead_Rate__c, Pre_Commission_Rate__c, Self_Gen_Rate__c,
           Commission_Rate__c, Override__c, Supplements_Commissionable__c, X50_50_Commission_Split__c,
           Office_Assignment__c, Start_Date__c, LastModifiedDate
    FROM User
    WHERE UserType = 'Standard' AND LastModifiedDate > ${lastSync.toISOString()}
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} modified users`);

  let created = 0, updated = 0, errors = 0;

  for (const record of result.records) {
    try {
      const existing = await db.query(
        'SELECT id FROM users WHERE salesforce_id = $1',
        [record.Id]
      );

      if (existing.rows.length > 0) {
        await db.query(`
          UPDATE users SET
            email = $1, first_name = $2, last_name = $3, full_name = $4,
            phone = $5, mobile_phone = $6, is_active = $7,
            department = $8, division = $9, title = $10, employee_number = $11,
            street = $12, city = $13, state = $14, postal_code = $15, country = $16,
            company_lead_rate = $17, pre_commission_rate = $18, self_gen_rate = $19,
            commission_rate = $20, override_percent = $21, supplements_commissionable = $22,
            x50_50_commission_split = $23, office_assignment = $24, start_date = $25,
            updated_at = NOW()
          WHERE salesforce_id = $26
        `, [
          record.Email, record.FirstName || 'Unknown', record.LastName || 'User', record.Name,
          record.Phone, record.MobilePhone, record.IsActive,
          record.Department, record.Division, record.Title, record.EmployeeNumber,
          record.Street, record.City, record.State, record.PostalCode, record.Country,
          record.Company_Lead_Rate__c, record.Pre_Commission_Rate__c, record.Self_Gen_Rate__c,
          record.Commission_Rate__c, record.Override__c, record.Supplements_Commissionable__c || false,
          record.X50_50_Commission_Split__c || false, record.Office_Assignment__c, record.Start_Date__c,
          record.Id
        ]);
        updated++;
      } else {
        await db.query(`
          INSERT INTO users (id, salesforce_id, email, first_name, last_name, full_name,
            phone, mobile_phone, is_active, department, division, title, employee_number,
            street, city, state, postal_code, country,
            company_lead_rate, pre_commission_rate, self_gen_rate,
            commission_rate, override_percent, supplements_commissionable,
            x50_50_commission_split, office_assignment, start_date, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
                  $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW())
        `, [
          generateId(), record.Id, record.Email, record.FirstName || 'Unknown', record.LastName || 'User', record.Name,
          record.Phone, record.MobilePhone, record.IsActive,
          record.Department, record.Division, record.Title, record.EmployeeNumber,
          record.Street, record.City, record.State, record.PostalCode, record.Country,
          record.Company_Lead_Rate__c, record.Pre_Commission_Rate__c, record.Self_Gen_Rate__c,
          record.Commission_Rate__c, record.Override__c, record.Supplements_Commissionable__c || false,
          record.X50_50_Commission_Split__c || false, record.Office_Assignment__c, record.Start_Date__c
        ]);
        created++;
      }
    } catch (error) {
      console.error(`Error syncing user ${record.Id}:`, error.message);
      errors++;
    }
  }

  console.log(`Users: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

async function syncAccountsIncremental(conn, lastSync) {
  const db = await getDbConnection();
  console.log(`\n=== Syncing Accounts modified since ${lastSync.toISOString()} ===`);

  const query = `
    SELECT Id, Name, AccountNumber, Job_Number__c,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           Phone, Email_Address__c, Website,
           Type, Account_Status__c, Industry,
           Total_Job_Value__c, fw1__Total_Paid_Amount__c, fw1__Total_Balance_Amount__c,
           isSureClaims__c, OwnerId, QB_Customer_ID__c
    FROM Account
    WHERE LastModifiedDate > ${lastSync.toISOString()}
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);

  while (true) {
    console.log(`Processing batch of ${result.records.length} accounts...`);

    for (const record of result.records) {
      try {
        let ownerId = null;
        if (record.OwnerId) {
          const ownerResult = await db.query(
            'SELECT id FROM users WHERE salesforce_id = $1',
            [record.OwnerId]
          );
          if (ownerResult.rows.length > 0) ownerId = ownerResult.rows[0].id;
        }

        const existing = await db.query(
          'SELECT id FROM accounts WHERE salesforce_id = $1',
          [record.Id]
        );

        if (existing.rows.length > 0) {
          await db.query(`
            UPDATE accounts SET
              name = $1, account_number = $2,
              billing_street = $3, billing_city = $4, billing_state = $5,
              billing_postal_code = $6, billing_country = $7,
              phone = $8, email = $9, website = $10,
              type = $11, status = $12, industry = $13,
              total_sales_volume = $14, total_paid_amount = $15, balance_due = $16,
              is_panda_claims = $17, is_sure_claims = $18,
              owner_id = $19, qb_customer_id = $20, updated_at = NOW()
            WHERE salesforce_id = $21
          `, [
            record.Name, record.AccountNumber || record.Job_Number__c,
            record.BillingStreet, record.BillingCity, record.BillingState,
            record.BillingPostalCode, record.BillingCountry,
            record.Phone, record.Email_Address__c, record.Website,
            mapAccountType(record.Type), mapAccountStatus(record.Account_Status__c), record.Industry,
            record.Total_Job_Value__c, record.fw1__Total_Paid_Amount__c, record.fw1__Total_Balance_Amount__c,
            record.isSureClaims__c || false, record.isSureClaims__c || false,
            ownerId, record.QB_Customer_ID__c, record.Id
          ]);
          totalUpdated++;
        } else {
          await db.query(`
            INSERT INTO accounts (id, salesforce_id, name, account_number,
              billing_street, billing_city, billing_state, billing_postal_code, billing_country,
              phone, email, website, type, status, industry,
              total_sales_volume, total_paid_amount, balance_due,
              is_panda_claims, is_sure_claims, owner_id, qb_customer_id,
              created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
          `, [
            generateId(), record.Id, record.Name, record.AccountNumber || record.Job_Number__c,
            record.BillingStreet, record.BillingCity, record.BillingState,
            record.BillingPostalCode, record.BillingCountry,
            record.Phone, record.Email_Address__c, record.Website,
            mapAccountType(record.Type), mapAccountStatus(record.Account_Status__c), record.Industry,
            record.Total_Job_Value__c, record.fw1__Total_Paid_Amount__c, record.fw1__Total_Balance_Amount__c,
            record.isSureClaims__c || false, record.isSureClaims__c || false,
            ownerId, record.QB_Customer_ID__c
          ]);
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing account ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) break;
    result = await conn.queryMore(result.nextRecordsUrl);
  }

  console.log(`Accounts: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncOpportunitiesIncremental(conn, lastSync) {
  const db = await getDbConnection();
  console.log(`\n=== Syncing Opportunities modified since ${lastSync.toISOString()} ===`);

  const query = `
    SELECT Id, Name, Description,
           StageName, Status__c, Probability,
           CloseDate, Tentative_Appointment_Date__c,
           Amount, fw1__Total_Invoice_Amount__c,
           Work_Type__c, Type, LeadSource, SelfGen_Lead__c,
           isSureClaims__c, Claim_Number__c, Claim_Filed__c,
           Insurance_Comp__c, RCV__c, ACV__c, Deductible__c,
           AccountId, Contact__c, OwnerId
    FROM Opportunity
    WHERE LastModifiedDate > ${lastSync.toISOString()}
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0, skipped = 0;
  let result = await conn.query(query);

  while (true) {
    console.log(`Processing batch of ${result.records.length} opportunities...`);

    for (const record of result.records) {
      try {
        // Get account CRM ID
        let accountId = null;
        if (record.AccountId) {
          const accountResult = await db.query(
            'SELECT id FROM accounts WHERE salesforce_id = $1',
            [record.AccountId]
          );
          if (accountResult.rows.length > 0) accountId = accountResult.rows[0].id;
        }

        if (!accountId) {
          skipped++;
          continue;
        }

        // Get contact CRM ID
        let contactId = null;
        if (record.Contact__c) {
          const contactResult = await db.query(
            'SELECT id FROM contacts WHERE salesforce_id = $1',
            [record.Contact__c]
          );
          if (contactResult.rows.length > 0) contactId = contactResult.rows[0].id;
        }

        // Get owner CRM ID
        let ownerId = null;
        if (record.OwnerId) {
          const ownerResult = await db.query(
            'SELECT id FROM users WHERE salesforce_id = $1',
            [record.OwnerId]
          );
          if (ownerResult.rows.length > 0) ownerId = ownerResult.rows[0].id;
        }

        const existing = await db.query(
          'SELECT id FROM opportunities WHERE salesforce_id = $1',
          [record.Id]
        );

        if (existing.rows.length > 0) {
          await db.query(`
            UPDATE opportunities SET
              name = $1, description = $2,
              stage = $3, status = $4, probability = $5,
              close_date = $6, appointment_date = $7,
              amount = $8, contract_total = $9,
              work_type = $10, type = $11, lead_source = $12, is_self_gen = $13,
              is_panda_claims = $14, claim_number = $15,
              insurance_carrier = $16, rcv_amount = $17, acv_amount = $18, deductible = $19,
              account_id = $20, contact_id = $21, owner_id = $22, updated_at = NOW()
            WHERE salesforce_id = $23
          `, [
            record.Name, record.Description,
            mapOpportunityStage(record.StageName), record.Status__c, record.Probability || 0,
            record.CloseDate, record.Tentative_Appointment_Date__c,
            record.Amount, record.fw1__Total_Invoice_Amount__c,
            record.Work_Type__c, mapOpportunityType(record.Type), record.LeadSource, record.SelfGen_Lead__c || false,
            record.isSureClaims__c || false, record.Claim_Number__c,
            record.Insurance_Comp__c, record.RCV__c, record.ACV__c, record.Deductible__c,
            accountId, contactId, ownerId, record.Id
          ]);
          totalUpdated++;
        } else {
          await db.query(`
            INSERT INTO opportunities (id, salesforce_id, name, description,
              stage, status, probability, close_date, appointment_date,
              amount, contract_total, work_type, type, lead_source, is_self_gen,
              is_panda_claims, claim_number,
              insurance_carrier, rcv_amount, acv_amount, deductible,
              account_id, contact_id, owner_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
          `, [
            generateId(), record.Id, record.Name, record.Description,
            mapOpportunityStage(record.StageName), record.Status__c, record.Probability || 0,
            record.CloseDate, record.Tentative_Appointment_Date__c,
            record.Amount, record.fw1__Total_Invoice_Amount__c,
            record.Work_Type__c, mapOpportunityType(record.Type), record.LeadSource, record.SelfGen_Lead__c || false,
            record.isSureClaims__c || false, record.Claim_Number__c,
            record.Insurance_Comp__c, record.RCV__c, record.ACV__c, record.Deductible__c,
            accountId, contactId, ownerId
          ]);
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing opportunity ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) break;
    result = await conn.queryMore(result.nextRecordsUrl);
  }

  console.log(`Opportunities: ${totalCreated} created, ${totalUpdated} updated, ${skipped} skipped, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

async function syncLeadsIncremental(conn, lastSync) {
  const db = await getDbConnection();
  console.log(`\n=== Syncing Leads modified since ${lastSync.toISOString()} ===`);

  // Only sync leads that have a salesforce_id OR were modified in Salesforce
  // Skip leads created in CRM (they get pushed to SF, not pulled)
  const query = `
    SELECT Id, FirstName, LastName, Company, Email, Phone, MobilePhone,
           Street, City, State, PostalCode,
           Status, LeadSource, Rating, Industry,
           OwnerId, IsConverted, ConvertedDate,
           ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId
    FROM Lead
    WHERE LastModifiedDate > ${lastSync.toISOString()}
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);

  while (true) {
    console.log(`Processing batch of ${result.records.length} leads...`);

    for (const record of result.records) {
      try {
        // Get owner CRM ID
        let ownerId = null;
        if (record.OwnerId) {
          const ownerResult = await db.query(
            'SELECT id FROM users WHERE salesforce_id = $1',
            [record.OwnerId]
          );
          if (ownerResult.rows.length > 0) ownerId = ownerResult.rows[0].id;
        }

        // Get converted IDs if applicable
        let convertedAccountId = null, convertedContactId = null, convertedOpportunityId = null;

        if (record.ConvertedAccountId) {
          const r = await db.query('SELECT id FROM accounts WHERE salesforce_id = $1', [record.ConvertedAccountId]);
          if (r.rows.length > 0) convertedAccountId = r.rows[0].id;
        }
        if (record.ConvertedContactId) {
          const r = await db.query('SELECT id FROM contacts WHERE salesforce_id = $1', [record.ConvertedContactId]);
          if (r.rows.length > 0) convertedContactId = r.rows[0].id;
        }
        if (record.ConvertedOpportunityId) {
          const r = await db.query('SELECT id FROM opportunities WHERE salesforce_id = $1', [record.ConvertedOpportunityId]);
          if (r.rows.length > 0) convertedOpportunityId = r.rows[0].id;
        }

        const existing = await db.query(
          'SELECT id FROM leads WHERE salesforce_id = $1',
          [record.Id]
        );

        const rating = mapLeadRating(record.Rating);

        if (existing.rows.length > 0) {
          await db.query(`
            UPDATE leads SET
              first_name = $1, last_name = $2, company = $3,
              email = $4, phone = $5, mobile_phone = $6,
              street = $7, city = $8, state = $9, postal_code = $10,
              status = $11, lead_source = $12, rating = $13, industry = $14,
              owner_id = $15, is_converted = $16, converted_date = $17,
              converted_account_id = $18, converted_contact_id = $19, converted_opportunity_id = $20,
              updated_at = NOW()
            WHERE salesforce_id = $21
          `, [
            record.FirstName || 'Unknown', record.LastName || 'Lead', record.Company,
            record.Email, record.Phone, record.MobilePhone,
            record.Street, record.City, record.State, record.PostalCode,
            mapLeadStatus(record.Status), record.LeadSource, rating, record.Industry,
            ownerId, record.IsConverted || false, record.ConvertedDate,
            convertedAccountId, convertedContactId, convertedOpportunityId, record.Id
          ]);
          totalUpdated++;
        } else {
          await db.query(`
            INSERT INTO leads (id, salesforce_id, first_name, last_name, company,
              email, phone, mobile_phone, street, city, state, postal_code,
              status, lead_source, rating, industry,
              owner_id, is_converted, converted_date,
              converted_account_id, converted_contact_id, converted_opportunity_id,
              created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
          `, [
            generateId(), record.Id, record.FirstName || 'Unknown', record.LastName || 'Lead', record.Company,
            record.Email, record.Phone, record.MobilePhone,
            record.Street, record.City, record.State, record.PostalCode,
            mapLeadStatus(record.Status), record.LeadSource, rating, record.Industry,
            ownerId, record.IsConverted || false, record.ConvertedDate,
            convertedAccountId, convertedContactId, convertedOpportunityId
          ]);
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing lead ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) break;
    result = await conn.queryMore(result.nextRecordsUrl);
  }

  console.log(`Leads: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// CRM → SALESFORCE LEAD PUSH
// ============================================================================

async function pushLeadToSalesforce(conn, lead) {
  console.log(`Pushing lead ${lead.id} to Salesforce...`);

  // Get owner's Salesforce ID if set
  let ownerSfId = null;
  if (lead.owner_id) {
    const db = await getDbConnection();
    const ownerResult = await db.query(
      'SELECT salesforce_id FROM users WHERE id = $1',
      [lead.owner_id]
    );
    if (ownerResult.rows.length > 0 && ownerResult.rows[0].salesforce_id) {
      ownerSfId = ownerResult.rows[0].salesforce_id;
    }
  }

  // Build Salesforce Lead object
  const sfLead = {
    FirstName: lead.first_name,
    LastName: lead.last_name,
    Company: lead.company || `${lead.first_name} ${lead.last_name}`,
    Email: lead.email,
    Phone: lead.phone,
    MobilePhone: lead.mobile_phone,
    Street: lead.street,
    City: lead.city,
    State: lead.state,
    PostalCode: lead.postal_code,
    Status: reverseLeadStatus(lead.status),
    LeadSource: lead.lead_source || 'CRM',
    Rating: lead.rating ? reverseLeadRating(lead.rating) : null,
    Industry: lead.industry,
    Description: `Created in Panda CRM. CRM ID: ${lead.id}`
  };

  // Set owner if we have a Salesforce ID
  if (ownerSfId) {
    sfLead.OwnerId = ownerSfId;
  }

  // Remove null values
  Object.keys(sfLead).forEach(key => {
    if (sfLead[key] === null || sfLead[key] === undefined) {
      delete sfLead[key];
    }
  });

  try {
    const result = await conn.sobject('Lead').create(sfLead);

    if (result.success) {
      console.log(`Lead created in Salesforce with ID: ${result.id}`);

      // Update CRM lead with Salesforce ID
      const db = await getDbConnection();
      await db.query(
        'UPDATE leads SET salesforce_id = $1, updated_at = NOW() WHERE id = $2',
        [result.id, lead.id]
      );

      return { success: true, salesforceId: result.id };
    } else {
      console.error('Failed to create lead in Salesforce:', result.errors);
      return { success: false, errors: result.errors };
    }
  } catch (error) {
    console.error('Error pushing lead to Salesforce:', error.message);
    return { success: false, error: error.message };
  }
}

async function pushPendingLeadsToSalesforce(conn) {
  const db = await getDbConnection();
  console.log('\n=== Pushing CRM Leads to Salesforce ===');

  // Find leads created in CRM that don't have a Salesforce ID yet
  const result = await db.query(`
    SELECT id, first_name, last_name, company, email, phone, mobile_phone,
           street, city, state, postal_code, status, lead_source, rating, industry, owner_id
    FROM leads
    WHERE salesforce_id IS NULL
    ORDER BY created_at ASC
    LIMIT 100
  `);

  console.log(`Found ${result.rows.length} leads to push to Salesforce`);

  let success = 0, failed = 0;

  for (const lead of result.rows) {
    const pushResult = await pushLeadToSalesforce(conn, lead);
    if (pushResult.success) {
      success++;
    } else {
      failed++;
    }
  }

  console.log(`Lead Push: ${success} succeeded, ${failed} failed`);
  return { success, failed };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function runDailySync() {
  console.log('='.repeat(60));
  console.log('DAILY SALESFORCE → CRM SYNC');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);

  const conn = await connectToSalesforce();
  const results = {};

  // Sync each entity with its last sync time
  const lastSyncUsers = await getLastSyncTime('users');
  results.users = await syncUsersIncremental(conn, lastSyncUsers);
  await saveLastSyncTime('users');

  const lastSyncAccounts = await getLastSyncTime('accounts');
  results.accounts = await syncAccountsIncremental(conn, lastSyncAccounts);
  await saveLastSyncTime('accounts');

  const lastSyncOpportunities = await getLastSyncTime('opportunities');
  results.opportunities = await syncOpportunitiesIncremental(conn, lastSyncOpportunities);
  await saveLastSyncTime('opportunities');

  const lastSyncLeads = await getLastSyncTime('leads');
  results.leads = await syncLeadsIncremental(conn, lastSyncLeads);
  await saveLastSyncTime('leads');

  // Also push any CRM leads that need to go to Salesforce
  results.leadPush = await pushPendingLeadsToSalesforce(conn);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SYNC SUMMARY');
  console.log('='.repeat(60));
  for (const [key, value] of Object.entries(results)) {
    if (value.created !== undefined) {
      console.log(`${key}: ${value.created} created, ${value.updated} updated, ${value.errors} errors`);
    } else {
      console.log(`${key}: ${value.success} succeeded, ${value.failed} failed`);
    }
  }

  return results;
}

async function handleLeadCreated(leadId) {
  console.log(`Processing new lead creation: ${leadId}`);

  const db = await getDbConnection();
  const result = await db.query(`
    SELECT id, first_name, last_name, company, email, phone, mobile_phone,
           street, city, state, postal_code, status, lead_source, rating, industry, owner_id
    FROM leads WHERE id = $1
  `, [leadId]);

  if (result.rows.length === 0) {
    return { success: false, error: 'Lead not found' };
  }

  const lead = result.rows[0];

  // Skip if already has Salesforce ID
  if (lead.salesforce_id) {
    return { success: true, message: 'Lead already synced to Salesforce' };
  }

  const conn = await connectToSalesforce();
  return await pushLeadToSalesforce(conn, lead);
}

// Lambda handler
exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Determine trigger type
    if (event.source === 'aws.scheduler' || event['detail-type'] === 'Scheduled Event') {
      // EventBridge scheduled trigger - run daily sync
      const results = await runDailySync();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, results })
      };
    } else if (event.action === 'pushLead' && event.leadId) {
      // Direct Lambda invocation from leads service - push single lead
      const result = await handleLeadCreated(event.leadId);
      return {
        statusCode: result.success ? 200 : 400,
        body: JSON.stringify(result)
      };
    } else if (event.httpMethod === 'POST' && event.path === '/sync/lead') {
      // API Gateway trigger - single lead push
      const body = JSON.parse(event.body);
      const result = await handleLeadCreated(body.leadId);
      return {
        statusCode: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    } else if (event.httpMethod === 'POST' && event.path === '/sync/full') {
      // Manual full sync trigger
      const results = await runDailySync();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, results })
      };
    } else if (event.action === 'dailySync') {
      // Direct Lambda invocation for daily sync
      const results = await runDailySync();
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, results })
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Unknown trigger type' })
      };
    }
  } catch (error) {
    console.error('Sync error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    if (db) {
      await db.end();
      db = null;
    }
  }
};

// For local testing
if (require.main === module) {
  runDailySync()
    .then(results => {
      console.log('\nSync completed:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Sync failed:', error);
      process.exit(1);
    });
}
