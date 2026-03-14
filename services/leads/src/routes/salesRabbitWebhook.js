import crypto from 'crypto';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { leadService } from '../services/leadService.js';
import {
  buildSalesRabbitLeadInput,
  extractProvidedSecret,
  getExpectedSecrets,
  isTrustedSalesRabbitAppRequest,
  validateSalesRabbitLeadInput,
} from './salesRabbitWebhookHelpers.js';

const prisma = new PrismaClient();
const router = express.Router();

const isSalesRabbitPath = (req) => (
  req?.method === 'POST'
  && (req?.path === '/webhook' || req?.path === '/' || req?.path === '')
);

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

  const expectedSecrets = getExpectedSecrets();
  if (expectedSecrets.length === 0) {
    return next();
  }

  const providedSecret = extractProvidedSecret(req);
  if (providedSecret) {
    const isMatch = expectedSecrets.some((expectedSecret) => secretsMatch(providedSecret, expectedSecret));
    if (isMatch) {
      return next();
    }

    logger.warn('SalesRabbit webhook: invalid or missing secret');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' },
    });
  }

  if (isTrustedSalesRabbitAppRequest(req)) {
    logger.info('SalesRabbit webhook: accepted trusted app request without secret');
    return next();
  }

  logger.warn('SalesRabbit webhook: invalid or missing secret');
  return res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' },
  });
};

const handleSalesRabbitWebhook = async (req, res) => {
  try {
    const payload = buildSalesRabbitLeadInput(req.body || {});
    logger.info('SalesRabbit webhook received');

    const validationError = validateSalesRabbitLeadInput(payload);
    if (validationError) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: validationError },
      });
    }

    if (payload.salesRabbitId) {
      const existingLead = await prisma.lead.findFirst({
        where: {
          leadNotes: { contains: `SalesRabbit ID: ${payload.salesRabbitId}` },
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

    if (payload.email || (payload.firstName && payload.lastName)) {
      const andWhere = [];
      if (payload.email) andWhere.push({ email: payload.email });
      if (payload.firstName) andWhere.push({ firstName: { equals: payload.firstName, mode: 'insensitive' } });
      if (payload.lastName) andWhere.push({ lastName: { equals: payload.lastName, mode: 'insensitive' } });

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

    let ownerId = null;
    if (payload.salesRabbitUser) {
      const owner = await prisma.user.findFirst({
        where: { email: { equals: payload.salesRabbitUser, mode: 'insensitive' } },
        select: { id: true, email: true },
      });

      if (owner) {
        ownerId = owner.id;
        logger.info(`SalesRabbit webhook: Assigned to owner ${owner.email}`);
      }
    }

    const lead = await leadService.createLead({
      firstName: payload.firstName || 'Unknown',
      lastName: payload.lastName || 'Unknown',
      email: payload.email,
      phone: payload.phone,
      mobilePhone: payload.mobilePhone,
      street: payload.street,
      city: payload.city,
      state: payload.state,
      postalCode: payload.postalCode,
      source: payload.source,
      status: 'NEW',
      workType: payload.workType,
      propertyType: payload.propertyType,
      leadNotes: payload.leadNotes,
      jobNotes: payload.jobNotes,
      salesRabbitUser: payload.salesRabbitUser,
      isSelfGen: payload.isSelfGen,
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
};

router.post('/', validateWebhookSecret, handleSalesRabbitWebhook);
router.post('/webhook', validateWebhookSecret, handleSalesRabbitWebhook);

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
