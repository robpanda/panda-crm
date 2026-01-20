#!/usr/bin/env node

/**
 * Reconciliation-First Salesforce → Panda CRM Migration
 *
 * Core Principles:
 * 1. CRM is authoritative (source of truth)
 * 2. Salesforce is reference source only
 * 3. Pattern: MATCH → UPDATE → CREATE (only if unmatched)
 * 4. Idempotent - safe to run multiple times
 * 5. No duplicates allowed
 * 6. Field-level precedence rules
 * 7. Status transition rules (no regression)
 * 8. Audit trail and mapping tables
 *
 * Usage:
 *   node reconciliation-sync.js [--dry-run] [--objects=accounts,contacts,leads,opportunities]
 *   node reconciliation-sync.js --validate-only
 *   node reconciliation-sync.js --report
 */

const { PrismaClient } = require('../../shared/node_modules/@prisma/client');
const jsforce = require('jsforce');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const crypto = require('crypto');

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  batchSize: 200,
  fuzzyMatchThreshold: 0.85,  // Levenshtein similarity threshold
  requireReviewThreshold: 0.70,  // Below this, flag for manual review
  migrationRunId: `migration-${Date.now()}`,
  // Will be populated with actual DB ID after MigrationRun is created
  migrationRunDbId: null,
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VALIDATE_ONLY = args.includes('--validate-only');
const REPORT_ONLY = args.includes('--report');
const objectsArg = args.find(a => a.startsWith('--objects='));
const OBJECTS_TO_SYNC = objectsArg
  ? objectsArg.replace('--objects=', '').split(',').map(s => s.trim().toLowerCase())
  : ['accounts', 'contacts', 'leads', 'opportunities', 'tasks', 'invoices', 'payments'];

// ============================================================================
// STATUS MAPPINGS (No Regression Rules)
// ============================================================================

const LEAD_STATUS_ORDER = ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING', 'CONVERTED', 'UNQUALIFIED'];
const OPPORTUNITY_STAGE_ORDER = [
  'LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED',
  'CLAIM_FILED', 'ADJUSTER_MEETING_COMPLETE', 'APPROVED', 'CONTRACT_SIGNED',
  'IN_PRODUCTION', 'COMPLETED', 'CLOSED_WON', 'CLOSED_LOST'
];

const LEAD_STATUS_MAP = {
  'New': 'NEW',
  'Open - Not Contacted': 'NEW',
  'Raw lead': 'NEW',
  'Working - Contacted': 'CONTACTED',
  'Contacted': 'CONTACTED',
  'Qualified': 'QUALIFIED',
  'Lead Set': 'QUALIFIED',
  'Nurturing': 'NURTURING',
  'Unqualified': 'UNQUALIFIED',
  'Canceled': 'UNQUALIFIED',
  'Closed - Converted': 'CONVERTED',
  'Converted': 'CONVERTED',
};

const OPPORTUNITY_STAGE_MAP = {
  'Lead Unassigned': 'LEAD_UNASSIGNED',
  'Lead Assigned': 'LEAD_ASSIGNED',
  'Scheduled': 'SCHEDULED',
  'Inspected': 'INSPECTED',
  'Claim Filed': 'CLAIM_FILED',
  'Adjuster Meeting Complete': 'ADJUSTER_MEETING_COMPLETE',
  'Approved': 'APPROVED',
  'Contract Signed': 'CONTRACT_SIGNED',
  'In Production': 'IN_PRODUCTION',
  'Completed': 'COMPLETED',
  'Closed Won': 'CLOSED_WON',
  'Closed Lost': 'CLOSED_LOST',
};

// ============================================================================
// FIELD PRECEDENCE RULES
// ============================================================================

/**
 * Field precedence types:
 * - SYSTEM: Never overwrite (id, createdAt, salesforceId)
 * - USER_EDITED: Preserve if CRM has been modified by user
 * - CALCULATED: Always recompute
 * - STATUS: Use status transition rules
 * - UPDATE_IF_EMPTY: Only populate if CRM field is null/empty
 * - ALWAYS_UPDATE: Always take Salesforce value
 */
const FIELD_PRECEDENCE = {
  // Account fields
  account: {
    id: 'SYSTEM',
    salesforceId: 'SYSTEM',
    createdAt: 'SYSTEM',
    updatedAt: 'SYSTEM',
    name: 'USER_EDITED',
    accountNumber: 'UPDATE_IF_EMPTY',
    phone: 'USER_EDITED',
    website: 'UPDATE_IF_EMPTY',
    industry: 'UPDATE_IF_EMPTY',
    billingStreet: 'USER_EDITED',
    billingCity: 'USER_EDITED',
    billingState: 'USER_EDITED',
    billingPostalCode: 'USER_EDITED',
    billingCountry: 'UPDATE_IF_EMPTY',
    shippingStreet: 'USER_EDITED',
    shippingCity: 'USER_EDITED',
    shippingState: 'USER_EDITED',
    shippingPostalCode: 'USER_EDITED',
    ownerId: 'UPDATE_IF_EMPTY',
    status: 'STATUS',
  },

  // Contact fields
  contact: {
    id: 'SYSTEM',
    salesforceId: 'SYSTEM',
    createdAt: 'SYSTEM',
    updatedAt: 'SYSTEM',
    firstName: 'USER_EDITED',
    lastName: 'USER_EDITED',
    email: 'USER_EDITED',
    phone: 'USER_EDITED',
    mobilePhone: 'USER_EDITED',
    title: 'UPDATE_IF_EMPTY',
    accountId: 'UPDATE_IF_EMPTY',
    // Note: Contact model does NOT have ownerId - contacts belong to accounts, not users directly
  },

  // Lead fields
  lead: {
    id: 'SYSTEM',
    salesforceId: 'SYSTEM',
    createdAt: 'SYSTEM',
    updatedAt: 'SYSTEM',
    firstName: 'USER_EDITED',
    lastName: 'USER_EDITED',
    email: 'USER_EDITED',
    phone: 'USER_EDITED',
    mobilePhone: 'USER_EDITED',
    company: 'USER_EDITED',
    street: 'USER_EDITED',
    city: 'USER_EDITED',
    state: 'USER_EDITED',
    postalCode: 'USER_EDITED',
    status: 'STATUS',
    leadSource: 'UPDATE_IF_EMPTY',
    ownerId: 'UPDATE_IF_EMPTY',
    leadScore: 'CALCULATED',
    leadRank: 'CALCULATED',
  },

  // Opportunity fields
  opportunity: {
    id: 'SYSTEM',
    salesforceId: 'SYSTEM',
    createdAt: 'SYSTEM',
    updatedAt: 'SYSTEM',
    jobId: 'SYSTEM',
    name: 'USER_EDITED',
    stage: 'STATUS',
    amount: 'USER_EDITED',
    closeDate: 'USER_EDITED',
    probability: 'CALCULATED',
    accountId: 'UPDATE_IF_EMPTY',
    ownerId: 'UPDATE_IF_EMPTY',
    claimNumber: 'UPDATE_IF_EMPTY',
    insuranceCarrier: 'UPDATE_IF_EMPTY',
    deductible: 'USER_EDITED',
    rcvAmount: 'USER_EDITED',
  },
};

// ============================================================================
// IDENTITY RESOLUTION
// ============================================================================

class IdentityResolver {
  constructor() {
    this.matchStats = {
      externalId: 0,
      naturalKey: 0,
      compositeKey: 0,
      fuzzyMatch: 0,
      noMatch: 0,
      requiresReview: 0,
    };
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  /**
   * Calculate similarity score (0-1) between two strings
   */
  similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    const distance = this.levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
  }

  /**
   * Normalize email for matching
   */
  normalizeEmail(email) {
    if (!email) return null;
    return email.toLowerCase().trim();
  }

  /**
   * Normalize phone to E.164 format
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return digits.length >= 10 ? `+${digits}` : null;
  }

  /**
   * Find matching CRM record for a Salesforce record
   * Returns: { match: CRMRecord|null, confidence: number, matchType: string, requiresReview: boolean }
   */
  async findMatch(sfRecord, objectType, crmRecords) {
    // Level 1: External ID match (salesforceId)
    const externalMatch = crmRecords.find(r => r.salesforceId === sfRecord.Id);
    if (externalMatch) {
      this.matchStats.externalId++;
      return { match: externalMatch, confidence: 1.0, matchType: 'EXTERNAL_ID', requiresReview: false };
    }

    // Level 2: Natural Key match (email, phone)
    if (objectType === 'contact' || objectType === 'lead') {
      const normalizedEmail = this.normalizeEmail(sfRecord.Email);
      const normalizedPhone = this.normalizePhone(sfRecord.Phone || sfRecord.MobilePhone);

      if (normalizedEmail) {
        const emailMatch = crmRecords.find(r => this.normalizeEmail(r.email) === normalizedEmail);
        if (emailMatch) {
          this.matchStats.naturalKey++;
          return { match: emailMatch, confidence: 0.95, matchType: 'EMAIL', requiresReview: false };
        }
      }

      if (normalizedPhone) {
        const phoneMatch = crmRecords.find(r =>
          this.normalizePhone(r.phone) === normalizedPhone ||
          this.normalizePhone(r.mobilePhone) === normalizedPhone
        );
        if (phoneMatch) {
          this.matchStats.naturalKey++;
          return { match: phoneMatch, confidence: 0.90, matchType: 'PHONE', requiresReview: false };
        }
      }
    }

    // Level 3: Composite Key match (name + account, name + address)
    if (objectType === 'contact') {
      const sfFullName = `${sfRecord.FirstName || ''} ${sfRecord.LastName || ''}`.trim().toLowerCase();
      const compositeMatch = crmRecords.find(r => {
        const crmFullName = `${r.firstName || ''} ${r.lastName || ''}`.trim().toLowerCase();
        return sfFullName === crmFullName && r.accountId && sfRecord.AccountId;
      });
      if (compositeMatch) {
        this.matchStats.compositeKey++;
        return { match: compositeMatch, confidence: 0.85, matchType: 'NAME_ACCOUNT', requiresReview: false };
      }
    }

    if (objectType === 'account') {
      const sfName = (sfRecord.Name || '').toLowerCase().trim();
      const sfAddress = `${sfRecord.BillingStreet || ''} ${sfRecord.BillingCity || ''}`.toLowerCase().trim();

      const compositeMatch = crmRecords.find(r => {
        const crmName = (r.name || '').toLowerCase().trim();
        const crmAddress = `${r.billingStreet || ''} ${r.billingCity || ''}`.toLowerCase().trim();
        return sfName === crmName && sfAddress === crmAddress && sfAddress.length > 5;
      });
      if (compositeMatch) {
        this.matchStats.compositeKey++;
        return { match: compositeMatch, confidence: 0.85, matchType: 'NAME_ADDRESS', requiresReview: false };
      }
    }

    if (objectType === 'opportunity') {
      // Match by name pattern "Panda Ext-XXXXX"
      const pandaExtMatch = sfRecord.Name?.match(/Panda Ext-(\d+)/i);
      if (pandaExtMatch) {
        const jobNumber = pandaExtMatch[0];
        const nameMatch = crmRecords.find(r => r.name?.includes(jobNumber) || r.jobId?.includes(jobNumber));
        if (nameMatch) {
          this.matchStats.compositeKey++;
          return { match: nameMatch, confidence: 0.90, matchType: 'JOB_NUMBER', requiresReview: false };
        }
      }
    }

    // Level 4: Fuzzy matching (last resort)
    let bestFuzzyMatch = null;
    let bestFuzzyScore = 0;

    for (const crmRecord of crmRecords) {
      let score = 0;

      if (objectType === 'account') {
        score = this.similarity(sfRecord.Name, crmRecord.name);
      } else if (objectType === 'contact' || objectType === 'lead') {
        const sfFullName = `${sfRecord.FirstName || ''} ${sfRecord.LastName || ''}`.trim();
        const crmFullName = `${crmRecord.firstName || ''} ${crmRecord.lastName || ''}`.trim();
        score = this.similarity(sfFullName, crmFullName);
      } else if (objectType === 'opportunity') {
        score = this.similarity(sfRecord.Name, crmRecord.name);
      }

      if (score > bestFuzzyScore) {
        bestFuzzyScore = score;
        bestFuzzyMatch = crmRecord;
      }
    }

    if (bestFuzzyScore >= CONFIG.fuzzyMatchThreshold) {
      this.matchStats.fuzzyMatch++;
      return {
        match: bestFuzzyMatch,
        confidence: bestFuzzyScore,
        matchType: 'FUZZY',
        requiresReview: bestFuzzyScore < CONFIG.requireReviewThreshold
      };
    }

    // No match found
    this.matchStats.noMatch++;
    return { match: null, confidence: 0, matchType: 'NONE', requiresReview: false };
  }

  getStats() {
    return this.matchStats;
  }
}

