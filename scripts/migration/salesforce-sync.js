#!/usr/bin/env node
/**
 * Salesforce to Panda CRM Data Migration Script
 *
 * This script syncs data from Salesforce to the Panda CRM PostgreSQL database.
 * It uses the Salesforce REST API via jsforce and Prisma ORM for database operations.
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node salesforce-sync.js [--entity <name>] [--full]
 *
 * Options:
 *   --entity <name>  Sync specific entity: users, accounts, contacts, opportunities, workorders, all
 *   --full           Full sync (ignore last sync timestamp)
 */

const jsforce = require('jsforce');
const { PrismaClient, Prisma } = require('@prisma/client');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// Job ID configuration
const JOB_ID_STARTING_NUMBER = 999; // First job will be 1000

// Configuration
const BATCH_SIZE = 200;
const SF_SECRET_ID = 'salesforce-api-credentials';

// Mapping of Salesforce values to Prisma enums
const STATUS_MAPPINGS = {
  accountType: {
    'Residential': 'RESIDENTIAL',
    'Commercial': 'COMMERCIAL',
    'Property Management': 'PROPERTY_MANAGEMENT',
    'Government': 'GOVERNMENT',
    'Non-Profit': 'NON_PROFIT',
    default: 'RESIDENTIAL'
  },
  accountStatus: {
    'New': 'NEW',
    'Lead': 'LEAD',
    'Customer - Active': 'CUSTOMER',
    'Customer': 'CUSTOMER',
    'Onboarding': 'ONBOARDING',
    'In Production': 'IN_PRODUCTION',
    'Closed - Paid': 'COMPLETED',
    'Closed - Won': 'COMPLETED',
    'Closed - Lost': 'LOST',
    'Inactive': 'INACTIVE',
    default: 'NEW'
  },
  leadStatus: {
    'Open - Not Contacted': 'NEW',
    'New': 'NEW',
    'Lead Set': 'CONTACTED',  // Lead Set = appointment has been scheduled, so they've been contacted
    'Working - Contacted': 'WORKING',
    'Contacted': 'CONTACTED',
    'Qualified': 'QUALIFIED',
    'Unqualified': 'UNQUALIFIED',
    'Converted': 'CONVERTED',
    default: 'NEW'
  },
  opportunityStage: {
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
    default: 'LEAD_UNASSIGNED'
  },
  opportunityType: {
    'Insurance': 'INSURANCE',
    'Retail': 'RETAIL',
    'Commercial': 'COMMERCIAL',
    default: 'INSURANCE'
  },
  workOrderStatus: {
    'New': 'NEW',
    'Open': 'OPEN',
    'In Progress': 'IN_PROGRESS',
    'On Hold': 'ON_HOLD',
    'Completed': 'COMPLETED',
    'Closed': 'CLOSED',
    'Cancelled': 'CANCELLED',
    default: 'NEW'
  },
  appointmentStatus: {
    'None': 'NONE',
    'Scheduled': 'SCHEDULED',
    'Dispatched': 'DISPATCHED',
    'In Progress': 'IN_PROGRESS',
    'Completed': 'COMPLETED',
    'Cannot Complete': 'CANNOT_COMPLETE',
    'Canceled': 'CANCELLED',
    default: 'NONE'
  }
};

// Get Salesforce credentials from AWS Secrets Manager
async function getSalesforceCredentials() {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SF_SECRET_ID })
  );
  return JSON.parse(response.SecretString);
}

// Connect to Salesforce
async function connectToSalesforce() {
  const creds = await getSalesforceCredentials();

  const conn = new jsforce.Connection({
    instanceUrl: creds.instance_url,
    accessToken: null
  });

  // Use JWT Bearer flow
  const privateKey = creds.private_key.replace(/\\n/g, '\n');

  await conn.login(creds.username, creds.password + creds.security_token);

  console.log('Connected to Salesforce:', conn.instanceUrl);
  return conn;
}

// Helper to map Salesforce value to Prisma enum
function mapEnum(value, mapping) {
  if (!value) return mapping.default;
  return mapping[value] || mapping.default;
}

// Parse decimal value
function parseDecimal(value) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

// Parse date value
function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

