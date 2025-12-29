// Commission Routes - Commission management API
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { commissionService } from '../services/commissionService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /commissions - List commissions with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      status,
      commissionType,
      ownerId,
      accountId,
      opportunityId,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;

    const where = {};

    // Filter by status
    if (status) where.status = status;
    if (commissionType) where.commissionType = commissionType;

    // Filter by owner - non-admins can only see their own
    if (ownerId) {
      where.ownerId = ownerId;
    } else if (!['admin', 'super_admin', 'finance'].includes(req.user.role)) {
      where.ownerId = req.user.id;
    }

    // Filter by related records
    if (accountId) where.accountId = accountId;
    if (opportunityId) where.opportunityId = opportunityId;

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          account: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          plan: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.commission.count({ where }),
    ]);

    res.json({
      success: true,
      data: commissions,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/summary - Get commission summary for current user or all
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;

    // Determine which user's summary to get
    let targetUserId = userId;
    if (!['admin', 'super_admin', 'finance'].includes(req.user.role)) {
      targetUserId = req.user.id;
    }

    const summary = await commissionService.getUserCommissionSummary(
      targetUserId,
      { startDate, endDate }
    );

    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/approval-queue - Get commissions pending approval
 */
router.get('/approval-queue', requireRole('admin', 'super_admin', 'finance', 'manager'), async (req, res, next) => {
  try {
    const { commissionType, minAmount } = req.query;

    const commissions = await commissionService.getApprovalQueue({
      commissionType,
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
    });

    res.json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/:id - Get single commission
 */
router.get('/:id', async (req, res, next) => {
  try {
    const commission = await prisma.commission.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
        serviceContract: { select: { id: true, contractNumber: true } },
        plan: { select: { id: true, name: true } },
        tier: true,
        approvedBy: { select: { id: true, name: true } },
        adjustedBy: { select: { id: true, name: true } },
      },
    });

    if (!commission) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission not found' },
      });
    }

    // Check permission to view
    if (!['admin', 'super_admin', 'finance'].includes(req.user.role) && commission.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot view this commission' },
      });
    }

    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/:id/approve - Approve commission
 */
router.post('/:id/approve', requireRole('admin', 'super_admin', 'finance', 'manager'), async (req, res, next) => {
  try {
    const { notes } = req.body;

    const commission = await commissionService.approveCommission(
      req.params.id,
      req.user.id,
      notes
    );

    logger.info(`Commission approved: ${commission.id} by ${req.user.email}`);

    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/:id/reject - Reject commission
 */
router.post('/:id/reject', requireRole('admin', 'super_admin', 'finance', 'manager'), async (req, res, next) => {
  try {
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required' },
      });
    }

    const commission = await prisma.commission.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        notes: reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: req.params.id,
        action: 'UPDATE',
        oldValues: { status: 'PENDING' },
        newValues: { status: 'REJECTED', reason },
        userId: req.user.id,
        source: 'commission_api',
      },
    });

    logger.info(`Commission rejected: ${commission.id} by ${req.user.email}`);

    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/:id/pay - Mark commission as paid
 */
router.post('/:id/pay', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { reference, notes } = req.body;

    const commission = await commissionService.markCommissionPaid(
      req.params.id,
      req.user.id,
      { reference, notes }
    );

    logger.info(`Commission marked paid: ${commission.id} by ${req.user.email}`);

    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/:id/adjust - Adjust commission amount
 */
router.post('/:id/adjust', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { amount, type = 'ADD', reason } = req.body;

    if (amount === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Amount and reason are required' },
      });
    }

    const commission = await commissionService.adjustCommission(
      req.params.id,
      req.user.id,
      { amount, type, reason }
    );

    logger.info(`Commission adjusted: ${commission.id} by ${req.user.email} - ${type} ${amount}`);

    res.json({ success: true, data: commission });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/bulk-approve - Bulk approve commissions
 */