// ============================================================================
// FIELD UPDATE LOGIC
// ============================================================================

/**
 * Determine if a field should be updated based on precedence rules
 */
function shouldUpdateField(fieldName, objectType, crmValue, sfValue, crmRecord) {
  const precedence = FIELD_PRECEDENCE[objectType]?.[fieldName] || 'ALWAYS_UPDATE';

  switch (precedence) {
    case 'SYSTEM':
      // Never overwrite system fields
      return false;

    case 'USER_EDITED':
      // Check if CRM value has been modified (compare with SF value stored in history)
      // For now, preserve CRM value if it exists and differs from SF
      if (crmValue !== null && crmValue !== undefined && crmValue !== '') {
        return false;  // Preserve user-edited value
      }
      return sfValue !== null && sfValue !== undefined;

    case 'CALCULATED':
      // Skip - these are computed by the CRM
      return false;

    case 'STATUS':
      // Use status transition rules
      return false;  // Handled separately by shouldTransitionStatus

    case 'UPDATE_IF_EMPTY':
      // Only update if CRM field is empty
      if (crmValue === null || crmValue === undefined || crmValue === '') {
        return sfValue !== null && sfValue !== undefined && sfValue !== '';
      }
      return false;

    case 'ALWAYS_UPDATE':
    default:
      return sfValue !== null && sfValue !== undefined;
  }
}

/**
 * Determine if status should transition based on no-regression rules
 */
function shouldTransitionStatus(objectType, currentStatus, newStatus) {
  const statusOrder = objectType === 'lead' ? LEAD_STATUS_ORDER : OPPORTUNITY_STAGE_ORDER;

  const currentIndex = statusOrder.indexOf(currentStatus);
  const newIndex = statusOrder.indexOf(newStatus);

  // If either status is not in our known list, allow the update
  if (currentIndex === -1 || newIndex === -1) {
    return true;
  }

  // Only allow forward progression (higher index) or same status
  // Exception: Terminal states (CLOSED_WON, CLOSED_LOST, CONVERTED, UNQUALIFIED) can change
  const terminalStates = ['CLOSED_WON', 'CLOSED_LOST', 'CONVERTED', 'UNQUALIFIED'];
  if (terminalStates.includes(currentStatus)) {
    return true;  // Allow changes from terminal states
  }

  return newIndex >= currentIndex;
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

// Map internal action names to Prisma enum values
const ACTION_TO_ENUM = {
  'CREATE': 'CREATED',
  'UPDATE': 'UPDATED',
  'MATCHED': 'MATCHED',
  'SKIPPED': 'SKIPPED',
  'ERROR': 'ERROR',
  'FLAGGED': 'FLAGGED_FOR_REVIEW',
};

async function logMigrationAudit(action, objectType, salesforceId, crmId, details) {
  try {
    const prismaAction = ACTION_TO_ENUM[action] || action;
    await prisma.migrationAuditLog.create({
      data: {
        runId: CONFIG.migrationRunId,
        objectType,
        salesforceId,
        crmRecordId: crmId,
        action: prismaAction,
        matchMethod: details?.matchType || null,
        matchConfidence: details?.confidence || null,
        fieldsChanged: details?.fields || [],
        oldValues: details?.oldValues || null,
        newValues: details?.newValues || null,
        status: action === 'ERROR' ? 'ERROR' : 'SUCCESS',
        errorMessage: details?.error || null,
        requiresReview: details?.requiresReview || false,
        reviewReason: details?.reviewReason || null,
      },
    });
  } catch (error) {
    // Log to console if audit table doesn't exist yet
    console.log(`[AUDIT] ${action} ${objectType} SF:${salesforceId} CRM:${crmId}`, details);
  }
}

async function saveMigrationMapping(objectType, salesforceId, crmId, matchType, confidence) {
  try {
    await prisma.migrationMapping.upsert({
      where: {
        objectType_salesforceId: { objectType, salesforceId },
      },
      update: {
        crmRecordId: crmId,
        matchMethod: matchType,
        matchConfidence: confidence,
      },
      create: {
        runId: CONFIG.migrationRunId,
        objectType,
        salesforceId,
        crmRecordId: crmId,
        matchMethod: matchType,
        matchConfidence: confidence,
      },
    });
  } catch (error) {
    // Table may not exist yet - will be created in setup
    console.log(`[MAPPING] ${objectType}: SF ${salesforceId} → CRM ${crmId} (${matchType}, ${confidence})`);
  }
}

async function createMigrationRun() {
  try {
    const migrationRun = await prisma.migrationRun.create({
      data: {
        runId: CONFIG.migrationRunId,
        status: 'RUNNING',
        dryRun: DRY_RUN,
        objectsToSync: OBJECTS_TO_SYNC,
      },
    });
    // Store the actual database ID (CUID) for use in orphaned records FK
    CONFIG.migrationRunDbId = migrationRun.id;
    console.log(`Created migration run: ${CONFIG.migrationRunId} (DB ID: ${CONFIG.migrationRunDbId})`);
  } catch (error) {
    console.log(`[INFO] Migration run tracking not available: ${error.message}`);
  }
}

async function updateMigrationRun(stats, status = 'COMPLETED') {
  try {
    await prisma.migrationRun.update({
      where: { runId: CONFIG.migrationRunId },
      data: {
        status,
        completedAt: new Date(),
        totalRecords: stats.total || 0,
        matchedRecords: stats.matched || 0,
        createdRecords: stats.created || 0,
        updatedRecords: stats.updated || 0,
        skippedRecords: stats.skipped || 0,
        errorRecords: stats.errors || 0,
        errors: stats.errorDetails || null,
      },
    });
  } catch (error) {
    console.log(`[INFO] Migration run update not available: ${error.message}`);
  }
}

/**
 * Record an orphaned record that couldn't be migrated due to missing relationships
 * These will appear in the admin UI for manual matching
 */
async function recordOrphanedRecord({
  salesforceId,
  salesforceType,
  recordNumber,
  recordName,
  orphanReason,
  missingFieldName,
  missingFieldValue,
  salesforceData,
}) {
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
        // Use actual DB ID (CUID), not the string runId
        migrationRunId: CONFIG.migrationRunDbId || null,
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
        // Use actual DB ID (CUID), not the string runId
        migrationRunId: CONFIG.migrationRunDbId || null,
        status: 'PENDING',
      },
    });
    console.log(`  [ORPHAN] Recorded ${salesforceType} ${recordNumber || salesforceId} - ${orphanReason}`);
  } catch (error) {
    console.log(`  [ORPHAN ERROR] Failed to record orphaned ${salesforceType}: ${error.message}`);
  }
}

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
// RECONCILIATION FUNCTIONS
// ============================================================================

