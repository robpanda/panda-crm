#!/usr/bin/env node

/**
 * Salesforce to Panda CRM PostgreSQL Migration Script
 *
 * Migrates data from Salesforce to the new PostgreSQL database:
 * - Accounts
 * - Contacts
 * - Leads
 * - Opportunities
 * - Work Orders
 * - Service Appointments
 * - Quotes
 * - Invoices
 * - Users
 */

import jsforce from 'jsforce';
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient();
const secretsManager = new SecretsManagerClient({ region: 'us-east-2' });

// Migration stats
const stats = {
  users: { migrated: 0, errors: 0 },
  accounts: { migrated: 0, errors: 0 },
  contacts: { migrated: 0, errors: 0 },
  leads: { migrated: 0, errors: 0 },
  opportunities: { migrated: 0, errors: 0 },
  workOrders: { migrated: 0, errors: 0 },
  serviceAppointments: { migrated: 0, errors: 0 },
  quotes: { migrated: 0, errors: 0 },
  invoices: { migrated: 0, errors: 0 },
};

// User ID mapping (Salesforce ID -> PostgreSQL ID)
const userIdMap = new Map();

async function getSalesforceCredentials() {
  const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
  const response = await secretsManager.send(command);
  return JSON.parse(response.SecretString);
}

async function connectToSalesforce() {
  const creds = await getSalesforceCredentials();

  const conn = new jsforce.Connection({
    loginUrl: creds.instance_url || 'https://ability-saas-2460.my.salesforce.com'
  });

  await conn.login(creds.username, creds.password + creds.security_token);
  console.log('Connected to Salesforce');
  return conn;
}

// ============================================================================
// USERS MIGRATION
// ============================================================================

async function migrateUsers(conn) {
  console.log('\n=== Migrating Users ===');

  const query = `
    SELECT Id, Email, FirstName, LastName, Name, Phone, IsActive,
           Department, Title, ManagerId, UserRoleId
    FROM User
    WHERE IsActive = true
    LIMIT 1000
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} active users`);

  for (const record of result.records) {
    try {
      const user = await prisma.user.upsert({
        where: { salesforceId: record.Id },
        update: {
          email: record.Email,
          firstName: record.FirstName || 'Unknown',
          lastName: record.LastName || 'User',
          fullName: record.Name,
          phone: record.Phone,
          isActive: record.IsActive,
          department: record.Department,
          title: record.Title,
        },
        create: {
          salesforceId: record.Id,
          email: record.Email,
          firstName: record.FirstName || 'Unknown',
          lastName: record.LastName || 'User',
          fullName: record.Name,
          phone: record.Phone,
          isActive: record.IsActive,
          department: record.Department,
          title: record.Title,
        },
      });

      userIdMap.set(record.Id, user.id);
      stats.users.migrated++;
    } catch (error) {
      console.error(`Error migrating user ${record.Email}:`, error.message);
      stats.users.errors++;
    }
  }

  console.log(`Users: ${stats.users.migrated} migrated, ${stats.users.errors} errors`);
}

// ============================================================================
// ACCOUNTS MIGRATION
// ============================================================================

