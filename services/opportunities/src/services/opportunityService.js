// Opportunity Service - Business Logic Layer
// Replicates SalesLeaderOpportunityDetailController.cls and related controllers
// This is the HUB - Opportunity is the central object in Panda CRM
import { PrismaClient, Prisma } from '@prisma/client';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// S3 client for pre-signed URLs
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const S3_BUCKET = process.env.S3_BUCKET || 'pandasign-documents';

// SES client for email notifications
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'notifications@pandaexteriors.com';
const CRM_BASE_URL = (process.env.CRM_BASE_URL || process.env.FRONTEND_URL || 'https://crm.pandaadmin.com').replace(/\/+$/, '');
const BAMBOOGLI_SERVICE_URL = process.env.BAMBOOGLI_SERVICE_URL || 'http://localhost:3012';

function toAbsoluteCrmUrl(actionPath = '/') {
  if (typeof actionPath === 'string' && /^https?:\/\//i.test(actionPath)) {
    return actionPath;
  }
  const normalizedPath = String(actionPath || '/').startsWith('/') ? String(actionPath) : `/${String(actionPath)}`;
  return `${CRM_BASE_URL}${normalizedPath}`;
}

const DISPOSITION_CATEGORIES = {
  INSPECTION_NOT_COMPLETED: 'INSPECTION_NOT_COMPLETED',
  RESCHEDULED: 'RESCHEDULED',
  FOLLOW_UP_SCHEDULED: 'FOLLOW_UP_SCHEDULED',
  INSURANCE_CLAIM_FILED: 'INSURANCE_CLAIM_FILED',
  INSURANCE_NO_CLAIM: 'INSURANCE_NO_CLAIM',
  RETAIL_SOLD: 'RETAIL_SOLD',
  RETAIL_NOT_SOLD: 'RETAIL_NOT_SOLD',
};

const DISPOSITION_STAGE_MAP = {
  INSPECTION_NOT_COMPLETED: 'SCHEDULED',
  RESCHEDULED: 'SCHEDULED',
  FOLLOW_UP_SCHEDULED: 'SCHEDULED',
  INSURANCE_CLAIM_FILED: 'CLAIM_FILED',
  INSURANCE_NO_CLAIM: 'INSPECTED',
  RETAIL_SOLD: 'CONTRACT_SIGNED',
  RETAIL_NOT_SOLD: 'CLOSED_LOST',
};

const INTERNAL_COMMENT_TITLE_PREFIX = 'INTERNAL_COMMENT|';

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasOwnField(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

const OPTIONAL_OPPORTUNITY_CLAIM_FIELDS = new Set([
  'stageName',
  'claimNumber',
  'claimFiledDate',
  'insuranceCarrier',
  'adjusterName',
  'adjusterEmail',
  'adjusterOfficePhone',
  'fieldAdjusterMobile',
  'damageLocation',
  'dateOfLoss',
]);

const OPTIONAL_OPPORTUNITY_INCLUDE_FIELDS = new Set([
  'projectManager',
]);

const CLAIM_FALLBACK_FIELD_TO_COLUMN = {
  claimNumber: 'claim_number',
  claimFiledDate: 'claim_filed_date',
  insuranceCarrier: 'insurance_carrier',
  adjusterName: 'adjuster_name',
  adjusterEmail: 'adjuster_email',
  adjusterOfficePhone: 'adjuster_office_phone',
  fieldAdjusterMobile: 'field_adjuster_mobile',
  damageLocation: 'damage_location',
  dateOfLoss: 'date_of_loss',
};

function parseUnknownPrismaFieldName(error) {
  const message = error?.message || '';
  const unknownFieldMatch = message.match(/Unknown (?:field|argument) `([^`]+)`/);
  if (unknownFieldMatch?.[1]) {
    return unknownFieldMatch[1];
  }

  const missingColumnMatch = message.match(/column [^\"]*\"([^\"]+)\" does not exist/i);
  const missingColumn = missingColumnMatch?.[1];
  if (!missingColumn) return null;

  const normalized = String(missingColumn).trim().toLowerCase();
  const byColumnName = {
    stage_name: 'stageName',
    claim_number: 'claimNumber',
    claim_filed_date: 'claimFiledDate',
    insurance_carrier: 'insuranceCarrier',
    adjuster_name: 'adjusterName',
    adjuster_email: 'adjusterEmail',
    adjuster_office_phone: 'adjusterOfficePhone',
    field_adjuster_mobile: 'fieldAdjusterMobile',
    damage_location: 'damageLocation',
    date_of_loss: 'dateOfLoss',
  };

  return byColumnName[normalized] || null;
}

function normalizeClaimFallbackValue(fieldName, value) {
  if (fieldName === 'claimFiledDate' || fieldName === 'dateOfLoss') {
    return parseDate(value);
  }
  return value == null ? null : String(value);
}

async function applyClaimRawFallback(opportunityId, sourceData, candidateFields = []) {
  const requestedFields = candidateFields
    .filter((field) => CLAIM_FALLBACK_FIELD_TO_COLUMN[field] && hasOwnField(sourceData, field));

  if (!opportunityId || requestedFields.length === 0) {
    return;
  }

  const requestedColumns = requestedFields.map((field) => CLAIM_FALLBACK_FIELD_TO_COLUMN[field]);
  const availableRows = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'opportunities'
      AND column_name IN (${Prisma.join(requestedColumns)})
  `;
  const availableColumns = new Set((availableRows || []).map((row) => row.column_name));

  const assignments = [];
  const values = [];
  let placeholderIndex = 1;

  for (const field of requestedFields) {
    const column = CLAIM_FALLBACK_FIELD_TO_COLUMN[field];
    if (!availableColumns.has(column)) continue;
    assignments.push(`"${column}" = $${placeholderIndex}`);
    values.push(normalizeClaimFallbackValue(field, sourceData[field]));
    placeholderIndex += 1;
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push(`"updated_at" = NOW()`);
  const sql = `UPDATE "opportunities" SET ${assignments.join(', ')} WHERE "id" = $${placeholderIndex}`;
  await prisma.$executeRawUnsafe(sql, ...values, opportunityId);
}

async function hydrateClaimFallbackFromRaw(opportunityId, opportunity) {
  if (!opportunityId || !opportunity) return opportunity;

  const fields = Object.keys(CLAIM_FALLBACK_FIELD_TO_COLUMN);
  const needsFallback = fields.some((field) => typeof opportunity[field] === 'undefined');
  if (!needsFallback) {
    return opportunity;
  }

  const rows = await prisma.$queryRaw`
    SELECT
      claim_number,
      claim_filed_date,
      insurance_carrier,
      adjuster_name,
      adjuster_email,
      adjuster_office_phone,
      field_adjuster_mobile,
      damage_location,
      date_of_loss
    FROM opportunities
    WHERE id = ${opportunityId}
    LIMIT 1
  `;

  const row = rows?.[0];
  if (!row) return opportunity;

  return {
    ...opportunity,
    claimNumber: opportunity.claimNumber ?? row.claim_number ?? null,
    claimFiledDate: opportunity.claimFiledDate ?? row.claim_filed_date ?? null,
    insuranceCarrier: opportunity.insuranceCarrier ?? row.insurance_carrier ?? null,
    adjusterName: opportunity.adjusterName ?? row.adjuster_name ?? null,
    adjusterEmail: opportunity.adjusterEmail ?? row.adjuster_email ?? null,
    adjusterOfficePhone: opportunity.adjusterOfficePhone ?? row.adjuster_office_phone ?? null,
    fieldAdjusterMobile: opportunity.fieldAdjusterMobile ?? row.field_adjuster_mobile ?? null,
    damageLocation: opportunity.damageLocation ?? row.damage_location ?? null,
    dateOfLoss: opportunity.dateOfLoss ?? row.date_of_loss ?? null,
  };
}

function parseBooleanFlag(value) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return false;
}

function normalizeEntityId(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === 'object') {
    const candidates = [value.id, value.userId, value.ownerId, value.newOwnerId, value.value, value.key];
    for (const candidate of candidates) {
      const normalized = normalizeEntityId(candidate);
      if (normalized) return normalized;
    }
  }
  return null;
}

function normalizeDepartmentTag(value) {
  const normalized = String(value || 'general')
    .trim()
    .toLowerCase()
    .replace(/\|/g, '')
    .replace(/\s+/g, '_');
  return normalized || 'general';
}

function toInternalCommentTitle(departmentTag = 'general', isResolved = false) {
  return `${INTERNAL_COMMENT_TITLE_PREFIX}${normalizeDepartmentTag(departmentTag)}|${isResolved ? '1' : '0'}`;
}

function parseInternalCommentTitle(title) {
  if (typeof title !== 'string' || !title.startsWith(INTERNAL_COMMENT_TITLE_PREFIX)) {
    return null;
  }

  const remainder = title.slice(INTERNAL_COMMENT_TITLE_PREFIX.length);
  const [departmentTagRaw = 'general', resolvedRaw = '0'] = remainder.split('|');
  return {
    departmentTag: normalizeDepartmentTag(departmentTagRaw),
    isResolved: resolvedRaw === '1' || String(resolvedRaw).toLowerCase() === 'true',
  };
}

function extractMentionUserId(mention) {
  if (!mention) return null;
  if (typeof mention === 'string') return mention;
  return mention.userId || mention.id || null;
}

function formatTransferCounts(counts = {}) {
  const labels = {
    tasks: 'tasks',
    events: 'events',
    commissions: 'commissions',
    serviceContracts: 'service contracts',
    photoProjects: 'photo projects',
    opportunityAttentionItems: 'job attention items',
    caseAttentionItems: 'case attention items',
    appointmentAssignments: 'appointment assignments',
  };

  return Object.entries(labels)
    .filter(([key]) => Number(counts[key] || 0) > 0)
    .map(([key, label]) => `${counts[key]} ${label}`)
    .join(', ');
}

function validateAppointmentResultPayload(payload = {}) {
  const errors = [];
  const category = payload.dispositionCategory;

  if (!category || !Object.values(DISPOSITION_CATEGORIES).includes(category)) {
    errors.push({ field: 'dispositionCategory', message: 'Valid dispositionCategory is required' });
  }

  if (
    (category === DISPOSITION_CATEGORIES.RESCHEDULED || category === DISPOSITION_CATEGORIES.FOLLOW_UP_SCHEDULED)
    && !payload.followUpAt
  ) {
    errors.push({ field: 'followUpAt', message: 'Follow-up date is required' });
  }

  if (category === DISPOSITION_CATEGORIES.INSPECTION_NOT_COMPLETED && !payload.dispositionReason) {
    errors.push({ field: 'dispositionReason', message: 'Reason is required for inspection not completed' });
  }

  if (category === DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM && !payload.dispositionReason) {
    errors.push({ field: 'dispositionReason', message: 'Reason is required for no claim filed' });
  }

  if (category === DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD && !payload.dispositionReason) {
    errors.push({ field: 'dispositionReason', message: 'Reason is required for retail not sold' });
  }

  if (category === DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED) {
    const hasClaimInfo = payload.insuranceCompany || payload.claimNumber;
    if (!hasClaimInfo) {
      errors.push({ field: 'claimNumber', message: 'Claim number or insurance company is required' });
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate a pre-signed URL for an S3 document
 * @param {string} s3Url - The S3 URL or path
 * @param {number} expiresIn - URL expiry time in seconds (default: 1 hour)
 * @returns {Promise<string>} Pre-signed URL
 */
async function getPresignedUrl(s3Url, expiresIn = 3600) {
  if (!s3Url) return null;

  try {
    // Extract the key from the S3 URL
    // URL format: https://bucket.s3.region.amazonaws.com/key or s3://bucket/key
    let key;
    if (s3Url.startsWith('s3://')) {
      key = s3Url.replace(`s3://${S3_BUCKET}/`, '');
    } else if (s3Url.includes('.s3.')) {
      // https://bucket.s3.region.amazonaws.com/encoded-key
      const url = new URL(s3Url);
      key = decodeURIComponent(url.pathname.slice(1));
    } else {
      // Already just a key
      key = s3Url;
    }

    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    logger.error(`Error generating pre-signed URL for ${s3Url}:`, error);
    return null;
  }
}

// Lazy-load insurance triggers to avoid circular dependencies
let insuranceTriggers = null;
async function getInsuranceTriggers() {
  if (!insuranceTriggers) {
    try {
      // Import from workflows service - in production this would be via HTTP or message queue
      const WORKFLOWS_SERVICE_URL =
        process.env.WORKFLOWS_SERVICE_URL || 'http://localhost:3008';

      insuranceTriggers = {
        async evaluateInsuranceTriggers(opportunityId, changes, userId) {
          try {
            const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/insurance/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ opportunityId, changes, userId }),
            });
            if (!response.ok) {
              logger.warn(`Insurance triggers returned ${response.status}`);
              return [];
            }
            const data = await response.json();
            return data.results || [];
          } catch (error) {
            logger.warn('Insurance triggers service unavailable:', error.message);
            return [];
          }
        },
      };
    } catch (error) {
      logger.warn('Failed to initialize insurance triggers:', error.message);
      insuranceTriggers = {
        evaluateInsuranceTriggers: async () => [],
      };
    }
  }
  return insuranceTriggers;
}

// Lazy-load expediting triggers to avoid circular dependencies
let expeditingTriggers = null;
async function getExpeditingTriggers() {
  if (!expeditingTriggers) {
    try {
      const WORKFLOWS_SERVICE_URL =
        process.env.WORKFLOWS_SERVICE_URL || 'http://localhost:3008';

      expeditingTriggers = {
        async evaluateExpeditingTriggers(opportunityId, changes, previousValues, userId) {
          try {
            const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/expediting/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ opportunityId, changes, previousValues, userId }),
            });
            if (!response.ok) {
              logger.warn(`Expediting triggers returned ${response.status}`);
              return {};
            }
            const data = await response.json();
            return data.data?.results || {};
          } catch (error) {
            logger.warn('Expediting triggers service unavailable:', error.message);
            return {};
          }
        },
      };
    } catch (error) {
      logger.warn('Failed to initialize expediting triggers:', error.message);
      expeditingTriggers = {
        evaluateExpeditingTriggers: async () => ({}),
      };
    }
  }
  return expeditingTriggers;
}

// Job ID starting number (first job ID will be YYYY-1000)
const JOB_ID_STARTING_NUMBER = 999;

// Lazy-load notification service to avoid circular dependencies
let notificationService = null;
async function getNotificationService() {
  if (!notificationService) {
    try {
      // The notification service runs on a separate port - call via HTTP
      // In production, this would be an internal service mesh call
      const NOTIFICATION_SERVICE_URL =
        process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3011';
      notificationService = {
        // Wrap notification methods to call via HTTP
        async notifyAppointmentBooked(inspectorId, appointment, opportunity, options) {
          return this._sendNotification('appointment-booked', {
            inspectorId,
            appointment,
            opportunity,
            options,
          });
        },
        async notifyAppointmentRescheduled(
          inspectorId,
          appointment,
          opportunity,
          previousTimes,
          options
        ) {
          return this._sendNotification('appointment-rescheduled', {
            inspectorId,
            appointment,
            opportunity,
            previousTimes,
            options,
          });
        },
        async notifyAppointmentCancelled(inspectorId, appointment, opportunity, reason, options) {
          return this._sendNotification('appointment-cancelled', {
            inspectorId,
            appointment,
            opportunity,
            reason,
            options,
          });
        },
        async getInspectorsForNotification(options) {
          try {
            const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/inspectors/for-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(options),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.inspectorIds || [];
          } catch (error) {
            logger.warn('Could not get inspectors for notification:', error.message);
            return [];
          }
        },
        async _sendNotification(type, payload) {
          try {
            const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notifications/appointment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, ...payload }),
            });
            if (!response.ok) {
              logger.warn(`Notification service returned ${response.status}`);
            }
            return response.ok;
          } catch (error) {
            // Log but don't fail the main operation if notifications fail
            logger.warn('Notification service unavailable:', error.message);
            return false;
          }
        },
      };
    } catch (error) {
      logger.warn('Failed to initialize notification service:', error.message);
      // Return a no-op service
      notificationService = {
        notifyAppointmentBooked: async () => false,
        notifyAppointmentRescheduled: async () => false,
        notifyAppointmentCancelled: async () => false,
        getInspectorsForNotification: async () => [],
      };
    }
  }
  return notificationService;
}

class OpportunityService {
  async resolveActorUserId(actor = null) {
    if (!actor) return null;

    const idCandidates = [
      actor.id,
      actor.userId,
      actor.sub,
      actor.username,
    ].filter(Boolean);

    for (const candidate of idCandidates) {
      const found = await prisma.user.findUnique({
        where: { id: String(candidate) },
        select: { id: true },
      });
      if (found?.id) return found.id;

      const foundByCognito = await prisma.user.findFirst({
        where: { cognitoId: String(candidate) },
        select: { id: true },
      });
      if (foundByCognito?.id) return foundByCognito.id;
    }

    if (actor.email) {
      const rawEmail = String(actor.email).trim().toLowerCase();
      const emailCandidates = new Set([rawEmail]);
      const [local = '', domain = ''] = rawEmail.split('@');
      if (local && domain) {
        // Keep fallback conservative to avoid mis-attribution.
        emailCandidates.add(`${local}@${domain.replace('panda-exteriors.com', 'pandaexteriors.com')}`);
        emailCandidates.add(`${local}@${domain.replace('pandaexteriors.com', 'panda-exteriors.com')}`);
      }

      for (const email of emailCandidates) {
        const foundByEmail = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
          select: { id: true },
        });
        if (foundByEmail?.id) return foundByEmail.id;
      }

