// SalesRabbit webhook routes
// Registered before auth middleware in index.js
import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { leadService } from '../services/leadService.js';

const prisma = new PrismaClient();
const router = express.Router();

const SALESRABBIT_WEBHOOK_SECRET = process.env.SALESRABBIT_WEBHOOK_SECRET;
const SALESRABBIT_API_KEY = process.env.SALESRABBIT_API_KEY;
const SALESRABBIT_WEBHOOK_TOKEN = process.env.SALESRABBIT_WEBHOOK_TOKEN;
const SALESRABBIT_SECRET = process.env.SALESRABBIT_SECRET;
const SALESRABBIT_TOKEN = process.env.SALESRABBIT_TOKEN;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }
  return null;
};

const normalizeOptionalValue = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const parseBool = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

const normalizeEmail = (value) => {
  const normalized = normalizeOptionalValue(value);
  return normalized ? normalized.toLowerCase() : null;
};

const isSalesRabbitPath = (req) => req?.path === '/webhook' && req?.method === 'POST';

const extractProvidedSecret = (req) => {
  const authHeader = req.headers.authorization;
  const forwardedAuthHeader =
    req.headers['x-forwarded-authorization']
    || req.headers['x-original-authorization']
    || req.headers['x-amzn-remapped-authorization']
    || null;
  const body = req.body || {};
  const nestedAuth = body.auth || body.authentication || body.headers || {};

  const [authType, authToken] = authHeader ? authHeader.split(' ') : [null, null];
  const [forwardedAuthType, forwardedAuthToken] = forwardedAuthHeader
    ? String(forwardedAuthHeader).split(' ')
    : [null, null];

  return pickFirstValue(
    req.headers['x-webhook-secret'],
    req.headers['x-webhook-token'],
    req.headers['x-salesrabbit-webhook-secret'],
    req.headers['x-salesrabbit-webhook-token'],
    req.headers['x-salesrabbit-secret'],
    req.headers['x-salesrabbit-token'],
    req.headers['x-api-key'],
    req.headers['x-salesrabbit-api-key'],
    req.headers['x-salesrabbit-signature'],
    req.headers['x-webhook-signature'],
    req.headers['x-auth-token'],
    req.headers['x-api-token'],
    req.headers['x-internal-api-key'],
    req.headers['x-webhook-key'],
    req.headers['x-salesrabbit-key'],
    req.headers['x-forwarded-api-key'],
    req.headers['x-forwarded-token'],
    req.headers['x-forwarded-webhook-secret'],
    req.headers['x-original-api-key'],
    req.headers['x-original-webhook-secret'],
    req.headers['authorization-token'],
    req.query?.secret,
    req.query?.webhookSecret,
    req.query?.webhookToken,
    req.query?.apiKey,
    req.query?.apikey,
    req.query?.token,
    body?.secret,
    body?.token,
    body?.apiKey,
    body?.api_key,
    body?.webhookSecret,
    body?.webhookToken,
    body?.authorization,
    body?.authToken,
    body?.auth_token,
    body?.accessToken,
    nestedAuth?.secret,
    nestedAuth?.token,
    nestedAuth?.apiKey,
    nestedAuth?.api_key,
    nestedAuth?.authorization,
    authType === 'ApiKey' ? authToken : null,
    forwardedAuthType === 'ApiKey' ? forwardedAuthToken : null,
    authType === 'Bearer' ? authToken : null,
    forwardedAuthType === 'Bearer' ? forwardedAuthToken : null,
    authType === 'Token' ? authToken : null,
    forwardedAuthType === 'Token' ? forwardedAuthToken : null,
    forwardedAuthHeader && !forwardedAuthToken ? forwardedAuthHeader : null,
    authHeader && !authToken ? authHeader : null
  );
};

const secretsMatch = (providedSecret, expectedSecret) => {
  if (!providedSecret || !expectedSecret) return false;
  const provided = Buffer.from(String(providedSecret));
  const expected = Buffer.from(String(expectedSecret));
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
};

const getExpectedSecrets = () => {
  return [
    SALESRABBIT_WEBHOOK_SECRET,
    SALESRABBIT_API_KEY,
    SALESRABBIT_WEBHOOK_TOKEN,
    SALESRABBIT_SECRET,
    SALESRABBIT_TOKEN,
    WEBHOOK_SECRET,
    process.env.INTERNAL_API_KEY,
  ]
    .map((value) => normalizeOptionalValue(value))
    .filter(Boolean);
};

const validateWebhookSecret = (req, res, next) => {
  if (!isSalesRabbitPath(req)) {
    return next();
  }

  const expectedSecrets = getExpectedSecrets();
  if (expectedSecrets.length === 0) {
    return next();
  }

  const providedSecret = extractProvidedSecret(req);
  const isMatch = expectedSecrets.some((expectedSecret) => secretsMatch(providedSecret, expectedSecret));
  if (!isMatch) {
    logger.warn('SalesRabbit webhook: invalid or missing secret');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' },
    });
  }

  return next();
};