async function migrateAccounts(conn) {
  console.log('\n=== Migrating Accounts ===');

  const query = `
    SELECT Id, Name, AccountNumber, Phone,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           Type, Account_Status__c, Industry, Website,
           Total_Sales_Volume__c, fw1__Total_Paid_Amount__c, Total_Balance_Amount__c,
           isPandaClaims__c, isSureClaims__c, OwnerId,
           CreatedDate, LastModifiedDate
    FROM Account
    WHERE IsDeleted = false
    ORDER BY CreatedDate DESC
    LIMIT 10000
  `;

  let result = await conn.query(query);
  console.log(`Found ${result.totalSize} accounts`);

  while (result.records.length > 0) {
    for (const record of result.records) {
      try {
        // Map account status
        let status = 'NEW';
        if (record.Account_Status__c) {
          const statusMap = {
            'New': 'NEW',
            'Active': 'ACTIVE',
            'Onboarding': 'ONBOARDING',
            'In Production': 'IN_PRODUCTION',
            'Completed': 'COMPLETED',
            'Inactive': 'INACTIVE',
          };
          status = statusMap[record.Account_Status__c] || 'NEW';
        }

        // Map account type
        let type = 'RESIDENTIAL';
        if (record.Type) {
          const typeMap = {
            'Residential': 'RESIDENTIAL',
            'Commercial': 'COMMERCIAL',
            'Insurance': 'INSURANCE',
          };
          type = typeMap[record.Type] || 'RESIDENTIAL';
        }

        await prisma.account.upsert({
          where: { salesforceId: record.Id },
          update: {
            name: record.Name,
            accountNumber: record.AccountNumber,
            phone: record.Phone,
            website: record.Website,
            billingStreet: record.BillingStreet,
            billingCity: record.BillingCity,
            billingState: record.BillingState,
            billingPostalCode: record.BillingPostalCode,
            billingCountry: record.BillingCountry,
            type,
            status,
            industry: record.Industry,
            totalSalesVolume: record.Total_Sales_Volume__c || null,
            totalPaidAmount: record.fw1__Total_Paid_Amount__c || null,
            balanceDue: record.Total_Balance_Amount__c || null,
            isPandaClaims: record.isPandaClaims__c || false,
            isSureClaims: record.isSureClaims__c || false,
            ownerId: userIdMap.get(record.OwnerId) || null,
          },
          create: {
            salesforceId: record.Id,
            name: record.Name,
            accountNumber: record.AccountNumber,
            phone: record.Phone,
            website: record.Website,
            billingStreet: record.BillingStreet,
            billingCity: record.BillingCity,
            billingState: record.BillingState,
            billingPostalCode: record.BillingPostalCode,
            billingCountry: record.BillingCountry,
            type,
            status,
            industry: record.Industry,
            totalSalesVolume: record.Total_Sales_Volume__c || null,
            totalPaidAmount: record.fw1__Total_Paid_Amount__c || null,
            balanceDue: record.Total_Balance_Amount__c || null,
            isPandaClaims: record.isPandaClaims__c || false,
            isSureClaims: record.isSureClaims__c || false,
            ownerId: userIdMap.get(record.OwnerId) || null,
          },
        });

        stats.accounts.migrated++;
      } catch (error) {
        console.error(`Error migrating account ${record.Name}:`, error.message);
        stats.accounts.errors++;
      }
    }

    // Fetch more if available
    if (!result.done) {
      result = await conn.queryMore(result.nextRecordsUrl);
    } else {
      break;
    }
  }

  console.log(`Accounts: ${stats.accounts.migrated} migrated, ${stats.accounts.errors} errors`);
}

// ============================================================================
// CONTACTS MIGRATION
// ============================================================================