      // Final fallback: match email local-part ignoring punctuation only when unique.
      if (local && domain) {
        const normalizedLocal = local.replace(/[._-]/g, '');
        const domainCandidates = new Set([
          domain,
          domain.replace('panda-exteriors.com', 'pandaexteriors.com'),
          domain.replace('pandaexteriors.com', 'panda-exteriors.com'),
        ]);

        for (const domainCandidate of domainCandidates) {
          const possibleUsers = await prisma.user.findMany({
            where: {
              email: {
                endsWith: `@${domainCandidate}`,
                mode: 'insensitive',
              },
            },
            select: { id: true, email: true },
            take: 25,
          });

          const normalizedMatches = possibleUsers.filter((candidate) => {
            const [candidateLocal = ''] = String(candidate.email || '').toLowerCase().split('@');
            return candidateLocal.replace(/[._-]/g, '') === normalizedLocal;
          });

          if (normalizedMatches.length === 1) {
            return normalizedMatches[0].id;
          }
        }
      }
    }

    return null;
  }

  /**
   * Get opportunities with filtering and pagination
   * Replicates: SalesLeaderOpportunityListController.getOpportunities()
   */
  async getOpportunities(options = {}) {
    const {
      page = 1,
      limit = 50,
      stage,
      type,
      ownerId,
      ownerIds = [], // Support multiple owner IDs for team filtering
      ownerFilter,
      accountId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      currentUserId,
      closeDateFrom,
      closeDateTo,
      invoiceStatus, // Filter by invoice workflow status (NOT_READY, READY, INVOICED, etc.)
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause - always exclude soft-deleted records
    const where = {
      deletedAt: null, // Only show non-deleted records
    };

    if (stage && stage !== 'all') {
      where.stage = stage;
    }

    if (type && type !== 'all') {
      where.type = type;
    }

    // Handle owner filtering with support for multiple owners (team view)
    if (ownerIds && ownerIds.length > 0) {
      // Multiple owner IDs provided (team filtering)
      where.ownerId = { in: ownerIds };
    } else if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (accountId) {
      where.accountId = accountId;
    }

    // Close date range filtering
    if (closeDateFrom || closeDateTo) {
      where.closeDate = {};
      if (closeDateFrom) {
        where.closeDate.gte = new Date(closeDateFrom);
      }
      if (closeDateTo) {
        where.closeDate.lte = new Date(closeDateTo);
      }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Invoice workflow status filter (for Finance team "Invoice Ready" view)
    if (invoiceStatus && invoiceStatus !== 'all') {
      where.invoiceStatus = invoiceStatus;
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          account: {
            select: { id: true, name: true, billingCity: true, billingState: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { quotes: true, workOrders: true },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    // Transform to wrappers
    const wrappers = opportunities.map((opp) => this.createOpportunityWrapper(opp));

    return {
      data: wrappers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get opportunity details (the HUB view)
   * Replicates: getOpportunityDetails()
   */
  async getOpportunityDetails(id) {
    try {
      console.log(`[getOpportunityDetails] Fetching opportunity: ${id}`);
      const opportunity = await prisma.opportunity.findUnique({
        where: { id },
        include: {
          account: true,
          contact: true,
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          projectManager: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobilePhone: true },
          },
          lineItems: {
            orderBy: { sortOrder: 'asc' },
            include: { product: true },
          },
          quotes: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              lineItems: {
                include: { product: true },
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          serviceContract: true,
          commissions: {
            include: {
              owner: { select: { firstName: true, lastName: true } },
            },
          },
          notes: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: {
              createdBy: { select: { firstName: true, lastName: true } },
            },
          },
          tasks: {
            orderBy: { dueDate: 'asc' },
            include: {
              assignedTo: { select: { firstName: true, lastName: true } },
            },
          },
          measurementReports: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
              orderedBy: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!opportunity) {
        console.log(`[getOpportunityDetails] Opportunity not found: ${id}`);
        const error = new Error(`Opportunity not found: ${id}`);
        error.name = 'NotFoundError';
        throw error;
      }

      console.log(`[getOpportunityDetails] Found opportunity: ${opportunity.name}`);
      const hydratedOpportunity = await hydrateClaimFallbackFromRaw(id, opportunity);
      const wrapper = this.createOpportunityWrapper(hydratedOpportunity, true);
      console.log(`[getOpportunityDetails] Wrapper created successfully`);
      return wrapper;
    } catch (error) {
      console.error(`[getOpportunityDetails] ERROR for ${id}:`, {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack,
        meta: error.meta,
      });
      throw error;
    }
  }

  /**
   * Get work orders and service appointments for the opportunity
   * Replicates: getOpportunityWorkOrders()
   */
  async getOpportunityWorkOrders(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { accountId: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const workOrders = await prisma.workOrder.findMany({
      where: {
        OR: [
          { opportunityId: id },
          { accountId: opportunity.accountId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        workType: true,
        territory: true,
        serviceAppointments: {
          orderBy: { scheduledStart: 'asc' },
          include: {
            assignedResources: {
              include: {
                serviceResource: true,
              },
            },
          },
        },
      },
    });

    return workOrders.map((wo) => ({
      id: wo.id,
      workOrderNumber: wo.workOrderNumber,
      subject: wo.subject,
      status: wo.status,
      priority: wo.priority,
      description: wo.description,
      startDate: wo.startDate,
      endDate: wo.endDate,
      workTypeName: wo.workType?.name,
      territoryName: wo.territory?.name,
      createdAt: wo.createdAt,
      serviceAppointments: wo.serviceAppointments.map((sa) => ({
        id: sa.id,
        appointmentNumber: sa.appointmentNumber,
        status: sa.status,
        scheduledStart: sa.scheduledStart,
        scheduledEnd: sa.scheduledEnd,
        actualStart: sa.actualStart,
        actualEnd: sa.actualEnd,
        duration: sa.duration,
        assignedResources: sa.assignedResources.map((ar) => ({
          id: ar.serviceResource.id,
          name: ar.serviceResource.name,
          isPrimary: ar.isPrimaryResource,
        })),
      })),
    }));
  }

  /**
   * Get quotes for the opportunity
   * Replicates: getOpportunityQuotes()
   */
  async getOpportunityQuotes(id) {
    const quotes = await prisma.quote.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        lineItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return quotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      name: q.name,
      status: q.status,
      total: q.total,
      subtotal: q.subtotal,
      discount: q.discount,
      tax: q.tax,
      expirationDate: q.expirationDate,
      isPmQuote: q.isPmQuote,
      createdAt: q.createdAt,
      lineItems: q.lineItems.map((li) => ({
        id: li.id,
        productName: li.product?.name,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
      })),
    }));
  }

  /**
   * Get contacts for the opportunity
   */
  async getOpportunityContacts(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { contactId: true, accountId: true },
    });

    if (!opportunity) return [];

    const contacts = await prisma.contact.findMany({
      where: { accountId: opportunity.accountId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.fullName || `${c.firstName} ${c.lastName}`,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      mobilePhone: c.mobilePhone,
      title: c.title,
      isPrimary: c.isPrimary,
      isPrimaryContact: c.id === opportunity.contactId,
      // Address fields for Google Maps link
      mailingStreet: c.mailingStreet,
      mailingCity: c.mailingCity,
      mailingState: c.mailingState,
      mailingPostalCode: c.mailingPostalCode,
    }));
  }

  /**
   * Generate a customer portal link for an opportunity.
   * Kept lightweight and non-destructive: no schema writes required.
   */
  async generatePortalLink(id, options = {}) {
    const opportunityId = normalizeEntityId(id);
    if (!opportunityId) {
      const error = new Error('Opportunity ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: {
        id: true,
        jobId: true,
        accountId: true,
        account: {
          select: { id: true, name: true },
        },
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const expiresInDaysRaw = Number(options?.expiresInDays);
    const expiresInDays = Number.isFinite(expiresInDaysRaw) && expiresInDaysRaw > 0
      ? Math.min(Math.trunc(expiresInDaysRaw), 365)
      : 30;

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + expiresInDays);

    // Use stable identifiers only; this avoids creating fragile state while keeping the
    // portal-link endpoint available for invoice/send flows.
    const portalToken = (opportunity.jobId || opportunity.id || '').trim();
    const encodedToken = encodeURIComponent(portalToken);
    const baseUrl = (
      process.env.CRM_BASE_URL
      || process.env.FRONTEND_URL
      || CRM_BASE_URL
      || 'https://crm.pandaadmin.com'
    ).replace(/\/+$/, '');
    const portalUrl = `${baseUrl}/portal/${encodedToken}`;

    return {
      opportunityId: opportunity.id,
      jobId: opportunity.jobId || null,
      accountId: opportunity.accountId || null,
      accountName: opportunity.account?.name || null,
      token: portalToken,
      expiresAt: expiresAt.toISOString(),
      portalUrl,
      portalLink: portalUrl,
      url: portalUrl,
      link: portalUrl,
    };
  }

  async resolveOpportunityByPortalToken(token) {
    const rawToken = typeof token === 'string' ? decodeURIComponent(token).trim() : '';
    if (!rawToken) {
      const error = new Error('Portal token is required');
      error.name = 'ValidationError';
      throw error;
    }

    const include = {
      account: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          billingStreet: true,
          billingCity: true,
          billingState: true,
          billingPostalCode: true,
        },
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          fullName: true,
          phone: true,
          mobilePhone: true,
          email: true,
        },
      },
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          mobilePhone: true,
        },
      },
      projectManager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          mobilePhone: true,
        },
      },
    };

    let opportunity = await prisma.opportunity.findFirst({
      where: { jobId: rawToken, deletedAt: null },
      include,
    });

    if (!opportunity) {
      opportunity = await prisma.opportunity.findFirst({
        where: { id: rawToken, deletedAt: null },
        include,
      });
    }

    if (!opportunity) {
      const error = new Error('Invalid portal link');
      error.name = 'NotFoundError';
      throw error;
    }

    return { token: rawToken, opportunity };
  }

  async getCustomerPortalProject(token) {
    const { token: resolvedToken, opportunity } = await this.resolveOpportunityByPortalToken(token);

    const contactName = opportunity.contact?.fullName
      || `${opportunity.contact?.firstName || ''} ${opportunity.contact?.lastName || ''}`.trim()
      || opportunity.account?.name
      || opportunity.name;

    const contactPhone = opportunity.contact?.phone || opportunity.contact?.mobilePhone || opportunity.account?.phone || null;
    const contactEmail = opportunity.contact?.email || opportunity.account?.email || null;

    const manager = opportunity.projectManager || opportunity.owner || null;

    const stageOrder = [
      'LEAD_UNASSIGNED',
      'LEAD_ASSIGNED',
      'SCHEDULED',
      'INSPECTED',
      'CLAIM_FILED',
      'APPROVED',
      'CONTRACT_SIGNED',
      'IN_PRODUCTION',
      'COMPLETED',
    ];
    const currentIndex = Math.max(stageOrder.indexOf(opportunity.stage), 0);
    const progressPercent = Math.round(((currentIndex + 1) / stageOrder.length) * 100);

    return {
      token: resolvedToken,
      project: {
        id: opportunity.id,
        jobId: opportunity.jobId,
        name: opportunity.name,
        stage: opportunity.stage,
        status: opportunity.status,
        installDate: opportunity.appointmentDate || null,
        street: opportunity.street || opportunity.account?.billingStreet || null,
        city: opportunity.city || opportunity.account?.billingCity || null,
        state: opportunity.state || opportunity.account?.billingState || null,
        postalCode: opportunity.postalCode || opportunity.account?.billingPostalCode || null,
        address: {
          street: opportunity.street || opportunity.account?.billingStreet || null,
          city: opportunity.city || opportunity.account?.billingCity || null,
          state: opportunity.state || opportunity.account?.billingState || null,
          postalCode: opportunity.postalCode || opportunity.account?.billingPostalCode || null,
        },
        accountName: opportunity.account?.name || contactName,
        accountPhone: contactPhone,
        accountEmail: contactEmail,
      },
      contact: {
        name: contactName,
        phone: contactPhone,
        email: contactEmail,
      },
      projectManager: manager
        ? {
            id: manager.id,
            firstName: manager.firstName || null,
            lastName: manager.lastName || null,
            name: `${manager.firstName || ''} ${manager.lastName || ''}`.trim(),
            phone: manager.mobilePhone || manager.phone || null,
            email: manager.email || null,
          }
        : null,
      progress: {
        percent: Number.isFinite(progressPercent) ? progressPercent : 0,
      },
    };
  }

  async getCustomerPortalStages(token) {
    const { opportunity } = await this.resolveOpportunityByPortalToken(token);

    const orderedStages = [
      { code: 'LEAD_ASSIGNED', name: 'Lead Assigned' },
      { code: 'SCHEDULED', name: 'Scheduled' },
      { code: 'INSPECTED', name: 'Inspected' },
      { code: 'CLAIM_FILED', name: 'Claim Filed' },
      { code: 'APPROVED', name: 'Approved' },
      { code: 'CONTRACT_SIGNED', name: 'Contract Signed' },
      { code: 'IN_PRODUCTION', name: 'In Production' },
      { code: 'COMPLETED', name: 'Completed' },
    ];

    const activeIndex = Math.max(orderedStages.findIndex((stage) => stage.code === opportunity.stage), 0);

    return orderedStages.map((stage, index) => ({
      number: index + 1,
      name: stage.name,
      status: index < activeIndex ? 'completed' : (index === activeIndex ? 'in_progress' : 'pending'),
      is_enabled: true,
      completedAt: index < activeIndex ? opportunity.updatedAt : null,
    }));
  }

  async getCustomerPortalGalleries(token) {
    await this.resolveOpportunityByPortalToken(token);
    return [];
  }

  async getCustomerPortalAppointments(token) {
    const { opportunity } = await this.resolveOpportunityByPortalToken(token);
    const result = await this.getOpportunityAppointments(opportunity.id);
    return result?.appointments || [];
  }

  async getCustomerPortalPayments(token) {
    const { opportunity } = await this.resolveOpportunityByPortalToken(token);
    const billing = await this.getOpportunityInvoices(opportunity.id);
    const invoices = billing?.invoices || [];
    const payments = invoices.flatMap((invoice) => invoice.payments || []);

    return {
      invoices,
      payments,
      summary: billing?.summary || null,
    };
  }

  async getCustomerPortalPaymentLink(token) {
    const billing = await this.getCustomerPortalPayments(token);
    const unpaidInvoice = (billing.invoices || []).find((invoice) => Number(invoice.balanceDue || 0) > 0);

    return {
      paymentLink: unpaidInvoice?.stripePaymentLinkUrl || unpaidInvoice?.stripeHostedInvoiceUrl || null,
      invoiceId: unpaidInvoice?.id || null,
      invoiceNumber: unpaidInvoice?.invoiceNumber || null,
    };
  }

  async sendCustomerPortalMessage(token, payload = {}) {
    const { opportunity } = await this.resolveOpportunityByPortalToken(token);
    const body = String(payload?.message || '').trim();
    if (!body) {
      const error = new Error('Message is required');
      error.name = 'ValidationError';
      throw error;
    }

    const sender = String(payload?.senderName || '').trim() || 'Customer';
    const senderPhone = String(payload?.senderPhone || '').trim();
    const noteBody = senderPhone
      ? `[Customer Portal] ${sender} (${senderPhone}): ${body}`
      : `[Customer Portal] ${sender}: ${body}`;

    // Notes require a non-null creator in this schema. If the job has no owner yet,
    // acknowledge safely without a write to avoid surfacing a 500 to the customer portal.
    if (!opportunity.ownerId) {
      return {
        id: null,
        createdAt: new Date().toISOString(),
        message: body,
        persisted: false,
      };
    }

    const note = await this.createOpportunityNote(opportunity.id, {
      title: 'Customer Portal Message',
      body: noteBody,
      isPinned: false,
      createdById: opportunity.ownerId,
    });

    return {
      id: note.id,
      createdAt: note.createdAt,
      message: body,
      persisted: true,
    };
  }

  /**
   * Get hub summary with counts of all related records
   * This powers the Opportunity Hub overview section
   */
  async getOpportunitySummary(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, name: true, billingCity: true, billingState: true, phone: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        serviceContract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            contractTotal: true,
            paidAmount: true,
            balanceDue: true,
            collectedPercent: true,
          },
        },
        _count: {
          select: {
            quotes: true,
            workOrders: true,
            commissions: true,
            notes: true,
            tasks: true,
            lineItems: true,
            measurementReports: true,
          },
        },
        // Get the most recent measurement report for display (prioritize delivered, then by creation date)
        measurementReports: {
          orderBy: [
            { orderStatus: 'asc' }, // DELIVERED comes before ORDERED/PENDING alphabetically
            { createdAt: 'desc' },
          ],
          take: 1,
          select: {
            id: true,
            provider: true,
            reportType: true,
            orderStatus: true,
            orderNumber: true,
            orderedAt: true,
            reportPdfUrl: true,
            modelViewerUrl: true,
            designViewerUrl: true,
            totalRoofArea: true,
            totalRoofSquares: true,
            predominantPitch: true,
            suggestedWasteFactor: true,
            ridgeLength: true,
            hipLength: true,
            valleyLength: true,
            rakeLength: true,
            eaveLength: true,
            flashingLength: true,
            stepFlashingLength: true,
            dripEdgeLength: true,
            facets: true,
            deliveredAt: true,
          },
        },
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Get additional counts that require separate queries
    const [appointmentCount, agreementCount] = await Promise.all([
      // Count ServiceAppointments via WorkOrders
      prisma.serviceAppointment.count({
        where: {
          workOrder: { opportunityId: id },
        },
      }),
      // Count Agreements for this Opportunity
      prisma.agreement.count({
        where: { opportunityId: id },
      }),
    ]);

    // Get invoices - first by opportunityId, if none found then by accountId
    let invoices = await prisma.invoice.findMany({
      where: { opportunityId: id },
      select: {
        id: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    });
    // If none found and we have accountId, try by account
    if (invoices.length === 0 && opportunity.accountId) {
      invoices = await prisma.invoice.findMany({
        where: { accountId: opportunity.accountId },
        select: {
          id: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          status: true,
        },
      });
    }

    // Calculate financials from invoices
    const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + Number(inv.amountPaid || 0), 0);
    const totalBalanceDue = invoices.reduce((sum, inv) => sum + Number(inv.balanceDue || 0), 0);
    const invoiceCount = invoices.length;

    // Use service contract values if available, otherwise use invoice calculations
    const contractValue = opportunity.serviceContract
      ? Number(opportunity.serviceContract.contractTotal || 0)
      : opportunity.amount
        ? Number(opportunity.amount)
        : totalInvoiced;

    return {
      id: opportunity.id,
      name: opportunity.name,
      jobId: opportunity.jobId, // Job ID in format YYYY-NNNN (e.g., 2025-49106)
      stage: opportunity.stage,
      stageName: this.formatStageName(opportunity.stage),
      status: opportunity.status,
      type: opportunity.type,
      amount: opportunity.amount ? Number(opportunity.amount) : null,
      contractTotal: opportunity.contractTotal ? Number(opportunity.contractTotal) : null,
      closeDate: opportunity.closeDate,
      appointmentDate: opportunity.appointmentDate,
      soldDate: opportunity.soldDate,
      // Account
      account: opportunity.account,
      // Contact
      contact: opportunity.contact
        ? {
            ...opportunity.contact,
            fullName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
          }
        : null,
      // Owner
      owner: opportunity.owner
        ? {
            ...opportunity.owner,
            fullName: `${opportunity.owner.firstName} ${opportunity.owner.lastName}`,
          }
        : null,
      // Service Contract (financial summary)
      serviceContract: opportunity.serviceContract
        ? {
            ...opportunity.serviceContract,
            contractTotal: Number(opportunity.serviceContract.contractTotal),
            paidAmount: opportunity.serviceContract.paidAmount
              ? Number(opportunity.serviceContract.paidAmount)
              : 0,
            balanceDue: opportunity.serviceContract.balanceDue
              ? Number(opportunity.serviceContract.balanceDue)
              : 0,
            collectedPercent: opportunity.serviceContract.collectedPercent
              ? Number(opportunity.serviceContract.collectedPercent)
              : 0,
          }
        : null,
      // Counts for hub tabs
      counts: {
        quotes: opportunity._count.quotes,
        workOrders: opportunity._count.workOrders,
        appointments: appointmentCount,
        commissions: opportunity._count.commissions,
        invoices: invoiceCount,
        agreements: agreementCount,
        notes: opportunity._count.notes,
        tasks: opportunity._count.tasks,
        lineItems: opportunity._count.lineItems,
        measurementReports: opportunity._count.measurementReports,
      },
      // Most recent delivered measurement report
      measurementReport: opportunity.measurementReports?.[0] || null,
      // Insurance-specific fields
      isPandaClaims: opportunity.isPandaClaims,
      isApproved: opportunity.isApproved,
      claimNumber: opportunity.claimNumber,
      insuranceCarrier: opportunity.insuranceCarrier,
      rcvAmount: opportunity.rcvAmount ? Number(opportunity.rcvAmount) : null,
      deductible: opportunity.deductible ? Number(opportunity.deductible) : null,
      // Financials summary (what frontend expects)
      financials: {
        contractValue: contractValue,
        totalInvoiced: totalInvoiced,
        totalPaid: opportunity.serviceContract
          ? Number(opportunity.serviceContract.paidAmount || 0)
          : totalPaid,
        balanceDue: opportunity.serviceContract
          ? Number(opportunity.serviceContract.balanceDue || 0)
          : totalBalanceDue,
        collectedPercent: opportunity.serviceContract
          ? Number(opportunity.serviceContract.collectedPercent || 0)
          : contractValue > 0
            ? Math.round((totalPaid / contractValue) * 100)
            : 0,
      },
    };
  }

  /**
   * Get service appointments for the opportunity
   * Goes through WorkOrders to find all appointments
   */
  async getOpportunityAppointments(id) {
    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        workOrder: { opportunityId: id },
      },
      orderBy: { scheduledStart: 'desc' },
      include: {
        workOrder: {
          select: {
            id: true,
            workOrderNumber: true,
            subject: true,
            workType: { select: { name: true } },
          },
        },
        assignedResources: {
          include: {
            serviceResource: {
              select: { id: true, name: true, phone: true, resourceType: true },
            },
          },
        },
      },
    });

    return {
      opportunityId: id,
      appointments: appointments.map((sa) => ({
        id: sa.id,
        appointmentNumber: sa.appointmentNumber,
        subject: sa.subject,
        status: sa.status,
        scheduledStart: sa.scheduledStart,
        scheduledEnd: sa.scheduledEnd,
        actualStart: sa.actualStart,
        actualEnd: sa.actualEnd,
        duration: sa.duration,
        address: sa.street
          ? `${sa.street}, ${sa.city}, ${sa.state} ${sa.postalCode}`
          : null,
        workOrder: {
          id: sa.workOrder.id,
          workOrderNumber: sa.workOrder.workOrderNumber,
          subject: sa.workOrder.subject,
          workTypeName: sa.workOrder.workType?.name,
        },
        crew: sa.assignedResources.map((ar) => ({
          id: ar.serviceResource.id,
          name: ar.serviceResource.name,
          phone: ar.serviceResource.phone,
          type: ar.serviceResource.resourceType,
          isPrimary: ar.isPrimaryResource,
        })),
      })),
      summary: {
        total: appointments.length,
        scheduled: appointments.filter((a) => a.status === 'SCHEDULED').length,
        completed: appointments.filter((a) => a.status === 'COMPLETED').length,
        inProgress: appointments.filter((a) => a.status === 'IN_PROGRESS').length,
      },
    };
  }

  /**
   * Get service contract for the opportunity
   */
  async getOpportunityContract(id) {
    const contract = await prisma.serviceContract.findUnique({
      where: { opportunityId: id },
      include: {
        commissions: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contract) {
      return null;
    }

    return {
      id: contract.id,
      contractNumber: contract.contractNumber,
      name: contract.name,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      contractTotal: Number(contract.contractTotal),
      salesTotalPrice: contract.salesTotalPrice ? Number(contract.salesTotalPrice) : null,
      supplementsClosedTotal: contract.supplementsClosedTotal
        ? Number(contract.supplementsClosedTotal)
        : null,
      paidAmount: contract.paidAmount ? Number(contract.paidAmount) : 0,
      balanceDue: contract.balanceDue ? Number(contract.balanceDue) : 0,
      collectedPercent: contract.collectedPercent ? Number(contract.collectedPercent) : 0,
      isPmContract: contract.isPmContract,
      backEndCommissionReady: contract.backEndCommissionReady,
      // Commission summary
      commissionSummary: {
        total: contract.commissions.length,
        totalAmount: contract.commissions.reduce(
          (sum, c) => sum + Number(c.commissionAmount),
          0
        ),
        byStatus: contract.commissions.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {}),
      },
      commissions: contract.commissions.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        ownerName: `${c.owner.firstName} ${c.owner.lastName}`,
        commissionValue: Number(c.commissionValue),
        commissionRate: Number(c.commissionRate),
        commissionAmount: Number(c.commissionAmount),
        requestedAmount: c.requestedAmount ? Number(c.requestedAmount) : null,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Get invoices for the opportunity (via Account)
   */
  async getOpportunityInvoices(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { accountId: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // First try to find invoices linked directly to this opportunity
    let invoices = await prisma.invoice.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        lineItems: true,
      },
    });

    // If no invoices found by opportunityId and we have an accountId, try by account
    // This catches invoices that may only be linked via account
    if (invoices.length === 0 && opportunity.accountId) {
      invoices = await prisma.invoice.findMany({
        where: { accountId: opportunity.accountId },
        orderBy: { createdAt: 'desc' },
        include: {
          payments: {
            orderBy: { paymentDate: 'desc' },
          },
          lineItems: true,
        },
      });
    }

    return {
      opportunityId: id,
      opportunityName: opportunity.name,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        terms: inv.terms,
        subtotal: Number(inv.subtotal),
        tax: Number(inv.tax),
        total: Number(inv.total),
        amountPaid: Number(inv.amountPaid),
        balanceDue: Number(inv.balanceDue),
        // Stripe
        stripePaymentLinkUrl: inv.stripePaymentLinkUrl,
        stripeHostedInvoiceUrl: inv.stripeHostedInvoiceUrl,
        // QuickBooks
        qbDocNumber: inv.qbDocNumber,
        qbSyncStatus: inv.qbSyncStatus,
        // Line items
        lineItems: inv.lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          totalPrice: Number(li.totalPrice),
        })),
        // Payments
        payments: inv.payments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          status: p.status,
          referenceNumber: p.referenceNumber,
        })),
      })),
      summary: {
        totalInvoiced: invoices.reduce((sum, i) => sum + Number(i.total), 0),
        totalPaid: invoices.reduce((sum, i) => sum + Number(i.amountPaid), 0),
        totalBalanceDue: invoices.reduce((sum, i) => sum + Number(i.balanceDue), 0),
        invoiceCount: invoices.length,
        paidCount: invoices.filter((i) => i.status === 'PAID').length,
        overdueCount: invoices.filter((i) => i.status === 'OVERDUE').length,
      },
    };
  }

  /**
   * Get commissions for the opportunity
   */
  async getOpportunityCommissions(id) {
    const commissions = await prisma.commission.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        serviceContract: {
          select: { contractNumber: true, contractTotal: true },
        },
      },
    });

    return {
      opportunityId: id,
      commissions: commissions.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        owner: {
          id: c.owner.id,
          name: `${c.owner.firstName} ${c.owner.lastName}`,
          email: c.owner.email,
        },
        commissionValue: Number(c.commissionValue),
        commissionRate: Number(c.commissionRate),
        commissionAmount: Number(c.commissionAmount),
        requestedAmount: c.requestedAmount ? Number(c.requestedAmount) : null,
        preCommissionAmount: c.preCommissionAmount ? Number(c.preCommissionAmount) : null,
        paidAmount: c.paidAmount ? Number(c.paidAmount) : null,
        isCompanyLead: c.isCompanyLead,
        isSelfGen: c.isSelfGen,
        notes: c.notes,
        holdReason: c.holdReason,
        deniedReason: c.deniedReason,
        contractNumber: c.serviceContract?.contractNumber,
        contractValue: c.serviceContract?.contractTotal ? Number(c.serviceContract.contractTotal) : null,
        createdAt: c.createdAt,
        requestedDate: c.requestedDate,
        approvedDate: c.approvedDate,
        paidDate: c.paidDate,
        holdDate: c.holdDate,
        deniedDate: c.deniedDate,
        updatedAt: c.updatedAt,
      })),
      summary: {
        total: commissions.length,
        totalAmount: commissions.reduce((sum, c) => sum + Number(c.commissionAmount), 0),
        totalPaid: commissions
          .filter((c) => c.status === 'PAID')
          .reduce((sum, c) => sum + Number(c.paidAmount || c.commissionAmount), 0),
        byType: commissions.reduce((acc, c) => {
          acc[c.type] = (acc[c.type] || 0) + 1;
          return acc;
        }, {}),
        byStatus: commissions.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  /**
   * Get activity timeline for the opportunity
   * Combines notes, tasks, stage changes into unified timeline
   */
  async getOpportunityActivity(id, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [notes, tasks, activityRecords, callLogs, opportunity] = await Promise.all([
      // Get notes
      prisma.note.findMany({
        where: { opportunityId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get tasks
      prisma.task.findMany({
        where: { opportunityId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get activity records (imported from AccuLynx, emails, Chatter, etc.)
      prisma.activity.findMany({
        where: { opportunityId: id },
        orderBy: { occurredAt: 'desc' },
        take: limit,
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get call logs with full details
      prisma.callLog.findMany({
        where: { opportunityId: id },
        orderBy: { startTime: 'desc' },
        take: limit,
        include: {
          user: { select: { firstName: true, lastName: true } },
          contact: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get opportunity for stage info
      prisma.opportunity.findUnique({
        where: { id },
        select: { stage: true, updatedAt: true, createdAt: true },
      }),
    ]);

    // Combine into unified timeline
    const activities = [
      ...notes.map((n) => ({
        id: n.id,
        type: 'NOTE',
        title: n.title || 'Note',
        body: n.body,
        createdAt: n.createdAt,
        createdBy: n.createdBy
          ? `${n.createdBy.firstName} ${n.createdBy.lastName}`
          : 'System',
        icon: 'document-text',
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: 'TASK',
        title: t.subject,
        body: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        completedDate: t.completedDate,
        createdAt: t.createdAt,
        assignedTo: t.assignedTo
          ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
          : 'Unassigned',
        icon: 'check-circle',
      })),
      // Include activity records (AccuLynx imports, emails, etc.)
      ...activityRecords.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.subject || a.type,
        body: a.body || a.description,
        status: a.status,
        createdAt: a.occurredAt || a.createdAt,
        createdBy: a.user
          ? `${a.user.firstName} ${a.user.lastName}`
          : a.externalName || 'System',
        sourceType: a.sourceType,
        externalEmail: a.externalEmail,
        icon: a.type?.includes('EMAIL') ? 'mail' : a.type?.includes('SMS') ? 'chat' : 'activity',
      })),
      // Include call logs with full details
      ...callLogs.map((c) => {
        // Format duration as mm:ss
        const formatDuration = (seconds) => {
          if (!seconds) return null;
          const mins = Math.floor(seconds / 60);
          const secs = seconds % 60;
          return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        // Build a descriptive body from call details
        const bodyParts = [];
        if (c.dispositionName || c.disposition) {
          bodyParts.push(`Result: ${c.dispositionName || c.disposition}`);
        }
        if (c.duration) {
          bodyParts.push(`Duration: ${formatDuration(c.duration)}`);
        }
        if (c.dispositionNotes) {
          bodyParts.push(`Notes: ${c.dispositionNotes}`);
        }
        if (c.summary) {
          bodyParts.push(`Summary: ${c.summary}`);
        }

        const contactName = c.contact
          ? `${c.contact.firstName || ''} ${c.contact.lastName || ''}`.trim()
          : null;

        return {
          id: c.id,
          type: c.direction === 'INBOUND' ? 'CALL_INBOUND' : 'CALL_OUTBOUND',
          title: `${c.direction === 'INBOUND' ? 'Inbound' : 'Outbound'} Call${contactName ? ` - ${contactName}` : ''}`,
          body: bodyParts.join('\n') || null,
          status: c.disposition || c.dispositionName || null,
          createdAt: c.startTime,
          createdBy: c.user
            ? `${c.user.firstName} ${c.user.lastName}`
            : c.extensionName || 'System',
          icon: 'phone',
          // Additional call-specific fields
          phoneNumber: c.formattedPhone || c.phoneNumber,
          duration: c.duration,
          durationFormatted: formatDuration(c.duration),
          direction: c.direction,
          disposition: c.dispositionName || c.disposition,
          dispositionNotes: c.dispositionNotes,
          recordingUrl: c.recordingUrl,
          transcription: c.transcription,
          sentiment: c.sentiment,
          summary: c.summary,
          keyPoints: c.keyPoints,
          nextActions: c.nextActions,
        };
      }),
    ];

    // Sort by createdAt descending
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      opportunityId: id,
      activities: activities.slice(offset, offset + limit),
      pagination: {
        total: activities.length,
        limit,
        offset,
        hasMore: activities.length > offset + limit,
      },
    };
  }

  /**
   * Generate AI summary for activity/message content using GPT-4o-mini
   */
  async generateActivitySummary(content, activityId = null) {
    try {
      // Get OpenAI API key from AWS Secrets Manager
      const secretsManager = new (await import('@aws-sdk/client-secrets-manager')).SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-2',
      });

      const secretResponse = await secretsManager.send(
        new (await import('@aws-sdk/client-secrets-manager')).GetSecretValueCommand({
          SecretId: 'openai-api-key',
        })
      );

      const secret = JSON.parse(secretResponse.SecretString);
      const apiKey = secret.api_key;

      // Prepare the message for summarization
      const systemPrompt = `You are a helpful assistant that summarizes workplace communication messages.
Create a brief, professional 1-2 sentence summary that captures:
- Who is communicating (names if mentioned)
- What action is being requested or discussed
- Any key outcomes or responses

Keep it concise and factual. Do not add interpretation beyond what's stated.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Summarize this workplace message thread:\n\n${content}` },
          ],
          max_tokens: 150,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', errorText);
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content?.trim();

      // Optionally update the activity record with the summary (if activityId provided)
      if (activityId && summary) {
        await prisma.activity.update({
          where: { id: activityId },
          data: { summary },
        }).catch(err => {
          // Ignore if summary column doesn't exist yet
          console.log('Could not save summary to activity:', err.message);
        });
      }

      return summary || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating activity summary:', error);
      return 'Unable to generate summary';
    }
  }

  /**
   * Generate AI summary for entire conversation (all communications for an opportunity)
   */
  async generateConversationSummary(opportunityId) {
    try {
      // Fetch all activities, notes, and messages for this opportunity
      const [activities, notes] = await Promise.all([
        prisma.activity.findMany({
          where: { opportunityId },
          orderBy: { occurredAt: 'asc' },
          take: 50, // Limit to last 50 to avoid token limits
        }),
        prisma.note.findMany({
          where: { opportunityId },
          orderBy: { createdAt: 'asc' },
          take: 50,
        }),
      ]);

      // Build conversation context
      const conversationParts = [];

      activities.forEach(a => {
        const date = a.occurredAt ? new Date(a.occurredAt).toLocaleDateString() : '';
        conversationParts.push(`[${a.type} - ${date}] ${a.subject || ''}: ${a.body || ''}`);
      });

      notes.forEach(n => {
        const date = n.createdAt ? new Date(n.createdAt).toLocaleDateString() : '';
        conversationParts.push(`[Note - ${date}] ${n.subject || ''}: ${n.body || ''}`);
      });

      if (conversationParts.length === 0) {
        return 'No conversation history to summarize.';
      }

      const fullConversation = conversationParts.join('\n\n');

      // Get OpenAI API key
      const secretsManager = new (await import('@aws-sdk/client-secrets-manager')).SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-2',
      });

      const secretResponse = await secretsManager.send(
        new (await import('@aws-sdk/client-secrets-manager')).GetSecretValueCommand({
          SecretId: 'openai-api-key',
        })
      );

      const secret = JSON.parse(secretResponse.SecretString);
      const apiKey = secret.api_key;

      const systemPrompt = `You are a helpful assistant summarizing the communication history for a roofing project.
Create a concise 3-5 sentence summary that includes:
- Overall status of customer communication
- Key topics discussed (insurance claims, scheduling, pricing, etc.)
- Any pending actions or follow-ups needed
- Overall customer sentiment (positive, neutral, concerned)

Be factual and professional. Highlight anything that needs attention.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Summarize this project communication history:\n\n${fullConversation}` },
          ],
          max_tokens: 300,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', errorText);
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating conversation summary:', error);
      return 'Unable to generate summary. Please try again later.';
    }
  }

  /**
   * Resolve mentions for opportunity comments/replies and create in-app notifications.
   */
  async notifyOpportunityMentions({
    opportunityId,
    content,
    mentions = [],
    actor = null,
    actorUserId = null,
    opportunityName = null,
    opportunityJobId = null,
    actionPath = null,
  }) {
    const mentionUserIds = [...new Set((mentions || [])
      .map(extractMentionUserId)
      .filter(Boolean))];

    if (mentionUserIds.length === 0) {
      return 0;
    }

    const users = await prisma.user.findMany({
      where: { id: { in: mentionUserIds } },
      select: { id: true, email: true, mobilePhone: true, firstName: true, lastName: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    const actorRecord = actorUserId
      ? await prisma.user.findUnique({
          where: { id: actorUserId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    const actorName = `${actorRecord?.firstName || actor?.firstName || ''} ${actorRecord?.lastName || actor?.lastName || ''}`.trim()
      || actorRecord?.email
      || actor?.email
      || 'Someone';
    const subjectName = opportunityName || opportunityJobId || 'an opportunity';
    const preview = (content || '').substring(0, 100);
    const resolvedActionPath = actionPath || `/jobs/${opportunityId}`;
    const absoluteActionUrl = toAbsoluteCrmUrl(resolvedActionPath);

    for (const userId of mentionUserIds) {
      const mentionedUser = userById.get(userId);
      if (!mentionedUser) continue;
      if (actorUserId && mentionedUser.id === actorUserId) continue;

      await prisma.notification.create({
        data: {
          userId,
          type: 'MENTION',
          title: `${actorName} mentioned you`,
          message: `You were mentioned on ${subjectName}: "${preview}${(content || '').length > 100 ? '...' : ''}"`,
          opportunityId,
          actionUrl: resolvedActionPath,
          actionLabel: 'View Job',
          sourceType: 'OPPORTUNITY',
          sourceId: opportunityId,
          status: 'UNREAD',
        },
      });

      if (mentionedUser.email) {
        this.sendMentionEmail({
          toEmail: mentionedUser.email,
          toName: mentionedUser.firstName || 'there',
          mentionerName: actorName,
          opportunityName: subjectName,
          actionUrl: absoluteActionUrl,
          messagePreview: (content || '').substring(0, 200),
        }).catch((err) => logger.warn(`Failed to send mention email to ${mentionedUser.email}: ${err.message}`));
      }

      if (mentionedUser.mobilePhone) {
        this.sendMentionSms({
          toPhone: mentionedUser.mobilePhone,
          mentionerName: actorName,
          opportunityName: subjectName,
          actionUrl: absoluteActionUrl,
        }).catch((err) => logger.warn(`Failed to send mention SMS to ${mentionedUser.mobilePhone}: ${err.message}`));
      }
    }

    return mentionUserIds.length;
  }

  /**
   * Add a reply with @mentions - creates a note and sends notifications
   */
  async addReplyWithMentions(opportunityId, { content, parentId, mentions, channel }, user) {
    const actorUserId = await this.resolveActorUserId(user);
    if (!actorUserId) {
      const error = new Error('Unable to resolve the logged-in user for this reply');
      error.name = 'ValidationError';
      throw error;
    }

    const normalizedContent = String(content || '').trim();
    if (!normalizedContent && (!mentions || mentions.length === 0)) {
      const error = new Error('Reply content is required');
      error.name = 'ValidationError';
      throw error;
    }

    const note = await prisma.note.create({
      data: {
        opportunityId,
        title: parentId ? `REPLY|${parentId}` : `REPLY|${channel || 'message'}`,
        body: normalizedContent || '(mention)',
        createdById: actorUserId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    let mentionsNotified = 0;
    if (mentions && mentions.length > 0) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { name: true, jobId: true },
      });
      mentionsNotified = await this.notifyOpportunityMentions({
        opportunityId,
        content: normalizedContent || note.body,
        mentions,
        actor: user,
        actorUserId,
        opportunityName: opportunity?.name,
        opportunityJobId: opportunity?.jobId,
        actionPath: `/jobs/${opportunityId}?tab=messages&noteId=${note.id}`,
      });
    }

    return {
      ...note,
      mentionsNotified,
    };
  }

  async getOpportunityInternalComments(opportunityId) {
    const comments = await prisma.note.findMany({
      where: {
        opportunityId,
        title: { startsWith: INTERNAL_COMMENT_TITLE_PREFIX },
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return comments.map((comment) => {
      const meta = parseInternalCommentTitle(comment.title) || {
        departmentTag: 'general',
        isResolved: false,
      };
      return {
        id: comment.id,
        content: comment.body,
        body: comment.body,
        departmentTag: meta.departmentTag,
        isResolved: meta.isResolved,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        author: comment.createdBy
          ? {
              id: comment.createdBy.id,
              firstName: comment.createdBy.firstName,
              lastName: comment.createdBy.lastName,
              email: comment.createdBy.email,
            }
          : null,
        replies: [],
        attachmentUrls: [],
      };
    });
  }

  async createOpportunityInternalComment(opportunityId, payload = {}, user = null) {
    const content = String(payload.content || payload.body || '').trim();
    if (!content) {
      const error = new Error('Comment content is required');
      error.name = 'ValidationError';
      throw error;
    }

    const actorUserId = await this.resolveActorUserId(user);
    if (!actorUserId) {
      const error = new Error('Unable to resolve the logged-in user for this internal comment');
      error.name = 'ValidationError';
      throw error;
    }

    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true, jobId: true },
    });
    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const departmentTag = normalizeDepartmentTag(payload.departmentTag || payload.department || 'general');
    const isResolved = Boolean(payload.isResolved);

    const comment = await prisma.note.create({
      data: {
        opportunityId,
        title: toInternalCommentTitle(departmentTag, isResolved),
        body: content,
        createdById: actorUserId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const mentionsNotified = await this.notifyOpportunityMentions({
      opportunityId,
      content,
      mentions: payload.mentions || [],
      actor: user,
      actorUserId,
      opportunityName: opportunity.name,
      opportunityJobId: opportunity.jobId,
      actionPath: `/jobs/${opportunityId}?tab=messages&internalCommentId=${comment.id}`,
    });

    return {
      id: comment.id,
      content: comment.body,
      body: comment.body,
      departmentTag,
      isResolved,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.createdBy
        ? {
            id: comment.createdBy.id,
            firstName: comment.createdBy.firstName,
            lastName: comment.createdBy.lastName,
            email: comment.createdBy.email,
          }
        : null,
      replies: [],
      attachmentUrls: [],
      mentionsNotified,
    };
  }

  async updateOpportunityInternalComment(opportunityId, commentId, payload = {}, user = null) {
    const existing = await prisma.note.findFirst({
      where: {
        id: commentId,
        opportunityId,
        title: { startsWith: INTERNAL_COMMENT_TITLE_PREFIX },
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!existing) {
      const error = new Error(`Internal comment not found: ${commentId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const meta = parseInternalCommentTitle(existing.title) || {
      departmentTag: 'general',
      isResolved: false,
    };
    const nextDepartment = hasOwnField(payload, 'departmentTag') || hasOwnField(payload, 'department')
      ? normalizeDepartmentTag(payload.departmentTag || payload.department)
      : meta.departmentTag;
    const nextResolved = hasOwnField(payload, 'isResolved')
      ? Boolean(payload.isResolved)
      : meta.isResolved;
    const nextContent = hasOwnField(payload, 'content') || hasOwnField(payload, 'body')
      ? String(payload.content || payload.body || '').trim()
      : existing.body;

    if (!nextContent) {
      const error = new Error('Comment content is required');
      error.name = 'ValidationError';
      throw error;
    }

    const updated = await prisma.note.update({
      where: { id: commentId },
      data: {
        title: toInternalCommentTitle(nextDepartment, nextResolved),
        body: nextContent,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const mentionsNotified = await this.notifyOpportunityMentions({
      opportunityId,
      content: nextContent,
      mentions: payload.mentions || [],
      actor: user,
    });

    return {
      id: updated.id,
      content: updated.body,
      body: updated.body,
      departmentTag: nextDepartment,
      isResolved: nextResolved,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      author: updated.createdBy
        ? {
            id: updated.createdBy.id,
            firstName: updated.createdBy.firstName,
            lastName: updated.createdBy.lastName,
            email: updated.createdBy.email,
          }
        : null,
      replies: [],
      attachmentUrls: [],
      mentionsNotified,
    };
  }

  async deleteOpportunityInternalComment(opportunityId, commentId) {
    const existing = await prisma.note.findFirst({
      where: {
        id: commentId,
        opportunityId,
        title: { startsWith: INTERNAL_COMMENT_TITLE_PREFIX },
      },
      select: { id: true },
    });

    if (!existing) {
      const error = new Error(`Internal comment not found: ${commentId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    await prisma.note.delete({ where: { id: commentId } });
    return { success: true, deletedId: commentId };
  }

  /**
   * Send email notification for @mention
   */
  async sendMentionEmail({ toEmail, toName, mentionerName, opportunityName, actionUrl, messagePreview }) {
    try {
      const opportunityUrl = toAbsoluteCrmUrl(actionUrl || '/jobs');

      await sesClient.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [toEmail],
        },
        Message: {
          Subject: {
            Data: `${mentionerName} mentioned you on ${opportunityName}`,
          },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #333;">You were mentioned in a conversation</h2>
                  <p>Hi ${toName},</p>
                  <p><strong>${mentionerName}</strong> mentioned you in a reply on <strong>${opportunityName}</strong>:</p>
                  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p style="margin: 0; color: #666;">"${messagePreview}"</p>
                  </div>
                  <a href="${opportunityUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 10px;">
                    View Conversation
                  </a>
                  <p style="color: #999; font-size: 12px; margin-top: 30px;">
                    This is an automated notification from Panda CRM.
                  </p>
                </div>
              `,
            },
            Text: {
              Data: `You were mentioned by ${mentionerName} on ${opportunityName}: "${messagePreview}"\n\nView at: ${opportunityUrl}`,
            },
          },
        },
      }));

      console.log(`Mention email sent to ${toEmail}`);
    } catch (error) {
      console.error('Error sending mention email:', error);
      throw error;
    }
  }

  async sendMentionSms({ toPhone, mentionerName, opportunityName, actionUrl }) {
    const smsBody = `${mentionerName} mentioned you on ${opportunityName}. View: ${toAbsoluteCrmUrl(actionUrl || '/jobs')}`;
    const response = await fetch(`${BAMBOOGLI_SERVICE_URL}/api/messages/send/sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: toPhone,
        body: smsBody,
        sentById: 'system',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `SMS delivery failed with status ${response.status}`);
    }
  }

  /**
   * Get threaded conversation for an opportunity
   */
  async getThreadedConversation(opportunityId) {
    const [activities, notes] = await Promise.all([
      prisma.activity.findMany({
        where: { opportunityId },
        orderBy: { occurredAt: 'desc' },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.note.findMany({
        where: { opportunityId },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    // Build thread structure
    const threads = [];
    const notesByParent = new Map();

    // Group notes using REPLY|<parentId> title convention for backward-compatible reply threading
    notes.forEach(note => {
      const replyMatch = typeof note.title === 'string' ? note.title.match(/^REPLY\|(.+)$/) : null;
      const parentId = replyMatch?.[1] || 'root';
      if (!notesByParent.has(parentId)) {
        notesByParent.set(parentId, []);
      }
      notesByParent.get(parentId).push({
        ...note,
        user: note.createdBy || null,
      });
    });

    // Build threads from activities and root notes
    activities.forEach(activity => {
      const replies = notesByParent.get(activity.id) || [];
      threads.push({
        ...activity,
        itemType: 'activity',
        replies: replies.map(r => ({
          ...r,
          itemType: 'note',
          replies: notesByParent.get(r.id) || [],
        })),
      });
    });

    // Add root-level notes (not replies)
    const rootNotes = notesByParent.get('root') || [];
    rootNotes.forEach(note => {
      if (!(typeof note.title === 'string' && note.title.startsWith('REPLY|'))) {
        threads.push({
          ...note,
          itemType: 'note',
          replies: notesByParent.get(note.id) || [],
        });
      }
    });

    // Sort by date
    threads.sort((a, b) => {
      const dateA = a.occurredAt || a.createdAt;
      const dateB = b.occurredAt || b.createdAt;
      return new Date(dateB) - new Date(dateA);
    });

    return threads;
  }

  /**
   * Get documents/agreements for the opportunity
   * Returns pre-signed URLs for S3 documents (valid for 1 hour)
   */
  async getOpportunityDocuments(id) {
    const agreements = await prisma.agreement.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { name: true, category: true },
        },
      },
    });

    // Generate pre-signed URLs for S3 documents
    const documentsWithPresignedUrls = await Promise.all(
      agreements.map(async (a) => {
        // Check if the URL is an S3 URL that needs pre-signing
        const needsPresigning = (url) => url && (url.includes('pandasign-documents') || url.includes('s3.'));

        const signedDocumentUrl = needsPresigning(a.signedDocumentUrl)
          ? await getPresignedUrl(a.signedDocumentUrl)
          : a.signedDocumentUrl;

        const documentUrl = needsPresigning(a.documentUrl)
          ? await getPresignedUrl(a.documentUrl)
          : a.documentUrl;

        // Generate thumbnail URL (same as document but smaller - we'll handle this in frontend)
        const thumbnailUrl = signedDocumentUrl || documentUrl;

        return {
          id: a.id,
          agreementNumber: a.agreementNumber,
          name: a.name,
          status: a.status,
          templateName: a.template?.name,
          category: a.template?.category || 'General',
          documentUrl,
          signedDocumentUrl,
          thumbnailUrl,
          signingUrl: a.signingUrl,
          sentAt: a.sentAt,
          viewedAt: a.viewedAt,
          signedAt: a.signedAt,
          declinedAt: a.declinedAt,
          declineReason: a.declineReason,
          expiresAt: a.expiresAt,
          createdAt: a.createdAt,
          // For download functionality
          downloadUrl: signedDocumentUrl || documentUrl,
          fileName: `${a.name || a.agreementNumber || 'document'}.pdf`,
        };
      })
    );

    return {
      opportunityId: id,
      documents: documentsWithPresignedUrls,
      summary: {
        total: agreements.length,
        signed: agreements.filter((a) => a.status === 'SIGNED').length,
        pending: agreements.filter((a) => ['SENT', 'VIEWED'].includes(a.status)).length,
        draft: agreements.filter((a) => a.status === 'DRAFT').length,
        declined: agreements.filter((a) => a.status === 'DECLINED').length,
      },
    };
  }

  /**
   * Get stage counts for dashboard
   * @param {string} currentUserId - Current user's ID
   * @param {string} ownerFilter - 'all', 'mine', or 'team'
   * @param {string[]} ownerIds - Array of owner IDs for team filtering
   */
  async getStageCounts(currentUserId, ownerFilter, ownerIds = []) {
    // Always exclude soft-deleted records
    const where = {
      deletedAt: null,
    };

    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerFilter === 'team' && ownerIds.length > 0) {
      where.ownerId = { in: ownerIds };
    } else if (ownerIds.length > 0) {
      // If ownerIds are provided, use them regardless of ownerFilter
      where.ownerId = { in: ownerIds };
    }

    // Get stage counts
    const counts = await prisma.opportunity.groupBy({
      by: ['stage'],
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get invoice ready count
    const invoiceReadyCount = await prisma.opportunity.count({
      where: {
        ...where,
        invoiceStatus: 'READY',
      },
    });

    const result = { total: 0, totalAmount: 0, invoiceReady: invoiceReadyCount };
    for (const item of counts) {
      result[item.stage] = {
        count: item._count.id,
        amount: Number(item._sum.amount) || 0,
      };
      result.total += item._count.id;
      result.totalAmount += Number(item._sum.amount) || 0;
    }

    return result;
  }

  /**
   * Generate Job ID within a transaction
   * @param {Object} tx - Prisma transaction client
   * @returns {Promise<string|null>} Job ID in format YYYY-NNNN or null if failed
   */
  async generateJobId(tx = prisma) {
    const currentYear = new Date().getFullYear();

    try {
      // Try to get and lock the sequence row for this year
      const sequences = await tx.$queryRaw`
        SELECT id, year, last_number
        FROM job_id_sequences
        WHERE year = ${currentYear}
        FOR UPDATE
      `;

      let nextNumber;
      if (!sequences || sequences.length === 0) {
        // First job of the year - create the sequence
        await tx.jobIdSequence.create({
          data: {
            year: currentYear,
            lastNumber: JOB_ID_STARTING_NUMBER + 1,
          },
        });
        nextNumber = JOB_ID_STARTING_NUMBER + 1;
      } else {
        // Increment the sequence
        nextNumber = Number(sequences[0].last_number) + 1;
        await tx.jobIdSequence.update({
          where: { year: currentYear },
          data: { lastNumber: nextNumber },
        });
      }

      const jobId = `${currentYear}-${nextNumber}`;
      logger.info(`Generated Job ID: ${jobId}`);
      return jobId;
    } catch (err) {
      logger.warn(`Failed to generate Job ID: ${err.message}`);
      return null;
    }
  }

  /**
   * Create new opportunity
   */
  async createOpportunity(data) {
    // Use transaction to ensure Job ID is assigned atomically
    const opportunity = await prisma.$transaction(async (tx) => {
      // Generate Job ID unless it's already provided (e.g., from Salesforce sync)
      let jobId = data.jobId || null;
      if (!jobId) {
        jobId = await this.generateJobId(tx);
      }

      const opp = await tx.opportunity.create({
        data: {
          name: data.name,
          jobId, // Auto-assigned Job ID
          description: data.description,
          stage: data.stage || 'LEAD_UNASSIGNED',
          status: data.status,
          probability: data.probability || 0,
          closeDate: data.closeDate ? new Date(data.closeDate) : null,
          appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : null,
          amount: data.amount,
          contractTotal: data.contractTotal,
          type: data.type || 'INSURANCE',
          workType: data.workType,
          leadSource: data.leadSource,
          isSelfGen: data.isSelfGen || false,
          isPandaClaims: data.isPandaClaims || false,
          isApproved: data.isApproved || false,
          claimNumber: data.claimNumber,
          claimFiledDate: data.claimFiledDate ? new Date(data.claimFiledDate) : null,
          insuranceCarrier: data.insuranceCarrier,
          rcvAmount: data.rcvAmount,
          acvAmount: data.acvAmount,
          deductible: data.deductible,
          supplementsTotal: data.supplementsTotal,
          // Address fields
          street: data.street,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          accountId: data.accountId,
          contactId: data.contactId,
          ownerId: data.ownerId,
          salesforceId: data.salesforceId,
          // Create line items if provided
          lineItems: data.lineItems?.length > 0 ? {
            create: data.lineItems.map((li, index) => ({
              name: li.name || li.product?.name || 'Line Item',
              description: li.description,
              productCode: li.productCode,
              quantity: li.quantity || 1,
              unitPrice: li.unitPrice || 0,
              totalPrice: li.total || li.totalPrice || (li.quantity || 1) * (li.unitPrice || 0),
              discount: li.discount,
              sortOrder: index,
              productId: li.productId,
            })),
          } : undefined,
        },
        include: {
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          lineItems: { include: { product: true } },
        },
      });

      return opp;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    logger.info(`Opportunity created: ${opportunity.id} (${opportunity.name}) with Job ID: ${opportunity.jobId}`);
    return this.createOpportunityWrapper(opportunity, true);
  }

  /**
   * Update opportunity
   */
  async updateOpportunity(id, data, userId = null) {
    // Get the current opportunity state for change detection.
    // Fallback avoids 500s if runtime Prisma client is older than DB schema.
    const previousStateSelect = {
      stage: true,
      status: true,
      isApproved: true,
      claimNumber: true,
      claimFiledDate: true,
      insuranceCarrier: true,
      adjusterName: true,
      adjusterEmail: true,
      adjusterOfficePhone: true,
      fieldAdjusterMobile: true,
      isPandaClaims: true,
      type: true,
      rcvAmount: true,
      acvAmount: true,
      deductible: true,
      // Expediting fields for trigger detection
      flatRoof: true,
      lineDrop: true,
      supplementRequired: true,
      supplementHoldsJob: true,
    };

    let previousState = null;
    const previousStateSelectMutable = { ...previousStateSelect };
    for (let attempt = 0; attempt <= OPTIONAL_OPPORTUNITY_CLAIM_FIELDS.size; attempt += 1) {
      try {
        previousState = await prisma.opportunity.findUnique({
          where: { id },
          select: previousStateSelectMutable,
        });
        break;
      } catch (error) {
        const unknownField = parseUnknownPrismaFieldName(error);
        if (!unknownField || !OPTIONAL_OPPORTUNITY_CLAIM_FIELDS.has(unknownField) || !hasOwnField(previousStateSelectMutable, unknownField)) {
          throw error;
        }
        logger.warn(
          `Opportunity update: runtime schema missing optional field "${unknownField}", retrying previous-state select without it`
        );
        delete previousStateSelectMutable[unknownField];
      }
    }

    const updateData = {
      name: data.name,
      description: data.description,
      stage: data.stage,
      status: data.status,
      probability: data.probability,
      closeDate: data.closeDate ? new Date(data.closeDate) : undefined,
      appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : undefined,
      soldDate: data.soldDate ? new Date(data.soldDate) : undefined,
      amount: data.amount,
      contractTotal: data.contractTotal,
      type: data.type,
      workType: data.workType,
      leadSource: data.leadSource,
      isSelfGen: data.isSelfGen,
      isPandaClaims: data.isPandaClaims,
      isApproved: data.isApproved,
      rcvAmount: data.rcvAmount,
      acvAmount: data.acvAmount,
      deductible: data.deductible,
      supplementsTotal: data.supplementsTotal,
      // Address fields
      street: data.street,
      city: data.city,
      state: data.state,
      postalCode: data.postalCode,
      accountId: data.accountId,
      contactId: data.contactId,
      ownerId: data.ownerId,
      projectManagerId: data.projectManagerId,
      // Invoice workflow fields
      invoiceStatus: data.invoiceStatus,
      invoiceReadyDate: data.invoiceReadyDate ? new Date(data.invoiceReadyDate) : undefined,
      invoicedDate: data.invoicedDate ? new Date(data.invoicedDate) : undefined,
      followUpDate: data.followUpDate ? new Date(data.followUpDate) : undefined,
    };

    if (hasOwnField(data, 'claimNumber')) {
      updateData.claimNumber = data.claimNumber || null;
    }

    if (hasOwnField(data, 'claimFiledDate')) {
      updateData.claimFiledDate = parseDate(data.claimFiledDate);
    }

    if (hasOwnField(data, 'insuranceCarrier')) {
      updateData.insuranceCarrier = data.insuranceCarrier || null;
    }

    if (hasOwnField(data, 'adjusterName')) {
      updateData.adjusterName = data.adjusterName || null;
    }

    if (hasOwnField(data, 'adjusterEmail')) {
      updateData.adjusterEmail = data.adjusterEmail || null;
    }

    if (hasOwnField(data, 'adjusterOfficePhone')) {
      updateData.adjusterOfficePhone = data.adjusterOfficePhone || null;
    }

    if (hasOwnField(data, 'fieldAdjusterMobile')) {
      updateData.fieldAdjusterMobile = data.fieldAdjusterMobile || null;
    }

    if (hasOwnField(data, 'damageLocation')) {
      updateData.damageLocation = data.damageLocation || null;
    }

    if (hasOwnField(data, 'dateOfLoss')) {
      updateData.dateOfLoss = parseDate(data.dateOfLoss);
    }

    if (hasOwnField(data, 'ownerId')) {
      updateData.owner = data.ownerId
        ? { connect: { id: data.ownerId } }
        : { disconnect: true };
      delete updateData.ownerId;
    }

    if (hasOwnField(data, 'projectManagerId')) {
      updateData.projectManager = data.projectManagerId
        ? { connect: { id: data.projectManagerId } }
        : { disconnect: true };
      delete updateData.projectManagerId;
    }
    // Handle line items separately if provided
    if (data.lineItems !== undefined) {
      // Delete existing line items and recreate
      await prisma.opportunityLineItem.deleteMany({ where: { opportunityId: id } });

      if (data.lineItems?.length > 0) {
        await prisma.opportunityLineItem.createMany({
          data: data.lineItems.map((li, index) => ({
            opportunityId: id,
            name: li.name || li.product?.name || 'Line Item',
            description: li.description,
            productCode: li.productCode,
            quantity: li.quantity || 1,
            unitPrice: li.unitPrice || 0,
            totalPrice: li.total || li.totalPrice || (li.quantity || 1) * (li.unitPrice || 0),
            discount: li.discount,
            sortOrder: index,
            productId: li.productId,
          })),
        });
      }
    }

    const include = {
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobilePhone: true } },
      projectManager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobilePhone: true } },
      lineItems: { include: { product: true } },
    };

    let opportunity;
    let lastUpdateError;
    let updatePayload = { ...updateData };
    let includePayload = { ...include };
    const removedClaimFields = new Set();

    const maxUpdateAttempts = OPTIONAL_OPPORTUNITY_CLAIM_FIELDS.size + OPTIONAL_OPPORTUNITY_INCLUDE_FIELDS.size + 1;
    for (let attempt = 0; attempt < maxUpdateAttempts; attempt += 1) {
      try {
        opportunity = await prisma.opportunity.update({
          where: { id },
          data: updatePayload,
          include: includePayload,
        });
        break;
      } catch (error) {
        lastUpdateError = error;
        const unknownField = parseUnknownPrismaFieldName(error);
        if (!unknownField) {
          throw error;
        }

        if (OPTIONAL_OPPORTUNITY_CLAIM_FIELDS.has(unknownField) && hasOwnField(updatePayload, unknownField)) {
          logger.warn(
            `Opportunity update: runtime schema missing optional field "${unknownField}", retrying update without it`
          );
          removedClaimFields.add(unknownField);
          delete updatePayload[unknownField];
          continue;
        }

        if (OPTIONAL_OPPORTUNITY_INCLUDE_FIELDS.has(unknownField) && hasOwnField(includePayload, unknownField)) {
          logger.warn(
            `Opportunity update: runtime schema missing optional include "${unknownField}", retrying update without it`
          );
          delete includePayload[unknownField];
          continue;
        }

        throw error;
      }
    }

    if (!opportunity && lastUpdateError) {
      throw lastUpdateError;
    }

    if (removedClaimFields.size > 0) {
      try {
        await applyClaimRawFallback(id, data, Array.from(removedClaimFields));
        opportunity = await hydrateClaimFallbackFromRaw(id, opportunity);
      } catch (fallbackError) {
        logger.warn(`Opportunity update fallback failed for ${id}: ${fallbackError.message}`);
      }
    }

    logger.info(`Opportunity updated: ${id}`);

    // ============================================================================
    // INSURANCE WORKFLOW TRIGGERS
    // Evaluate and fire automations based on status/stage changes
    // Per Scribehow: After adjuster meeting, create task, note, and service appointment
    // ============================================================================
    if (previousState && (opportunity.type === 'INSURANCE' || data.type === 'INSURANCE')) {
      try {
        // Build changes object to pass to triggers
        const changes = {
          stageName: data.stageName,
          stage: data.stage,
          status: data.status,
          isApproved: data.isApproved,
          claimNumber: data.claimNumber,
          insuranceCarrier: data.insuranceCarrier,
          claimFiledDate: data.claimFiledDate,
          isPandaClaims: data.isPandaClaims,
          rcvAmount: data.rcvAmount,
          acvAmount: data.acvAmount,
          deductible: data.deductible,
          // Include previous values for comparison
          _previousStageName: previousState.stageName,
          _previousStage: previousState.stage,
          _previousStatus: previousState.status,
          _previousIsApproved: previousState.isApproved,
          _previousClaimNumber: previousState.claimNumber,
        };

        // Only trigger if there was an actual change in relevant fields
        const hasRelevantChange =
          changes.stageName !== previousState.stageName ||
          changes.stage !== previousState.stage ||
          changes.status !== previousState.status ||
          changes.isApproved !== previousState.isApproved ||
          (changes.claimNumber && !previousState.claimNumber);

        if (hasRelevantChange) {
          const triggers = await getInsuranceTriggers();
          const effectiveUserId = userId || opportunity.ownerId;

          // Fire async - don't block the update response
          triggers.evaluateInsuranceTriggers(id, changes, effectiveUserId)
            .then(results => {
              if (results.length > 0) {
                logger.info(`Insurance triggers fired for opportunity ${id}:`, results.map(r => r.trigger));
              }
            })
            .catch(err => {
              logger.warn(`Insurance triggers failed for opportunity ${id}:`, err.message);
            });
        }
      } catch (triggerError) {
        // Log but don't fail the update if triggers have an issue
        logger.warn(`Failed to evaluate insurance triggers for ${id}:`, triggerError.message);
      }
    }

    // Evaluate expediting triggers if expediting-related fields changed
    const expeditingFields = ['flatRoof', 'lineDrop', 'supplementRequired', 'supplementHoldsJob'];
    const hasExpeditingChange = expeditingFields.some(field => data[field] !== undefined);

    if (hasExpeditingChange) {
      try {
        // Get previous values for expediting fields
        const previousExpeditingState = {
          flatRoof: previousState?.flatRoof,
          lineDrop: previousState?.lineDrop,
          supplementRequired: previousState?.supplementRequired,
          supplementHoldsJob: previousState?.supplementHoldsJob,
        };

        const expeditingChanges = {
          flatRoof: opportunity.flatRoof,
          lineDrop: opportunity.lineDrop,
          supplementRequired: opportunity.supplementRequired,
          supplementHoldsJob: opportunity.supplementHoldsJob,
        };

        const triggers = await getExpeditingTriggers();
        const effectiveUserId = userId || opportunity.ownerId;

        // Fire async - don't block the update response
        triggers.evaluateExpeditingTriggers(id, expeditingChanges, previousExpeditingState, effectiveUserId)
          .then(results => {
            if (results.flatRoof || results.lineDrop || results.supplementHold) {
              logger.info(`Expediting triggers fired for opportunity ${id}:`, results);
            }
          })
          .catch(err => {
            logger.warn(`Expediting triggers failed for opportunity ${id}:`, err.message);
          });
      } catch (triggerError) {
        logger.warn(`Failed to evaluate expediting triggers for ${id}:`, triggerError.message);
      }
    }

    const wrappedOpportunity = await hydrateClaimFallbackFromRaw(id, opportunity);
    return this.createOpportunityWrapper(wrappedOpportunity, true);
  }

  /**
   * Record appointment result and update opportunity disposition/claim info
   */
  async createAppointmentResult(id, payload = {}, userContext = {}) {
    const opportunity = await prisma.opportunity.findUnique({ where: { id } });
    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const validation = validateAppointmentResultPayload(payload);
    if (!validation.valid) {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.details = validation.errors;
      throw error;
    }

    const followUpAt = parseDate(payload.followUpAt);
    const claimFiledDate = parseDate(payload.claimFiledDate);
    const dateOfLoss = parseDate(payload.dateOfLoss);

    const appointmentResult = await prisma.appointmentResult.create({
      data: {
        opportunityId: id,
        appointmentId: payload.appointmentId || null,
        payload,
        dispositionCategory: payload.dispositionCategory,
        dispositionReason: payload.dispositionReason || null,
        followUpAt,
        insuranceCompany: payload.insuranceCompany || null,
        claimNumber: payload.claimNumber || null,
        claimFiledDate,
        dateOfLoss,
        damageLocation: payload.damageLocation || null,
        createdById: userContext?.userId || null,
      },
    });

    const updateData = {
      currentDispositionCategory: payload.dispositionCategory,
      currentDispositionReason: payload.dispositionReason || null,
      followUpDate: followUpAt || undefined,
      claimNumber: payload.claimNumber || undefined,
      claimFiledDate: claimFiledDate || undefined,
      insuranceCarrier: payload.insuranceCompany || undefined,
      dateOfLoss: dateOfLoss || undefined,
      damageLocation: payload.damageLocation || undefined,
    };

    const normalizedWorkType = String(payload.workType || '').trim();
    const stormDamageAnswer = String(payload?.answers?.stormDamage || '').trim().toLowerCase();
    const isInsurancePath = normalizedWorkType.toLowerCase() === 'insurance'
      || [DISPOSITION_CATEGORIES.INSURANCE_CLAIM_FILED, DISPOSITION_CATEGORIES.INSURANCE_NO_CLAIM]
        .includes(payload.dispositionCategory)
      || stormDamageAnswer === 'yes';
    const isRetailPath = normalizedWorkType.toLowerCase() === 'retail'
      || [DISPOSITION_CATEGORIES.RETAIL_SOLD, DISPOSITION_CATEGORIES.RETAIL_NOT_SOLD]
        .includes(payload.dispositionCategory)
      || stormDamageAnswer === 'no';

    // Work type is intentionally set only after Result Appointment completion.
    if (isInsurancePath) {
      updateData.workType = 'Insurance';
      updateData.type = 'INSURANCE';
    } else if (isRetailPath) {
      updateData.workType = 'Retail';
      updateData.type = 'RETAIL';
    }

    if (payload.autoStageUpdate !== false) {
      const stage = DISPOSITION_STAGE_MAP[payload.dispositionCategory];
      if (stage) {
        updateData.stage = stage;
      }
    }

    const updatedOpportunity = await prisma.opportunity.update({
      where: { id },
      data: updateData,
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        lineItems: { include: { product: true } },
      },
    });

    return {
      opportunity: this.createOpportunityWrapper(updatedOpportunity, true),
      appointmentResult,
    };
  }

  /**
   * Assign a Job ID to an existing opportunity that doesn't have one
   * @param {string} id - Opportunity ID
   * @returns {Promise<Object>} Updated opportunity with jobId
   */
  async assignJobId(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { id: true, jobId: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // If already has a jobId, return it
    if (opportunity.jobId) {
      logger.info(`Opportunity ${id} already has Job ID: ${opportunity.jobId}`);
      return { jobId: opportunity.jobId, assigned: false };
    }

    // Generate and assign a new Job ID
    const jobId = await prisma.$transaction(async (tx) => {
      const newJobId = await this.generateJobId(tx);
      if (newJobId) {
        await tx.opportunity.update({
          where: { id },
          data: { jobId: newJobId },
        });
      }
      return newJobId;
    });

    if (!jobId) {
      const error = new Error('Failed to generate Job ID');
      error.name = 'InternalError';
      throw error;
    }

    logger.info(`Assigned Job ID ${jobId} to opportunity ${id} (${opportunity.name})`);
    return { jobId, assigned: true };
  }

  /**
   * Delete opportunity
   */
  async deleteOpportunity(id) {
    await prisma.opportunity.delete({ where: { id } });
    logger.info(`Opportunity deleted: ${id}`);
    return { deleted: true };
  }

  /**
   * Create opportunity wrapper with computed fields
   */
  createOpportunityWrapper(opp, includeDetails = false) {
    const wrapper = {
      id: opp.id,
      name: opp.name,
      jobId: opp.jobId, // Job ID in format YYYY-NNNN (e.g., 2025-49106)
      description: opp.description,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      status: opp.status,
      probability: opp.probability,
      closeDate: opp.closeDate,
      appointmentDate: opp.appointmentDate,
      soldDate: opp.soldDate,
      amount: opp.amount ? Number(opp.amount) : null,
      contractTotal: opp.contractTotal ? Number(opp.contractTotal) : null,
      type: opp.type,
      workType: opp.workType,
      leadSource: opp.leadSource,
      isSelfGen: opp.isSelfGen,
      isPandaClaims: opp.isPandaClaims,
      isApproved: opp.isApproved,
      followUpDate: opp.followUpDate,
      currentDispositionCategory: opp.currentDispositionCategory,
      currentDispositionReason: opp.currentDispositionReason,
      damageLocation: opp.damageLocation,
      dateOfLoss: opp.dateOfLoss,
      isClosed: ['CLOSED_WON', 'CLOSED_LOST'].includes(opp.stage),
      isWon: opp.stage === 'CLOSED_WON',
      // Account
      accountId: opp.accountId,
      accountName: opp.account?.name,
      accountLocation: opp.account ? `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.replace(/^, |, $/, '') : '',
      // Contact
      contactId: opp.contactId,
      contactName: opp.contact ? `${opp.contact.firstName} ${opp.contact.lastName}` : null,
      contactPhone: opp.contact?.phone,
      contactEmail: opp.contact?.email,
      // Owner
      ownerId: opp.ownerId,
      ownerName: opp.owner ? `${opp.owner.firstName} ${opp.owner.lastName}` : 'Unassigned',
      projectManagerId: opp.projectManagerId || null,
      projectManager: opp.projectManager || null,
      // Insurance / claim
      claimNumber: opp.claimNumber,
      claimFiledDate: opp.claimFiledDate,
      insuranceCarrier: opp.insuranceCarrier,
      adjusterName: opp.adjusterName,
      adjusterEmail: opp.adjusterEmail,
      adjusterOfficePhone: opp.adjusterOfficePhone,
      fieldAdjusterMobile: opp.fieldAdjusterMobile,
      rcvAmount: opp.rcvAmount ? Number(opp.rcvAmount) : null,
      acvAmount: opp.acvAmount ? Number(opp.acvAmount) : null,
      deductible: opp.deductible ? Number(opp.deductible) : null,
      supplementsTotal: opp.supplementsTotal ? Number(opp.supplementsTotal) : null,
      // Timestamps
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
      // Counts
      quoteCount: opp._count?.quotes,
      workOrderCount: opp._count?.workOrders,
      // Address
      street: opp.street,
      city: opp.city,
      state: opp.state,
      postalCode: opp.postalCode,
      // Styling
      stageClass: this.getStageClass(opp.stage),
      typeClass: this.getTypeClass(opp.type),
    };

    // Include related records for detail view
    if (includeDetails) {
      wrapper.account = opp.account;
      wrapper.contact = opp.contact;
      wrapper.quotes = opp.quotes;
      wrapper.orders = opp.orders;
      wrapper.serviceContract = opp.serviceContract;
      wrapper.commissions = opp.commissions;
      wrapper.notes = opp.notes;
      wrapper.tasks = opp.tasks;
      // Include line items with formatted data
      wrapper.lineItems = opp.lineItems?.map((li) => ({
        id: li.id,
        name: li.name,
        description: li.description,
        productCode: li.productCode,
        quantity: li.quantity,
        unitPrice: Number(li.unitPrice),
        totalPrice: Number(li.totalPrice),
        total: Number(li.totalPrice),
        discount: li.discount ? Number(li.discount) : null,
        sortOrder: li.sortOrder,
        product: li.product,
      })) || [];
    }

    return wrapper;
  }

  /**
   * Format stage name for display
   */
  formatStageName(stage) {
    if (!stage) return 'Unknown';
    return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Get CSS class for stage
   */
  getStageClass(stage) {
    if (!stage) return 'stage-default';
    if (stage === 'CLOSED_WON') return 'stage-won';
    if (stage === 'CLOSED_LOST') return 'stage-lost';
    if (stage.includes('LEAD')) return 'stage-lead';
    if (stage.includes('APPROVED') || stage.includes('CONTRACT')) return 'stage-active';
    if (stage.includes('PRODUCTION') || stage.includes('COMPLETED')) return 'stage-production';
    return 'stage-default';
  }

  /**
   * Get CSS class for type
   */
  getTypeClass(type) {
    if (!type) return 'type-default';
    if (type === 'INSURANCE') return 'type-insurance';
    if (type === 'RETAIL') return 'type-retail';
    if (type === 'COMMERCIAL') return 'type-commercial';
    return 'type-default';
  }

  // ============================================================================
  // CALL CENTER METHODS
  // These support the Call Center dashboard for scheduling appointments
  // ============================================================================

  /**
   * Get unscheduled appointments - opportunities that were converted from leads
   * but don't have a scheduled service appointment yet
   * Used by: Call Center Dashboard - Unscheduled Appointments tab
   */
  async getUnscheduledAppointments(options = {}) {
    const { startDate, endDate, sortBy = 'appointmentDate', sortOrder = 'asc' } = options;

    // Build date filter for tentative/expected appointment date
    const dateFilter = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    // Find opportunities that:
    // 1. Are in early stages (just converted from lead, need appointment)
    // 2. Have an expected appointment date (tentativeAppointmentDate stored from lead conversion)
    // 3. Do NOT have a scheduled service appointment yet
    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: {
          in: ['LEAD_ASSIGNED', 'SCHEDULED', 'LEAD_UNASSIGNED'],
        },
        // Optional date filter on expected appointment date
        ...(Object.keys(dateFilter).length > 0
          ? { appointmentDate: dateFilter }
          : { appointmentDate: { not: null } }),
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            phone: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            billingPostalCode: true,
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            mobilePhone: true,
            email: true,
          },
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workOrders: {
          include: {
            serviceAppointments: {
              where: {
                status: { in: ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'] },
              },
            },
          },
        },
      },
      orderBy: {
        [sortBy === 'tentativeAppointmentDate' ? 'appointmentDate' : sortBy]: sortOrder,
      },
    });

    // Filter to only those without any scheduled appointments
    const unscheduledOpportunities = opportunities.filter((opp) => {
      // Check if any work order has a scheduled appointment
      const hasScheduledAppointment = opp.workOrders.some(
        (wo) => wo.serviceAppointments.length > 0
      );
      return !hasScheduledAppointment;
    });

    // Format response for call center dashboard
    const formatted = unscheduledOpportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      type: opp.type,
      tentativeAppointmentDate: opp.appointmentDate,
      expectedAppointmentDate: opp.appointmentDate,
      // Account info
      account: opp.account
        ? {
            id: opp.account.id,
            name: opp.account.name,
            phone: opp.account.phone,
            address: [
              opp.account.billingStreet,
              opp.account.billingCity,
              opp.account.billingState,
              opp.account.billingPostalCode,
            ]
              .filter(Boolean)
              .join(', '),
          }
        : null,
      // Contact info for calling
      contact: opp.contact
        ? {
            id: opp.contact.id,
            name: `${opp.contact.firstName} ${opp.contact.lastName}`,
            firstName: opp.contact.firstName,
            lastName: opp.contact.lastName,
            phone: opp.contact.phone || opp.contact.mobilePhone,
            mobilePhone: opp.contact.mobilePhone,
            email: opp.contact.email,
          }
        : null,
      // Owner (sales rep)
      owner: opp.owner
        ? {
            id: opp.owner.id,
            name: `${opp.owner.firstName} ${opp.owner.lastName}`,
            email: opp.owner.email,
          }
        : null,
      createdAt: opp.createdAt,
    }));

    return {
      opportunities: formatted,
      total: formatted.length,
    };
  }

  /**
   * Book a service appointment for an opportunity
   * Creates WorkOrder (if needed) and ServiceAppointment
   * Used by: Call Center after confirming appointment with customer
   */
  async bookAppointment(opportunityId, data) {
    const { scheduledStart, scheduledEnd, workTypeId, notes, bookedBy } = data;

    // Get the opportunity with account info
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Check if there's already a work order for this opportunity
    let workOrder = await prisma.workOrder.findFirst({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });

    // Create work order if none exists
    if (!workOrder) {
      workOrder = await prisma.workOrder.create({
        data: {
          subject: `Inspection - ${opportunity.name}`,
          status: 'NEW',
          priority: 'NORMAL',
          description: `Service appointment for ${opportunity.name}`,
          opportunityId: opportunityId,
          accountId: opportunity.accountId,
          contactId: opportunity.contactId,
          workTypeId: workTypeId,
          // Address from opportunity or account
          street: opportunity.street || opportunity.account?.billingStreet,
          city: opportunity.city || opportunity.account?.billingCity,
          state: opportunity.state || opportunity.account?.billingState,
          postalCode: opportunity.postalCode || opportunity.account?.billingPostalCode,
        },
      });
    }

    // Create the service appointment
    const serviceAppointment = await prisma.serviceAppointment.create({
      data: {
        subject: `${opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit'} - ${opportunity.name}`,
        status: 'SCHEDULED',
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        duration: Math.round(
          (new Date(scheduledEnd) - new Date(scheduledStart)) / (1000 * 60)
        ), // Duration in minutes
        description: notes,
        workOrderId: workOrder.id,
        // Address
        street: workOrder.street,
        city: workOrder.city,
        state: workOrder.state,
        postalCode: workOrder.postalCode,
      },
    });

    // Update opportunity stage to SCHEDULED
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: 'SCHEDULED',
        status: 'Scheduled',
        appointmentDate: new Date(scheduledStart),
      },
    });

    // Create a note documenting the appointment booking
    await prisma.note.create({
      data: {
        title: 'Appointment Booked',
        body: `Service appointment scheduled for ${new Date(scheduledStart).toLocaleString()}. ${notes ? `Notes: ${notes}` : ''}`,
        opportunityId: opportunityId,
        createdById: bookedBy,
      },
    });

    logger.info(
      `Appointment booked for opportunity ${opportunityId}: SA ${serviceAppointment.id}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the new appointment
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who booked the appointment for notification context
      let bookedByName = 'Call Center';
      if (bookedBy) {
        const bookedByUser = await prisma.user.findUnique({
          where: { id: bookedBy },
          select: { firstName: true, lastName: true },
        });
        if (bookedByUser) {
          bookedByName = `${bookedByUser.firstName} ${bookedByUser.lastName}`;
        }
      }

      // Get inspectors to notify (assigned resources or territory members)
      const inspectorIds = await notifications.getInspectorsForNotification({
        workOrderId: workOrder.id,
        opportunityId: opportunityId,
      });

      // If no assigned resources yet, notify opportunity owner
      const notifyIds =
        inspectorIds.length > 0 ? inspectorIds : opportunity.ownerId ? [opportunity.ownerId] : [];

      // Send notifications to each inspector
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentBooked(
          inspectorId,
          {
            id: serviceAppointment.id,
            subject: serviceAppointment.subject,
            scheduledStart: serviceAppointment.scheduledStart,
            scheduledEnd: serviceAppointment.scheduledEnd,
            workOrderId: workOrder.id,
            appointmentType: opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          opportunity,
          {
            notes,
            bookedByName,
          }
        );
      }

      logger.info(
        `Sent appointment notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      // Log but don't fail the booking if notifications fail
      logger.warn(`Failed to send appointment notifications: ${notifyError.message}`);
    }

    return {
      success: true,
      workOrder: {
        id: workOrder.id,
        subject: workOrder.subject,
        status: workOrder.status,
      },
      serviceAppointment: {
        id: serviceAppointment.id,
        subject: serviceAppointment.subject,
        status: serviceAppointment.status,
        scheduledStart: serviceAppointment.scheduledStart,
        scheduledEnd: serviceAppointment.scheduledEnd,
        duration: serviceAppointment.duration,
      },
      opportunity: {
        id: opportunity.id,
        name: opportunity.name,
        stage: 'SCHEDULED',
      },
      notificationsSent: true,
    };
  }

  /**
   * Reschedule an existing service appointment
   * Used by: Call Center when customer requests reschedule
   */
  async rescheduleAppointment(opportunityId, appointmentId, data) {
    const { scheduledStart, scheduledEnd, notes, rescheduledBy } = data;

    // Verify the appointment belongs to this opportunity
    const appointment = await prisma.serviceAppointment.findFirst({
      where: {
        id: appointmentId,
        workOrder: { opportunityId },
      },
      include: {
        workOrder: {
          include: {
            opportunity: true,
          },
        },
        assignedResources: {
          include: { serviceResource: true },
        },
      },
    });

    if (!appointment) {
      const error = new Error(
        `Appointment ${appointmentId} not found for opportunity ${opportunityId}`
      );
      error.name = 'NotFoundError';
      throw error;
    }

    const oldStart = appointment.scheduledStart;
    const oldEnd = appointment.scheduledEnd;

    // Update the appointment
    const updatedAppointment = await prisma.serviceAppointment.update({
      where: { id: appointmentId },
      data: {
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        duration: Math.round(
          (new Date(scheduledEnd) - new Date(scheduledStart)) / (1000 * 60)
        ),
        status: 'SCHEDULED', // Reset to scheduled if was in another state
      },
    });

    // Update opportunity appointment date
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        appointmentDate: new Date(scheduledStart),
      },
    });

    // Create note documenting the reschedule
    await prisma.note.create({
      data: {
        title: 'Appointment Rescheduled',
        body: `Appointment rescheduled from ${oldStart.toLocaleString()} to ${new Date(scheduledStart).toLocaleString()}. ${notes ? `Reason: ${notes}` : ''}`,
        opportunityId: opportunityId,
        createdById: rescheduledBy,
      },
    });

    logger.info(
      `Appointment ${appointmentId} rescheduled for opportunity ${opportunityId}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the reschedule
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who rescheduled for notification context
      let rescheduledByName = 'Call Center';
      if (rescheduledBy) {
        const rescheduledByUser = await prisma.user.findUnique({
          where: { id: rescheduledBy },
          select: { firstName: true, lastName: true },
        });
        if (rescheduledByUser) {
          rescheduledByName = `${rescheduledByUser.firstName} ${rescheduledByUser.lastName}`;
        }
      }

      // Get inspectors to notify from assigned resources
      const inspectorIds = appointment.assignedResources
        .filter((ar) => ar.serviceResource?.userId)
        .map((ar) => ar.serviceResource.userId);

      // If no assigned resources, try to get from notification service or use owner
      let notifyIds = inspectorIds;
      if (notifyIds.length === 0) {
        notifyIds = await notifications.getInspectorsForNotification({
          workOrderId: appointment.workOrderId,
          opportunityId: opportunityId,
        });
      }
      if (notifyIds.length === 0 && appointment.workOrder.opportunity.ownerId) {
        notifyIds = [appointment.workOrder.opportunity.ownerId];
      }

      // Send notifications
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentRescheduled(
          inspectorId,
          {
            id: updatedAppointment.id,
            subject: updatedAppointment.subject,
            scheduledStart: updatedAppointment.scheduledStart,
            scheduledEnd: updatedAppointment.scheduledEnd,
            workOrderId: appointment.workOrderId,
            appointmentType: appointment.workOrder.opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          appointment.workOrder.opportunity,
          { previousStart: oldStart, previousEnd: oldEnd },
          {
            notes,
            rescheduledByName,
          }
        );
      }

      logger.info(
        `Sent reschedule notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      logger.warn(`Failed to send reschedule notifications: ${notifyError.message}`);
    }

    // Return info for notification to assigned crew/inspector
    return {
      success: true,
      appointment: {
        id: updatedAppointment.id,
        subject: updatedAppointment.subject,
        status: updatedAppointment.status,
        scheduledStart: updatedAppointment.scheduledStart,
        scheduledEnd: updatedAppointment.scheduledEnd,
        previousStart: oldStart,
        previousEnd: oldEnd,
      },
      // Crew to notify
      assignedResources: appointment.assignedResources.map((ar) => ({
        id: ar.serviceResource.id,
        name: ar.serviceResource.name,
        phone: ar.serviceResource.phone,
        email: ar.serviceResource.email,
      })),
      opportunity: {
        id: opportunityId,
        name: appointment.workOrder.opportunity.name,
      },
      notificationsSent: true,
    };
  }

  /**
   * Cancel a service appointment
   * Used by: Call Center when customer cancels
   */
  async cancelAppointment(opportunityId, appointmentId, data) {
    const { reason, cancelledBy } = data;

    // Verify the appointment belongs to this opportunity
    const appointment = await prisma.serviceAppointment.findFirst({
      where: {
        id: appointmentId,
        workOrder: { opportunityId },
      },
      include: {
        workOrder: {
          include: { opportunity: true },
        },
        assignedResources: {
          include: { serviceResource: true },
        },
      },
    });

    if (!appointment) {
      const error = new Error(
        `Appointment ${appointmentId} not found for opportunity ${opportunityId}`
      );
      error.name = 'NotFoundError';
      throw error;
    }

    // Update appointment status to CANCELED
    const updatedAppointment = await prisma.serviceAppointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELED',
        description: appointment.description
          ? `${appointment.description}\n\nCancellation reason: ${reason}`
          : `Cancellation reason: ${reason}`,
      },
    });

    // Update opportunity - may need to go back to earlier stage
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'Appointment Cancelled',
        // Don't clear appointmentDate - keep for reference
      },
    });

    // Create note documenting the cancellation
    await prisma.note.create({
      data: {
        title: 'Appointment Cancelled',
        body: `Service appointment for ${appointment.scheduledStart.toLocaleString()} was cancelled. Reason: ${reason}`,
        opportunityId: opportunityId,
        createdById: cancelledBy,
      },
    });

    logger.info(
      `Appointment ${appointmentId} cancelled for opportunity ${opportunityId}: ${reason}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the cancellation
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who cancelled for notification context
      let cancelledByName = 'Call Center';
      if (cancelledBy) {
        const cancelledByUser = await prisma.user.findUnique({
          where: { id: cancelledBy },
          select: { firstName: true, lastName: true },
        });
        if (cancelledByUser) {
          cancelledByName = `${cancelledByUser.firstName} ${cancelledByUser.lastName}`;
        }
      }

      // Get inspectors to notify from assigned resources
      const inspectorIds = appointment.assignedResources
        .filter((ar) => ar.serviceResource?.userId)
        .map((ar) => ar.serviceResource.userId);

      // If no assigned resources, try to get from notification service or use owner
      let notifyIds = inspectorIds;
      if (notifyIds.length === 0) {
        notifyIds = await notifications.getInspectorsForNotification({
          workOrderId: appointment.workOrderId,
          opportunityId: opportunityId,
        });
      }
      if (notifyIds.length === 0 && appointment.workOrder.opportunity.ownerId) {
        notifyIds = [appointment.workOrder.opportunity.ownerId];
      }

      // Send notifications - cancellations are urgent
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentCancelled(
          inspectorId,
          {
            id: updatedAppointment.id,
            subject: updatedAppointment.subject,
            scheduledStart: appointment.scheduledStart,
            scheduledEnd: appointment.scheduledEnd,
            workOrderId: appointment.workOrderId,
            appointmentType: appointment.workOrder.opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          appointment.workOrder.opportunity,
          reason,
          {
            cancelledByName,
          }
        );
      }

      logger.info(
        `Sent cancellation notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      logger.warn(`Failed to send cancellation notifications: ${notifyError.message}`);
    }

    // Return info for notification to assigned crew/inspector
    return {
      success: true,
      appointment: {
        id: updatedAppointment.id,
        subject: updatedAppointment.subject,
        status: 'CANCELED',
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        cancellationReason: reason,
      },
      // Crew to notify
      assignedResources: appointment.assignedResources.map((ar) => ({
        id: ar.serviceResource.id,
        name: ar.serviceResource.name,
        phone: ar.serviceResource.phone,
        email: ar.serviceResource.email,
      })),
      opportunity: {
        id: opportunityId,
        name: appointment.workOrder.opportunity.name,
      },
      notificationsSent: true,
    };
  }

  /**
   * Add a job message/note to an opportunity
   * Used by: Call Center to document calls and status updates
   */
  async addJobMessage(opportunityId, data) {
    const { message, createdBy } = data;

    // Verify opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Create the note
    const note = await prisma.note.create({
      data: {
        title: 'Job Message',
        body: message,
        opportunityId: opportunityId,
        createdById: createdBy,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info(`Job message added to opportunity ${opportunityId}`);

    return {
      success: true,
      note: {
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
        createdBy: note.createdBy
          ? `${note.createdBy.firstName} ${note.createdBy.lastName}`
          : 'System',
      },
      opportunity: {
        id: opportunity.id,
        name: opportunity.name,
      },
    };
  }

  // ============================================================================
  // SERVICE REQUEST METHODS
  // Per Creating A Service Request SOP - service requests live on jobs (opportunities)
  // ============================================================================

  /**
   * Get opportunities with active service requests
   * Used by: Project Manager dashboard to track service needs
   */
  async getServiceRequests(options = {}) {
    const { status = 'pending', projectManagerId, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      serviceRequired: true,
    };

    if (status === 'pending') {
      where.serviceComplete = false;
    } else if (status === 'complete') {
      where.serviceComplete = true;
    }
    // 'all' doesn't add serviceComplete filter

    if (projectManagerId) {
      where.projectManagerId = projectManagerId;
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { serviceRequestDate: 'desc' },
        include: {
          account: {
            select: { id: true, name: true, phone: true, billingCity: true, billingState: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
          projectManager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    const data = opportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      type: opp.type,
      // Service request fields
      serviceRequired: opp.serviceRequired,
      serviceComplete: opp.serviceComplete,
      serviceRequestDate: opp.serviceRequestDate,
      serviceNotes: opp.serviceNotes,
      // Related records
      account: opp.account
        ? {
            id: opp.account.id,
            name: opp.account.name,
            phone: opp.account.phone,
            location: `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.replace(/^, |, $/, ''),
          }
        : null,
      contact: opp.contact
        ? {
            id: opp.contact.id,
            name: `${opp.contact.firstName} ${opp.contact.lastName}`,
            phone: opp.contact.phone,
            email: opp.contact.email,
          }
        : null,
      owner: opp.owner
        ? {
            id: opp.owner.id,
            name: `${opp.owner.firstName} ${opp.owner.lastName}`,
          }
        : null,
      projectManager: opp.projectManager
        ? {
            id: opp.projectManager.id,
            name: `${opp.projectManager.firstName} ${opp.projectManager.lastName}`,
            email: opp.projectManager.email,
          }
        : null,
      createdAt: opp.createdAt,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Create a service request on an opportunity
   * Per SOP: PM creates service request when service is needed
   */
  async createServiceRequest(opportunityId, data) {
    const { projectManagerId, serviceNotes, createdBy } = data;

    // Verify opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Update opportunity with service request fields
    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        serviceRequired: true,
        serviceComplete: false,
        serviceRequestDate: new Date(),
        serviceNotes: serviceNotes,
        projectManagerId: projectManagerId,
      },
      include: {
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Create note documenting the service request
    await prisma.note.create({
      data: {
        title: 'Service Request Created',
        body: `Service request created. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`,
        opportunityId: opportunityId,
        createdById: createdBy,
      },
    });

    logger.info(`Service request created for opportunity ${opportunityId}`);

    return {
      success: true,
      opportunity: {
        id: updated.id,
        name: updated.name,
        serviceRequired: updated.serviceRequired,
        serviceComplete: updated.serviceComplete,
        serviceRequestDate: updated.serviceRequestDate,
        serviceNotes: updated.serviceNotes,
        projectManager: updated.projectManager
          ? {
              id: updated.projectManager.id,
              name: `${updated.projectManager.firstName} ${updated.projectManager.lastName}`,
              email: updated.projectManager.email,
            }
          : null,
      },
    };
  }

  /**
   * Update a service request on an opportunity
   */
  async updateServiceRequest(opportunityId, data) {
    const { serviceComplete, serviceNotes, projectManagerId, updatedBy } = data;

    // Verify opportunity exists and has a service request
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true, serviceRequired: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!opportunity.serviceRequired) {
      const error = new Error(`No service request exists for opportunity: ${opportunityId}`);
      error.name = 'ValidationError';
      throw error;
    }

    // Build update data
    const updateData = {};
    if (serviceComplete !== undefined) updateData.serviceComplete = serviceComplete;
    if (serviceNotes !== undefined) updateData.serviceNotes = serviceNotes;
    if (projectManagerId !== undefined) updateData.projectManagerId = projectManagerId;

    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: updateData,
      include: {
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Create note if status changed
    if (serviceComplete !== undefined) {
      await prisma.note.create({
        data: {
          title: serviceComplete ? 'Service Request Completed' : 'Service Request Reopened',
          body: serviceComplete
            ? `Service request marked as complete. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`
            : `Service request reopened. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`,
          opportunityId: opportunityId,
          createdById: updatedBy,
        },
      });
    }

    logger.info(`Service request updated for opportunity ${opportunityId}`);

    return {
      success: true,
      opportunity: {
        id: updated.id,
        name: updated.name,
        serviceRequired: updated.serviceRequired,
        serviceComplete: updated.serviceComplete,
        serviceRequestDate: updated.serviceRequestDate,
        serviceNotes: updated.serviceNotes,
        projectManager: updated.projectManager
          ? {
              id: updated.projectManager.id,
              name: `${updated.projectManager.firstName} ${updated.projectManager.lastName}`,
              email: updated.projectManager.email,
            }
          : null,
      },
    };
  }

  /**
   * Mark a service request as complete
   * Shortcut method for completing a service request
   */
  async completeServiceRequest(opportunityId, data) {
    const { notes, completedBy } = data;

    return this.updateServiceRequest(opportunityId, {
      serviceComplete: true,
      serviceNotes: notes,
      updatedBy: completedBy,
    });
  }

  // ============================================================================
  // BULK REASSIGNMENT METHODS
  // Contact Center feature: Bulk reassign jobs to different owners
  // ============================================================================

  /**
   * Get users who can be assigned as job owners
   * Returns sales reps, project managers, and managers who can own jobs
   */
  async getAssignableUsers() {
    const assignableRoleValues = ['SALES_REP', 'PROJECT_MANAGER', 'SALES_MANAGER', 'OFFICE_MANAGER', 'ADMIN'];
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          is: {
            isActive: true,
            OR: [
              { name: { in: assignableRoleValues } },
              { roleType: { in: assignableRoleValues } },
            ],
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: {
          select: {
            name: true,
            roleType: true,
          },
        },
        officeAssignment: true,
        _count: {
          select: {
            ownedOpportunities: {
              where: {
                stage: {
                  notIn: ['CLOSED_WON', 'CLOSED_LOST'],
                },
              },
            },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role?.name || user.role?.roleType || null,
      office: user.officeAssignment,
      activeJobCount: user._count.ownedOpportunities,
    }));
  }

  /**
   * Bulk reassign multiple jobs to a new owner
   * @param {string[]} opportunityIds - Array of opportunity IDs to reassign
   * @param {string} newOwnerId - ID of the new owner
   * @param {Object} auditContext - Context for audit logging
   */
  async bulkReassignJobs(opportunityIds, newOwnerId, auditContext = {}) {
    // Validate inputs
    if (!opportunityIds || opportunityIds.length === 0) {
      const error = new Error('No opportunity IDs provided');
      error.name = 'ValidationError';
      throw error;
    }

    if (!newOwnerId) {
      const error = new Error('New owner ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    // Verify new owner exists and is active
    const newOwner = await prisma.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
    });

    if (!newOwner) {
      const error = new Error(`User not found: ${newOwnerId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!newOwner.isActive) {
      const error = new Error('Cannot reassign to inactive user');
      error.name = 'ValidationError';
      throw error;
    }

    // Get current opportunities with their owners
    const opportunities = await prisma.opportunity.findMany({
      where: { id: { in: opportunityIds } },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
        account: {
          select: { name: true },
        },
      },
    });

    // Track results
    const results = {
      success: true,
      total: opportunityIds.length,
      reassigned: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    // Process each opportunity
    for (const opp of opportunities) {
      try {
        // Skip if already assigned to new owner
        if (opp.ownerId === newOwnerId) {
          results.skipped++;
          results.details.push({
            id: opp.id,
            name: opp.name,
            status: 'skipped',
            reason: 'Already assigned to this owner',
          });
          continue;
        }

        const previousOwner = opp.owner
          ? `${opp.owner.firstName} ${opp.owner.lastName}`
          : 'Unassigned';

        // Update the opportunity owner
        await prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            // Use relation connect to remain compatible with Prisma clients
            // where ownerId scalar is not exposed in OpportunityUpdateInput.
            owner: {
              connect: { id: newOwnerId },
            },
          },
        });

        // Create audit note
        await prisma.note.create({
          data: {
            title: 'Job Reassigned',
            body: `Job reassigned from ${previousOwner} to ${newOwner.firstName} ${newOwner.lastName}. ${auditContext.userEmail ? `Reassigned by: ${auditContext.userEmail}` : ''}`,
            opportunityId: opp.id,
            createdById: auditContext.userId,
          },
        });

        results.reassigned++;
        results.details.push({
          id: opp.id,
          name: opp.name,
          accountName: opp.account?.name,
          status: 'reassigned',
          previousOwner,
          newOwner: `${newOwner.firstName} ${newOwner.lastName}`,
        });

        logger.info(`Job ${opp.id} (${opp.name}) reassigned to ${newOwner.email}`);
      } catch (err) {
        results.failed++;
        results.details.push({
          id: opp.id,
          name: opp.name,
          status: 'failed',
          error: err.message,
        });
        logger.error(`Failed to reassign job ${opp.id}: ${err.message}`);
      }
    }

    // Check for any IDs that weren't found
    const foundIds = opportunities.map((o) => o.id);
    const notFoundIds = opportunityIds.filter((id) => !foundIds.includes(id));
    for (const id of notFoundIds) {
      results.failed++;
      results.details.push({
        id,
        status: 'failed',
        error: 'Opportunity not found',
      });
    }

    results.success = results.failed === 0;
    logger.info(
      `Bulk reassignment complete: ${results.reassigned} reassigned, ${results.skipped} skipped, ${results.failed} failed`
    );

    return results;
  }

  /**
   * Transfer a single opportunity to a different owner.
   * Compatibility endpoint for clients posting to /:id/transfer.
   * @param {string} opportunityId - Opportunity ID
   * @param {string} newOwnerId - New owner user ID
   * @param {Object} transferOptions - Transfer behavior options
   * @param {Object} auditContext - Context for audit logging
   */
  async transferOpportunity(opportunityId, newOwnerId, transferOptions = {}, auditContext = {}) {
    const normalizedOpportunityId = normalizeEntityId(opportunityId);
    const normalizedNewOwnerId = normalizeEntityId(newOwnerId);

    if (!normalizedOpportunityId) {
      const error = new Error('Opportunity ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    if (!normalizedNewOwnerId) {
      const error = new Error('New owner ID is required');
      error.name = 'ValidationError';
      throw error;
    }

    let normalizedTransferOptions = transferOptions && typeof transferOptions === 'object' ? transferOptions : {};
    let normalizedAuditContext = auditContext && typeof auditContext === 'object' ? auditContext : {};

    // Backward compatibility: older callers passed auditContext as 3rd argument.
    if (normalizedTransferOptions && !Object.keys(normalizedAuditContext).length) {
      const looksLikeAuditContext = Boolean(
        hasOwnField(normalizedTransferOptions, 'userId')
        || hasOwnField(normalizedTransferOptions, 'userEmail')
        || hasOwnField(normalizedTransferOptions, 'ipAddress')
        || hasOwnField(normalizedTransferOptions, 'userAgent')
      );

      if (looksLikeAuditContext) {
        normalizedAuditContext = normalizedTransferOptions;
        normalizedTransferOptions = {};
      }
    }

    const transferRelatedItems = parseBooleanFlag(
      normalizedTransferOptions.transferRelatedItems
      ?? normalizedTransferOptions.transferRelated
      ?? normalizedTransferOptions.transferAllAssociated
      ?? normalizedTransferOptions.transferAssociatedRecords
    );

    const auditUserId = normalizeEntityId(normalizedAuditContext.userId);

    const [opportunity, newOwner, auditUser] = await Promise.all([
      prisma.opportunity.findUnique({
        where: { id: normalizedOpportunityId },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          account: {
            select: { id: true, name: true, billingCity: true, billingState: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          _count: {
            select: { quotes: true, workOrders: true },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: normalizedNewOwnerId },
        select: { id: true, firstName: true, lastName: true, email: true, isActive: true },
      }),
      auditUserId
        ? prisma.user.findUnique({
            where: { id: auditUserId },
            select: { id: true },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${normalizedOpportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!newOwner) {
      const error = new Error(`User not found: ${newOwnerId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!newOwner.isActive) {
      const error = new Error('Cannot transfer to inactive user');
      error.name = 'ValidationError';
      throw error;
    }

    const previousOwnerName = opportunity.owner
      ? `${opportunity.owner.firstName} ${opportunity.owner.lastName}`
      : 'Unassigned';
    const newOwnerName = `${newOwner.firstName} ${newOwner.lastName}`;

    const relatedTransferBase = {
      requested: transferRelatedItems,
      completed: false,
      skippedReason: null,
      counts: {
        tasks: 0,
        events: 0,
        commissions: 0,
        serviceContracts: 0,
        photoProjects: 0,
        opportunityAttentionItems: 0,
        caseAttentionItems: 0,
        appointmentAssignments: 0,
      },
    };

    if (opportunity.ownerId === normalizedNewOwnerId) {
      return {
        transferred: false,
        reason: 'ALREADY_ASSIGNED',
        opportunity: this.createOpportunityWrapper(opportunity),
        previousOwner: opportunity.owner
          ? {
              id: opportunity.owner.id,
              name: previousOwnerName,
              email: opportunity.owner.email,
            }
          : null,
        newOwner: {
          id: newOwner.id,
          name: newOwnerName,
          email: newOwner.email,
        },
        relatedTransfer: {
          ...relatedTransferBase,
          skippedReason: transferRelatedItems ? 'ALREADY_ASSIGNED' : null,
        },
      };
    }

    const oldOwnerId = opportunity.ownerId || null;
    const resolvedAuditUserId = auditUser?.id || null;

    const updatedOpportunity = await prisma.$transaction(async (tx) => tx.opportunity.update({
      where: { id: normalizedOpportunityId },
      data: {
        // Use relation connect to avoid scalar ownerId update validation failures.
        owner: {
          connect: { id: normalizedNewOwnerId },
        },
      },
      include: {
        account: {
          select: { id: true, name: true, billingCity: true, billingState: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: {
          select: { quotes: true, workOrders: true },
        },
      },
    }));

    let relatedTransfer = { ...relatedTransferBase };
    if (transferRelatedItems) {
      try {
        relatedTransfer = await prisma.$transaction(async (tx) => this.transferRelatedOpportunityOwnership(tx, {
          opportunityId: normalizedOpportunityId,
          accountId: opportunity.accountId || null,
          oldOwnerId,
          newOwnerId: normalizedNewOwnerId,
        }));
      } catch (error) {
        logger.error('Related assignment transfer failed after owner transfer', {
          opportunityId: normalizedOpportunityId,
          oldOwnerId,
          newOwnerId: normalizedNewOwnerId,
          error: error.message,
        });

        relatedTransfer = {
          ...relatedTransferBase,
          skippedReason: 'RELATED_TRANSFER_FAILED',
          error: error.message,
        };
      }
    }

    const relatedCountsSummary = formatTransferCounts(relatedTransfer.counts);
    const relatedSummaryText = transferRelatedItems
      ? relatedCountsSummary
        ? ` Related records transferred: ${relatedCountsSummary}.`
        : ` Related records transfer requested, but no matching assignments were found.`
      : '';

    await prisma.note.create({
      data: {
        title: 'Job Reassigned',
        body: `Job reassigned from ${previousOwnerName} to ${newOwnerName}.${relatedSummaryText}${normalizedAuditContext.userEmail ? ` Reassigned by: ${normalizedAuditContext.userEmail}` : ''}`,
        opportunityId: normalizedOpportunityId,
        createdById: resolvedAuditUserId || newOwner.id,
      },
    }).catch((error) => {
      logger.warn(`Failed to create reassignment note for ${normalizedOpportunityId}: ${error.message}`);
    });

    logger.info(
      `Job ${normalizedOpportunityId} transferred from ${previousOwnerName} to ${newOwnerName}` +
      `${transferRelatedItems ? ` (related: ${relatedCountsSummary || 'none moved'})` : ''}`
    );

    return {
      transferred: true,
      opportunity: this.createOpportunityWrapper(updatedOpportunity),
      previousOwner: opportunity.owner
        ? {
            id: opportunity.owner.id,
            name: previousOwnerName,
            email: opportunity.owner.email,
          }
        : null,
      newOwner: {
        id: newOwner.id,
        name: newOwnerName,
        email: newOwner.email,
      },
      relatedTransfer,
    };
  }

  async transferRelatedOpportunityOwnership(tx, options = {}) {
    const {
      opportunityId,
      accountId,
      oldOwnerId,
      newOwnerId,
    } = options;

    const result = {
      requested: true,
      completed: false,
      skippedReason: null,
      counts: {
        tasks: 0,
        events: 0,
        commissions: 0,
        serviceContracts: 0,
        photoProjects: 0,
        opportunityAttentionItems: 0,
        caseAttentionItems: 0,
        appointmentAssignments: 0,
      },
    };

    if (!oldOwnerId) {
      result.skippedReason = 'NO_PREVIOUS_OWNER';
      return result;
    }

    const [
      taskUpdate,
      eventUpdate,
      commissionUpdate,
      serviceContractUpdate,
      photoProjectUpdate,
      opportunityAttentionUpdate,
    ] = await Promise.all([
      tx.task.updateMany({
        where: { opportunityId, assignedToId: oldOwnerId },
        data: { assignedToId: newOwnerId },
      }),
      tx.event.updateMany({
        where: { opportunityId, ownerId: oldOwnerId },
        data: { ownerId: newOwnerId },
      }),
      tx.commission.updateMany({
        where: { opportunityId, ownerId: oldOwnerId },
        data: { ownerId: newOwnerId },
      }),
      tx.serviceContract.updateMany({
        where: { opportunityId, ownerId: oldOwnerId },
        data: { ownerId: newOwnerId },
      }),
      tx.photoProject.updateMany({
        where: { opportunityId, ownerId: oldOwnerId },
        data: { ownerId: newOwnerId },
      }),
      tx.attentionItem.updateMany({
        where: { opportunityId, assignedToId: oldOwnerId },
        data: { assignedToId: newOwnerId },
      }),
    ]);

    result.counts.tasks = taskUpdate.count;
    result.counts.events = eventUpdate.count;
    result.counts.commissions = commissionUpdate.count;
    result.counts.serviceContracts = serviceContractUpdate.count;
    result.counts.photoProjects = photoProjectUpdate.count;
    result.counts.opportunityAttentionItems = opportunityAttentionUpdate.count;

    if (accountId) {
      const accountCaseIds = await tx.case.findMany({
        where: { accountId },
        select: { id: true },
      });
      const caseIds = accountCaseIds.map((record) => record.id);
      if (caseIds.length > 0) {
        const caseAttentionUpdate = await tx.attentionItem.updateMany({
          where: {
            caseId: { in: caseIds },
            assignedToId: oldOwnerId,
          },
          data: { assignedToId: newOwnerId },
        });
        result.counts.caseAttentionItems = caseAttentionUpdate.count;
      }
    }

    const [oldOwnerResource, newOwnerResource] = await Promise.all([
      tx.serviceResource.findFirst({
        where: { userId: oldOwnerId, isActive: true },
        select: { id: true },
      }),
      tx.serviceResource.findFirst({
        where: { userId: newOwnerId, isActive: true },
        select: { id: true },
      }),
    ]);

    if (
      oldOwnerResource?.id
      && newOwnerResource?.id
      && oldOwnerResource.id !== newOwnerResource.id
    ) {
      const assignments = await tx.assignedResource.findMany({
        where: {
          serviceResourceId: oldOwnerResource.id,
          serviceAppointment: {
            workOrder: {
              opportunityId,
            },
          },
        },
        select: {
          id: true,
          serviceAppointmentId: true,
          isPrimaryResource: true,
        },
      });

      for (const assignment of assignments) {
        const existingAssignment = await tx.assignedResource.findFirst({
          where: {
            serviceAppointmentId: assignment.serviceAppointmentId,
            serviceResourceId: newOwnerResource.id,
          },
          select: {
            id: true,
            isPrimaryResource: true,
          },
        });

        if (existingAssignment) {
          if (assignment.isPrimaryResource && !existingAssignment.isPrimaryResource) {
            await tx.assignedResource.update({
              where: { id: existingAssignment.id },
              data: { isPrimaryResource: true },
            });
          }

          await tx.assignedResource.delete({
            where: { id: assignment.id },
          });
        } else {
          await tx.assignedResource.update({
            where: { id: assignment.id },
            data: { serviceResourceId: newOwnerResource.id },
          });
        }

        result.counts.appointmentAssignments += 1;
      }
    }

    result.completed = true;
    return result;
  }

  /**
   * Bulk update stage for multiple opportunities
   * @param {string[]} opportunityIds - Array of opportunity IDs
   * @param {string} stage - New stage
   * @param {object} auditContext - Audit trail context
   */
  async bulkUpdateStage(opportunityIds, stage, auditContext = {}) {
    const results = {
      success: [],
      failed: [],
      total: opportunityIds.length,
    };

    for (const oppId of opportunityIds) {
      try {
        const oldOpp = await prisma.opportunity.findUnique({
          where: { id: oppId },
          select: { stage: true, name: true },
        });

        if (!oldOpp) {
          results.failed.push({ id: oppId, error: 'Opportunity not found' });
          continue;
        }

        await prisma.opportunity.update({
          where: { id: oppId },
          data: { stage },
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            tableName: 'opportunities',
            recordId: oppId,
            action: 'BULK_STAGE_UPDATE',
            oldValues: { stage: oldOpp.stage },
            newValues: { stage },
            changedFields: ['stage'],
            userId: auditContext.userId,
            userEmail: auditContext.userEmail,
            source: 'api',
          },
        }).catch((err) => logger.error('Audit log failed:', err));

        results.success.push(oppId);
      } catch (error) {
        logger.error(`Failed to update opportunity ${oppId}:`, error);
        results.failed.push({ id: oppId, error: error.message });
      }
    }

    logger.info(`Bulk stage update complete: ${results.success.length}/${results.total} succeeded`);

    return {
      success: true,
      message: `${results.success.length} of ${results.total} opportunities updated`,
      results,
    };
  }

  /**
   * Bulk delete (soft delete) multiple opportunities
   * @param {string[]} opportunityIds - Array of opportunity IDs
   * @param {object} auditContext - Audit trail context
   */
  async bulkDeleteOpportunities(opportunityIds, auditContext = {}) {
    const results = {
      success: [],
      failed: [],
      total: opportunityIds.length,
      canceledAppointments: 0,
    };

    for (const oppId of opportunityIds) {
      try {
        const oldOpp = await prisma.opportunity.findUnique({
          where: { id: oppId },
          select: { id: true, name: true, stage: true },
        });

        if (!oldOpp) {
          results.failed.push({ id: oppId, error: 'Opportunity not found' });
          continue;
        }

        // Soft delete by setting stage to CLOSED_LOST and adding deletion marker.
        // Also cancel any active service appointments tied to this job's work orders.
        const workOrderIds = (await prisma.workOrder.findMany({
          where: { opportunityId: oppId },
          select: { id: true },
        })).map((wo) => wo.id);

        let canceledForOpportunity = 0;
        if (workOrderIds.length > 0) {
          const canceledResult = await prisma.serviceAppointment.updateMany({
            where: {
              workOrderId: { in: workOrderIds },
              status: { in: ['NONE', 'SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'] },
            },
            data: {
              status: 'CANCELED',
              description: 'Canceled automatically by bulk job delete',
            },
          });
          canceledForOpportunity = canceledResult.count || 0;
          results.canceledAppointments += canceledForOpportunity;
        }

        await prisma.opportunity.update({
          where: { id: oppId },
          data: {
            stage: 'CLOSED_LOST',
            closeDate: new Date(),
            lostReason: 'Bulk Deleted',
            deletedAt: new Date(),
          },
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            tableName: 'opportunities',
            recordId: oppId,
            action: 'BULK_DELETE',
            oldValues: { stage: oldOpp.stage },
            newValues: {
              stage: 'CLOSED_LOST',
              lostReason: 'Bulk Deleted',
              deletedAt: new Date(),
              canceledAppointments: canceledForOpportunity,
            },
            changedFields: ['stage', 'closeDate', 'lostReason', 'deletedAt', 'serviceAppointments'],
            userId: auditContext.userId,
            userEmail: auditContext.userEmail,
            source: 'api',
          },
        }).catch((err) => logger.error('Audit log failed:', err));

        results.success.push(oppId);
        logger.info(`Soft deleted opportunity: ${oldOpp.name}`);
      } catch (error) {
        logger.error(`Failed to delete opportunity ${oppId}:`, error);
        results.failed.push({ id: oppId, error: error.message });
      }
    }

    logger.info(`Bulk delete complete: ${results.success.length}/${results.total} succeeded`);

    return {
      success: true,
      message: `${results.success.length} of ${results.total} opportunities deleted`,
      results,
    };
  }

  /**
   * Get deleted opportunities for admin restore page
   */
  async getDeletedOpportunities(options = {}) {
    const { page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;

    const where = { deletedAt: { not: null } };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { jobId: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: {
          account: { select: { id: true, name: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    return {
      data: opportunities.map((opp) => this.createOpportunityWrapper(opp)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Restore a soft-deleted opportunity
   */
  async restoreOpportunity(id) {
    logger.info(`Restoring opportunity: ${id}`);

    const opp = await prisma.opportunity.findUnique({ where: { id } });
    if (!opp) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }
    if (!opp.deletedAt) {
      const error = new Error('Opportunity is not deleted');
      error.name = 'ValidationError';
      throw error;
    }

    const restored = await prisma.opportunity.update({
      where: { id },
      data: {
        deletedAt: null,
        stage: 'LEAD_ASSIGNED', // Reset to a reasonable stage
        lostReason: null,
        updatedAt: new Date(),
      },
    });

    logger.info(`Opportunity restored: ${id}`);
    return this.createOpportunityWrapper(restored);
  }

  // ============================================================================
  // NOTES METHODS
  // ============================================================================

  /**
   * Get all notes for an opportunity with pinned note first, then chronological
   */
  async getOpportunityNotes(opportunityId) {
    logger.info(`Getting notes for opportunity: ${opportunityId}`);

    const notes = await prisma.note.findMany({
      where: { opportunityId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      isPinned: note.isPinned,
      pinnedAt: note.pinnedAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      createdBy: note.createdBy
        ? {
            id: note.createdBy.id,
            name: `${note.createdBy.firstName || ''} ${note.createdBy.lastName || ''}`.trim() || note.createdBy.email,
            email: note.createdBy.email,
          }
        : null,
    }));
  }

  /**
   * Create a new note for an opportunity
   */
  async createOpportunityNote(opportunityId, data) {
    logger.info(`Creating note for opportunity: ${opportunityId}`);

    // If this note is pinned, unpin any existing pinned notes
    if (data.isPinned) {
      await prisma.note.updateMany({
        where: { opportunityId, isPinned: true },
        data: { isPinned: false, pinnedAt: null },
      });
    }

    const note = await prisma.note.create({
      data: {
        title: data.title,
        body: data.body,
        isPinned: data.isPinned || false,
        pinnedAt: data.isPinned ? new Date() : null,
        opportunityId,
        createdById: data.createdById,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Note created: ${note.id}`);
    return {
      id: note.id,
      title: note.title,
      body: note.body,
      isPinned: note.isPinned,
      pinnedAt: note.pinnedAt,
      createdAt: note.createdAt,
      createdBy: note.createdBy
        ? {
            id: note.createdBy.id,
            name: `${note.createdBy.firstName || ''} ${note.createdBy.lastName || ''}`.trim() || note.createdBy.email,
            email: note.createdBy.email,
          }
        : null,
    };
  }

  /**
   * Update an existing note
   */
  async updateOpportunityNote(noteId, data) {
    logger.info(`Updating note: ${noteId}`);

    const existingNote = await prisma.note.findUnique({ where: { id: noteId } });
    if (!existingNote) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // If pinning this note, unpin any existing pinned notes for this opportunity
    if (data.isPinned && !existingNote.isPinned) {
      await prisma.note.updateMany({
        where: { opportunityId: existingNote.opportunityId, isPinned: true },
        data: { isPinned: false, pinnedAt: null },
      });
    }

    const updateData = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.body !== undefined) updateData.body = data.body;
    if (data.isPinned !== undefined) {
      updateData.isPinned = data.isPinned;
      updateData.pinnedAt = data.isPinned ? new Date() : null;
    }

    const note = await prisma.note.update({
      where: { id: noteId },
      data: updateData,
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return {
      id: note.id,
      title: note.title,
      body: note.body,
      isPinned: note.isPinned,
      pinnedAt: note.pinnedAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      createdBy: note.createdBy
        ? {
            id: note.createdBy.id,
            name: `${note.createdBy.firstName || ''} ${note.createdBy.lastName || ''}`.trim() || note.createdBy.email,
            email: note.createdBy.email,
          }
        : null,
    };
  }

  /**
   * Delete a note
   */
  async deleteOpportunityNote(noteId) {
    logger.info(`Deleting note: ${noteId}`);

    const existingNote = await prisma.note.findUnique({ where: { id: noteId } });
    if (!existingNote) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    await prisma.note.delete({ where: { id: noteId } });
    logger.info(`Note deleted: ${noteId}`);
    return { success: true };
  }

  /**
   * Toggle pin status of a note (only one pinned note allowed per opportunity)
   */
  async togglePinNote(opportunityId, noteId) {
    logger.info(`Toggling pin for note: ${noteId}`);

    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) {
      const error = new Error(`Note not found: ${noteId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (note.opportunityId !== opportunityId) {
      const error = new Error('Note does not belong to this opportunity');
      error.name = 'ValidationError';
      throw error;
    }

    const newPinnedState = !note.isPinned;

    // If pinning, unpin any other pinned notes for this opportunity
    if (newPinnedState) {
      await prisma.note.updateMany({
        where: { opportunityId, isPinned: true, id: { not: noteId } },
        data: { isPinned: false, pinnedAt: null },
      });
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: {
        isPinned: newPinnedState,
        pinnedAt: newPinnedState ? new Date() : null,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return {
      id: updatedNote.id,
      title: updatedNote.title,
      body: updatedNote.body,
      isPinned: updatedNote.isPinned,
      pinnedAt: updatedNote.pinnedAt,
      createdAt: updatedNote.createdAt,
      updatedAt: updatedNote.updatedAt,
      createdBy: updatedNote.createdBy
        ? {
            id: updatedNote.createdBy.id,
            name: `${updatedNote.createdBy.firstName || ''} ${updatedNote.createdBy.lastName || ''}`.trim() || updatedNote.createdBy.email,
            email: updatedNote.createdBy.email,
          }
        : null,
    };
  }

  // ============================================================================
  // JOB APPROVAL METHODS - PandaClaims Unapproved Jobs Workflow
  // ============================================================================

  /**
   * Get list of unapproved jobs with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Paginated unapproved jobs
   */
  async getUnapprovedJobs(options = {}) {
    const {
      page = 1,
      limit = 50,
      ownerId,
      ownerFilter = 'all',
      stage,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      userId,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      isApproved: false,
      deletedAt: null,
    };

    // Filter by owner
    if (ownerFilter === 'mine' && userId) {
      where.ownerId = userId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    // Filter by stage
    if (stage && stage !== 'all') {
      where.stage = stage;
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { jobId: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Build orderBy
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    const [jobs, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          account: {
            select: { id: true, name: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          approvalRequests: {
            where: {
              type: 'EXCEPTION',
              status: { in: ['PENDING', 'IN_REVIEW'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              requester: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    const openCasesByOpportunity = new Map();
    if (jobs.length > 0) {
      const accountIds = [...new Set(jobs.map((job) => job.accountId).filter(Boolean))];
      if (accountIds.length > 0) {
        const openCasesByAccount = await prisma.case.groupBy({
          by: ['accountId'],
          where: {
            accountId: { in: accountIds },
            status: { not: 'CLOSED' },
          },
          _count: { _all: true },
        });
        const accountCaseMap = new Map(
          openCasesByAccount.map((row) => [row.accountId, row._count?._all || 0])
        );
        jobs.forEach((job) => {
          openCasesByOpportunity.set(job.id, accountCaseMap.get(job.accountId) || 0);
        });
      }
    }

    return {
      data: jobs.map(job => ({
        id: job.id,
        name: job.name,
        jobId: job.jobId,
        stage: job.stage,
        type: job.type,
        amount: job.amount,
        contractTotal: job.contractTotal,
        isApproved: job.isApproved,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        account: job.account,
        owner: job.owner ? {
          id: job.owner.id,
          name: `${job.owner.firstName || ''} ${job.owner.lastName || ''}`.trim() || job.owner.email,
        } : null,
        pendingApprovalRequest: job.approvalRequests[0] || null,
        openCasesCount: openCasesByOpportunity.get(job.id) || 0,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get statistics for unapproved jobs dashboard
   * @param {string} userId - Current user ID
   * @param {string} ownerFilter - 'mine' or 'all'
   * @returns {Promise<Object>} Statistics
   */
  async getUnapprovedJobsStats(userId, ownerFilter = 'all') {
    const baseWhere = {
      isApproved: false,
      deletedAt: null,
    };

    if (ownerFilter === 'mine' && userId) {
      baseWhere.ownerId = userId;
    }

    const [
      totalUnapproved,
      pendingApproval,
      byStage,
      byOwner,
    ] = await Promise.all([
      // Total unapproved jobs
      prisma.opportunity.count({ where: baseWhere }),

      // Jobs with pending approval requests
      prisma.opportunity.count({
        where: {
          ...baseWhere,
          approvalRequests: {
            some: {
              type: 'EXCEPTION',
              status: { in: ['PENDING', 'IN_REVIEW'] },
            },
          },
        },
      }),

      // Count by stage
      prisma.opportunity.groupBy({
        by: ['stage'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Count by owner (top 10)
      prisma.opportunity.groupBy({
        by: ['ownerId'],
        where: baseWhere,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
    ]);

    // Get owner names for the byOwner stats
    const ownerIds = byOwner.map(o => o.ownerId).filter(Boolean);
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const ownerMap = new Map(owners.map(o => [o.id, o]));

    return {
      totalUnapproved,
      pendingApproval,
      awaitingSubmission: totalUnapproved - pendingApproval,
      byStage: byStage.map(s => ({
        stage: s.stage,
        count: s._count.id,
      })),
      byOwner: byOwner.map(o => {
        const owner = ownerMap.get(o.ownerId);
        return {
          ownerId: o.ownerId,
          ownerName: owner
            ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() || owner.email
            : 'Unassigned',
          count: o._count.id,
        };
      }),
    };
  }

  /**
   * Submit a job for approval - creates an approval request
   * @param {string} opportunityId - Job ID
   * @param {string} requesterId - User requesting approval
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Created approval request
   */
  async requestJobApproval(opportunityId, requesterId, options = {}) {
    const { reason, priority = 'NORMAL' } = options;

    // Get the opportunity
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true, managerId: true } },
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    if (opportunity.isApproved) {
      throw new Error('Job is already approved');
    }

    // Check if there's already a pending approval request
    const existingRequest = await prisma.approvalRequest.findFirst({
      where: {
        opportunityId,
        type: 'EXCEPTION',
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
    });

    if (existingRequest) {
      throw new Error('There is already a pending approval request for this job');
    }

    // Determine the approver (owner's manager, or fallback to admin)
    let approverId = opportunity.owner?.managerId;
    if (!approverId) {
      // Find an admin user as fallback
      const admin = await prisma.user.findFirst({
        where: {
          isActive: true,
          role: {
            is: {
              isActive: true,
              OR: [
                { name: { equals: 'ADMIN', mode: 'insensitive' } },
                { roleType: { equals: 'ADMIN', mode: 'insensitive' } },
              ],
            },
          },
        },
        select: { id: true },
      });
      approverId = admin?.id;
    }

    // Create approval request
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        type: 'EXCEPTION',
        status: 'PENDING',
        priority,
        subject: `Job Approval: ${opportunity.name}`,
        description: reason || `Requesting approval for job ${opportunity.jobId || opportunity.name}`,
        requestedValue: opportunity.contractTotal || opportunity.amount,
        originalValue: opportunity.contractTotal || opportunity.amount,
        requesterId,
        approverId,
        opportunityId,
        currentStep: 1,
        totalSteps: 1,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Create attention item for the approver
    if (approverId) {
      await prisma.attentionItem.create({
        data: {
          type: 'APPROVAL_NEEDED',
          category: 'APPROVAL',
          priority,
          urgency: priority === 'URGENT' ? 'CRITICAL' : priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
          status: 'PENDING',
          title: `Job Approval Required: ${opportunity.name}`,
          description: reason || `Job ${opportunity.jobId || opportunity.name} requires approval`,
          sourceType: 'APPROVAL_REQUEST',
          sourceId: approvalRequest.id,
          opportunityId,
          accountId: opportunity.accountId,
          assignedToId: approverId,
          actionUrl: `/jobs/${opportunityId}`,
        },
      });
    }

    logger.info(`Job approval requested for opportunity ${opportunityId} by user ${requesterId}`);

    return approvalRequest;
  }

  /**
   * Approve a job
   * @param {string} opportunityId - Job ID
   * @param {string} approverId - User approving the job
   * @param {string} reason - Approval reason/notes
   * @returns {Promise<Object>} Updated opportunity
   */
  async approveJob(opportunityId, approverId, reason) {
    // Get the opportunity
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    if (opportunity.isApproved) {
      throw new Error('Job is already approved');
    }

    // Update any pending approval requests to APPROVED
    await prisma.approvalRequest.updateMany({
      where: {
        opportunityId,
        type: 'EXCEPTION',
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
      data: {
        status: 'APPROVED',
        decision: 'APPROVE',
        decidedById: approverId,
        decidedAt: new Date(),
        decisionReason: reason,
      },
    });

    // Mark related attention items as completed
    await prisma.attentionItem.updateMany({
      where: {
        opportunityId,
        type: 'APPROVAL_NEEDED',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      data: {
        status: 'COMPLETED',
        actionCompleted: true,
        actionCompletedAt: new Date(),
        actionCompletedById: approverId,
      },
    });

    // Update the opportunity
    const updatedOpportunity = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        isApproved: true,
        approvedById: approverId,
        approvedDate: new Date(),
      },
      include: {
        account: { select: { id: true, name: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Notify the job owner that their job was approved
    if (opportunity.ownerId) {
      await prisma.notification.create({
        data: {
          userId: opportunity.ownerId,
          type: 'JOB_UPDATE',
          title: 'Job Approved',
          message: `Your job "${opportunity.name}" has been approved${reason ? `: ${reason}` : ''}`,
          data: { opportunityId, action: 'approved' },
          link: `/jobs/${opportunityId}`,
        },
      });
    }

    logger.info(`Job ${opportunityId} approved by user ${approverId}`);

    return updatedOpportunity;
  }

  /**
   * Reject a job approval request
   * @param {string} opportunityId - Job ID
   * @param {string} rejecterId - User rejecting the approval
   * @param {string} reason - Rejection reason (required)
   * @returns {Promise<Object>} Updated approval request
   */
  async rejectJobApproval(opportunityId, rejecterId, reason) {
    // Get the opportunity
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Find and update the pending approval request
    const approvalRequest = await prisma.approvalRequest.findFirst({
      where: {
        opportunityId,
        type: 'EXCEPTION',
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
    });

    if (!approvalRequest) {
      throw new Error('No pending approval request found for this job');
    }

    // Update the approval request to REJECTED
    const updatedRequest = await prisma.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: 'REJECTED',
        decision: 'REJECT',
        decidedById: rejecterId,
        decidedAt: new Date(),
        decisionReason: reason,
      },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true } },
        decidedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Mark related attention items as completed
    await prisma.attentionItem.updateMany({
      where: {
        opportunityId,
        type: 'APPROVAL_NEEDED',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      data: {
        status: 'COMPLETED',
        actionCompleted: true,
        actionCompletedAt: new Date(),
        actionCompletedById: rejecterId,
      },
    });

    // Notify the job owner that their approval was rejected
    if (opportunity.ownerId) {
      await prisma.notification.create({
        data: {
          userId: opportunity.ownerId,
          type: 'JOB_UPDATE',
          title: 'Job Approval Rejected',
          message: `Your job "${opportunity.name}" approval was rejected: ${reason}`,
          data: { opportunityId, action: 'rejected', reason },
          link: `/jobs/${opportunityId}`,
        },
      });
    }

    // Create attention item for the owner to address the rejection
    await prisma.attentionItem.create({
      data: {
        type: 'FOLLOW_UP',
        category: 'TASK',
        priority: 'HIGH',
        urgency: 'HIGH',
        status: 'PENDING',
        title: `Job Approval Rejected: ${opportunity.name}`,
        description: `Your job approval was rejected: ${reason}. Please address the issues and resubmit.`,
        sourceType: 'APPROVAL_REQUEST',
        sourceId: approvalRequest.id,
        opportunityId,
        accountId: opportunity.accountId,
        assignedToId: opportunity.ownerId,
        actionUrl: `/jobs/${opportunityId}`,
      },
    });

    logger.info(`Job approval for ${opportunityId} rejected by user ${rejecterId}: ${reason}`);

    return updatedRequest;
  }

  /**
   * Get approval history for a job
   * @param {string} opportunityId - Job ID
   * @returns {Promise<Array>} Approval history
   */
  async getJobApprovalHistory(opportunityId) {
    const approvalRequests = await prisma.approvalRequest.findMany({
      where: {
        opportunityId,
        type: 'EXCEPTION',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, email: true } },
        approver: { select: { id: true, firstName: true, lastName: true, email: true } },
        decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: {
            approver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    return approvalRequests.map(req => ({
      id: req.id,
      status: req.status,
      priority: req.priority,
      subject: req.subject,
      description: req.description,
      decision: req.decision,
      decisionReason: req.decisionReason,
      createdAt: req.createdAt,
      decidedAt: req.decidedAt,
      requester: req.requester ? {
        id: req.requester.id,
        name: `${req.requester.firstName || ''} ${req.requester.lastName || ''}`.trim() || req.requester.email,
      } : null,
      approver: req.approver ? {
        id: req.approver.id,
        name: `${req.approver.firstName || ''} ${req.approver.lastName || ''}`.trim() || req.approver.email,
      } : null,
      decidedBy: req.decidedBy ? {
        id: req.decidedBy.id,
        name: `${req.decidedBy.firstName || ''} ${req.decidedBy.lastName || ''}`.trim() || req.decidedBy.email,
      } : null,
      comments: req.comments.map(c => ({
        id: c.id,
        content: c.content,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
        user: c.user ? {
          id: c.user.id,
          name: `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim(),
        } : null,
      })),
      steps: req.steps,
    }));
  }

  /**
   * Get cases related to a job for context during approval review
   * @param {string} opportunityId - Job ID
   * @returns {Promise<Array>} Related cases
   */
  async getRelatedCases(opportunityId) {
    // Get the opportunity to find its account
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { accountId: true },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Find cases related to this opportunity's account
    const cases = await prisma.case.findMany({
      where: {
        accountId: opportunity.accountId,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    return cases.map(c => ({
      id: c.id,
      caseNumber: c.caseNumber,
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      type: c.type,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      account: c.account,
    }));
  }
}

export const opportunityService = new OpportunityService();
export default opportunityService;