router.post('/webhook', validateWebhookSecret, async (req, res) => {
  try {
    const rawData = req.body || {};
    const formData = rawData.formData || {};
    const metaData = rawData.leadMetaData || rawData.leadMetadata || {};
    const data = { ...metaData, ...formData, ...rawData };

    logger.info('SalesRabbit webhook received');

    const salesRabbitId = pickFirstValue(
      rawData.leadId,
      data.leadId,
      data.salesRabbitId,
      data.id,
      data.iD
    );

    if (salesRabbitId) {
      const existingLead = await prisma.lead.findFirst({
        where: {
          leadNotes: { contains: `SalesRabbit ID: ${salesRabbitId}` },
        },
        select: { id: true },
      });

      if (existingLead) {
        logger.info(`SalesRabbit webhook: Lead already exists (${existingLead.id})`);
        return res.status(200).json({
          success: true,
          message: 'Lead already exists',
          leadId: existingLead.id,
          duplicate: true,
        });
      }
    }

    let firstName = pickFirstValue(
      data.firstName,
      data.FirstName,
      data.First_Name,
      data.contactFirstName,
      data.first_name,
      data?.contact?.firstName,
      data?.contact?.first_name,
      data?.person?.firstName
    );
    let lastName = pickFirstValue(
      data.lastName,
      data.LastName,
      data.Last_Name,
      data.contactLastName,
      data.last_name,
      data?.contact?.lastName,
      data?.contact?.last_name,
      data?.person?.lastName
    );

    if (!firstName && !lastName) {
      const fullName = pickFirstValue(
        data.name,
        data.Name,
        data.fullName,
        data.FullName,
        data.contactName
      );
      if (fullName) {
        const parts = fullName.split(/\s+/);
        if (parts.length >= 2) {
          firstName = parts[0];
          lastName = parts.slice(1).join(' ');
        } else if (parts.length === 1) {
          firstName = parts[0];
        }
      }
    }

    if (!firstName && !lastName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'First name or last name is required' },
      });
    }

    const email = normalizeEmail(
      pickFirstValue(
        data.email,
        data.Email,
        data.emailAddress,
        data.EmailAddress,
        data?.contact?.email,
        data?.person?.email
      )
    );

    const phone = normalizeOptionalValue(
      pickFirstValue(
        data.phonePrimary,
        data.phone,
        data.Phone,
        data.phoneNumber,
        data.primaryPhone,
        data.homePhone,
        data?.contact?.phone,
        data?.contact?.phoneNumber
      )
    );

    const mobilePhone = normalizeOptionalValue(
      pickFirstValue(
        data.phoneSecondary,
        data.mobilePhone,
        data.MobilePhone,
        data.Mobile_Phone,
        data.cell,
        data.cellPhone,
        data.mobile,
        data?.contact?.mobilePhone,
        data?.contact?.mobile
      )
    );

    if (!email && !phone && !mobilePhone) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one contact method is required' },
      });
    }

    let potentialDuplicateLeadId = null;
    if (email || (firstName && lastName)) {
      const andWhere = [];
      if (email) andWhere.push({ email });
      if (firstName) andWhere.push({ firstName: { equals: firstName, mode: 'insensitive' } });
      if (lastName) andWhere.push({ lastName: { equals: lastName, mode: 'insensitive' } });

      if (andWhere.length > 0) {
        const recentDuplicate = await prisma.lead.findFirst({
          where: {
            AND: andWhere,
            createdAt: {
              gte: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)),
            },
          },
          select: { id: true },
        });

        if (recentDuplicate) {
          logger.info(`SalesRabbit webhook: Potential duplicate found (${recentDuplicate.id}), continuing to ingest as requested`);
          potentialDuplicateLeadId = recentDuplicate.id;
        }
      }
    }

    const marketingDivision = pickFirstValue(
      data.marketingDivision,
      data.MarketingDivision,
      data['Marketing Division'],
      data.division
    );
    const retailInsurance = pickFirstValue(
      data.retailInsurance,
      data.RetailInsurance,
      data['Retail/Insurance'],
      data['Retail Insurance']
    );
    const shingleType = pickFirstValue(
      data.shingleType,
      data.ShingleType,
      data['Shingle Type'],
      data.shingle
    );
    const appointmentTime = pickFirstValue(
      data.appointmentTime,
      data.appointmentDate
    );

    const spouseFirstName = normalizeOptionalValue(data.spouseFirstName);
    const spouseLastName = normalizeOptionalValue(data.spouseLastName);
    const spouseName = spouseFirstName || spouseLastName
      ? `${spouseFirstName || ''} ${spouseLastName || ''}`.trim()
      : null;

    const sfLeadId = pickFirstValue(data.salesforceLeadID, data.salesforceLeadId, data.sfLeadId);
    const sfOppId = pickFirstValue(data.salesforceOpportunityI, data.salesforceOpportunityId, data.sfOpportunityId);

    const notes = [];
    if (salesRabbitId) notes.push(`SalesRabbit ID: ${salesRabbitId}`);
    if (marketingDivision) notes.push(`Marketing Division: ${marketingDivision}`);
    if (shingleType) notes.push(`Shingle Type: ${shingleType}`);
    if (spouseName) notes.push(`Spouse: ${spouseName}`);
    if (appointmentTime) notes.push(`Appointment: ${appointmentTime}`);
    if (parseBool(data.iConsentToRecieveSMSFromPandaExteriors) || parseBool(data.iConsentToSMSOffersFromPandaExteriors) || parseBool(data.smsConsent)) {
      notes.push('SMS Consent: Yes');
    }
    if (sfLeadId) notes.push(`SF Lead ID: ${sfLeadId}`);
    if (sfOppId) notes.push(`SF Opportunity ID: ${sfOppId}`);
    if (potentialDuplicateLeadId) notes.push(`Potential duplicate lead: ${potentialDuplicateLeadId}`);

    for (const noteValue of [data.note, data.notes, data.leadNotes, data.description]) {
      const normalized = normalizeOptionalValue(noteValue);
      if (normalized) notes.push(normalized);
    }
    const combinedNotes = notes.join('\n\n') || null;

    const street = normalizeOptionalValue(pickFirstValue(
      data.street1,
      data.street,
      data.Street,
      data.address,
      data.Address,
      data.streetAddress,
      data.addressLine1,
      data.address_line_1,
      data.address1
    ));
    const city = normalizeOptionalValue(pickFirstValue(data.city, data.City, data.addressCity));
    const state = normalizeOptionalValue(pickFirstValue(data.state, data.State, data.addressState, data.stateProvince));
    const postalCode = normalizeOptionalValue(pickFirstValue(
      data.postalCode,
      data.PostalCode,
      data.Postal_Code,
      data.zip,
      data.Zip,
      data.zipCode,
      data.zipcode
    ));

    let workType = normalizeOptionalValue(pickFirstValue(
      data.workType,
      data.WorkType,
      data.Work_Type,
      data['Work Type'],
      data.jobType,
      data.leadType,
      data.serviceType
    ));

    if (retailInsurance && !workType) {
      workType = retailInsurance;
    } else if (retailInsurance && workType && !workType.toLowerCase().includes(retailInsurance.toLowerCase())) {
      workType = `${retailInsurance} - ${workType}`;
    }

    const propertyType = normalizeOptionalValue(pickFirstValue(
      data.propertyType,
      data.PropertyType,
      data.Property_Type,
      data.buildingType
    ));

    const repEmail = normalizeEmail(pickFirstValue(
      data.ownerEmail,
      data.salesRabbitUser,
      data.repEmail,
      data.userEmail,
      data.assignedTo,
      data.createdBy,
      metaData.ownerEmail
    ));

    let ownerId = null;
    if (repEmail) {
      const owner = await prisma.user.findFirst({
        where: { email: { equals: repEmail, mode: 'insensitive' } },
        select: { id: true, email: true },
      });

      if (owner) {
        ownerId = owner.id;
        logger.info(`SalesRabbit webhook: Assigned to owner ${owner.email}`);
      }
    }

    const lead = await leadService.createLead({
      firstName: firstName || 'Unknown',
      lastName: lastName || 'Unknown',
      email,
      phone,
      mobilePhone,
      street,
      city,
      state,
      postalCode,
      source: normalizeOptionalValue(pickFirstValue(data.source, data.Source, data.leadSource)) || 'SalesRabbit',
      status: 'NEW',
      workType,
      propertyType,
      leadNotes: combinedNotes,
      jobNotes: normalizeOptionalValue(pickFirstValue(data.jobNotes, data.JobNotes, data['Job Notes'])),
      salesRabbitUser: repEmail,
      isSelfGen: parseBool(data.isSelfGen) || parseBool(data.selfGen),
      ownerId,
      _auditContext: {
        userId: null,
        userEmail: 'salesrabbit-webhook',
      },
    });

    logger.info(`SalesRabbit webhook: Created lead ${lead.id}`);
    return res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      leadId: lead.id,
      lead: {
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email || null,
        phone: lead.phone || null,
        status: lead.status,
      },
    });
  } catch (error) {
    logger.error(`SalesRabbit webhook error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' },
    });
  }
});

router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'SalesRabbit webhook endpoint is active',
    webhookUrl: 'https://bamboo.pandaadmin.com/api/leads/salesrabbit/webhook',
    method: 'POST',
  });
});

router.get('/status', async (req, res) => {
  try {
    const [total, recent] = await Promise.all([
      prisma.lead.count({
        where: {
          OR: [
            { source: 'SalesRabbit' },
            { leadNotes: { contains: 'SalesRabbit ID:' } },
          ],
        },
      }),
      prisma.lead.count({
        where: {
          OR: [
            { source: 'SalesRabbit' },
            { leadNotes: { contains: 'SalesRabbit ID:' } },
          ],
          createdAt: { gte: new Date(Date.now() - (24 * 60 * 60 * 1000)) },
        },
      }),
    ]);

    res.json({
      success: true,
      status: 'active',
      webhookUrl: 'https://bamboo.pandaadmin.com/api/leads/salesrabbit/webhook',
      stats: {
        totalLeads: total,
        leadsLast24h: recent,
      },
    });
  } catch (error) {
    logger.error(`SalesRabbit status error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get status' },
    });
  }
});

export default router;