async function migrateContacts(conn) {
  console.log('\n=== Migrating Contacts ===');

  const query = `
    SELECT Id, FirstName, LastName, Name, Email, Phone, MobilePhone,
           Mogli_SMS__Mogli_Number__c, Mogli_SMS__Mogli_Opt_Out__c,
           MailingStreet, MailingCity, MailingState, MailingPostalCode,
           Title, Department, HasOptedOutOfEmail, DoNotCall,
           AccountId, Is_Primary__c,
           CreatedDate
    FROM Contact
    WHERE IsDeleted = false
    ORDER BY CreatedDate DESC
    LIMIT 10000
  `;

  let result = await conn.query(query);
  console.log(`Found ${result.totalSize} contacts`);

  while (result.records.length > 0) {
    for (const record of result.records) {
      try {
        // Look up Account by Salesforce ID
        let accountId = null;
        if (record.AccountId) {
          const account = await prisma.account.findUnique({
            where: { salesforceId: record.AccountId },
            select: { id: true },
          });
          accountId = account?.id;
        }

        await prisma.contact.upsert({
          where: { salesforceId: record.Id },
          update: {
            firstName: record.FirstName || 'Unknown',
            lastName: record.LastName || 'Contact',
            fullName: record.Name,
            email: record.Email,
            phone: record.Phone,
            mobilePhone: record.MobilePhone,
            smsNumber: record.Mogli_SMS__Mogli_Number__c,
            mailingStreet: record.MailingStreet,
            mailingCity: record.MailingCity,
            mailingState: record.MailingState,
            mailingPostalCode: record.MailingPostalCode,
            title: record.Title,
            department: record.Department,
            emailOptOut: record.HasOptedOutOfEmail || false,
            smsOptOut: record.Mogli_SMS__Mogli_Opt_Out__c || false,
            doNotCall: record.DoNotCall || false,
            accountId,
            isPrimary: record.Is_Primary__c || false,
          },
          create: {
            salesforceId: record.Id,
            firstName: record.FirstName || 'Unknown',
            lastName: record.LastName || 'Contact',
            fullName: record.Name,
            email: record.Email,
            phone: record.Phone,
            mobilePhone: record.MobilePhone,
            smsNumber: record.Mogli_SMS__Mogli_Number__c,
            mailingStreet: record.MailingStreet,
            mailingCity: record.MailingCity,
            mailingState: record.MailingState,
            mailingPostalCode: record.MailingPostalCode,
            title: record.Title,
            department: record.Department,
            emailOptOut: record.HasOptedOutOfEmail || false,
            smsOptOut: record.Mogli_SMS__Mogli_Opt_Out__c || false,
            doNotCall: record.DoNotCall || false,
            accountId,
            isPrimary: record.Is_Primary__c || false,
          },
        });

        stats.contacts.migrated++;
      } catch (error) {
        console.error(`Error migrating contact ${record.Name}:`, error.message);
        stats.contacts.errors++;
      }
    }

    if (!result.done) {
      result = await conn.queryMore(result.nextRecordsUrl);
    } else {
      break;
    }
  }

  console.log(`Contacts: ${stats.contacts.migrated} migrated, ${stats.contacts.errors} errors`);
}

// ============================================================================
// LEADS MIGRATION
// ============================================================================

async function migrateLeads(conn) {
  console.log('\n=== Migrating Leads ===');

  const query = `
    SELECT Id, FirstName, LastName, Company, Email, Phone, MobilePhone,
           Street, City, State, PostalCode,
           Status, LeadSource, Rating, Industry,
           OwnerId, SelfGen_Lead__c,
           IsConverted, ConvertedDate, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId,
           CreatedDate
    FROM Lead
    WHERE IsDeleted = false
    ORDER BY CreatedDate DESC
    LIMIT 10000
  `;

  let result = await conn.query(query);
  console.log(`Found ${result.totalSize} leads`);

  while (result.records.length > 0) {
    for (const record of result.records) {
      try {
        // Map lead status
        let status = 'NEW';
        const statusMap = {
          'New': 'NEW',
          'Contacted': 'CONTACTED',
          'Qualified': 'QUALIFIED',
          'Unqualified': 'UNQUALIFIED',
          'Nurturing': 'NURTURING',
          'Converted': 'CONVERTED',
        };
        status = statusMap[record.Status] || 'NEW';

        // Map rating
        let rating = null;
        if (record.Rating) {
          const ratingMap = { 'Hot': 'HOT', 'Warm': 'WARM', 'Cold': 'COLD' };
          rating = ratingMap[record.Rating];
        }

        await prisma.lead.upsert({
          where: { salesforceId: record.Id },
          update: {
            firstName: record.FirstName || 'Unknown',
            lastName: record.LastName || 'Lead',
            company: record.Company,
            email: record.Email,
            phone: record.Phone,
            mobilePhone: record.MobilePhone,
            street: record.Street,
            city: record.City,
            state: record.State,
            postalCode: record.PostalCode,
            status,
            source: record.LeadSource,
            rating,
            industry: record.Industry,
            ownerId: userIdMap.get(record.OwnerId) || null,
            isSelfGen: record.SelfGen_Lead__c || false,
            isConverted: record.IsConverted || false,
            convertedDate: record.ConvertedDate ? new Date(record.ConvertedDate) : null,
          },
          create: {
            salesforceId: record.Id,
            firstName: record.FirstName || 'Unknown',
            lastName: record.LastName || 'Lead',
            company: record.Company,
            email: record.Email,
            phone: record.Phone,
            mobilePhone: record.MobilePhone,
            street: record.Street,
            city: record.City,
            state: record.State,
            postalCode: record.PostalCode,
            status,
            source: record.LeadSource,
            rating,
            industry: record.Industry,
            ownerId: userIdMap.get(record.OwnerId) || null,
            isSelfGen: record.SelfGen_Lead__c || false,
            isConverted: record.IsConverted || false,
            convertedDate: record.ConvertedDate ? new Date(record.ConvertedDate) : null,
          },
        });

        stats.leads.migrated++;
      } catch (error) {
        console.error(`Error migrating lead ${record.FirstName} ${record.LastName}:`, error.message);
        stats.leads.errors++;
      }
    }

    if (!result.done) {
      result = await conn.queryMore(result.nextRecordsUrl);
    } else {
      break;
    }
  }

  console.log(`Leads: ${stats.leads.migrated} migrated, ${stats.leads.errors} errors`);
}

