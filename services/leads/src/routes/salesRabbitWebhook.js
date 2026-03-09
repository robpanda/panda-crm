// SalesRabbit webhook routes
// Registered before auth middleware in index.js
import express from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { leadService } from '../services/leadService.js';

const prisma = new PrismaClient();
const router = express.Router();

const WEBHOOK_SECRETS = [
  process.env.SALESRABBIT_WEBHOOK_SECRET,
  process.env.SALESRABBIT_API_KEY,
  process.env.SALES_RABBIT_API_KEY,
  process.env.INTERNAL_API_KEY,
].filter(Boolean);

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

const toObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {
      return {};
    }
  }
  return {};
};

const getNestedValue = (source, path) => {
  if (!source || !path) return null;
  const segments = String(path).split('.');
  let current = source;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }
    current = current[segment];
  }
  return current;
};

const pickFirstPathValue = (sources, paths) => {
  for (const path of paths) {
    for (const source of sources) {
      const value = getNestedValue(source, path);
      const picked = pickFirstValue(value);
      if (picked) return picked;
    }
  }
  return null;
};

const summarizeObjectKeys = (value, limit = 25) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).slice(0, limit);
};

const fingerprintSecret = (value) => {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
};

const collectCandidateSecretsFromObject = (input, depth = 0, maxDepth = 6) => {
  if (!input || depth > maxDepth) return [];
  if (Array.isArray(input)) {
    return input.flatMap((item) => collectCandidateSecretsFromObject(item, depth + 1, maxDepth));
  }
  if (typeof input !== 'object') return [];

  const out = [];
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = String(key).toLowerCase();
    const looksLikeSecretKey = /(secret|token|api[_-]?key|auth)/i.test(normalizedKey);

    if (looksLikeSecretKey) {
      const candidate = pickFirstValue(value);
      if (candidate) out.push(candidate);
    }

    if (value && typeof value === 'object') {
      out.push(...collectCandidateSecretsFromObject(value, depth + 1, maxDepth));
    } else if (typeof value === 'string') {
      // Some providers send stringified nested JSON blocks
      const asObj = toObject(value);
      if (Object.keys(asObj).length > 0) {
        out.push(...collectCandidateSecretsFromObject(asObj, depth + 1, maxDepth));
      }
    }
  }
  return out;
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
  const [authType, authToken] = authHeader ? authHeader.split(' ') : [null, null];
  const formData = toObject(req.body?.formData || req.body?.form_data || req.body?.payload);
  const leadMetaData = toObject(req.body?.leadMetaData || req.body?.leadMetadata || req.body?.metadata || req.body?.metaData);
  const headerCandidates = Object.entries(req.headers || {})
    .flatMap(([key, value]) => (
      /(salesrabbit|webhook|secret|auth|token|api[_-]?key|apikey)/i.test(String(key))
        ? (Array.isArray(value) ? value : [value])
        : []
    ))
    .map((value) => pickFirstValue(value))
    .filter(Boolean);
  const collectedCandidates = [
    ...collectCandidateSecretsFromObject(req.body),
    ...collectCandidateSecretsFromObject(formData),
    ...collectCandidateSecretsFromObject(leadMetaData),
  ];

  return pickFirstValue(
    req.headers['x-webhook-secret'],
    req.headers['x-salesrabbit-secret'],
    req.headers['x-api-key'],
    req.headers['x-apikey'],
    req.headers.apikey,
    req.headers['api-key'],
    req.headers['api_key'],
    req.headers['x-salesrabbit-api-key'],
    req.headers['x-auth-token'],
    req.headers['x-authtoken'],
    req.headers['x-auth-key'],
    req.headers['x-authkey'],
    req.headers['x-webhook-token'],
    req.headers['authorization-token'],
    req.query?.secret,
    req.query?.auth,
    req.query?.apiKey,
    req.query?.api_key,
    req.query?.authKey,
    req.query?.auth_key,
    req.query?.xApiKey,
    req.query?.apikey,
    req.query?.token,
    req.body?.secret,
    req.body?.auth,
    req.body?.apiKey,
    req.body?.api_key,
    req.body?.authKey,
    req.body?.auth_key,
    req.body?.xApiKey,
    req.body?.apikey,
    req.body?.token,
    req.body?.authToken,
    req.body?.leadMetaData?.secret,
    req.body?.leadMetaData?.apiKey,
    req.body?.leadMetaData?.apikey,
    req.body?.leadMetaData?.authToken,
    req.body?.leadMetadata?.secret,
    req.body?.leadMetadata?.apiKey,
    req.body?.leadMetadata?.apikey,
    req.body?.leadMetadata?.authToken,
    ...headerCandidates,
    formData?.secret,
    formData?.apiKey,
    formData?.apikey,
    formData?.authToken,
    formData?.auth_key,
    formData?.api_key,
    leadMetaData?.secret,
    leadMetaData?.apiKey,
    leadMetaData?.apikey,
    leadMetaData?.authToken,
    leadMetaData?.auth_key,
    leadMetaData?.api_key,
    ...collectedCandidates,
    authType === 'ApiKey' ? authToken : null,
    authType === 'Bearer' ? authToken : null,
    authToken || null,
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

const validateWebhookSecret = (req, res, next) => {
  if (!isSalesRabbitPath(req)) {
    return next();
  }

  if (WEBHOOK_SECRETS.length === 0) {
    return next();
  }

  const providedSecret = extractProvidedSecret(req);
  const isAllowed = WEBHOOK_SECRETS.some((secret) => secretsMatch(providedSecret, secret));
  if (!isAllowed) {
    logger.warn('SalesRabbit webhook: invalid or missing secret', {
      requestId: req.headers['x-request-id'] || null,
      userAgent: req.headers['user-agent'] || null,
      sourceIp: req.headers['x-forwarded-for'] || req.ip || null,
      authHeaderType: req.headers.authorization ? String(req.headers.authorization).split(' ')[0] : null,
      providedSecretFingerprint: fingerprintSecret(providedSecret),
      providedSecretLength: providedSecret ? String(providedSecret).length : 0,
      configuredSecretCount: WEBHOOK_SECRETS.length,
      candidateHeaderKeys: Object.keys(req.headers || {}).filter((key) => (
        key.includes('secret')
        || key.includes('token')
        || key.includes('auth')
        || key.includes('api-key')
        || key.includes('api_key')
        || key.includes('apikey')
        || key.includes('salesrabbit')
      )),
      queryKeys: summarizeObjectKeys(req.query),
      bodyKeys: summarizeObjectKeys(req.body),
    });
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
    const formData = toObject(rawData.formData || rawData.form_data || rawData.payload);
    const metaData = toObject(rawData.leadMetaData || rawData.leadMetadata || rawData.metadata || rawData.metaData);
    const contactData = toObject(rawData.contact || formData.contact || metaData.contact);
    const customerData = toObject(rawData.customer || formData.customer || metaData.customer);
    const leadData = toObject(rawData.lead || formData.lead || metaData.lead);
    const homeownerData = toObject(rawData.homeowner || formData.homeowner || metaData.homeowner);
    const data = { ...metaData, ...formData, ...rawData };
    const searchSources = [data, rawData, formData, metaData, contactData, customerData, leadData, homeownerData];

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
      pickFirstPathValue(searchSources, [
        'first_name',
        'first',
        'firstname',
        'contact.firstName',
        'contact.first_name',
        'customer.firstName',
        'customer.first_name',
        'lead.firstName',
        'lead.first_name',
        'homeowner.firstName',
        'homeowner.first_name',
      ])
    );
    let lastName = pickFirstValue(
      data.lastName,
      data.LastName,
      data.Last_Name,
      data.contactLastName,
      pickFirstPathValue(searchSources, [
        'last_name',
        'last',
        'lastname',
        'contact.lastName',
        'contact.last_name',
        'customer.lastName',
        'customer.last_name',
        'lead.lastName',
        'lead.last_name',
        'homeowner.lastName',
        'homeowner.last_name',
      ])
    );

    if (!firstName && !lastName) {
      const fullName = pickFirstValue(
        data.name,
        data.Name,
        data.fullName,
        data.FullName,
        pickFirstPathValue(searchSources, [
          'full_name',
          'contact.fullName',
          'contact.full_name',
          'contact.name',
          'customer.fullName',
          'customer.full_name',
          'customer.name',
          'lead.fullName',
          'lead.full_name',
          'lead.name',
          'homeowner.fullName',
          'homeowner.full_name',
          'homeowner.name',
        ])
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
      logger.warn('SalesRabbit webhook rejected: missing first/last name', {
        requestId: req.headers['x-request-id'] || null,
        userAgent: req.headers['user-agent'] || null,
        sourceIp: req.headers['x-forwarded-for'] || req.ip || null,
        topLevelKeys: summarizeObjectKeys(rawData),
        formDataKeys: summarizeObjectKeys(formData),
        metaDataKeys: summarizeObjectKeys(metaData),
        contactKeys: summarizeObjectKeys(contactData),
        customerKeys: summarizeObjectKeys(customerData),
        leadKeys: summarizeObjectKeys(leadData),
        homeownerKeys: summarizeObjectKeys(homeownerData),
      });
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
        pickFirstPathValue(searchSources, [
          'email',
          'email_address',
          'contact.email',
          'contact.emailAddress',
          'customer.email',
          'customer.emailAddress',
          'lead.email',
          'lead.emailAddress',
          'homeowner.email',
          'homeowner.emailAddress',
        ])
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
        pickFirstPathValue(searchSources, [
          'phone_primary',
          'phone',
          'phone_number',
          'contact.phone',
          'contact.phonePrimary',
          'contact.phone_number',
          'customer.phone',
          'customer.phone_number',
          'lead.phone',
          'lead.phone_number',
          'homeowner.phone',
          'homeowner.phone_number',
        ])
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
        pickFirstPathValue(searchSources, [
          'phone_secondary',
          'mobile_phone',
          'cell_phone',
          'contact.mobilePhone',
          'contact.mobile_phone',
          'contact.cellPhone',
          'customer.mobilePhone',
          'customer.mobile_phone',
          'lead.mobilePhone',
          'lead.mobile_phone',
          'homeowner.mobilePhone',
          'homeowner.mobile_phone',
        ])
      )
    );

    if (!email && !phone && !mobilePhone) {
      logger.warn('SalesRabbit webhook rejected: missing contact method', {
        requestId: req.headers['x-request-id'] || null,
        userAgent: req.headers['user-agent'] || null,
        sourceIp: req.headers['x-forwarded-for'] || req.ip || null,
        hasFirstName: Boolean(firstName),
        hasLastName: Boolean(lastName),
        topLevelKeys: summarizeObjectKeys(rawData),
        formDataKeys: summarizeObjectKeys(formData),
        metaDataKeys: summarizeObjectKeys(metaData),
      });
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one contact method is required' },
      });
    }

    // Secondary duplicate check (recent same person).
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
          logger.info(`SalesRabbit webhook: Potential duplicate found (${recentDuplicate.id})`);
          return res.status(200).json({
            success: true,
            message: 'Potential duplicate lead found',
            leadId: recentDuplicate.id,
            duplicate: true,
          });
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

    try {
      await prisma.activity.create({
        data: {
          type: 'RECORD_CREATED',
          subject: 'Lead created from SalesRabbit',
          description: `Lead ${firstName || 'Unknown'} ${lastName || ''} imported from SalesRabbit${salesRabbitId ? ` (ID: ${salesRabbitId})` : ''}`.trim(),
          leadId: lead.id,
          sourceType: 'salesrabbit_webhook',
          sourceId: salesRabbitId,
        },
      });
    } catch (activityError) {
      logger.warn(`SalesRabbit webhook: failed to create activity log (${activityError.message})`);
    }

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
