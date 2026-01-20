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
      ownerIds, // Support multiple owner IDs for team filtering (comma-separated)
      accountId,
      opportunityId,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    // Filter by status
    if (status) where.status = status;
    if (commissionType) where.commissionType = commissionType;

    // Filter by owner(s) - support team filtering
    const parsedOwnerIds = ownerIds
      ? ownerIds.split(',').filter(id => id.trim())
      : [];

    if (parsedOwnerIds.length > 0) {
      // Multiple owner IDs provided (team filtering)
      where.ownerId = { in: parsedOwnerIds };
    } else if (ownerId) {
      where.ownerId = ownerId;
    } else if (!['admin', 'super_admin', 'finance'].includes(req.user.role)) {
      // Non-admins can only see their own by default
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

    // Build orderBy based on sortBy field
    // Handle nested relations and special fields
    let orderBy = { createdAt: 'desc' };
    const validSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const sortFieldMap = {
      createdAt: { createdAt: validSortOrder },
      commissionValue: { commissionValue: validSortOrder },
      commissionAmount: { commissionAmount: validSortOrder },
      commissionType: { commissionType: validSortOrder },
      status: { status: validSortOrder },
      ownerName: { owner: { name: validSortOrder } },
      soldDate: { opportunity: { closeDate: validSortOrder } },
      onboardDate: { serviceContract: { startDate: validSortOrder } },
      collectedPercent: { serviceContract: { collectedPercent: validSortOrder } },
    };

    if (sortFieldMap[sortBy]) {
      orderBy = sortFieldMap[sortBy];
    }

    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          account: {
            select: {
              id: true,
              name: true,
              collectedPercent: true,
              totalPaidAmount: true,
              totalInvoiceAmount: true,
            },
          },
          opportunity: {
            select: {
              id: true,
              name: true,
              stage: true,
              jobId: true,
              closeDate: true,
            },
          },
          serviceContract: {
            select: {
              id: true,
              contractNumber: true,
              collectedPercent: true,
              paidAmount: true,
              balanceDue: true,
              grandTotal: true,
              startDate: true,
              status: true,
            },
          },
          plan: { select: { id: true, name: true } },
        },
        orderBy,
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
 * For admin/finance users without a specific userId, returns admin summary with byStatus/byType
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;

    // Check if user is admin/finance
    const isAdmin = ['admin', 'super_admin', 'finance'].includes(req.user.role);

    // If admin and no specific userId requested, return admin summary with byStatus/byType
    if (isAdmin && !userId) {
      const summary = await commissionService.getAdminCommissionSummary({ startDate, endDate });
      return res.json({ success: true, data: summary });
    }

    // Otherwise return user-specific summary
    const targetUserId = isAdmin ? (userId || req.user.id) : req.user.id;
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
 * POST /commissions - Create a manual commission (e.g., Bonus)
 * Per Scribehow workflow: Creating a New Commission Bonus
 * Required fields: ownerId, requestedAmount
 * Optional: type (default: BONUS), status (default: REQUESTED), notes, opportunityId, accountId
 */