// ============================================================================
// OPPORTUNITIES MIGRATION
// ============================================================================

async function migrateOpportunities(conn) {
  console.log('\n=== Migrating Opportunities ===');

  const query = `
    SELECT Id, Name, Description, StageName, Status__c, Probability,
           CloseDate, Tentative_Appointment_Date__c, Sold_Date__c,
           Amount, Contract_Grand_Total__c,
           Type, Work_Type__c, LeadSource, SelfGen_Lead__c,
           isPandaClaims__c, isApproved__c, Claim_Number__c, Claim_Filed__c,
           Insurance_Carrier__c, RCV_Amount__c, ACV_Amount__c, Deductible__c,
           Supplements_Closed_Total__c,
           AccountId, ContactId, OwnerId,
           CreatedDate
    FROM Opportunity
    WHERE IsDeleted = false
    ORDER BY CreatedDate DESC
    LIMIT 10000
  `;

  let result = await conn.query(query);
  console.log(`Found ${result.totalSize} opportunities`);

  while (result.records.length > 0) {
    for (const record of result.records) {
      try {
        // Look up Account
        let accountId = null;
        if (record.AccountId) {
          const account = await prisma.account.findUnique({
            where: { salesforceId: record.AccountId },
            select: { id: true },
          });
          accountId = account?.id;
        }

        if (!accountId) {
          console.warn(`Skipping opportunity ${record.Name} - no account found`);
          stats.opportunities.errors++;
          continue;
        }

        // Look up Contact
        let contactId = null;
        if (record.ContactId) {
          const contact = await prisma.contact.findUnique({
            where: { salesforceId: record.ContactId },
            select: { id: true },
          });
          contactId = contact?.id;
        }

        // Map stage
        const stageMap = {
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
          'Closed Lost': 'CLOSED_LOST',
        };
        const stage = stageMap[record.StageName] || 'LEAD_UNASSIGNED';

        // Map type
        let type = 'INSURANCE';
        if (record.Type) {
          const typeMap = {
            'Insurance': 'INSURANCE',
            'Retail': 'RETAIL',
            'Commercial': 'COMMERCIAL',
          };
          type = typeMap[record.Type] || 'INSURANCE';
        }

        await prisma.opportunity.upsert({
          where: { salesforceId: record.Id },
          update: {
            name: record.Name,
            description: record.Description,
            stage,
            status: record.Status__c,
            probability: record.Probability || 0,
            closeDate: record.CloseDate ? new Date(record.CloseDate) : null,
            appointmentDate: record.Tentative_Appointment_Date__c ? new Date(record.Tentative_Appointment_Date__c) : null,
            soldDate: record.Sold_Date__c ? new Date(record.Sold_Date__c) : null,
            amount: record.Amount || null,
            contractTotal: record.Contract_Grand_Total__c || null,
            type,
            workType: record.Work_Type__c,
            leadSource: record.LeadSource,
            isSelfGen: record.SelfGen_Lead__c || false,
            isPandaClaims: record.isPandaClaims__c || false,
            isApproved: record.isApproved__c || false,
            claimNumber: record.Claim_Number__c,
            claimFiledDate: record.Claim_Filed__c ? new Date(record.Claim_Filed__c) : null,
            insuranceCarrier: record.Insurance_Carrier__c,
            rcvAmount: record.RCV_Amount__c || null,
            acvAmount: record.ACV_Amount__c || null,
            deductible: record.Deductible__c || null,
            supplementsTotal: record.Supplements_Closed_Total__c || null,
            accountId,
            contactId,
            ownerId: userIdMap.get(record.OwnerId) || null,
          },
          create: {
            salesforceId: record.Id,
            name: record.Name,
            description: record.Description,
            stage,
            status: record.Status__c,
            probability: record.Probability || 0,
            closeDate: record.CloseDate ? new Date(record.CloseDate) : null,
            appointmentDate: record.Tentative_Appointment_Date__c ? new Date(record.Tentative_Appointment_Date__c) : null,
            soldDate: record.Sold_Date__c ? new Date(record.Sold_Date__c) : null,
            amount: record.Amount || null,
            contractTotal: record.Contract_Grand_Total__c || null,
            type,
            workType: record.Work_Type__c,
            leadSource: record.LeadSource,
            isSelfGen: record.SelfGen_Lead__c || false,
            isPandaClaims: record.isPandaClaims__c || false,
            isApproved: record.isApproved__c || false,
            claimNumber: record.Claim_Number__c,
            claimFiledDate: record.Claim_Filed__c ? new Date(record.Claim_Filed__c) : null,
            insuranceCarrier: record.Insurance_Carrier__c,
            rcvAmount: record.RCV_Amount__c || null,
            acvAmount: record.ACV_Amount__c || null,
            deductible: record.Deductible__c || null,
            supplementsTotal: record.Supplements_Closed_Total__c || null,
            accountId,
            contactId,
            ownerId: userIdMap.get(record.OwnerId) || null,
          },
        });

        stats.opportunities.migrated++;
      } catch (error) {
        console.error(`Error migrating opportunity ${record.Name}:`, error.message);
        stats.opportunities.errors++;
      }
    }

    if (!result.done) {
      result = await conn.queryMore(result.nextRecordsUrl);
    } else {
      break;
    }
  }

  console.log(`Opportunities: ${stats.opportunities.migrated} migrated, ${stats.opportunities.errors} errors`);
}

// ============================================================================
// MAIN MIGRATION FUNCTION
// ============================================================================

async function runMigration() {
  console.log('======================================');
  console.log('Salesforce to Panda CRM Migration');
  console.log('======================================');
  console.log('Started at:', new Date().toISOString());

  try {
    const conn = await connectToSalesforce();

    // Run migrations in order (dependencies matter)
    await migrateUsers(conn);
    await migrateAccounts(conn);
    await migrateContacts(conn);
    await migrateLeads(conn);
    await migrateOpportunities(conn);

    // TODO: Add these when needed
    // await migrateWorkOrders(conn);
    // await migrateServiceAppointments(conn);
    // await migrateQuotes(conn);
    // await migrateInvoices(conn);

    console.log('\n======================================');
    console.log('Migration Complete!');
    console.log('======================================');
    console.log('Final Stats:');
    console.log(JSON.stringify(stats, null, 2));
    console.log('Finished at:', new Date().toISOString());

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
runMigration();
