// Commission Routes
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { commissionService } from '../services/commissionService.js';
import { requireRole } from '../middleware/auth.js';

const prisma = new PrismaClient();
const router = express.Router();

// ============================================================================
// COMMISSION RULES ROUTES (must come before /:id to avoid conflicts)
// ============================================================================

/**
 * GET /api/commissions/rules/meta/types
 * Get available commission rule types
 */
router.get('/rules/meta/types', async (req, res, next) => {
  try {
    const types = [
      { value: 'PERCENTAGE', label: 'Percentage', description: 'Calculate as percentage of value' },
      { value: 'FLAT_AMOUNT', label: 'Flat Amount', description: 'Fixed dollar amount' },
      { value: 'TIERED', label: 'Tiered', description: 'Different rates based on value ranges' },
    ];
    res.json({ success: true, data: types });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/rules
 * Get all commission rules
 */
router.get('/rules', async (req, res, next) => {
  try {
    const { includeInactive } = req.query;
    const where = includeInactive === 'true' ? {} : { isActive: true };

    const rules = await prisma.commissionRule.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions/rules/seed
 * Seed default commission rules
 */
router.post('/rules/seed', requireRole('admin', 'system'), async (req, res, next) => {
  try {
    const defaultRules = [
      {
        name: 'Standard Sales Commission',
        description: 'Default sales commission rate for back-end commissions',
        ruleType: 'PERCENTAGE',
        rate: 8.0,
        commissionType: 'BACK_END',
        priority: 1,
      },
      {
        name: 'Pre-Commission',
        description: 'Pre-commission rate for sales reps',
        ruleType: 'PERCENTAGE',
        rate: 4.0,
        commissionType: 'PRE_COMMISSION',
        priority: 1,
      },
      {
        name: 'Self-Gen Bonus',
        description: 'Additional bonus for self-generated leads',
        ruleType: 'PERCENTAGE',
        rate: 2.0,
        commissionType: 'SELF_GEN',
        priority: 2,
      },
      {
        name: 'Company Lead Commission',
        description: 'Commission rate for company-provided leads',
        ruleType: 'PERCENTAGE',
        rate: 6.0,
        commissionType: 'COMPANY_LEAD',
        priority: 1,
      },
      {
        name: 'Supplement Override',
        description: 'Override commission on supplements',
        ruleType: 'PERCENTAGE',
        rate: 0.5,
        commissionType: 'SUPPLEMENT_OVERRIDE',
        priority: 1,
      },
    ];

    const created = [];
    for (const rule of defaultRules) {
      // Check if rule already exists by name
      const existing = await prisma.commissionRule.findFirst({
        where: { name: rule.name },
      });

      if (!existing) {
        const newRule = await prisma.commissionRule.create({ data: rule });
        created.push(newRule);
      }
    }

    res.json({
      success: true,
      data: { created: created.length, rules: created },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions/rules
 * Create a new commission rule
 */
router.post('/rules', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const rule = await prisma.commissionRule.create({
      data: req.body,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/rules/:id
 * Get a single commission rule
 */
router.get('/rules/:id', async (req, res, next) => {
  try {
    const rule = await prisma.commissionRule.findUnique({
      where: { id: req.params.id },
    });

    if (!rule) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission rule not found' },
      });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/commissions/rules/:id
 * Update a commission rule
 */
router.put('/rules/:id', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const rule = await prisma.commissionRule.update({
      where: { id: req.params.id },
      data: req.body,
    });

    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/commissions/rules/:id
 * Delete a commission rule
 */
router.delete('/rules/:id', requireRole('admin', 'system'), async (req, res, next) => {
  try {
    await prisma.commissionRule.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions/rules/:id/toggle
 * Toggle a commission rule's active status
 */
router.post('/rules/:id/toggle', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const existing = await prisma.commissionRule.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission rule not found' },
      });
    }

    const rule = await prisma.commissionRule.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });

    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COMMISSION LIST & AGGREGATE ROUTES (specific paths before /:id)
// ============================================================================

/**
 * GET /api/commissions/summary
 * Get dashboard summary with counts by status
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { ownerId, startDate, endDate } = req.query;
    const summary = await commissionService.getDashboardSummary({
      ownerId,
      startDate,
      endDate,
    });
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/stats
 * Get commission statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const stats = await commissionService.getStats({ startDate, endDate });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/user/:userId
 * Get commissions for a specific user
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const result = await commissionService.getUserCommissions(req.params.userId, req.query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/user/:userId/profile
 * Get commission profile for a user
 */
router.get('/user/:userId/profile', async (req, res, next) => {
  try {
    const profile = await commissionService.getUserCommissionProfile(req.params.userId);
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/opportunity/:opportunityId
 * Get commissions for an opportunity
 */
router.get('/opportunity/:opportunityId', async (req, res, next) => {
  try {
    const commissions = await commissionService.getOpportunityCommissions(req.params.opportunityId);
    res.json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/service-contract/:serviceContractId
 * Get commissions for a service contract
 */
router.get('/service-contract/:serviceContractId', async (req, res, next) => {
  try {
    const commissions = await commissionService.getServiceContractCommissions(req.params.serviceContractId);
    res.json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions/calculate
 * Calculate commission amount based on type and user rates
 */
router.post('/calculate', async (req, res, next) => {
  try {
    const { userId, type, value } = req.body;

    if (!userId || !type || !value) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId, type, and value are required' },
      });
    }

    const calculation = await commissionService.calculateCommission(userId, type, value);
    res.json({ success: true, data: calculation });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions/bulk-status
 * Bulk update commission status
 */
router.post('/bulk-status', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const { commissionIds, status, notes, reason } = req.body;

    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'commissionIds array is required' },
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'status is required' },
      });
    }

    const result = await commissionService.bulkUpdateStatus(commissionIds, status, notes, reason);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// COMMISSION CRUD ROUTES (generic /:id routes must come last)
// ============================================================================

/**
 * GET /api/commissions
 * Get commissions with pagination and filtering
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      type,
      ownerId,
      opportunityId,
      serviceContractId,
      search,
      startDate,
      endDate,
      paidDateFrom,
      paidDateTo,
      minAmount,
      maxAmount,
    } = req.query;

    const result = await commissionService.getCommissions({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      sortBy,
      sortOrder,
      status,
      type,
      ownerId,
      opportunityId,
      serviceContractId,
      search,
      startDate,
      endDate,
      paidDateFrom,
      paidDateTo,
      minAmount,
      maxAmount,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/commissions
 * Create a new commission
 */
router.post('/', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const commission = await commissionService.createCommission(req.body);
    res.status(201).json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/commissions/:id
 * Get single commission by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const commission = await commissionService.getCommissionById(req.params.id);
    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/commissions/:id
 * Update commission
 */
router.put('/:id', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const commission = await commissionService.updateCommission(req.params.id, req.body);
    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/commissions/:id/status
 * Update commission status
 */
router.patch('/:id/status', requireRole('admin', 'manager', 'system'), async (req, res, next) => {
  try {
    const { status, notes, reason } = req.body;
    const commission = await commissionService.updateStatus(req.params.id, status, notes, reason);
    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/commissions/:id
 * Delete commission
 */
router.delete('/:id', requireRole('admin', 'system'), async (req, res, next) => {
  try {
    const result = await commissionService.deleteCommission(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
