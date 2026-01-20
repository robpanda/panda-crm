import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /activities
 * Get activity feed with filtering options
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      accountId,
      contactId,
      opportunityId,
      leadId,
      userId,
      type,
      types, // comma-separated list of types
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    // Entity filters
    if (accountId) where.accountId = accountId;
    if (contactId) where.contactId = contactId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (leadId) where.leadId = leadId;
    if (userId) where.userId = userId;

    // Type filters
    if (type) {
      where.type = type;
    } else if (types) {
      where.type = { in: types.split(',') };
    }

    // Date range filters
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate);
      if (endDate) where.occurredAt.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, fullName: true, email: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          lead: { select: { id: true, fullName: true } },
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: { occurredAt: sortOrder },
        skip,
        take,
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      data: activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /activities/:id
 * Get single activity by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const activity = await prisma.activity.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, fullName: true, email: true, mobilePhone: true } },
        opportunity: { select: { id: true, name: true, stage: true, amount: true } },
        lead: { select: { id: true, fullName: true, status: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(activity);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /activities/account/:accountId/feed
 * Get unified activity feed for an account (includes related contacts, opportunities)
 */
router.get('/account/:accountId/feed', async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Get all contact IDs and opportunity IDs for this account
    const [contacts, opportunities] = await Promise.all([
      prisma.contact.findMany({
        where: { accountId },
        select: { id: true },
      }),
      prisma.opportunity.findMany({
        where: { accountId },
        select: { id: true },
      }),
    ]);

    const contactIds = contacts.map(c => c.id);
    const opportunityIds = opportunities.map(o => o.id);

    // Build OR query for account-related activities
    const where = {
      OR: [
        { accountId },
        { contactId: { in: contactIds } },
        { opportunityId: { in: opportunityIds } },
      ],
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        include: {
          contact: { select: { id: true, fullName: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take,
      }),
      prisma.activity.count({ where }),
    ]);

    res.json({
      data: activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /activities/opportunity/:opportunityId/feed
 * Get activity feed for an opportunity (THE HUB view)
 */
router.get('/opportunity/:opportunityId/feed', async (req, res, next) => {
  try {
    const { opportunityId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { opportunityId },
        include: {
          contact: { select: { id: true, fullName: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take,
      }),
      prisma.activity.count({ where: { opportunityId } }),
    ]);

    res.json({
      data: activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /activities
 * Create a manual activity (for notes, tasks, etc.)
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      type,
      subType,
      subject,
      description,
      body,
      status,
      accountId,
      contactId,
      opportunityId,
      leadId,
      userId,
      externalPhone,
      externalEmail,
      externalName,
      metadata,
      occurredAt,
    } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Activity type is required' });
    }

    const activity = await prisma.activity.create({
      data: {
        type,
        subType,
        subject,
        description,
        body,
        status,
        accountId,
        contactId,
        opportunityId,
        leadId,
        userId,
        externalPhone,
        externalEmail,
        externalName,
        metadata: metadata || {},
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, fullName: true } },
        opportunity: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
      },
    });

    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /activities/:id
 * Delete an activity
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.activity.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