async function reconcileAccounts(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING ACCOUNTS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM accounts for matching
  const crmAccounts = await prisma.account.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      salesforceId: true,
      name: true,
      billingStreet: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      phone: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmAccounts.length} CRM accounts for matching`);

  // Fetch Salesforce accounts
  const sfQuery = `
    SELECT Id, Name, AccountNumber, Phone, Website, Industry, Type,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry,
           OwnerId, CreatedDate, LastModifiedDate
    FROM Account
    WHERE IsDeleted = false
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce accounts`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfAccount of batch) {
      try {
        // Find matching CRM record
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfAccount, 'account', crmAccounts);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfAccount.Id,
            salesforceName: sfAccount.Name,
            crmId: match?.id,
            crmName: match?.name,
            confidence,
            matchType,
          });
        }

        // Build owner lookup
        let ownerId = null;
        if (sfAccount.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfAccount.OwnerId } });
          ownerId = owner?.id || null;
        }

        if (match) {
          // MATCHED - Apply field-level update rules
          stats.matched++;

          const updateData = {};

          // Apply field precedence rules
          if (shouldUpdateField('name', 'account', match.name, sfAccount.Name, match)) {
            updateData.name = sfAccount.Name;
          }
          if (shouldUpdateField('accountNumber', 'account', match.accountNumber, sfAccount.AccountNumber, match)) {
            updateData.accountNumber = sfAccount.AccountNumber;
          }
          if (shouldUpdateField('phone', 'account', match.phone, sfAccount.Phone, match)) {
            updateData.phone = sfAccount.Phone;
          }
          if (shouldUpdateField('billingStreet', 'account', match.billingStreet, sfAccount.BillingStreet, match)) {
            updateData.billingStreet = sfAccount.BillingStreet;
          }
          if (shouldUpdateField('billingCity', 'account', match.billingCity, sfAccount.BillingCity, match)) {
            updateData.billingCity = sfAccount.BillingCity;
          }
          if (shouldUpdateField('billingState', 'account', match.billingState, sfAccount.BillingState, match)) {
            updateData.billingState = sfAccount.BillingState;
          }
          if (shouldUpdateField('billingPostalCode', 'account', match.billingPostalCode, sfAccount.BillingPostalCode, match)) {
            updateData.billingPostalCode = sfAccount.BillingPostalCode;
          }
          if (shouldUpdateField('ownerId', 'account', match.ownerId, ownerId, match)) {
            updateData.ownerId = ownerId;
          }

          // Always ensure salesforceId is set (for cross-reference)
          if (!match.salesforceId) {
            updateData.salesforceId = sfAccount.Id;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.account.update({
                where: { id: match.id },
                data: updateData,
              });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'account', sfAccount.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('account', sfAccount.Id, match.id, matchType, confidence);

        } else {
          // NO MATCH - Create new record
          const createData = {
            salesforceId: sfAccount.Id,
            name: sfAccount.Name,
            accountNumber: sfAccount.AccountNumber,
            phone: sfAccount.Phone,
            website: sfAccount.Website,
            industry: sfAccount.Industry,
            type: sfAccount.Type,
            billingStreet: sfAccount.BillingStreet,
            billingCity: sfAccount.BillingCity,
            billingState: sfAccount.BillingState,
            billingPostalCode: sfAccount.BillingPostalCode,
            billingCountry: sfAccount.BillingCountry,
            shippingStreet: sfAccount.ShippingStreet,
            shippingCity: sfAccount.ShippingCity,
            shippingState: sfAccount.ShippingState,
            shippingPostalCode: sfAccount.ShippingPostalCode,
            shippingCountry: sfAccount.ShippingCountry,
            ownerId,
            createdAt: sfAccount.CreatedDate ? new Date(sfAccount.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newAccount = await prisma.account.create({ data: createData });
            await saveMigrationMapping('account', sfAccount.Id, newAccount.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'account', sfAccount.Id, newAccount.id, { name: sfAccount.Name });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing account ${sfAccount.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'account', sfAccount.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileContacts(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING CONTACTS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM contacts for matching
  const crmContacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      salesforceId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobilePhone: true,
      accountId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmContacts.length} CRM contacts for matching`);

  // Build account mapping
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  // Fetch Salesforce contacts
  // Note: Contact model does not have ownerId or mailingCountry fields
  const sfQuery = `
    SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Title,
           MailingStreet, MailingCity, MailingState, MailingPostalCode,
           AccountId, CreatedDate, LastModifiedDate
    FROM Contact
    WHERE IsDeleted = false
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce contacts`);

  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfContact of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfContact, 'contact', crmContacts);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfContact.Id,
            salesforceName: `${sfContact.FirstName} ${sfContact.LastName}`,
            crmId: match?.id,
            crmName: `${match?.firstName} ${match?.lastName}`,
            confidence,
            matchType,
          });
        }

        const accountId = sfContact.AccountId ? accountMap.get(sfContact.AccountId) : null;
        // Note: Contact model does NOT have ownerId - contacts belong to accounts, not users directly

        if (match) {
          stats.matched++;

          const updateData = {};

          if (shouldUpdateField('firstName', 'contact', match.firstName, sfContact.FirstName, match)) {
            updateData.firstName = sfContact.FirstName;
          }
          if (shouldUpdateField('lastName', 'contact', match.lastName, sfContact.LastName, match)) {
            updateData.lastName = sfContact.LastName;
          }
          if (shouldUpdateField('email', 'contact', match.email, sfContact.Email, match)) {
            updateData.email = sfContact.Email;
          }
          if (shouldUpdateField('phone', 'contact', match.phone, sfContact.Phone, match)) {
            updateData.phone = sfContact.Phone;
          }
          if (shouldUpdateField('mobilePhone', 'contact', match.mobilePhone, sfContact.MobilePhone, match)) {
            updateData.mobilePhone = sfContact.MobilePhone;
          }
          if (shouldUpdateField('accountId', 'contact', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }

          if (!match.salesforceId) {
            updateData.salesforceId = sfContact.Id;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.contact.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'contact', sfContact.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('contact', sfContact.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfContact.Id,
            firstName: sfContact.FirstName,
            lastName: sfContact.LastName,
            email: sfContact.Email,
            phone: sfContact.Phone,
            mobilePhone: sfContact.MobilePhone,
            title: sfContact.Title,
            mailingStreet: sfContact.MailingStreet,
            mailingCity: sfContact.MailingCity,
            mailingState: sfContact.MailingState,
            mailingPostalCode: sfContact.MailingPostalCode,
            // Note: mailingCountry field does not exist in Contact model
            accountId,
            // Note: Contact model does NOT have ownerId
            createdAt: sfContact.CreatedDate ? new Date(sfContact.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newContact = await prisma.contact.create({ data: createData });
            await saveMigrationMapping('contact', sfContact.Id, newContact.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'contact', sfContact.Id, newContact.id, { name: `${sfContact.FirstName} ${sfContact.LastName}` });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing contact ${sfContact.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'contact', sfContact.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileLeads(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING LEADS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM leads for matching
  const crmLeads = await prisma.lead.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      salesforceId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobilePhone: true,
      company: true,
      status: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmLeads.length} CRM leads for matching`);

  // Fetch Salesforce leads
  const sfQuery = `
    SELECT Id, FirstName, LastName, Email, Phone, MobilePhone, Company, Title,
           Street, City, State, PostalCode, Country,
           Status, LeadSource, Industry, Description,
           OwnerId, CreatedDate, LastModifiedDate, IsConverted
    FROM Lead
    WHERE IsDeleted = false
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce leads`);

  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfLead of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfLead, 'lead', crmLeads);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfLead.Id,
            salesforceName: `${sfLead.FirstName} ${sfLead.LastName}`,
            crmId: match?.id,
            crmName: `${match?.firstName} ${match?.lastName}`,
            confidence,
            matchType,
          });
        }

        let ownerId = null;
        if (sfLead.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfLead.OwnerId } });
          ownerId = owner?.id || null;
        }

        const mappedStatus = LEAD_STATUS_MAP[sfLead.Status] || 'NEW';

        if (match) {
          stats.matched++;

          const updateData = {};

          if (shouldUpdateField('firstName', 'lead', match.firstName, sfLead.FirstName, match)) {
            updateData.firstName = sfLead.FirstName;
          }
          if (shouldUpdateField('lastName', 'lead', match.lastName, sfLead.LastName, match)) {
            updateData.lastName = sfLead.LastName;
          }
          if (shouldUpdateField('email', 'lead', match.email, sfLead.Email, match)) {
            updateData.email = sfLead.Email;
          }
          if (shouldUpdateField('phone', 'lead', match.phone, sfLead.Phone, match)) {
            updateData.phone = sfLead.Phone;
          }
          if (shouldUpdateField('mobilePhone', 'lead', match.mobilePhone, sfLead.MobilePhone, match)) {
            updateData.mobilePhone = sfLead.MobilePhone;
          }
          if (shouldUpdateField('company', 'lead', match.company, sfLead.Company, match)) {
            updateData.company = sfLead.Company;
          }
          if (shouldUpdateField('ownerId', 'lead', match.ownerId, ownerId, match)) {
            updateData.ownerId = ownerId;
          }

          // Status transition check
          if (match.status !== mappedStatus && shouldTransitionStatus('lead', match.status, mappedStatus)) {
            updateData.status = mappedStatus;
          }

          if (!match.salesforceId) {
            updateData.salesforceId = sfLead.Id;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.lead.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'lead', sfLead.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('lead', sfLead.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfLead.Id,
            firstName: sfLead.FirstName,
            lastName: sfLead.LastName,
            email: sfLead.Email,
            phone: sfLead.Phone,
            mobilePhone: sfLead.MobilePhone,
            company: sfLead.Company,
            title: sfLead.Title,
            street: sfLead.Street,
            city: sfLead.City,
            state: sfLead.State,
            postalCode: sfLead.PostalCode,
            country: sfLead.Country,
            status: mappedStatus,
            leadSource: sfLead.LeadSource,
            industry: sfLead.Industry,
            description: sfLead.Description,
            ownerId,
            isConverted: sfLead.IsConverted || false,
            createdAt: sfLead.CreatedDate ? new Date(sfLead.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newLead = await prisma.lead.create({ data: createData });
            await saveMigrationMapping('lead', sfLead.Id, newLead.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'lead', sfLead.Id, newLead.id, { name: `${sfLead.FirstName} ${sfLead.LastName}` });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing lead ${sfLead.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'lead', sfLead.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileOpportunities(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING OPPORTUNITIES');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM opportunities for matching
  const crmOpportunities = await prisma.opportunity.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      salesforceId: true,
      name: true,
      jobId: true,
      stage: true,
      amount: true,
      accountId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmOpportunities.length} CRM opportunities for matching`);

  // Build account mapping
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  // Fetch Salesforce opportunities
  const sfQuery = `
    SELECT Id, Name, StageName, Amount, CloseDate, Probability, Type, LeadSource, Description,
           AccountId, OwnerId, ContactId,
           Claim_Number__c, Insurance_Company__c, Deductible__c, RCV__c,
           CreatedDate, LastModifiedDate
    FROM Opportunity
    WHERE IsDeleted = false
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce opportunities`);

  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfOpp of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfOpp, 'opportunity', crmOpportunities);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfOpp.Id,
            salesforceName: sfOpp.Name,
            crmId: match?.id,
            crmName: match?.name,
            confidence,
            matchType,
          });
        }

        const accountId = sfOpp.AccountId ? accountMap.get(sfOpp.AccountId) : null;
        let ownerId = null;
        if (sfOpp.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfOpp.OwnerId } });
          ownerId = owner?.id || null;
        }

        const mappedStage = OPPORTUNITY_STAGE_MAP[sfOpp.StageName] || 'LEAD_UNASSIGNED';

        if (match) {
          stats.matched++;

          const updateData = {};

          if (shouldUpdateField('name', 'opportunity', match.name, sfOpp.Name, match)) {
            updateData.name = sfOpp.Name;
          }
          if (shouldUpdateField('amount', 'opportunity', match.amount, sfOpp.Amount, match)) {
            updateData.amount = sfOpp.Amount;
          }
          if (shouldUpdateField('closeDate', 'opportunity', match.closeDate, sfOpp.CloseDate, match)) {
            updateData.closeDate = sfOpp.CloseDate ? new Date(sfOpp.CloseDate) : null;
          }
          if (shouldUpdateField('accountId', 'opportunity', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }
          if (shouldUpdateField('ownerId', 'opportunity', match.ownerId, ownerId, match)) {
            updateData.ownerId = ownerId;
          }
          if (shouldUpdateField('claimNumber', 'opportunity', match.claimNumber, sfOpp.Claim_Number__c, match)) {
            updateData.claimNumber = sfOpp.Claim_Number__c;
          }
          if (shouldUpdateField('insuranceCarrier', 'opportunity', match.insuranceCarrier, sfOpp.Insurance_Company__c, match)) {
            updateData.insuranceCarrier = sfOpp.Insurance_Company__c;
          }
          if (shouldUpdateField('deductible', 'opportunity', match.deductible, sfOpp.Deductible__c, match)) {
            updateData.deductible = sfOpp.Deductible__c;
          }
          if (shouldUpdateField('rcvAmount', 'opportunity', match.rcvAmount, sfOpp.RCV__c, match)) {
            updateData.rcvAmount = sfOpp.RCV__c;
          }

          // Stage transition check
          if (match.stage !== mappedStage && shouldTransitionStatus('opportunity', match.stage, mappedStage)) {
            updateData.stage = mappedStage;
          }

          if (!match.salesforceId) {
            updateData.salesforceId = sfOpp.Id;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.opportunity.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'opportunity', sfOpp.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('opportunity', sfOpp.Id, match.id, matchType, confidence);

        } else {
          // Generate Job ID for new opportunity
          const year = sfOpp.CreatedDate ? new Date(sfOpp.CreatedDate).getFullYear() : new Date().getFullYear();
          let jobId = null;

          if (!DRY_RUN) {
            let sequence = await prisma.jobIdSequence.findUnique({ where: { year } });
            if (!sequence) {
              sequence = await prisma.jobIdSequence.create({ data: { year, lastNumber: 1000 } });
            }
            const nextNumber = sequence.lastNumber + 1;
            await prisma.jobIdSequence.update({ where: { year }, data: { lastNumber: nextNumber } });
            jobId = `${year}-${nextNumber}`;
          }

          const createData = {
            salesforceId: sfOpp.Id,
            name: sfOpp.Name,
            jobId,
            stage: mappedStage,
            amount: sfOpp.Amount,
            closeDate: sfOpp.CloseDate ? new Date(sfOpp.CloseDate) : null,
            probability: sfOpp.Probability,
            type: sfOpp.Type,
            leadSource: sfOpp.LeadSource,
            description: sfOpp.Description,
            accountId,
            ownerId,
            claimNumber: sfOpp.Claim_Number__c,
            insuranceCarrier: sfOpp.Insurance_Company__c,
            deductible: sfOpp.Deductible__c,
            rcvAmount: sfOpp.RCV__c,
            createdAt: sfOpp.CreatedDate ? new Date(sfOpp.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newOpp = await prisma.opportunity.create({ data: createData });
            await saveMigrationMapping('opportunity', sfOpp.Id, newOpp.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'opportunity', sfOpp.Id, newOpp.id, { name: sfOpp.Name, jobId });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing opportunity ${sfOpp.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'opportunity', sfOpp.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileWorkOrders(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING WORK ORDERS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM work orders for matching
  const crmWorkOrders = await prisma.workOrder.findMany({
    select: {
      id: true,
      salesforceId: true,
      workOrderNumber: true,
      subject: true,
      accountId: true,
      opportunityId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmWorkOrders.length} CRM work orders for matching`);

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const workTypeMappings = await prisma.workType.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const workTypeMap = new Map(workTypeMappings.map(w => [w.salesforceId, w.id]));

  const territoryMappings = await prisma.serviceTerritory.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const territoryMap = new Map(territoryMappings.map(t => [t.salesforceId, t.id]));

  // Fetch Salesforce work orders
  const sfQuery = `
    SELECT Id, WorkOrderNumber, Subject, Description, Status, Priority,
           AccountId, Opportunity__c, WorkTypeId, ServiceTerritoryId,
           Street, City, State, PostalCode, Country,
           StartDate, EndDate, OwnerId, CreatedDate, LastModifiedDate
    FROM WorkOrder
    WHERE Status != 'Canceled'
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce work orders`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfWO of batch) {
      try {
        // Find matching CRM record
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfWO, 'workorder', crmWorkOrders);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfWO.Id,
            salesforceName: sfWO.WorkOrderNumber,
            crmId: match?.id,
            crmName: match?.workOrderNumber,
            confidence,
            matchType,
          });
        }

        // Resolve foreign keys
        const accountId = sfWO.AccountId ? accountMap.get(sfWO.AccountId) : null;
        const opportunityId = sfWO.Opportunity__c ? oppMap.get(sfWO.Opportunity__c) : null;
        const workTypeId = sfWO.WorkTypeId ? workTypeMap.get(sfWO.WorkTypeId) : null;
        const territoryId = sfWO.ServiceTerritoryId ? territoryMap.get(sfWO.ServiceTerritoryId) : null;

        let ownerId = null;
        if (sfWO.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfWO.OwnerId } });
          ownerId = owner?.id || null;
        }

        // Map SF status to enum
        const statusMapping = {
          'New': 'NEW',
          'In Progress': 'IN_PROGRESS',
          'On Hold': 'ON_HOLD',
          'Completed': 'COMPLETED',
          'Closed': 'CLOSED',
          'Cannot Complete': 'CANNOT_COMPLETE',
        };
        const status = statusMapping[sfWO.Status] || 'NEW';

        const priorityMapping = {
          'Low': 'LOW',
          'Medium': 'MEDIUM',
          'High': 'HIGH',
          'Critical': 'CRITICAL',
        };
        const priority = priorityMapping[sfWO.Priority] || 'MEDIUM';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfWO.Id;
          }
          if (shouldUpdateField('subject', 'workorder', match.subject, sfWO.Subject, match)) {
            updateData.subject = sfWO.Subject;
          }
          if (shouldUpdateField('status', 'workorder', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('accountId', 'workorder', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }
          if (shouldUpdateField('opportunityId', 'workorder', match.opportunityId, opportunityId, match)) {
            updateData.opportunityId = opportunityId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.workOrder.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'workorder', sfWO.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('workorder', sfWO.Id, match.id, matchType, confidence);

        } else {
          // Create new work order - accountId is required
          if (!accountId) {
            // Record as orphaned record for manual resolution
            await recordOrphanedRecord({
              salesforceId: sfWO.Id,
              salesforceType: 'WorkOrder',
              recordNumber: sfWO.WorkOrderNumber,
              recordName: sfWO.Subject || sfWO.WorkOrderNumber,
              orphanReason: sfWO.AccountId ? 'INVALID_ACCOUNT_ID' : 'NULL_ACCOUNT_ID',
              missingFieldName: 'AccountId',
              missingFieldValue: sfWO.AccountId || null,
              salesforceData: {
                WorkOrderNumber: sfWO.WorkOrderNumber,
                Subject: sfWO.Subject,
                Status: sfWO.Status,
                AccountId: sfWO.AccountId,
                OpportunityId: sfWO.OpportunityId__c,
                Street: sfWO.Street,
                City: sfWO.City,
                State: sfWO.State,
                PostalCode: sfWO.PostalCode,
              },
            });
            stats.skipped++;
            continue;
          }

          const createData = {
            salesforceId: sfWO.Id,
            workOrderNumber: sfWO.WorkOrderNumber,
            subject: sfWO.Subject,
            description: sfWO.Description,
            status,
            priority,
            accountId,
            opportunityId,
            workTypeId,
            territoryId,
            street: sfWO.Street,
            city: sfWO.City,
            state: sfWO.State,
            postalCode: sfWO.PostalCode,
            country: sfWO.Country,
            startDate: sfWO.StartDate ? new Date(sfWO.StartDate) : null,
            endDate: sfWO.EndDate ? new Date(sfWO.EndDate) : null,
            ownerId,
            createdAt: sfWO.CreatedDate ? new Date(sfWO.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newWO = await prisma.workOrder.create({ data: createData });
            await saveMigrationMapping('workorder', sfWO.Id, newWO.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'workorder', sfWO.Id, newWO.id, { workOrderNumber: sfWO.WorkOrderNumber });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing work order ${sfWO.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'workorder', sfWO.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileServiceAppointments(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING SERVICE APPOINTMENTS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM service appointments for matching
  const crmAppointments = await prisma.serviceAppointment.findMany({
    select: {
      id: true,
      salesforceId: true,
      appointmentNumber: true,
      subject: true,
      workOrderId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmAppointments.length} CRM service appointments for matching`);

  // Build work order mapping
  const woMappings = await prisma.workOrder.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const woMap = new Map(woMappings.map(w => [w.salesforceId, w.id]));

  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce service appointments
  const sfQuery = `
    SELECT Id, AppointmentNumber, Subject, Description, Status,
           ParentRecordId, AccountId, ContactId,
           SchedStartTime, SchedEndTime, ActualStartTime, ActualEndTime,
           Duration, DurationType, Street, City, State, PostalCode, Country,
           OwnerId, CreatedDate, LastModifiedDate
    FROM ServiceAppointment
    WHERE Status != 'Canceled'
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce service appointments`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfSA of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfSA, 'serviceappointment', crmAppointments);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfSA.Id,
            salesforceName: sfSA.AppointmentNumber,
            crmId: match?.id,
            crmName: match?.appointmentNumber,
            confidence,
            matchType,
          });
        }

        // Resolve foreign keys - ParentRecordId is typically a WorkOrder
        const workOrderId = sfSA.ParentRecordId ? woMap.get(sfSA.ParentRecordId) : null;
        const accountId = sfSA.AccountId ? accountMap.get(sfSA.AccountId) : null;
        const contactId = sfSA.ContactId ? contactMap.get(sfSA.ContactId) : null;

        let ownerId = null;
        if (sfSA.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfSA.OwnerId } });
          ownerId = owner?.id || null;
        }

        // Map status
        const statusMapping = {
          'None': 'NONE',
          'Scheduled': 'SCHEDULED',
          'Dispatched': 'DISPATCHED',
          'In Progress': 'IN_PROGRESS',
          'Completed': 'COMPLETED',
          'Cannot Complete': 'CANNOT_COMPLETE',
          'Canceled': 'CANCELED',
        };
        const status = statusMapping[sfSA.Status] || 'NONE';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfSA.Id;
          }
          if (shouldUpdateField('subject', 'serviceappointment', match.subject, sfSA.Subject, match)) {
            updateData.subject = sfSA.Subject;
          }
          if (shouldUpdateField('status', 'serviceappointment', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('workOrderId', 'serviceappointment', match.workOrderId, workOrderId, match)) {
            updateData.workOrderId = workOrderId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.serviceAppointment.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'serviceappointment', sfSA.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('serviceappointment', sfSA.Id, match.id, matchType, confidence);

        } else {
          // Only skip for NEW records without a valid work order - they would be orphaned
          if (!workOrderId) {
            console.log(`  Skipping NEW service appointment ${sfSA.AppointmentNumber || sfSA.Id} - no valid work order found for ParentRecordId: ${sfSA.ParentRecordId || 'null'}`);
            stats.skipped++;
            continue;
          }

          const createData = {
            salesforceId: sfSA.Id,
            appointmentNumber: sfSA.AppointmentNumber,
            subject: sfSA.Subject,
            description: sfSA.Description,
            status,
            workOrderId,
            accountId,
            contactId,
            scheduledStart: sfSA.SchedStartTime ? new Date(sfSA.SchedStartTime) : null,
            scheduledEnd: sfSA.SchedEndTime ? new Date(sfSA.SchedEndTime) : null,
            actualStart: sfSA.ActualStartTime ? new Date(sfSA.ActualStartTime) : null,
            actualEnd: sfSA.ActualEndTime ? new Date(sfSA.ActualEndTime) : null,
            duration: sfSA.Duration,
            street: sfSA.Street,
            city: sfSA.City,
            state: sfSA.State,
            postalCode: sfSA.PostalCode,
            country: sfSA.Country,
            ownerId,
            createdAt: sfSA.CreatedDate ? new Date(sfSA.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newSA = await prisma.serviceAppointment.create({ data: createData });
            await saveMigrationMapping('serviceappointment', sfSA.Id, newSA.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'serviceappointment', sfSA.Id, newSA.id, { appointmentNumber: sfSA.AppointmentNumber });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing service appointment ${sfSA.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'serviceappointment', sfSA.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileQuotes(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING QUOTES');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM quotes for matching
  const crmQuotes = await prisma.quote.findMany({
    select: {
      id: true,
      salesforceId: true,
      quoteNumber: true,
      name: true,
      opportunityId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmQuotes.length} CRM quotes for matching`);

  // Build opportunity mapping
  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce quotes
  const sfQuery = `
    SELECT Id, QuoteNumber, Name, Status, Description,
           OpportunityId, AccountId, ContactId,
           Subtotal, Discount, TotalPrice, Tax, GrandTotal,
           ExpirationDate, BillingStreet, BillingCity, BillingState, BillingPostalCode,
           ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode,
           CreatedDate, LastModifiedDate
    FROM Quote
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce quotes`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfQuote of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfQuote, 'quote', crmQuotes);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfQuote.Id,
            salesforceName: sfQuote.QuoteNumber,
            crmId: match?.id,
            crmName: match?.quoteNumber,
            confidence,
            matchType,
          });
        }

        const opportunityId = sfQuote.OpportunityId ? oppMap.get(sfQuote.OpportunityId) : null;
        const accountId = sfQuote.AccountId ? accountMap.get(sfQuote.AccountId) : null;
        const contactId = sfQuote.ContactId ? contactMap.get(sfQuote.ContactId) : null;

        // Map status
        const statusMapping = {
          'Draft': 'DRAFT',
          'Needs Review': 'NEEDS_REVIEW',
          'In Review': 'IN_REVIEW',
          'Approved': 'APPROVED',
          'Rejected': 'REJECTED',
          'Presented': 'PRESENTED',
          'Accepted': 'ACCEPTED',
          'Denied': 'DENIED',
        };
        const status = statusMapping[sfQuote.Status] || 'DRAFT';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfQuote.Id;
          }
          if (shouldUpdateField('name', 'quote', match.name, sfQuote.Name, match)) {
            updateData.name = sfQuote.Name;
          }
          if (shouldUpdateField('status', 'quote', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('opportunityId', 'quote', match.opportunityId, opportunityId, match)) {
            updateData.opportunityId = opportunityId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.quote.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'quote', sfQuote.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('quote', sfQuote.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfQuote.Id,
            quoteNumber: sfQuote.QuoteNumber,
            name: sfQuote.Name,
            status,
            description: sfQuote.Description,
            opportunityId,
            accountId,
            contactId,
            subtotal: sfQuote.Subtotal,
            discount: sfQuote.Discount,
            total: sfQuote.TotalPrice,
            tax: sfQuote.Tax,
            grandTotal: sfQuote.GrandTotal,
            expirationDate: sfQuote.ExpirationDate ? new Date(sfQuote.ExpirationDate) : null,
            billingStreet: sfQuote.BillingStreet,
            billingCity: sfQuote.BillingCity,
            billingState: sfQuote.BillingState,
            billingPostalCode: sfQuote.BillingPostalCode,
            shippingStreet: sfQuote.ShippingStreet,
            shippingCity: sfQuote.ShippingCity,
            shippingState: sfQuote.ShippingState,
            shippingPostalCode: sfQuote.ShippingPostalCode,
            createdAt: sfQuote.CreatedDate ? new Date(sfQuote.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newQuote = await prisma.quote.create({ data: createData });
            await saveMigrationMapping('quote', sfQuote.Id, newQuote.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'quote', sfQuote.Id, newQuote.id, { quoteNumber: sfQuote.QuoteNumber });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing quote ${sfQuote.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'quote', sfQuote.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileServiceContracts(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING SERVICE CONTRACTS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM service contracts for matching
  const crmContracts = await prisma.serviceContract.findMany({
    select: {
      id: true,
      salesforceId: true,
      contractNumber: true,
      name: true,
      opportunityId: true,
      accountId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmContracts.length} CRM service contracts for matching`);

  // Build foreign key mappings
  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce service contracts
  const sfQuery = `
    SELECT Id, ContractNumber, Name, Status, Description,
           AccountId, ContactId, Opportunity__c,
           StartDate, EndDate, Term, ContractAmount__c,
           BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry,
           OwnerId, CreatedDate, LastModifiedDate
    FROM ServiceContract
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce service contracts`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfContract of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfContract, 'servicecontract', crmContracts);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfContract.Id,
            salesforceName: sfContract.ContractNumber,
            crmId: match?.id,
            crmName: match?.contractNumber,
            confidence,
            matchType,
          });
        }

        const opportunityId = sfContract.Opportunity__c ? oppMap.get(sfContract.Opportunity__c) : null;
        const accountId = sfContract.AccountId ? accountMap.get(sfContract.AccountId) : null;
        const contactId = sfContract.ContactId ? contactMap.get(sfContract.ContactId) : null;

        let ownerId = null;
        if (sfContract.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfContract.OwnerId } });
          ownerId = owner?.id || null;
        }

        // Map status
        const statusMapping = {
          'Draft': 'DRAFT',
          'Active': 'ACTIVE',
          'Expired': 'EXPIRED',
          'Canceled': 'CANCELED',
          'Terminated': 'TERMINATED',
        };
        const status = statusMapping[sfContract.Status] || 'DRAFT';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfContract.Id;
          }
          if (shouldUpdateField('name', 'servicecontract', match.name, sfContract.Name, match)) {
            updateData.name = sfContract.Name;
          }
          if (shouldUpdateField('status', 'servicecontract', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('opportunityId', 'servicecontract', match.opportunityId, opportunityId, match)) {
            updateData.opportunityId = opportunityId;
          }
          if (shouldUpdateField('accountId', 'servicecontract', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.serviceContract.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'servicecontract', sfContract.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('servicecontract', sfContract.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfContract.Id,
            contractNumber: sfContract.ContractNumber,
            name: sfContract.Name,
            status,
            description: sfContract.Description,
            opportunityId,
            accountId,
            contactId,
            startDate: sfContract.StartDate ? new Date(sfContract.StartDate) : null,
            endDate: sfContract.EndDate ? new Date(sfContract.EndDate) : null,
            term: sfContract.Term,
            contractTotal: sfContract.ContractAmount__c,
            billingStreet: sfContract.BillingStreet,
            billingCity: sfContract.BillingCity,
            billingState: sfContract.BillingState,
            billingPostalCode: sfContract.BillingPostalCode,
            billingCountry: sfContract.BillingCountry,
            ownerId,
            createdAt: sfContract.CreatedDate ? new Date(sfContract.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newContract = await prisma.serviceContract.create({ data: createData });
            await saveMigrationMapping('servicecontract', sfContract.Id, newContract.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'servicecontract', sfContract.Id, newContract.id, { contractNumber: sfContract.ContractNumber });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing service contract ${sfContract.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'servicecontract', sfContract.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileInvoices(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING INVOICES');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM invoices for matching
  const crmInvoices = await prisma.invoice.findMany({
    select: {
      id: true,
      salesforceId: true,
      invoiceNumber: true,
      accountId: true,
      opportunityId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmInvoices.length} CRM invoices for matching`);

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contractMappings = await prisma.serviceContract.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contractMap = new Map(contractMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce invoices (FinancialForce fw1__Invoice__c object)
  const sfQuery = `
    SELECT Id, Name, fw1__Status__c, fw1__Account__c, fw1__Opportunity__c,
           fw1__Subtotal__c, fw1__Tax__c, fw1__Total__c, fw1__Balance_Due__c,
           fw1__Invoice_Date__c, fw1__Due_Date__c, fw1__Terms__c,
           Service_Contract__c,
           CreatedDate, LastModifiedDate
    FROM fw1__Invoice__c
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce invoices`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfInvoice of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfInvoice, 'invoice', crmInvoices);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfInvoice.Id,
            salesforceName: sfInvoice.Name,
            crmId: match?.id,
            crmName: match?.invoiceNumber,
            confidence,
            matchType,
          });
        }

        const accountId = sfInvoice.fw1__Account__c ? accountMap.get(sfInvoice.fw1__Account__c) : null;
        const opportunityId = sfInvoice.fw1__Opportunity__c ? oppMap.get(sfInvoice.fw1__Opportunity__c) : null;
        const serviceContractId = sfInvoice.Service_Contract__c ? contractMap.get(sfInvoice.Service_Contract__c) : null;

        // Map status
        const statusMapping = {
          'Draft': 'DRAFT',
          'Approved': 'APPROVED',
          'Sent': 'SENT',
          'Partially Paid': 'PARTIALLY_PAID',
          'Paid': 'PAID',
          'Overdue': 'OVERDUE',
          'Voided': 'VOIDED',
          'Cancelled': 'CANCELLED',
        };
        const status = statusMapping[sfInvoice.fw1__Status__c] || 'DRAFT';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfInvoice.Id;
          }
          if (shouldUpdateField('status', 'invoice', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('accountId', 'invoice', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }
          if (shouldUpdateField('opportunityId', 'invoice', match.opportunityId, opportunityId, match)) {
            updateData.opportunityId = opportunityId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.invoice.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'invoice', sfInvoice.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('invoice', sfInvoice.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfInvoice.Id,
            invoiceNumber: sfInvoice.Name,
            status,
            accountId,
            opportunityId,
            serviceContractId,
            subtotal: sfInvoice.fw1__Subtotal__c,
            tax: sfInvoice.fw1__Tax__c,
            total: sfInvoice.fw1__Total__c,
            balanceDue: sfInvoice.fw1__Balance_Due__c,
            invoiceDate: sfInvoice.fw1__Invoice_Date__c ? new Date(sfInvoice.fw1__Invoice_Date__c) : null,
            dueDate: sfInvoice.fw1__Due_Date__c ? new Date(sfInvoice.fw1__Due_Date__c) : null,
            terms: sfInvoice.fw1__Terms__c,
            createdAt: sfInvoice.CreatedDate ? new Date(sfInvoice.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newInvoice = await prisma.invoice.create({ data: createData });
            await saveMigrationMapping('invoice', sfInvoice.Id, newInvoice.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'invoice', sfInvoice.Id, newInvoice.id, { invoiceNumber: sfInvoice.Name });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing invoice ${sfInvoice.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'invoice', sfInvoice.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileCommissions(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING COMMISSIONS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM commissions for matching
  const crmCommissions = await prisma.commission.findMany({
    select: {
      id: true,
      salesforceId: true,
      name: true,
      type: true,
      opportunityId: true,
      ownerId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmCommissions.length} CRM commissions for matching`);

  // Build foreign key mappings
  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contractMappings = await prisma.serviceContract.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contractMap = new Map(contractMappings.map(c => [c.salesforceId, c.id]));

  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  // Fetch Salesforce commissions
  const sfQuery = `
    SELECT Id, Name, Commission_Type__c, Status__c,
           Commission_Value__c, Commission_Rate_of_Pay__c, Commission_Amount__c,
           Requested_Amount__c, Pre_Commission__c, Paid_Amount__c, Paid_Date__c,
           User_Profle__c, Service_Contract__c, Customer_Name__c, Invoice__c,
           CreatedDate, LastModifiedDate
    FROM Commission__c
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce commissions`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfComm of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfComm, 'commission', crmCommissions);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfComm.Id,
            salesforceName: sfComm.Name,
            crmId: match?.id,
            crmName: match?.name,
            confidence,
            matchType,
          });
        }

        // Resolve owner
        let ownerId = null;
        if (sfComm.User_Profle__c) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfComm.User_Profle__c } });
          ownerId = owner?.id || null;
        }

        const serviceContractId = sfComm.Service_Contract__c ? contractMap.get(sfComm.Service_Contract__c) : null;
        const accountId = sfComm.Customer_Name__c ? accountMap.get(sfComm.Customer_Name__c) : null;

        // Map commission type
        const typeMapping = {
          'Pre-Commission': 'PRE_COMMISSION',
          'Back-End Commission': 'BACK_END',
          'Sales Op Commission': 'SALES_OP',
          'Supplement Override': 'SUPPLEMENT_OVERRIDE',
          'PM Commission': 'PM_COMMISSION',
          'Manager Override': 'MANAGER_OVERRIDE',
          'Bonus': 'BONUS',
          'Payroll Adjustment': 'PAYROLL_ADJUSTMENT',
        };
        const commissionType = typeMapping[sfComm.Commission_Type__c] || 'BACK_END';

        // Map status
        const statusMapping = {
          'New': 'NEW',
          'Requested': 'REQUESTED',
          'Approved': 'APPROVED',
          'Hold': 'HOLD',
          'Paid': 'PAID',
          'Denied': 'DENIED',
        };
        const status = statusMapping[sfComm.Status__c] || 'NEW';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfComm.Id;
          }
          if (shouldUpdateField('status', 'commission', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('type', 'commission', match.type, commissionType, match)) {
            updateData.type = commissionType;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.commission.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'commission', sfComm.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('commission', sfComm.Id, match.id, matchType, confidence);

        } else {
          // Try to get opportunityId via Service Contract
          let opportunityId = null;
          if (serviceContractId) {
            const contract = await prisma.serviceContract.findUnique({
              where: { id: serviceContractId },
              select: { opportunityId: true },
            });
            opportunityId = contract?.opportunityId || null;
          }

          const createData = {
            salesforceId: sfComm.Id,
            name: sfComm.Name,
            type: commissionType,
            status,
            commissionValue: sfComm.Commission_Value__c,
            commissionRate: sfComm.Commission_Rate_of_Pay__c,
            commissionAmount: sfComm.Commission_Amount__c,
            requestedAmount: sfComm.Requested_Amount__c,
            preCommission: sfComm.Pre_Commission__c,
            paidAmount: sfComm.Paid_Amount__c,
            paidDate: sfComm.Paid_Date__c ? new Date(sfComm.Paid_Date__c) : null,
            ownerId,
            serviceContractId,
            accountId,
            opportunityId,
            createdAt: sfComm.CreatedDate ? new Date(sfComm.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newComm = await prisma.commission.create({ data: createData });
            await saveMigrationMapping('commission', sfComm.Id, newComm.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'commission', sfComm.Id, newComm.id, { name: sfComm.Name, type: commissionType });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing commission ${sfComm.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'commission', sfComm.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileTasks(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING TASKS');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM tasks for matching
  const crmTasks = await prisma.task.findMany({
    select: {
      id: true,
      salesforceId: true,
      subject: true,
      opportunityId: true,
      accountId: true,
      leadId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmTasks.length} CRM tasks for matching`);

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const leadMappings = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const leadMap = new Map(leadMappings.map(l => [l.salesforceId, l.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce tasks
  const sfQuery = `
    SELECT Id, Subject, Description, Status, Priority, Type,
           WhoId, WhatId, AccountId, OwnerId,
           ActivityDate, ReminderDateTime, IsReminderSet,
           CreatedDate, LastModifiedDate
    FROM Task
    WHERE IsClosed = false OR CreatedDate = LAST_N_DAYS:365
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce tasks`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfTask of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfTask, 'task', crmTasks);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfTask.Id,
            salesforceName: sfTask.Subject,
            crmId: match?.id,
            crmName: match?.subject,
            confidence,
            matchType,
          });
        }

        // Resolve foreign keys
        // WhatId can be Account or Opportunity, WhoId can be Contact or Lead
        let accountId = sfTask.AccountId ? accountMap.get(sfTask.AccountId) : null;
        let opportunityId = null;
        let contactId = null;
        let leadId = null;

        if (sfTask.WhatId) {
          // Try Opportunity first
          if (oppMap.has(sfTask.WhatId)) {
            opportunityId = oppMap.get(sfTask.WhatId);
          } else if (accountMap.has(sfTask.WhatId) && !accountId) {
            accountId = accountMap.get(sfTask.WhatId);
          }
        }

        if (sfTask.WhoId) {
          // Try Contact first
          if (contactMap.has(sfTask.WhoId)) {
            contactId = contactMap.get(sfTask.WhoId);
          } else if (leadMap.has(sfTask.WhoId)) {
            leadId = leadMap.get(sfTask.WhoId);
          }
        }

        let ownerId = null;
        if (sfTask.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfTask.OwnerId } });
          ownerId = owner?.id || null;
        }

        // Map status
        const statusMapping = {
          'Not Started': 'NOT_STARTED',
          'In Progress': 'IN_PROGRESS',
          'Completed': 'COMPLETED',
          'Waiting on someone else': 'WAITING',
          'Deferred': 'DEFERRED',
        };
        const status = statusMapping[sfTask.Status] || 'NOT_STARTED';

        const priorityMapping = {
          'Low': 'LOW',
          'Normal': 'MEDIUM',
          'High': 'HIGH',
        };
        const priority = priorityMapping[sfTask.Priority] || 'MEDIUM';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfTask.Id;
          }
          if (shouldUpdateField('status', 'task', match.status, status, match)) {
            updateData.status = status;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.task.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'task', sfTask.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('task', sfTask.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfTask.Id,
            subject: sfTask.Subject,
            description: sfTask.Description,
            status,
            priority,
            type: sfTask.Type,
            accountId,
            opportunityId,
            contactId,
            leadId,
            ownerId,
            dueDate: sfTask.ActivityDate ? new Date(sfTask.ActivityDate) : null,
            reminderDate: sfTask.ReminderDateTime ? new Date(sfTask.ReminderDateTime) : null,
            isReminderSet: sfTask.IsReminderSet || false,
            createdAt: sfTask.CreatedDate ? new Date(sfTask.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newTask = await prisma.task.create({ data: createData });
            await saveMigrationMapping('task', sfTask.Id, newTask.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'task', sfTask.Id, newTask.id, { subject: sfTask.Subject });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing task ${sfTask.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'task', sfTask.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

async function reconcileCases(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING CASES');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Fetch all CRM cases for matching
  const crmCases = await prisma.case.findMany({
    select: {
      id: true,
      salesforceId: true,
      caseNumber: true,
      subject: true,
      accountId: true,
      opportunityId: true,
      updatedAt: true,
    },
  });
  console.log(`Loaded ${crmCases.length} CRM cases for matching`);

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  // Fetch Salesforce cases
  const sfQuery = `
    SELECT Id, CaseNumber, Subject, Description, Status, Priority, Type, Origin, Reason,
           AccountId, ContactId, Opportunity__c, OwnerId,
           ClosedDate, CreatedDate, LastModifiedDate
    FROM Case
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce cases`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfCase of batch) {
      try {
        const { match, confidence, matchType, requiresReview } = await resolver.findMatch(sfCase, 'case', crmCases);

        if (requiresReview) {
          stats.requiresReview.push({
            salesforceId: sfCase.Id,
            salesforceName: sfCase.CaseNumber,
            crmId: match?.id,
            crmName: match?.caseNumber,
            confidence,
            matchType,
          });
        }

        const accountId = sfCase.AccountId ? accountMap.get(sfCase.AccountId) : null;
        const opportunityId = sfCase.Opportunity__c ? oppMap.get(sfCase.Opportunity__c) : null;
        const contactId = sfCase.ContactId ? contactMap.get(sfCase.ContactId) : null;

        let ownerId = null;
        if (sfCase.OwnerId) {
          const owner = await prisma.user.findFirst({ where: { salesforceId: sfCase.OwnerId } });
          ownerId = owner?.id || null;
        }

        // Map status
        const statusMapping = {
          'New': 'NEW',
          'Working': 'WORKING',
          'Escalated': 'ESCALATED',
          'Closed': 'CLOSED',
          'On Hold': 'ON_HOLD',
        };
        const status = statusMapping[sfCase.Status] || 'NEW';

        const priorityMapping = {
          'Low': 'LOW',
          'Medium': 'MEDIUM',
          'High': 'HIGH',
          'Critical': 'CRITICAL',
        };
        const priority = priorityMapping[sfCase.Priority] || 'MEDIUM';

        if (match) {
          stats.matched++;
          const updateData = {};

          if (!match.salesforceId) {
            updateData.salesforceId = sfCase.Id;
          }
          if (shouldUpdateField('status', 'case', match.status, status, match)) {
            updateData.status = status;
          }
          if (shouldUpdateField('accountId', 'case', match.accountId, accountId, match)) {
            updateData.accountId = accountId;
          }
          if (shouldUpdateField('opportunityId', 'case', match.opportunityId, opportunityId, match)) {
            updateData.opportunityId = opportunityId;
          }

          if (Object.keys(updateData).length > 0) {
            if (!DRY_RUN) {
              await prisma.case.update({ where: { id: match.id }, data: updateData });
            }
            stats.updated++;
            await logMigrationAudit('UPDATE', 'case', sfCase.Id, match.id, { fields: Object.keys(updateData), matchType, confidence });
          } else {
            stats.skipped++;
          }

          await saveMigrationMapping('case', sfCase.Id, match.id, matchType, confidence);

        } else {
          const createData = {
            salesforceId: sfCase.Id,
            caseNumber: sfCase.CaseNumber,
            subject: sfCase.Subject,
            description: sfCase.Description,
            status,
            priority,
            type: sfCase.Type,
            origin: sfCase.Origin,
            reason: sfCase.Reason,
            accountId,
            opportunityId,
            contactId,
            ownerId,
            closedDate: sfCase.ClosedDate ? new Date(sfCase.ClosedDate) : null,
            createdAt: sfCase.CreatedDate ? new Date(sfCase.CreatedDate) : new Date(),
          };

          if (!DRY_RUN) {
            const newCase = await prisma.case.create({ data: createData });
            await saveMigrationMapping('case', sfCase.Id, newCase.id, 'CREATED', 1.0);
            await logMigrationAudit('CREATE', 'case', sfCase.Id, newCase.id, { caseNumber: sfCase.CaseNumber });
          }
          stats.created++;
        }

      } catch (error) {
        console.error(`Error processing case ${sfCase.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'case', sfCase.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

// ============================================================================
// PHASE 3: ACTIVITIES, CHATTER, EMAILS, NOTES
// ============================================================================

async function reconcileActivities(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING ACTIVITIES (Events → Activity model)');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  const leadMappings = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const leadMap = new Map(leadMappings.map(l => [l.salesforceId, l.id]));

  const userMappings = await prisma.user.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const userMap = new Map(userMappings.map(u => [u.salesforceId, u.id]));

  console.log(`ID Maps: ${accountMap.size} accounts, ${oppMap.size} opps, ${contactMap.size} contacts, ${leadMap.size} leads, ${userMap.size} users`);

  // Fetch existing activities to avoid duplicates (by sourceId)
  const existingActivities = await prisma.activity.findMany({
    where: { sourceType: 'SALESFORCE_EVENT' },
    select: { id: true, sourceId: true },
  });
  const existingSourceIds = new Set(existingActivities.map(a => a.sourceId));
  console.log(`Found ${existingSourceIds.size} existing Salesforce Event activities`);

  // Fetch Salesforce Events
  const sfQuery = `
    SELECT Id, Subject, Description, Location, StartDateTime, EndDateTime,
           WhoId, WhatId, OwnerId, Type, ActivityDateTime,
           CreatedDate, LastModifiedDate
    FROM Event
  `;

  let records = [];
  let result = await sfConn.query(sfQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce events`);

  // Process in batches
  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfEvent of batch) {
      try {
        // Skip if already migrated
        if (existingSourceIds.has(sfEvent.Id)) {
          stats.skipped++;
          continue;
        }

        // Resolve WhoId (Contact or Lead)
        let contactId = null;
        let leadId = null;
        if (sfEvent.WhoId) {
          if (sfEvent.WhoId.startsWith('003')) {
            contactId = contactMap.get(sfEvent.WhoId);
          } else if (sfEvent.WhoId.startsWith('00Q')) {
            leadId = leadMap.get(sfEvent.WhoId);
          }
        }

        // Resolve WhatId (Account or Opportunity)
        let accountId = null;
        let opportunityId = null;
        if (sfEvent.WhatId) {
          if (sfEvent.WhatId.startsWith('001')) {
            accountId = accountMap.get(sfEvent.WhatId);
          } else if (sfEvent.WhatId.startsWith('006')) {
            opportunityId = oppMap.get(sfEvent.WhatId);
          }
        }

        // Get userId from OwnerId
        const userId = sfEvent.OwnerId ? userMap.get(sfEvent.OwnerId) : null;

        const activityData = {
          type: 'EVENT_CREATED',
          subType: sfEvent.Type || null,
          subject: sfEvent.Subject,
          description: sfEvent.Description,
          body: sfEvent.Location ? `Location: ${sfEvent.Location}\n${sfEvent.Description || ''}` : sfEvent.Description,
          sourceId: sfEvent.Id,
          sourceType: 'SALESFORCE_EVENT',
          accountId,
          contactId,
          leadId,
          opportunityId,
          userId,
          occurredAt: sfEvent.ActivityDateTime ? new Date(sfEvent.ActivityDateTime) :
                     sfEvent.StartDateTime ? new Date(sfEvent.StartDateTime) : new Date(sfEvent.CreatedDate),
          createdAt: new Date(sfEvent.CreatedDate),
          metadata: {
            sfStartDateTime: sfEvent.StartDateTime,
            sfEndDateTime: sfEvent.EndDateTime,
            sfLocation: sfEvent.Location,
            sfType: sfEvent.Type,
          },
        };

        if (!DRY_RUN) {
          const newActivity = await prisma.activity.create({ data: activityData });
          await logMigrationAudit('CREATE', 'activity', sfEvent.Id, newActivity.id, { subject: sfEvent.Subject, type: 'EVENT' });
        }
        stats.created++;

      } catch (error) {
        console.error(`  Error processing event ${sfEvent.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'activity', sfEvent.Id, null, { error: error.message, type: 'EVENT' });
      }
    }
  }

  return stats;
}

async function reconcileChatterPosts(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING CHATTER POSTS (FeedItem, FeedComment → Activity model)');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  const leadMappings = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const leadMap = new Map(leadMappings.map(l => [l.salesforceId, l.id]));

  const userMappings = await prisma.user.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const userMap = new Map(userMappings.map(u => [u.salesforceId, u.id]));

  console.log(`ID Maps: ${accountMap.size} accounts, ${oppMap.size} opps, ${contactMap.size} contacts, ${leadMap.size} leads, ${userMap.size} users`);

  // Fetch existing activities to avoid duplicates
  const existingActivities = await prisma.activity.findMany({
    where: { sourceType: { in: ['SALESFORCE_FEEDITEM', 'SALESFORCE_FEEDCOMMENT'] } },
    select: { id: true, sourceId: true },
  });
  const existingSourceIds = new Set(existingActivities.map(a => a.sourceId));
  console.log(`Found ${existingSourceIds.size} existing Chatter activities`);

  // ---- FEED ITEMS (Chatter Posts) ----
  console.log('\n--- Processing FeedItem (Chatter Posts) ---');

  const feedItemQuery = `
    SELECT Id, ParentId, Body, Title, Type, CreatedById, CreatedDate, LastModifiedDate
    FROM FeedItem
    WHERE Type IN ('TextPost', 'ContentPost', 'LinkPost', 'TrackedChange')
  `;

  let feedItems = [];
  let result = await sfConn.query(feedItemQuery);
  feedItems = feedItems.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    feedItems = feedItems.concat(result.records);
  }

  console.log(`Fetched ${feedItems.length} Salesforce FeedItems`);

  for (let i = 0; i < feedItems.length; i += CONFIG.batchSize) {
    const batch = feedItems.slice(i, i + CONFIG.batchSize);
    console.log(`Processing FeedItem batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(feedItems.length / CONFIG.batchSize)}`);

    for (const sfItem of batch) {
      try {
        if (existingSourceIds.has(sfItem.Id)) {
          stats.skipped++;
          continue;
        }

        // Resolve ParentId to the correct entity
        let accountId = null;
        let opportunityId = null;
        let contactId = null;
        let leadId = null;

        if (sfItem.ParentId) {
          if (sfItem.ParentId.startsWith('001')) {
            accountId = accountMap.get(sfItem.ParentId);
          } else if (sfItem.ParentId.startsWith('006')) {
            opportunityId = oppMap.get(sfItem.ParentId);
          } else if (sfItem.ParentId.startsWith('003')) {
            contactId = contactMap.get(sfItem.ParentId);
          } else if (sfItem.ParentId.startsWith('00Q')) {
            leadId = leadMap.get(sfItem.ParentId);
          }
        }

        // Skip if we can't link to any entity
        if (!accountId && !opportunityId && !contactId && !leadId) {
          stats.skipped++;
          continue;
        }

        const userId = sfItem.CreatedById ? userMap.get(sfItem.CreatedById) : null;

        const activityData = {
          type: 'COMMENT_ADDED',
          subType: sfItem.Type,
          subject: sfItem.Title || 'Chatter Post',
          description: sfItem.Body,
          body: sfItem.Body,
          sourceId: sfItem.Id,
          sourceType: 'SALESFORCE_FEEDITEM',
          accountId,
          contactId,
          leadId,
          opportunityId,
          userId,
          occurredAt: new Date(sfItem.CreatedDate),
          createdAt: new Date(sfItem.CreatedDate),
          metadata: {
            sfType: sfItem.Type,
            sfParentId: sfItem.ParentId,
          },
        };

        if (!DRY_RUN) {
          const newActivity = await prisma.activity.create({ data: activityData });
          await logMigrationAudit('CREATE', 'activity', sfItem.Id, newActivity.id, { type: 'FEEDITEM' });
        }
        stats.created++;

      } catch (error) {
        console.error(`  Error processing FeedItem ${sfItem.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'activity', sfItem.Id, null, { error: error.message, type: 'FEEDITEM' });
      }
    }
  }

  // ---- FEED COMMENTS ----
  console.log('\n--- Processing FeedComment ---');

  const feedCommentQuery = `
    SELECT Id, FeedItemId, CommentBody, CreatedById, CreatedDate
    FROM FeedComment
  `;

  let feedComments = [];
  result = await sfConn.query(feedCommentQuery);
  feedComments = feedComments.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    feedComments = feedComments.concat(result.records);
  }

  console.log(`Fetched ${feedComments.length} Salesforce FeedComments`);

  // Build a map of FeedItem to parent entity
  const feedItemToParent = new Map();
  for (const fi of feedItems) {
    if (fi.ParentId) {
      feedItemToParent.set(fi.Id, fi.ParentId);
    }
  }

  for (let i = 0; i < feedComments.length; i += CONFIG.batchSize) {
    const batch = feedComments.slice(i, i + CONFIG.batchSize);
    console.log(`Processing FeedComment batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(feedComments.length / CONFIG.batchSize)}`);

    for (const sfComment of batch) {
      try {
        if (existingSourceIds.has(sfComment.Id)) {
          stats.skipped++;
          continue;
        }

        // Get the parent entity from the FeedItem
        const parentId = feedItemToParent.get(sfComment.FeedItemId);

        let accountId = null;
        let opportunityId = null;
        let contactId = null;
        let leadId = null;

        if (parentId) {
          if (parentId.startsWith('001')) {
            accountId = accountMap.get(parentId);
          } else if (parentId.startsWith('006')) {
            opportunityId = oppMap.get(parentId);
          } else if (parentId.startsWith('003')) {
            contactId = contactMap.get(parentId);
          } else if (parentId.startsWith('00Q')) {
            leadId = leadMap.get(parentId);
          }
        }

        // Skip if we can't link to any entity
        if (!accountId && !opportunityId && !contactId && !leadId) {
          stats.skipped++;
          continue;
        }

        const userId = sfComment.CreatedById ? userMap.get(sfComment.CreatedById) : null;

        const activityData = {
          type: 'COMMENT_ADDED',
          subType: 'FeedComment',
          subject: 'Chatter Comment',
          description: sfComment.CommentBody,
          body: sfComment.CommentBody,
          sourceId: sfComment.Id,
          sourceType: 'SALESFORCE_FEEDCOMMENT',
          accountId,
          contactId,
          leadId,
          opportunityId,
          userId,
          occurredAt: new Date(sfComment.CreatedDate),
          createdAt: new Date(sfComment.CreatedDate),
          metadata: {
            sfFeedItemId: sfComment.FeedItemId,
            sfParentId: parentId,
          },
        };

        if (!DRY_RUN) {
          const newActivity = await prisma.activity.create({ data: activityData });
          await logMigrationAudit('CREATE', 'activity', sfComment.Id, newActivity.id, { type: 'FEEDCOMMENT' });
        }
        stats.created++;

      } catch (error) {
        console.error(`  Error processing FeedComment ${sfComment.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'activity', sfComment.Id, null, { error: error.message, type: 'FEEDCOMMENT' });
      }
    }
  }

  return stats;
}

async function reconcileEmailMessages(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING EMAIL MESSAGES (EmailMessage → Activity model)');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  const leadMappings = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const leadMap = new Map(leadMappings.map(l => [l.salesforceId, l.id]));

  const userMappings = await prisma.user.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const userMap = new Map(userMappings.map(u => [u.salesforceId, u.id]));

  console.log(`ID Maps: ${accountMap.size} accounts, ${oppMap.size} opps, ${contactMap.size} contacts, ${leadMap.size} leads, ${userMap.size} users`);

  // Fetch existing activities to avoid duplicates
  const existingActivities = await prisma.activity.findMany({
    where: { sourceType: 'SALESFORCE_EMAIL' },
    select: { id: true, sourceId: true },
  });
  const existingSourceIds = new Set(existingActivities.map(a => a.sourceId));
  console.log(`Found ${existingSourceIds.size} existing email activities`);

  // Fetch EmailMessage records with related entity info
  const emailQuery = `
    SELECT Id, Subject, TextBody, HtmlBody, FromAddress, FromName, ToAddress,
           Status, Incoming, MessageDate, ParentId, RelatedToId, CreatedById, CreatedDate
    FROM EmailMessage
  `;

  let records = [];
  let result = await sfConn.query(emailQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce EmailMessages`);

  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfEmail of batch) {
      try {
        if (existingSourceIds.has(sfEmail.Id)) {
          stats.skipped++;
          continue;
        }

        // Resolve RelatedToId to the correct entity
        let accountId = null;
        let opportunityId = null;
        let contactId = null;
        let leadId = null;

        if (sfEmail.RelatedToId) {
          if (sfEmail.RelatedToId.startsWith('001')) {
            accountId = accountMap.get(sfEmail.RelatedToId);
          } else if (sfEmail.RelatedToId.startsWith('006')) {
            opportunityId = oppMap.get(sfEmail.RelatedToId);
          }
        }

        // Also check ParentId (could be Case, which links to Account/Opp)
        if (sfEmail.ParentId) {
          if (sfEmail.ParentId.startsWith('001')) {
            accountId = accountId || accountMap.get(sfEmail.ParentId);
          } else if (sfEmail.ParentId.startsWith('006')) {
            opportunityId = opportunityId || oppMap.get(sfEmail.ParentId);
          } else if (sfEmail.ParentId.startsWith('003')) {
            contactId = contactMap.get(sfEmail.ParentId);
          } else if (sfEmail.ParentId.startsWith('00Q')) {
            leadId = leadMap.get(sfEmail.ParentId);
          }
        }

        // Skip if we can't link to any entity
        if (!accountId && !opportunityId && !contactId && !leadId) {
          stats.skipped++;
          continue;
        }

        const userId = sfEmail.CreatedById ? userMap.get(sfEmail.CreatedById) : null;
        const activityType = sfEmail.Incoming ? 'EMAIL_RECEIVED' : 'EMAIL_SENT';

        const activityData = {
          type: activityType,
          subType: sfEmail.Status,
          subject: sfEmail.Subject,
          description: sfEmail.TextBody,
          body: sfEmail.TextBody,
          bodyHtml: sfEmail.HtmlBody,
          sourceId: sfEmail.Id,
          sourceType: 'SALESFORCE_EMAIL',
          accountId,
          contactId,
          leadId,
          opportunityId,
          userId,
          externalEmail: sfEmail.Incoming ? sfEmail.FromAddress : sfEmail.ToAddress,
          externalName: sfEmail.Incoming ? sfEmail.FromName : null,
          occurredAt: sfEmail.MessageDate ? new Date(sfEmail.MessageDate) : new Date(sfEmail.CreatedDate),
          createdAt: new Date(sfEmail.CreatedDate),
          metadata: {
            sfFromAddress: sfEmail.FromAddress,
            sfFromName: sfEmail.FromName,
            sfToAddress: sfEmail.ToAddress,
            sfStatus: sfEmail.Status,
            sfIncoming: sfEmail.Incoming,
            sfParentId: sfEmail.ParentId,
            sfRelatedToId: sfEmail.RelatedToId,
          },
        };

        if (!DRY_RUN) {
          const newActivity = await prisma.activity.create({ data: activityData });
          await logMigrationAudit('CREATE', 'activity', sfEmail.Id, newActivity.id, { subject: sfEmail.Subject, type: 'EMAIL' });
        }
        stats.created++;

      } catch (error) {
        console.error(`  Error processing EmailMessage ${sfEmail.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'activity', sfEmail.Id, null, { error: error.message, type: 'EMAIL' });
      }
    }
  }

  return stats;
}

async function reconcileNotes(sfConn, resolver) {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RECONCILING NOTES (Note → Note model)');
  console.log('══════════════════════════════════════════════════════════════');

  const stats = { matched: 0, updated: 0, created: 0, skipped: 0, errors: 0, requiresReview: [] };

  // Build foreign key mappings
  const accountMappings = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const accountMap = new Map(accountMappings.map(a => [a.salesforceId, a.id]));

  const oppMappings = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const oppMap = new Map(oppMappings.map(o => [o.salesforceId, o.id]));

  const contactMappings = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const contactMap = new Map(contactMappings.map(c => [c.salesforceId, c.id]));

  const leadMappings = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const leadMap = new Map(leadMappings.map(l => [l.salesforceId, l.id]));

  const userMappings = await prisma.user.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true },
  });
  const userMap = new Map(userMappings.map(u => [u.salesforceId, u.id]));

  console.log(`ID Maps: ${accountMap.size} accounts, ${oppMap.size} opps, ${contactMap.size} contacts, ${leadMap.size} leads, ${userMap.size} users`);

  // Fetch existing notes by checking for salesforce sourceId in metadata
  // Since Note model doesn't have salesforceId, we'll use a different approach - check by title+body+date
  const existingNotes = await prisma.$queryRaw`
    SELECT id, title, body, created_at FROM notes
  `;
  console.log(`Found ${existingNotes.length} existing notes`);

  // We'll track by a hash of title+body+createdAt to avoid duplicates
  const existingNotesSet = new Set(existingNotes.map(n => `${n.title || ''}|${(n.body || '').substring(0, 100)}|${n.created_at?.toISOString?.() || ''}`));

  // Fetch Salesforce Notes
  const noteQuery = `
    SELECT Id, Title, Body, ParentId, OwnerId, IsPrivate, CreatedDate, LastModifiedDate
    FROM Note
  `;

  let records = [];
  let result = await sfConn.query(noteQuery);
  records = records.concat(result.records);

  while (!result.done) {
    result = await sfConn.queryMore(result.nextRecordsUrl);
    records = records.concat(result.records);
  }

  console.log(`Fetched ${records.length} Salesforce Notes`);

  // Get a default user for createdById (required field)
  const defaultUser = await prisma.user.findFirst({ where: { isActive: true } });
  if (!defaultUser) {
    console.error('No active user found for default createdById');
    return stats;
  }

  for (let i = 0; i < records.length; i += CONFIG.batchSize) {
    const batch = records.slice(i, i + CONFIG.batchSize);
    console.log(`Processing batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(records.length / CONFIG.batchSize)}`);

    for (const sfNote of batch) {
      try {
        // Check for duplicate
        const noteKey = `${sfNote.Title || ''}|${(sfNote.Body || '').substring(0, 100)}|${sfNote.CreatedDate}`;
        if (existingNotesSet.has(noteKey)) {
          stats.skipped++;
          continue;
        }

        // Resolve ParentId to the correct entity
        let accountId = null;
        let opportunityId = null;
        let contactId = null;
        let leadId = null;

        if (sfNote.ParentId) {
          if (sfNote.ParentId.startsWith('001')) {
            accountId = accountMap.get(sfNote.ParentId);
          } else if (sfNote.ParentId.startsWith('006')) {
            opportunityId = oppMap.get(sfNote.ParentId);
          } else if (sfNote.ParentId.startsWith('003')) {
            contactId = contactMap.get(sfNote.ParentId);
          } else if (sfNote.ParentId.startsWith('00Q')) {
            leadId = leadMap.get(sfNote.ParentId);
          }
        }

        // Skip if we can't link to any entity
        if (!accountId && !opportunityId && !contactId && !leadId) {
          stats.skipped++;
          continue;
        }

        const createdById = sfNote.OwnerId ? userMap.get(sfNote.OwnerId) : defaultUser.id;

        const noteData = {
          title: sfNote.Title || 'Salesforce Note',
          body: sfNote.Body || '',
          accountId,
          contactId,
          leadId,
          opportunityId,
          createdById: createdById || defaultUser.id,
          createdAt: new Date(sfNote.CreatedDate),
        };

        if (!DRY_RUN) {
          const newNote = await prisma.note.create({ data: noteData });
          await logMigrationAudit('CREATE', 'note', sfNote.Id, newNote.id, { title: sfNote.Title });
          existingNotesSet.add(noteKey); // Add to set to prevent duplicates in same batch
        }
        stats.created++;

      } catch (error) {
        console.error(`  Error processing Note ${sfNote.Id}:`, error.message);
        stats.errors++;
        await logMigrationAudit('ERROR', 'note', sfNote.Id, null, { error: error.message });
      }
    }
  }

  return stats;
}

// ============================================================================
// VALIDATION & REPORTING
// ============================================================================

async function runValidation() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RUNNING VALIDATION CHECKS');
  console.log('══════════════════════════════════════════════════════════════');

  const issues = [];

  // Check for orphaned records (SF ID but no CRM data)
  const accountsWithSfId = await prisma.account.count({ where: { salesforceId: { not: null } } });
  const contactsWithSfId = await prisma.contact.count({ where: { salesforceId: { not: null } } });
  const leadsWithSfId = await prisma.lead.count({ where: { salesforceId: { not: null } } });
  const oppsWithSfId = await prisma.opportunity.count({ where: { salesforceId: { not: null } } });
  const workOrdersWithSfId = await prisma.workOrder.count({ where: { salesforceId: { not: null } } });
  const serviceApptsWithSfId = await prisma.serviceAppointment.count({ where: { salesforceId: { not: null } } });
  const quotesWithSfId = await prisma.quote.count({ where: { salesforceId: { not: null } } });
  const serviceContractsWithSfId = await prisma.serviceContract.count({ where: { salesforceId: { not: null } } });
  const invoicesWithSfId = await prisma.invoice.count({ where: { salesforceId: { not: null } } });
  const commissionsWithSfId = await prisma.commission.count({ where: { salesforceId: { not: null } } });
  const tasksWithSfId = await prisma.task.count({ where: { salesforceId: { not: null } } });
  const casesWithSfId = await prisma.case.count({ where: { salesforceId: { not: null } } });

  console.log(`\nRecords with Salesforce IDs:`);
  console.log(`  Accounts: ${accountsWithSfId}`);
  console.log(`  Contacts: ${contactsWithSfId}`);
  console.log(`  Leads: ${leadsWithSfId}`);
  console.log(`  Opportunities: ${oppsWithSfId}`);
  console.log(`  Work Orders: ${workOrdersWithSfId}`);
  console.log(`  Service Appointments: ${serviceApptsWithSfId}`);
  console.log(`  Quotes: ${quotesWithSfId}`);
  console.log(`  Service Contracts: ${serviceContractsWithSfId}`);
  console.log(`  Invoices: ${invoicesWithSfId}`);
  console.log(`  Commissions: ${commissionsWithSfId}`);
  console.log(`  Tasks: ${tasksWithSfId}`);
  console.log(`  Cases: ${casesWithSfId}`);

  // Check for duplicates
  const duplicateAccounts = await prisma.$queryRaw`
    SELECT salesforce_id, COUNT(*) as count
    FROM accounts
    WHERE salesforce_id IS NOT NULL
    GROUP BY salesforce_id
    HAVING COUNT(*) > 1
  `;
  if (duplicateAccounts.length > 0) {
    issues.push({ type: 'DUPLICATE', object: 'account', count: duplicateAccounts.length });
    console.log(`\n⚠️  Found ${duplicateAccounts.length} duplicate accounts by salesforce_id`);
  }

  const duplicateContacts = await prisma.$queryRaw`
    SELECT salesforce_id, COUNT(*) as count
    FROM contacts
    WHERE salesforce_id IS NOT NULL
    GROUP BY salesforce_id
    HAVING COUNT(*) > 1
  `;
  if (duplicateContacts.length > 0) {
    issues.push({ type: 'DUPLICATE', object: 'contact', count: duplicateContacts.length });
    console.log(`\n⚠️  Found ${duplicateContacts.length} duplicate contacts by salesforce_id`);
  }

  const duplicateLeads = await prisma.$queryRaw`
    SELECT salesforce_id, COUNT(*) as count
    FROM leads
    WHERE salesforce_id IS NOT NULL
    GROUP BY salesforce_id
    HAVING COUNT(*) > 1
  `;
  if (duplicateLeads.length > 0) {
    issues.push({ type: 'DUPLICATE', object: 'lead', count: duplicateLeads.length });
    console.log(`\n⚠️  Found ${duplicateLeads.length} duplicate leads by salesforce_id`);
  }

  const duplicateOpps = await prisma.$queryRaw`
    SELECT salesforce_id, COUNT(*) as count
    FROM opportunities
    WHERE salesforce_id IS NOT NULL
    GROUP BY salesforce_id
    HAVING COUNT(*) > 1
  `;
  if (duplicateOpps.length > 0) {
    issues.push({ type: 'DUPLICATE', object: 'opportunity', count: duplicateOpps.length });
    console.log(`\n⚠️  Found ${duplicateOpps.length} duplicate opportunities by salesforce_id`);
  }

  // Check for orphaned relationships
  const oppsWithoutAccount = await prisma.opportunity.count({
    where: { accountId: null, salesforceId: { not: null } }
  });
  if (oppsWithoutAccount > 0) {
    issues.push({ type: 'ORPHAN', object: 'opportunity', detail: 'missing accountId', count: oppsWithoutAccount });
    console.log(`\n⚠️  Found ${oppsWithoutAccount} opportunities without linked accounts`);
  }

  const contactsWithoutAccount = await prisma.contact.count({
    where: { accountId: null, salesforceId: { not: null } }
  });
  if (contactsWithoutAccount > 0) {
    issues.push({ type: 'ORPHAN', object: 'contact', detail: 'missing accountId', count: contactsWithoutAccount });
    console.log(`\n⚠️  Found ${contactsWithoutAccount} contacts without linked accounts`);
  }

  if (issues.length === 0) {
    console.log('\n✅ All validation checks passed!');
  } else {
    console.log(`\n❌ Found ${issues.length} validation issues`);
  }

  return issues;
}