// Generate Job ID for opportunities
// Format: YYYY-NNNN (e.g., 2026-1000)
async function generateJobId(tx = prisma) {
  const currentYear = new Date().getFullYear();

  try {
    // Use raw query with row-level lock for thread safety
    const sequences = await tx.$queryRaw`
      SELECT id, year, last_number
      FROM job_id_sequences
      WHERE year = ${currentYear}
      FOR UPDATE
    `;

    let nextNumber;
    if (!sequences || sequences.length === 0) {
      // Create new sequence for this year
      await tx.jobIdSequence.create({
        data: {
          year: currentYear,
          lastNumber: JOB_ID_STARTING_NUMBER + 1,
        },
      });
      nextNumber = JOB_ID_STARTING_NUMBER + 1;
    } else {
      // Increment existing sequence
      nextNumber = Number(sequences[0].last_number) + 1;
      await tx.jobIdSequence.update({
        where: { year: currentYear },
        data: { lastNumber: nextNumber },
      });
    }

    return `${currentYear}-${nextNumber}`;
  } catch (err) {
    console.error(`Failed to generate Job ID: ${err.message}`);
    return null;
  }
}

// Bulk generate Job IDs for multiple opportunities
async function generateBulkJobIds(count) {
  const currentYear = new Date().getFullYear();
  const jobIds = [];

  try {
    await prisma.$transaction(async (tx) => {
      // Lock and get current sequence
      const sequences = await tx.$queryRaw`
        SELECT id, year, last_number
        FROM job_id_sequences
        WHERE year = ${currentYear}
        FOR UPDATE
      `;

      let startNumber;
      if (!sequences || sequences.length === 0) {
        // Create new sequence for this year
        startNumber = JOB_ID_STARTING_NUMBER + 1;
        await tx.jobIdSequence.create({
          data: {
            year: currentYear,
            lastNumber: startNumber + count - 1,
          },
        });
      } else {
        startNumber = Number(sequences[0].last_number) + 1;
        await tx.jobIdSequence.update({
          where: { year: currentYear },
          data: { lastNumber: startNumber + count - 1 },
        });
      }

      // Generate all Job IDs
      for (let i = 0; i < count; i++) {
        jobIds.push(`${currentYear}-${startNumber + i}`);
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (err) {
    console.error(`Failed to generate bulk Job IDs: ${err.message}`);
  }

  return jobIds;
}

// ============================================================================
// USER SYNC
// ============================================================================
async function syncUsers(conn, fullSync = false) {
  console.log('\n=== Syncing Users ===');

  const query = `
    SELECT Id, Email, FirstName, LastName, Name, Phone, MobilePhone, IsActive,
           Department, Division, Title, EmployeeNumber, Street, City, State, PostalCode, Country,
           ManagerId, Director__c, Regional_Manager__c, Executive__c,
           Company_Lead_Rate__c, Pre_Commission_Rate__c, Self_Gen_Rate__c,
           Commission_Rate__c, Override_Percent__c, Supplements_Commissionable__c, X50_50_Commission_Split__c,
           Office_Assignment__c, Start_Date__c, LastModifiedDate
    FROM User
    WHERE UserType = 'Standard'
  `;

  const result = await conn.query(query);
  console.log(`Found ${result.totalSize} users in Salesforce`);

  let created = 0, updated = 0, errors = 0;

  for (const record of result.records) {
    try {
      const userData = {
        salesforceId: record.Id,
        email: record.Email,
        firstName: record.FirstName || 'Unknown',
        lastName: record.LastName || 'User',
        fullName: record.Name,
        phone: record.Phone,
        mobilePhone: record.MobilePhone,
        isActive: record.IsActive,
        department: record.Department,
        division: record.Division,
        title: record.Title,
        employeeNumber: record.EmployeeNumber,
        officeAssignment: record.Office_Assignment__c,
        startDate: parseDate(record.Start_Date__c),
        street: record.Street,
        city: record.City,
        state: record.State,
        postalCode: record.PostalCode,
        country: record.Country,
        // Commission rates
        companyLeadRate: parseDecimal(record.Company_Lead_Rate__c),
        preCommissionRate: parseDecimal(record.Pre_Commission_Rate__c),
        selfGenRate: parseDecimal(record.Self_Gen_Rate__c),
        commissionRate: parseDecimal(record.Commission_Rate__c),
        overridePercent: parseDecimal(record.Override_Percent__c),
        supplementsCommissionable: record.Supplements_Commissionable__c || false,
        x5050CommissionSplit: record.X50_50_Commission_Split__c || false,
      };

      const existing = await prisma.user.findUnique({
        where: { salesforceId: record.Id }
      });

      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: userData
        });
        updated++;
      } else {
        await prisma.user.create({ data: userData });
        created++;
      }
    } catch (error) {
      console.error(`Error syncing user ${record.Id}:`, error.message);
      errors++;
    }
  }

  // Second pass: Update manager relationships
  console.log('Updating manager relationships...');
  for (const record of result.records) {
    if (record.ManagerId || record.Director__c || record.Regional_Manager__c || record.Executive__c) {
      try {
        const updates = {};

        if (record.ManagerId) {
          const manager = await prisma.user.findUnique({ where: { salesforceId: record.ManagerId } });
          if (manager) updates.managerId = manager.id;
        }
        if (record.Director__c) {
          const director = await prisma.user.findUnique({ where: { salesforceId: record.Director__c } });
          if (director) updates.directorId = director.id;
        }
        if (record.Regional_Manager__c) {
          const rm = await prisma.user.findUnique({ where: { salesforceId: record.Regional_Manager__c } });
          if (rm) updates.regionalManagerId = rm.id;
        }
        if (record.Executive__c) {
          const exec = await prisma.user.findUnique({ where: { salesforceId: record.Executive__c } });
          if (exec) updates.executiveId = exec.id;
        }

        if (Object.keys(updates).length > 0) {
          const user = await prisma.user.findUnique({ where: { salesforceId: record.Id } });
          if (user) {
            await prisma.user.update({ where: { id: user.id }, data: updates });
          }
        }
      } catch (error) {
        console.error(`Error updating relationships for user ${record.Id}:`, error.message);
      }
    }
  }

  console.log(`Users: ${created} created, ${updated} updated, ${errors} errors`);
  return { created, updated, errors };
}

// ============================================================================
// ACCOUNT SYNC
// ============================================================================
async function syncAccounts(conn, fullSync = false) {
  console.log('\n=== Syncing Accounts ===');

  const query = `
    SELECT Id, Name, Account_Number__c,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           Phone, Email__c, Website,
           Type, Account_Status__c, Industry,
           Total_Sales_Volume__c, fw1__Total_Paid_Amount__c, Balance_Due__c,
           isPandaClaims__c, isSureClaims__c,
           OwnerId,
           QB_Customer_ID__c,
           LastModifiedDate
    FROM Account
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let done = false;
  let nextRecordsUrl = null;

  // Execute query with pagination
  let result = await conn.query(query);

  while (!done) {
    console.log(`Processing batch of ${result.records.length} accounts...`);

    for (const record of result.records) {
      try {
        // Get owner CRM ID
        let ownerId = null;
        if (record.OwnerId) {
          const owner = await prisma.user.findUnique({ where: { salesforceId: record.OwnerId } });
          if (owner) ownerId = owner.id;
        }

        const accountData = {
          salesforceId: record.Id,
          name: record.Name,
          accountNumber: record.Account_Number__c,
          billingStreet: record.BillingStreet,
          billingCity: record.BillingCity,
          billingState: record.BillingState,
          billingPostalCode: record.BillingPostalCode,
          billingCountry: record.BillingCountry,
          phone: record.Phone,
          email: record.Email__c,
          website: record.Website,
          type: mapEnum(record.Type, STATUS_MAPPINGS.accountType),
          status: mapEnum(record.Account_Status__c, STATUS_MAPPINGS.accountStatus),
          industry: record.Industry,
          totalSalesVolume: parseDecimal(record.Total_Sales_Volume__c),
          totalPaidAmount: parseDecimal(record.fw1__Total_Paid_Amount__c),
          balanceDue: parseDecimal(record.Balance_Due__c),
          isPandaClaims: record.isPandaClaims__c || false,
          isSureClaims: record.isSureClaims__c || false,
          qbCustomerId: record.QB_Customer_ID__c,
          ownerId,
        };

        const existing = await prisma.account.findUnique({
          where: { salesforceId: record.Id }
        });

        if (existing) {
          await prisma.account.update({
            where: { id: existing.id },
            data: accountData
          });
          totalUpdated++;
        } else {
          await prisma.account.create({ data: accountData });
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing account ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    // Check for more records
    if (result.done) {
      done = true;
    } else {
      result = await conn.queryMore(result.nextRecordsUrl);
    }
  }

  console.log(`Accounts: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// CONTACT SYNC
// ============================================================================
async function syncContacts(conn, fullSync = false) {
  console.log('\n=== Syncing Contacts ===');

  const query = `
    SELECT Id, FirstName, LastName, Name, Email, Phone, MobilePhone,
           MailingStreet, MailingCity, MailingState, MailingPostalCode,
           Title, Department,
           HasOptedOutOfEmail, DoNotCall,
           AccountId,
           Riley_Number__c, Riley_Opt_Out__c,
           LastModifiedDate
    FROM Contact
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);
  let done = false;

  while (!done) {
    console.log(`Processing batch of ${result.records.length} contacts...`);

    for (const record of result.records) {
      try {
        // Get account CRM ID
        let accountId = null;
        if (record.AccountId) {
          const account = await prisma.account.findUnique({ where: { salesforceId: record.AccountId } });
          if (account) accountId = account.id;
        }

        const contactData = {
          salesforceId: record.Id,
          firstName: record.FirstName || 'Unknown',
          lastName: record.LastName || 'Contact',
          fullName: record.Name,
          email: record.Email,
          phone: record.Phone,
          mobilePhone: record.MobilePhone,
          smsNumber: record.Riley_Number__c,
          mailingStreet: record.MailingStreet,
          mailingCity: record.MailingCity,
          mailingState: record.MailingState,
          mailingPostalCode: record.MailingPostalCode,
          title: record.Title,
          department: record.Department,
          emailOptOut: record.HasOptedOutOfEmail || false,
          doNotCall: record.DoNotCall || false,
          smsOptOut: record.Riley_Opt_Out__c || false,
          accountId,
        };

        const existing = await prisma.contact.findUnique({
          where: { salesforceId: record.Id }
        });

        if (existing) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: contactData
          });
          totalUpdated++;
        } else {
          await prisma.contact.create({ data: contactData });
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing contact ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) {
      done = true;
    } else {
      result = await conn.queryMore(result.nextRecordsUrl);
    }
  }

  console.log(`Contacts: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// OPPORTUNITY SYNC
// ============================================================================
async function syncOpportunities(conn, fullSync = false) {
  console.log('\n=== Syncing Opportunities ===');

  const query = `
    SELECT Id, Name, Description,
           StageName, Status__c, Probability,
           CloseDate, Tentative_Appointment_Date__c, Sold_Date__c,
           Amount, Contract_Grand_Total__c,
           Work_Type__c, Type, LeadSource, SelfGen_Lead__c,
           Street__c, City__c, State__c, Zip_Code__c,
           isPandaClaims__c, isApproved__c, Claim_Number__c, Claim_Filed_Date__c,
           Insurance_Carrier__c, RCV_Amount__c, ACV_Amount__c, Deductible__c, Supplements_Closed_Total__c,
           AccountId, ContactId, OwnerId,
           LastModifiedDate
    FROM Opportunity
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);
  let done = false;

  while (!done) {
    console.log(`Processing batch of ${result.records.length} opportunities...`);

    for (const record of result.records) {
      try {
        // Get related CRM IDs
        let accountId = null, contactId = null, ownerId = null;

        if (record.AccountId) {
          const account = await prisma.account.findUnique({ where: { salesforceId: record.AccountId } });
          if (account) accountId = account.id;
        }

        if (!accountId) {
          // Opportunity requires an account
          console.warn(`Skipping opportunity ${record.Id} - no account found`);
          continue;
        }

        if (record.ContactId) {
          const contact = await prisma.contact.findUnique({ where: { salesforceId: record.ContactId } });
          if (contact) contactId = contact.id;
        }

        if (record.OwnerId) {
          const owner = await prisma.user.findUnique({ where: { salesforceId: record.OwnerId } });
          if (owner) ownerId = owner.id;
        }

        const oppData = {
          salesforceId: record.Id,
          name: record.Name,
          description: record.Description,
          stage: mapEnum(record.StageName, STATUS_MAPPINGS.opportunityStage),
          status: record.Status__c,
          probability: record.Probability || 0,
          closeDate: parseDate(record.CloseDate),
          appointmentDate: parseDate(record.Tentative_Appointment_Date__c),
          soldDate: parseDate(record.Sold_Date__c),
          amount: parseDecimal(record.Amount),
          contractTotal: parseDecimal(record.Contract_Grand_Total__c),
          type: mapEnum(record.Type, STATUS_MAPPINGS.opportunityType),
          workType: record.Work_Type__c,
          leadSource: record.LeadSource,
          isSelfGen: record.SelfGen_Lead__c || false,
          street: record.Street__c,
          city: record.City__c,
          state: record.State__c,
          postalCode: record.Zip_Code__c,
          isPandaClaims: record.isPandaClaims__c || false,
          isApproved: record.isApproved__c || false,
          claimNumber: record.Claim_Number__c,
          claimFiledDate: parseDate(record.Claim_Filed_Date__c),
          insuranceCarrier: record.Insurance_Carrier__c,
          rcvAmount: parseDecimal(record.RCV_Amount__c),
          acvAmount: parseDecimal(record.ACV_Amount__c),
          deductible: parseDecimal(record.Deductible__c),
          supplementsTotal: parseDecimal(record.Supplements_Closed_Total__c),
          accountId,
          contactId,
          ownerId,
        };

        const existing = await prisma.opportunity.findUnique({
          where: { salesforceId: record.Id }
        });

        if (existing) {
          await prisma.opportunity.update({
            where: { id: existing.id },
            data: oppData
          });
          totalUpdated++;
        } else {
          // Generate Job ID for new opportunities
          // Use transaction for atomic Job ID assignment
          await prisma.$transaction(async (tx) => {
            const jobId = await generateJobId(tx);
            if (jobId) {
              oppData.jobId = jobId;
              console.log(`  Assigned Job ID: ${jobId} to opportunity: ${record.Name}`);
            }
            await tx.opportunity.create({ data: oppData });
          }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          });
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing opportunity ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) {
      done = true;
    } else {
      result = await conn.queryMore(result.nextRecordsUrl);
    }
  }

  console.log(`Opportunities: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// WORK ORDER SYNC
// ============================================================================
async function syncWorkOrders(conn, fullSync = false) {
  console.log('\n=== Syncing Work Orders ===');

  const query = `
    SELECT Id, WorkOrderNumber, Subject, Description, Status, Priority,
           AccountId, Opportunity__c, WorkTypeId, ServiceTerritoryId,
           StartDate, EndDate, LastModifiedDate
    FROM WorkOrder
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);
  let done = false;

  while (!done) {
    console.log(`Processing batch of ${result.records.length} work orders...`);

    for (const record of result.records) {
      try {
        // Get related CRM IDs
        let accountId = null, opportunityId = null;

        if (record.AccountId) {
          const account = await prisma.account.findUnique({ where: { salesforceId: record.AccountId } });
          if (account) accountId = account.id;
        }

        if (!accountId) {
          console.warn(`Skipping work order ${record.Id} - no account found`);
          continue;
        }

        if (record.Opportunity__c) {
          const opp = await prisma.opportunity.findUnique({ where: { salesforceId: record.Opportunity__c } });
          if (opp) opportunityId = opp.id;
        }

        const workOrderData = {
          salesforceId: record.Id,
          workOrderNumber: record.WorkOrderNumber,
          subject: record.Subject,
          description: record.Description,
          status: mapEnum(record.Status, STATUS_MAPPINGS.workOrderStatus),
          priority: record.Priority === 'High' ? 'HIGH' : record.Priority === 'Low' ? 'LOW' : 'NORMAL',
          startDate: parseDate(record.StartDate),
          endDate: parseDate(record.EndDate),
          accountId,
          opportunityId,
        };

        const existing = await prisma.workOrder.findUnique({
          where: { salesforceId: record.Id }
        });

        if (existing) {
          await prisma.workOrder.update({
            where: { id: existing.id },
            data: workOrderData
          });
          totalUpdated++;
        } else {
          await prisma.workOrder.create({ data: workOrderData });
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing work order ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) {
      done = true;
    } else {
      result = await conn.queryMore(result.nextRecordsUrl);
    }
  }

  console.log(`Work Orders: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// SERVICE APPOINTMENT SYNC
// ============================================================================
async function syncServiceAppointments(conn, fullSync = false) {
  console.log('\n=== Syncing Service Appointments ===');

  const query = `
    SELECT Id, AppointmentNumber, Subject, Description, Status,
           Street, City, State, PostalCode,
           EarliestStartTime, DueDate, SchedStartTime, SchedEndTime,
           ActualStartTime, ActualEndTime, Duration,
           ParentRecordId,
           LastModifiedDate
    FROM ServiceAppointment
    ORDER BY LastModifiedDate DESC
  `;

  let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
  let result = await conn.query(query);
  let done = false;

  while (!done) {
    console.log(`Processing batch of ${result.records.length} service appointments...`);

    for (const record of result.records) {
      try {
        // Get work order CRM ID
        let workOrderId = null;

        if (record.ParentRecordId) {
          const workOrder = await prisma.workOrder.findUnique({ where: { salesforceId: record.ParentRecordId } });
          if (workOrder) workOrderId = workOrder.id;
        }

        if (!workOrderId) {
          console.warn(`Skipping service appointment ${record.Id} - no work order found`);
          continue;
        }

        const saData = {
          salesforceId: record.Id,
          appointmentNumber: record.AppointmentNumber,
          subject: record.Subject,
          description: record.Description,
          status: mapEnum(record.Status, STATUS_MAPPINGS.appointmentStatus),
          street: record.Street,
          city: record.City,
          state: record.State,
          postalCode: record.PostalCode,
          earliestStart: parseDate(record.EarliestStartTime),
          dueDate: parseDate(record.DueDate),
          scheduledStart: parseDate(record.SchedStartTime),
          scheduledEnd: parseDate(record.SchedEndTime),
          actualStart: parseDate(record.ActualStartTime),
          actualEnd: parseDate(record.ActualEndTime),
          duration: record.Duration,
          workOrderId,
        };

        const existing = await prisma.serviceAppointment.findUnique({
          where: { salesforceId: record.Id }
        });

        if (existing) {
          await prisma.serviceAppointment.update({
            where: { id: existing.id },
            data: saData
          });
          totalUpdated++;
        } else {
          await prisma.serviceAppointment.create({ data: saData });
          totalCreated++;
        }
      } catch (error) {
        console.error(`Error syncing service appointment ${record.Id}:`, error.message);
        totalErrors++;
      }
    }

    if (result.done) {
      done = true;
    } else {
      result = await conn.queryMore(result.nextRecordsUrl);
    }
  }

  console.log(`Service Appointments: ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
  return { created: totalCreated, updated: totalUpdated, errors: totalErrors };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const entityIndex = args.indexOf('--entity');
  const entity = entityIndex !== -1 ? args[entityIndex + 1] : 'all';
  const fullSync = args.includes('--full');

  console.log('='.repeat(60));
  console.log('Salesforce to Panda CRM Data Migration');
  console.log('='.repeat(60));
  console.log(`Entity: ${entity}`);
  console.log(`Full Sync: ${fullSync}`);
  console.log('');

  try {
    const conn = await connectToSalesforce();
    const results = {};

    if (entity === 'all' || entity === 'users') {
      results.users = await syncUsers(conn, fullSync);
    }

    if (entity === 'all' || entity === 'accounts') {
      results.accounts = await syncAccounts(conn, fullSync);
    }

    if (entity === 'all' || entity === 'contacts') {
      results.contacts = await syncContacts(conn, fullSync);
    }

    if (entity === 'all' || entity === 'opportunities') {
      results.opportunities = await syncOpportunities(conn, fullSync);
    }

    if (entity === 'all' || entity === 'workorders') {
      results.workOrders = await syncWorkOrders(conn, fullSync);
      results.serviceAppointments = await syncServiceAppointments(conn, fullSync);
    }

    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));

    for (const [key, value] of Object.entries(results)) {
      console.log(`${key}: ${value.created} created, ${value.updated} updated, ${value.errors} errors`);
    }

    console.log('\nMigration completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