router.post('/', requireRole('admin', 'super_admin', 'finance', 'manager'), async (req, res, next) => {
  try {
    const {
      ownerId,
      type = 'BONUS',
      status = 'REQUESTED',
      requestedAmount,
      commissionValue,
      commissionRate,
      opportunityId,
      accountId,
      serviceContractId,
      notes,
    } = req.body;

    // Validation
    if (!ownerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Commission Owner (ownerId) is required' },
      });
    }

    if (!requestedAmount || parseFloat(requestedAmount) <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Requested Amount is required and must be greater than 0' },
      });
    }

    const commission = await commissionService.createManualCommission(
      {
        ownerId,
        type,
        status,
        requestedAmount,
        commissionValue,
        commissionRate,
        opportunityId,
        accountId,
        serviceContractId,
        notes,
      },
      req.user.id
    );

    logger.info(`Manual commission created: ${commission.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: commission });
  } catch (error) {
    if (error.message.includes('required') || error.message.includes('must be')) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }
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
 * PUT /commissions/:id - Update commission with optional override
 * Supports manual override of commission amount with audit trail
 * When isManualOverride is true, stores original amount and tracks override details
 */
router.put('/:id', requireRole('admin', 'super_admin', 'finance', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      commissionAmount,
      requestedAmount,
      status,
      notes,
      holdReason,
      isManualOverride,
      overrideReason,
    } = req.body;

    // Get existing commission
    const existing = await prisma.commission.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission not found' },
      });
    }

    // Build update data
    const updateData = {};
    const oldValues = {};

    // Track status change
    if (status && status !== existing.status) {
      oldValues.status = existing.status;
      updateData.status = status;

      // Update related timestamps
      if (status === 'REQUESTED' && !existing.requestedDate) {
        updateData.requestedDate = new Date();
      } else if (status === 'APPROVED' && !existing.approvedDate) {
        updateData.approvedDate = new Date();
      } else if (status === 'HOLD') {
        updateData.holdDate = new Date();
        if (holdReason) updateData.holdReason = holdReason;
      }
    }

    // Handle amount override
    if (commissionAmount !== undefined && parseFloat(commissionAmount) !== parseFloat(existing.commissionAmount)) {
      oldValues.commissionAmount = existing.commissionAmount;
      updateData.commissionAmount = parseFloat(commissionAmount);

      // If this is a manual override, store original and track
      if (isManualOverride) {
        // Only store original if this is the first override
        if (!existing.isManualOverride) {
          updateData.originalAmount = existing.commissionAmount;
        }
        updateData.isManualOverride = true;
        updateData.overrideDate = new Date();
        updateData.overrideById = req.user.id;
        if (overrideReason) updateData.overrideReason = overrideReason;
      }
    }

    // Handle requested amount
    if (requestedAmount !== undefined && parseFloat(requestedAmount) !== parseFloat(existing.requestedAmount || 0)) {
      oldValues.requestedAmount = existing.requestedAmount;
      updateData.requestedAmount = parseFloat(requestedAmount);

      // If manual override on requested amount
      if (isManualOverride && !existing.isManualOverride) {
        updateData.originalAmount = existing.requestedAmount || existing.commissionAmount;
        updateData.isManualOverride = true;
        updateData.overrideDate = new Date();
        updateData.overrideById = req.user.id;
        if (overrideReason) updateData.overrideReason = overrideReason;
      }
    }

    // Handle notes
    if (notes !== undefined && notes !== existing.notes) {
      oldValues.notes = existing.notes;
      updateData.notes = notes;
    }

    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, data: existing, message: 'No changes detected' });
    }

    // Perform update
    const updated = await prisma.commission.update({
      where: { id },
      data: updateData,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        opportunity: { select: { id: true, name: true, stage: true, jobId: true } },
        serviceContract: { select: { id: true, contractNumber: true } },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: id,
        action: 'UPDATE',
        oldValues,
        newValues: updateData,
        userId: req.user.id,
        source: isManualOverride ? 'commission_override' : 'commission_api',
      },
    });

    logger.info(`Commission updated: ${id} by ${req.user.email}${isManualOverride ? ' (OVERRIDE)' : ''}`);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /commissions/:id/revert-override - Revert a manual override back to original calculated amount
 */
router.post('/:id/revert-override', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.commission.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Commission not found' },
      });
    }

    if (!existing.isManualOverride || !existing.originalAmount) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_OVERRIDE', message: 'This commission has no manual override to revert' },
      });
    }

    const oldAmount = existing.commissionAmount || existing.requestedAmount;
    const originalAmount = existing.originalAmount;

    // Revert to original amount
    const updated = await prisma.commission.update({
      where: { id },
      data: {
        commissionAmount: originalAmount,
        requestedAmount: originalAmount,
        isManualOverride: false,
        originalAmount: null,
        overrideReason: null,
        overrideDate: null,
        overrideById: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        opportunity: { select: { id: true, name: true, jobId: true } },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: id,
        action: 'UPDATE',
        oldValues: { commissionAmount: oldAmount, isManualOverride: true },
        newValues: { commissionAmount: originalAmount, isManualOverride: false },
        userId: req.user.id,
        source: 'commission_revert_override',
      },
    });

    logger.info(`Commission override reverted: ${id} by ${req.user.email} (${oldAmount} -> ${originalAmount})`);

    res.json({ success: true, data: updated });
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
 * POST /commissions/bulk-pay - Bulk mark commissions as paid
 * Per Scribehow workflow: Updates APPROVED commissions to PAID status
 * Sets Paid Date = Today, Paid Amount = Requested Amount
 */
router.post('/bulk-pay', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { commissionIds, notes } = req.body;

    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'commissionIds array is required' },
      });
    }

    const results = await commissionService.bulkMarkCommissionsPaid(
      commissionIds,
      req.user.id,
      notes
    );

    logger.info(`Bulk commission payment: ${results.paid} paid, ${results.skipped} skipped by ${req.user.email}`);

    res.json({
      success: true,
      data: results,
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

/**
 * PATCH /commissions/:id/paid-amount - Update paid amount (for payroll adjustments)
 * Per Scribehow: Edit Commission Record's "Paid Amount" field
 * Changes tracked with "Payroll Update Date" for the Payroll Change Report
 */
router.patch('/:id/paid-amount', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { paidAmount, notes } = req.body;

    if (paidAmount === undefined || paidAmount === null) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'paidAmount is required' },
      });
    }

    const commission = await commissionService.updatePaidAmount(
      req.params.id,
      req.user.id,
      paidAmount,
      notes
    );

    logger.info(`Commission paid amount updated: ${commission.id} to ${paidAmount} by ${req.user.email}`);

    res.json({ success: true, data: commission });
  } catch (error) {
    if (error.message === 'Commission not found') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * GET /commissions/payroll-changes - Get Payroll Change Report data
 * Returns commissions where paidAmount was edited after initial payment
 */
router.get('/payroll-changes', requireRole('admin', 'super_admin', 'finance'), async (req, res, next) => {
  try {
    const { startDate, endDate, ownerId } = req.query;

    const changes = await commissionService.getPayrollChanges({
      startDate,
      endDate,
      ownerId,
    });

    res.json({ success: true, data: changes });
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