router.post('/bulk-approve', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { commissionIds, notes } = req.body;

    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'commissionIds array is required' },
      });
    }

    const results = await Promise.allSettled(
      commissionIds.map(id => commissionService.approveCommission(id, req.user.id, notes))
    );

    const approved = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    logger.info(`Bulk commission approval: ${approved} approved, ${failed} failed by ${req.user.email}`);

    res.json({
      success: true,
      data: { approved, failed, total: commissionIds.length },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/history/:recordType/:recordId - Get commission history for a record
 */
router.get('/history/:recordType/:recordId', async (req, res, next) => {
  try {
    const { recordType, recordId } = req.params;

    const commissions = await commissionService.getCommissionHistory(recordType, recordId);

    res.json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Commission Plans (Admin)
// ==========================================

/**
 * GET /commissions/plans - Get all commission plans
 */
router.get('/plans', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { includeInactive } = req.query;

    const plans = await commissionService.getPlans(includeInactive === 'true');

    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/plans/:id - Get single commission plan
 */
router.get('/plans/:id', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const plan = await prisma.commissionPlan.findUnique({
      where: { id: req.params.id },
      include: { tiers: { orderBy: { triggerEvent: 'asc' } } },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission plan not found' },
      });
    }

    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/plans - Create commission plan
 */
router.post('/plans', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const plan = await commissionService.upsertPlan(req.body);

    logger.info(`Commission plan created: ${plan.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /commissions/plans/:id - Update commission plan
 */
router.put('/plans/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const plan = await commissionService.upsertPlan({
      ...req.body,
      id: req.params.id,
    });

    logger.info(`Commission plan updated: ${plan.id} by ${req.user.email}`);

    res.json({ success: true, data: plan });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /commissions/plans/:id - Delete commission plan
 */
router.delete('/plans/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    // Check if plan is in use
    const inUse = await prisma.commission.count({
      where: { planId: req.params.id },
    });

    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'PLAN_IN_USE', message: `Cannot delete plan - ${inUse} commissions are using it` },
      });
    }

    // Delete tiers first
    await prisma.commissionTier.deleteMany({ where: { planId: req.params.id } });

    // Delete plan
    await prisma.commissionPlan.delete({ where: { id: req.params.id } });

    logger.info(`Commission plan deleted: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Commission plan deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/types - Get commission type enum values
 */
router.get('/meta/types', (req, res) => {
  const types = [
    { value: 'PRE_COMMISSION', label: 'Pre-Commission', description: 'Paid at contract creation' },
    { value: 'BACKEND_COMMISSION', label: 'Back-End Commission', description: 'Paid when job completed' },
    { value: 'DOWNPAYMENT', label: 'Downpayment', description: 'Paid when downpayment received' },
    { value: 'COMPANY_LEAD', label: 'Company Lead', description: 'Commission on company-generated leads' },
    { value: 'SELF_GEN', label: 'Self-Gen', description: 'Commission on self-generated leads' },
    { value: 'SALES_OP_COMMISSION', label: 'Sales Op Commission', description: 'Jason Wooten PandaClaims commission' },
    { value: 'SUPPLEMENT_OVERRIDE', label: 'Supplement Override', description: 'Commission on supplements' },
    { value: 'PM_COMMISSION', label: 'PM Commission', description: 'Project Manager commission' },
    { value: 'REFERRAL_COMMISSION', label: 'Referral Commission', description: 'Referral bonus' },
    { value: 'OVERRIDE', label: 'Override', description: 'Manager override commission' },
  ];

  res.json({ success: true, data: types });
});

/**
 * GET /commissions/triggers - Get commission trigger enum values
 */
router.get('/meta/triggers', (req, res) => {
  const triggers = [
    { value: 'CONTRACT_CREATED', label: 'Contract Created', description: 'When service contract is created' },
    { value: 'ONBOARDING_COMPLETE', label: 'Onboarding Complete', description: 'When onboarding is completed' },
    { value: 'DOWNPAYMENT_RECEIVED', label: 'Downpayment Received', description: 'When downpayment is received' },
    { value: 'BALANCE_PAID', label: 'Balance Paid', description: 'When balance is paid in full' },
    { value: 'JOB_COMPLETED', label: 'Job Completed', description: 'When main trade is completed' },
    { value: 'SUPPLEMENT_APPROVED', label: 'Supplement Approved', description: 'When supplement is approved' },
  ];

  res.json({ success: true, data: triggers });
});

// ==========================================
// Commission Rules (Editable Admin UI)
// ==========================================

/**
 * GET /commissions/rules - Get all commission rules
 */
router.get('/rules', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { includeInactive } = req.query;

    const rules = await commissionService.getRules(includeInactive === 'true');

    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/rules/:id - Get single commission rule
 */
router.get('/rules/:id', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const rule = await commissionService.getRuleById(req.params.id);

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
 * POST /commissions/rules - Create commission rule
 */
router.post('/rules', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { name, description, ruleType, rate, flatAmount, commissionType, isActive, priority, conditions, appliesToRole, appliesToDepartment, appliesToUserId } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rule name is required' },
      });
    }

    if (ruleType === 'PERCENTAGE' && !rate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rate is required for percentage rules' },
      });
    }

    if (ruleType === 'FLAT' && !flatAmount) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Flat amount is required for flat rules' },
      });
    }

    const rule = await commissionService.createRule(
      { name, description, ruleType, rate, flatAmount, commissionType, isActive, priority, conditions, appliesToRole, appliesToDepartment, appliesToUserId },
      req.user.id
    );

    logger.info(`Commission rule created: ${rule.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /commissions/rules/:id - Update commission rule
 */
router.put('/rules/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const rule = await commissionService.updateRule(
      req.params.id,
      req.body,
      req.user.id
    );

    logger.info(`Commission rule updated: ${rule.id} by ${req.user.email}`);

    res.json({ success: true, data: rule });
  } catch (error) {
    if (error.message === 'Commission rule not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * DELETE /commissions/rules/:id - Delete commission rule
 */
router.delete('/rules/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    await commissionService.deleteRule(req.params.id, req.user.id);

    logger.info(`Commission rule deleted: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Commission rule deleted' });
  } catch (error) {
    if (error.message === 'Commission rule not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * POST /commissions/rules/:id/toggle - Toggle rule active status
 */
router.post('/rules/:id/toggle', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const rule = await commissionService.toggleRuleStatus(req.params.id, req.user.id);

    logger.info(`Commission rule toggled: ${rule.id} to ${rule.isActive ? 'active' : 'inactive'} by ${req.user.email}`);

    res.json({ success: true, data: rule });
  } catch (error) {
    if (error.message === 'Commission rule not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * POST /commissions/rules/seed - Seed default commission rules
 */
router.post('/rules/seed', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const rules = await commissionService.seedDefaultRules(req.user.id);

    logger.info(`Commission rules seeded: ${rules.length} rules by ${req.user.email}`);

    res.json({ success: true, data: rules, message: `${rules.length} default rules created` });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /commissions/rules/meta/types - Get rule type enum values
 */
router.get('/rules/meta/types', (req, res) => {
  const types = [
    { value: 'PERCENTAGE', label: 'Percentage', description: 'Rate-based commission (e.g., 8% of contract value)' },
    { value: 'FLAT', label: 'Flat Amount', description: 'Fixed amount per job (e.g., $200)' },
    { value: 'BONUS', label: 'Bonus', description: 'Additional bonus on top of base commission' },
  ];

  res.json({ success: true, data: types });
});

export default router;