async function generateReport() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('MIGRATION STATUS REPORT');
  console.log('══════════════════════════════════════════════════════════════');

  const totalAccounts = await prisma.account.count({ where: { deletedAt: null } });
  const accountsWithSf = await prisma.account.count({ where: { salesforceId: { not: null }, deletedAt: null } });

  const totalContacts = await prisma.contact.count({ where: { deletedAt: null } });
  const contactsWithSf = await prisma.contact.count({ where: { salesforceId: { not: null }, deletedAt: null } });

  const totalLeads = await prisma.lead.count({ where: { deleted_at: null } });
  const leadsWithSf = await prisma.lead.count({ where: { salesforceId: { not: null }, deleted_at: null } });

  const totalOpps = await prisma.opportunity.count({ where: { deletedAt: null } });
  const oppsWithSf = await prisma.opportunity.count({ where: { salesforceId: { not: null }, deletedAt: null } });

  const totalWorkOrders = await prisma.workOrder.count();
  const workOrdersWithSf = await prisma.workOrder.count({ where: { salesforceId: { not: null } } });

  const totalServiceAppts = await prisma.serviceAppointment.count();
  const serviceApptsWithSf = await prisma.serviceAppointment.count({ where: { salesforceId: { not: null } } });

  const totalQuotes = await prisma.quote.count();
  const quotesWithSf = await prisma.quote.count({ where: { salesforceId: { not: null } } });

  const totalServiceContracts = await prisma.serviceContract.count();
  const serviceContractsWithSf = await prisma.serviceContract.count({ where: { salesforceId: { not: null } } });

  const totalInvoices = await prisma.invoice.count();
  const invoicesWithSf = await prisma.invoice.count({ where: { salesforceId: { not: null } } });

  const totalCommissions = await prisma.commission.count();
  const commissionsWithSf = await prisma.commission.count({ where: { salesforceId: { not: null } } });

  const totalTasks = await prisma.task.count();
  const tasksWithSf = await prisma.task.count({ where: { salesforceId: { not: null } } });

  const totalCases = await prisma.case.count();
  const casesWithSf = await prisma.case.count({ where: { salesforceId: { not: null } } });

  const safePercent = (part, total) => total > 0 ? ((part/total)*100).toFixed(1) + '%' : '0.0%';

  console.log('\n┌──────────────────────────────────────────────────────────────────┐');
  console.log('│                         RECORD COUNTS                             │');
  console.log('├────────────────────┬────────────┬────────────┬────────────────────┤');
  console.log('│ Object             │ Total      │ With SF ID │ Coverage           │');
  console.log('├────────────────────┼────────────┼────────────┼────────────────────┤');
  console.log(`│ Accounts           │ ${String(totalAccounts).padStart(10)} │ ${String(accountsWithSf).padStart(10)} │ ${safePercent(accountsWithSf, totalAccounts).padStart(18)} │`);
  console.log(`│ Contacts           │ ${String(totalContacts).padStart(10)} │ ${String(contactsWithSf).padStart(10)} │ ${safePercent(contactsWithSf, totalContacts).padStart(18)} │`);
  console.log(`│ Leads              │ ${String(totalLeads).padStart(10)} │ ${String(leadsWithSf).padStart(10)} │ ${safePercent(leadsWithSf, totalLeads).padStart(18)} │`);
  console.log(`│ Opportunities      │ ${String(totalOpps).padStart(10)} │ ${String(oppsWithSf).padStart(10)} │ ${safePercent(oppsWithSf, totalOpps).padStart(18)} │`);
  console.log(`│ Work Orders        │ ${String(totalWorkOrders).padStart(10)} │ ${String(workOrdersWithSf).padStart(10)} │ ${safePercent(workOrdersWithSf, totalWorkOrders).padStart(18)} │`);
  console.log(`│ Service Appts      │ ${String(totalServiceAppts).padStart(10)} │ ${String(serviceApptsWithSf).padStart(10)} │ ${safePercent(serviceApptsWithSf, totalServiceAppts).padStart(18)} │`);
  console.log(`│ Quotes             │ ${String(totalQuotes).padStart(10)} │ ${String(quotesWithSf).padStart(10)} │ ${safePercent(quotesWithSf, totalQuotes).padStart(18)} │`);
  console.log(`│ Service Contracts  │ ${String(totalServiceContracts).padStart(10)} │ ${String(serviceContractsWithSf).padStart(10)} │ ${safePercent(serviceContractsWithSf, totalServiceContracts).padStart(18)} │`);
  console.log(`│ Invoices           │ ${String(totalInvoices).padStart(10)} │ ${String(invoicesWithSf).padStart(10)} │ ${safePercent(invoicesWithSf, totalInvoices).padStart(18)} │`);
  console.log(`│ Commissions        │ ${String(totalCommissions).padStart(10)} │ ${String(commissionsWithSf).padStart(10)} │ ${safePercent(commissionsWithSf, totalCommissions).padStart(18)} │`);
  console.log(`│ Tasks              │ ${String(totalTasks).padStart(10)} │ ${String(tasksWithSf).padStart(10)} │ ${safePercent(tasksWithSf, totalTasks).padStart(18)} │`);
  console.log(`│ Cases              │ ${String(totalCases).padStart(10)} │ ${String(casesWithSf).padStart(10)} │ ${safePercent(casesWithSf, totalCases).padStart(18)} │`);
  console.log('└────────────────────┴────────────┴────────────┴────────────────────┘');
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     RECONCILIATION-FIRST SALESFORCE → CRM MIGRATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Migration Run ID: ${CONFIG.migrationRunId}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`Objects: ${OBJECTS_TO_SYNC.join(', ')}`);
  console.log(`Started: ${new Date().toISOString()}`);

  if (REPORT_ONLY) {
    await generateReport();
    await runValidation();
    await prisma.$disconnect();
    return;
  }

  if (VALIDATE_ONLY) {
    await runValidation();
    await prisma.$disconnect();
    return;
  }

  const startTime = Date.now();
  const resolver = new IdentityResolver();
  const allStats = {};

  // Create migration run record for tracking
  await createMigrationRun();

  try {
    // Connect to Salesforce
    const sfConn = await getSalesforceConnection();

    // Run reconciliation for each object type
    if (OBJECTS_TO_SYNC.includes('accounts')) {
      allStats.accounts = await reconcileAccounts(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('contacts')) {
      allStats.contacts = await reconcileContacts(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('leads')) {
      allStats.leads = await reconcileLeads(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('opportunities')) {
      allStats.opportunities = await reconcileOpportunities(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('workorders')) {
      allStats.workorders = await reconcileWorkOrders(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('serviceappointments')) {
      allStats.serviceappointments = await reconcileServiceAppointments(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('quotes')) {
      allStats.quotes = await reconcileQuotes(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('servicecontracts')) {
      allStats.servicecontracts = await reconcileServiceContracts(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('invoices')) {
      allStats.invoices = await reconcileInvoices(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('commissions')) {
      allStats.commissions = await reconcileCommissions(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('tasks')) {
      allStats.tasks = await reconcileTasks(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('cases')) {
      allStats.cases = await reconcileCases(sfConn, resolver);
    }

    // Phase 3: Activities, Chatter, Emails, Notes
    if (OBJECTS_TO_SYNC.includes('activities')) {
      allStats.activities = await reconcileActivities(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('chatter')) {
      allStats.chatter = await reconcileChatterPosts(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('emails')) {
      allStats.emails = await reconcileEmailMessages(sfConn, resolver);
    }

    if (OBJECTS_TO_SYNC.includes('notes')) {
      allStats.notes = await reconcileNotes(sfConn, resolver);
    }

    // Print summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                     MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Duration: ${duration}s`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);

    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│                              RESULTS                                     │');
    console.log('├──────────────────┬─────────┬─────────┬─────────┬─────────┬──────────────┤');
    console.log('│ Object           │ Matched │ Updated │ Created │ Skipped │ Errors       │');
    console.log('├──────────────────┼─────────┼─────────┼─────────┼─────────┼──────────────┤');

    for (const [obj, stats] of Object.entries(allStats)) {
      console.log(`│ ${obj.padEnd(16)} │ ${String(stats.matched).padStart(7)} │ ${String(stats.updated).padStart(7)} │ ${String(stats.created).padStart(7)} │ ${String(stats.skipped).padStart(7)} │ ${String(stats.errors).padStart(12)} │`);
    }
    console.log('└──────────────────┴─────────┴─────────┴─────────┴─────────┴──────────────┘');

    // Print identity resolution stats
    const matchStats = resolver.getStats();
    console.log('\n┌─────────────────────────────────────────────────────────────────────────┐');
    console.log('│                     IDENTITY RESOLUTION STATS                            │');
    console.log('├─────────────────────────────────────────────────────────────────────────┤');
    console.log(`│ External ID matches:    ${String(matchStats.externalId).padStart(10)}                                  │`);
    console.log(`│ Natural Key matches:    ${String(matchStats.naturalKey).padStart(10)}                                  │`);
    console.log(`│ Composite Key matches:  ${String(matchStats.compositeKey).padStart(10)}                                  │`);
    console.log(`│ Fuzzy matches:          ${String(matchStats.fuzzyMatch).padStart(10)}                                  │`);
    console.log(`│ No match (created):     ${String(matchStats.noMatch).padStart(10)}                                  │`);
    console.log('└─────────────────────────────────────────────────────────────────────────┘');

    // Print records requiring review
    let totalRequiresReview = 0;
    for (const [obj, stats] of Object.entries(allStats)) {
      if (stats.requiresReview && stats.requiresReview.length > 0) {
        totalRequiresReview += stats.requiresReview.length;
        console.log(`\n⚠️  ${stats.requiresReview.length} ${obj} records require manual review:`);
        for (const item of stats.requiresReview.slice(0, 10)) {
          console.log(`   SF: ${item.salesforceId} "${item.salesforceName}" → CRM: ${item.crmId} "${item.crmName}" (${(item.confidence * 100).toFixed(0)}% ${item.matchType})`);
        }
        if (stats.requiresReview.length > 10) {
          console.log(`   ... and ${stats.requiresReview.length - 10} more`);
        }
      }
    }

    if (totalRequiresReview > 0) {
      console.log(`\n⚠️  Total records requiring manual review: ${totalRequiresReview}`);
    }

    // Update migration run record with final stats
    const aggregateStats = {
      total: Object.values(allStats).reduce((sum, s) => sum + (s.matched || 0) + (s.created || 0) + (s.skipped || 0) + (s.errors || 0), 0),
      matched: Object.values(allStats).reduce((sum, s) => sum + (s.matched || 0), 0),
      created: Object.values(allStats).reduce((sum, s) => sum + (s.created || 0), 0),
      updated: Object.values(allStats).reduce((sum, s) => sum + (s.updated || 0), 0),
      skipped: Object.values(allStats).reduce((sum, s) => sum + (s.skipped || 0), 0),
      errors: Object.values(allStats).reduce((sum, s) => sum + (s.errors || 0), 0),
    };
    await updateMigrationRun(aggregateStats, 'COMPLETED');

    // Run validation
    await runValidation();

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    // Update migration run as failed
    await updateMigrationRun({ errors: 1, errorDetails: { message: error.message, stack: error.stack } }, 'FAILED');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
