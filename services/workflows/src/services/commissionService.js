// Commission Service - Commission calculation and management
import pkg from '@prisma/client';
const { PrismaClient, Decimal } = pkg;
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

/**
 * Commission Service - Replaces Salesforce commission engine
 * Handles commission calculation, creation, and tracking
 */
export const commissionService = {
  /**
   * Create a commission based on trigger event
   */
  async createCommission({ recordType, recordId, record, triggerEvent, userId }) {
    logger.info(`Creating commission for ${recordType}:${recordId} on ${triggerEvent}`);

    try {
      // Get the appropriate commission plan
      const plan = await this.getApplicablePlan(record, triggerEvent);

      if (!plan) {
        logger.info('No applicable commission plan found');
        return { created: false, reason: 'No applicable commission plan' };
      }

      // Calculate commission amount
      const commissionData = await this.calculateCommission(plan, record, triggerEvent);

      if (!commissionData.amount || commissionData.amount <= 0) {
        logger.info('Commission amount is zero or negative, skipping');
        return { created: false, reason: 'Commission amount is zero' };
      }

      // Check for existing commission to avoid duplicates
      const existingCommission = await prisma.commission.findFirst({
        where: {
          serviceContractId: record.serviceContractId || recordId,
          commissionType: commissionData.type,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
      });

      if (existingCommission) {
        logger.info(`Commission already exists: ${existingCommission.id}`);
        return { created: false, reason: 'Commission already exists', existingId: existingCommission.id };
      }

      // Determine commission owner
      const ownerId = await this.determineCommissionOwner(record, commissionData.type);

      // Create the commission record
      const commission = await prisma.commission.create({
        data: {
          serviceContractId: record.serviceContractId || recordId,
          accountId: record.accountId,
          opportunityId: record.opportunityId || record.id,
          ownerId,
          commissionType: commissionData.type,
          commissionValue: commissionData.baseValue,
          commissionRateOfPay: commissionData.rate,
          grossCommission: commissionData.amount,
          netCommission: commissionData.amount, // Adjusted by adjustments later
          status: 'PENDING',
          planId: plan.id,
          tierId: commissionData.tierId,
          calculationDetails: commissionData.details,
          triggerEvent,
          createdById: userId,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          tableName: 'commissions',
          recordId: commission.id,
          action: 'CREATE',
          newValues: {
            type: commissionData.type,
            amount: commissionData.amount,
            rate: commissionData.rate,
            triggerEvent,
          },
          userId,
          source: 'commission_service',
        },
      });

      logger.info(`Commission created: ${commission.id} for ${commissionData.amount}`);

      return {
        created: true,
        commissionId: commission.id,
        amount: commissionData.amount,
        type: commissionData.type,
      };

    } catch (error) {
      logger.error('Failed to create commission:', error);
      throw error;
    }
  },

  /**
   * Get applicable commission plan for the record and event
   */
  async getApplicablePlan(record, triggerEvent) {
    // First check for user-specific plan
    if (record.ownerId || record.salesRepId) {
      const userPlan = await prisma.commissionPlan.findFirst({
        where: {
          isActive: true,
          appliesToUserId: record.ownerId || record.salesRepId,
          effectiveDate: { lte: new Date() },
          OR: [
            { expirationDate: null },
            { expirationDate: { gte: new Date() } },
          ],
        },
        include: { tiers: true },
        orderBy: { effectiveDate: 'desc' },
      });

      if (userPlan) return userPlan;
    }

    // Check for role-specific plan
    if (record.ownerRole) {
      const rolePlan = await prisma.commissionPlan.findFirst({
        where: {
          isActive: true,
          appliesToRole: record.ownerRole,
          effectiveDate: { lte: new Date() },
          OR: [
            { expirationDate: null },
            { expirationDate: { gte: new Date() } },
          ],
        },
        include: { tiers: true },
        orderBy: { effectiveDate: 'desc' },
      });

      if (rolePlan) return rolePlan;
    }

    // Fall back to default plan
    const defaultPlan = await prisma.commissionPlan.findFirst({
      where: {
        isActive: true,
        appliesToUserId: null,
        appliesToRole: null,
        effectiveDate: { lte: new Date() },
        OR: [
          { expirationDate: null },
          { expirationDate: { gte: new Date() } },
        ],
      },
      include: { tiers: true },
      orderBy: { effectiveDate: 'desc' },
    });

    return defaultPlan;
  },

  /**
   * Calculate commission based on plan tiers
   */
  async calculateCommission(plan, record, triggerEvent) {
    // Find matching tier for this trigger event
    const tier = plan.tiers.find(t => t.triggerEvent === triggerEvent);

    if (!tier) {
      return { amount: 0, type: 'UNKNOWN', details: { error: 'No matching tier for trigger event' } };
    }

    // Determine base value for commission calculation
    let baseValue = 0;
    let commissionType = tier.commissionType;

    switch (triggerEvent) {
      case 'CONTRACT_CREATED':
      case 'ONBOARDING_COMPLETE':
        baseValue = parseFloat(record.contractGrandTotal || record.totalAmount || 0);
        commissionType = commissionType || 'PRE_COMMISSION';
        break;

      case 'DOWNPAYMENT_RECEIVED':
        baseValue = parseFloat(record.downPaymentAmount || record.amount || 0);
        commissionType = commissionType || 'DOWNPAYMENT';
        break;

      case 'BALANCE_PAID':
      case 'JOB_COMPLETED':
        baseValue = parseFloat(record.contractGrandTotal || record.totalAmount || 0);
        commissionType = commissionType || 'BACKEND_COMMISSION';
        break;

      case 'SUPPLEMENT_APPROVED':
        baseValue = parseFloat(record.supplementAmount || record.amount || 0);
        commissionType = commissionType || 'SUPPLEMENT_OVERRIDE';
        break;

      default:
        baseValue = parseFloat(record.amount || record.totalAmount || 0);
    }

    // Apply rate
    const rate = parseFloat(tier.rate);
    let amount = baseValue * rate;

    // Apply min/max if configured
    if (tier.minimumAmount && amount < parseFloat(tier.minimumAmount)) {
      amount = parseFloat(tier.minimumAmount);
    }
    if (tier.maximumAmount && amount > parseFloat(tier.maximumAmount)) {
      amount = parseFloat(tier.maximumAmount);
    }

    // Apply flat amount if configured
    if (tier.flatAmount) {
      amount = parseFloat(tier.flatAmount);
    }

    // Round to 2 decimal places
    amount = Math.round(amount * 100) / 100;

    return {
      amount,
      baseValue,
      rate,
      type: commissionType,
      tierId: tier.id,
      details: {
        planName: plan.name,
        tierName: tier.name,
        calculation: `${baseValue} * ${rate} = ${amount}`,
        triggerEvent,
      },
    };
  },

  /**
   * Determine who should receive the commission
   */
  async determineCommissionOwner(record, commissionType) {
    // Check for specific assignment rules
    switch (commissionType) {
      case 'SALES_OP_COMMISSION':
        // For Jason Wooten's special PandaClaims commission
        if (record.isPandaClaims) {
          const jasonWooten = await prisma.user.findFirst({
            where: { email: { contains: 'jason' }, name: { contains: 'Wooten' } },
          });
          if (jasonWooten) return jasonWooten.id;
        }
        break;

      case 'PM_COMMISSION':
        // Project Manager gets their own commission
        if (record.projectManagerId) return record.projectManagerId;
        break;

      case 'REFERRAL_COMMISSION':
        if (record.referredById) return record.referredById;
        break;
    }

    // Default to record owner or sales rep
    return record.ownerId || record.salesRepId || record.createdById;
  },

  /**
   * Get commission summary for a user
   */
  async getUserCommissionSummary(userId, dateRange = {}) {
    const where = {
      ownerId: userId,
      ...(dateRange.startDate && { createdAt: { gte: new Date(dateRange.startDate) } }),
      ...(dateRange.endDate && { createdAt: { lte: new Date(dateRange.endDate) } }),
    };

    const [pending, approved, paid, total] = await Promise.all([
      prisma.commission.aggregate({
        where: { ...where, status: 'PENDING' },
        _sum: { grossCommission: true },
        _count: true,
      }),
      prisma.commission.aggregate({
        where: { ...where, status: 'APPROVED' },
        _sum: { grossCommission: true },
        _count: true,
      }),
      prisma.commission.aggregate({
        where: { ...where, status: 'PAID' },
        _sum: { netCommission: true },
        _count: true,
      }),
      prisma.commission.aggregate({
        where,
        _sum: { grossCommission: true, netCommission: true },
        _count: true,
      }),
    ]);

    return {
      pending: {
        count: pending._count,
        amount: parseFloat(pending._sum.grossCommission || 0),
      },
      approved: {
        count: approved._count,
        amount: parseFloat(approved._sum.grossCommission || 0),
      },
      paid: {
        count: paid._count,
        amount: parseFloat(paid._sum.netCommission || 0),
      },
      total: {
        count: total._count,
        grossAmount: parseFloat(total._sum.grossCommission || 0),
        netAmount: parseFloat(total._sum.netCommission || 0),
      },
    };
  },

  /**
   * Get commission plans (admin)
   */
  async getPlans(includeInactive = false) {
    return prisma.commissionPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        tiers: { orderBy: { triggerEvent: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Create or update commission plan (admin)
   */
  async upsertPlan(data) {
    const planData = {
      name: data.name,
      description: data.description,
      isActive: data.isActive ?? true,
      effectiveDate: new Date(data.effectiveDate),
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
      appliesToRole: data.appliesToRole,
      appliesToUserId: data.appliesToUserId,
    };

    if (data.id) {
      // Update existing plan
      const plan = await prisma.commissionPlan.update({
        where: { id: data.id },
        data: planData,
      });

      // Update tiers if provided
      if (data.tiers) {
        await this.updatePlanTiers(plan.id, data.tiers);
      }

      return prisma.commissionPlan.findUnique({
        where: { id: plan.id },
        include: { tiers: true },
      });
    }

    // Create new plan with tiers
    const plan = await prisma.commissionPlan.create({
      data: {
        ...planData,
        tiers: data.tiers ? {
          create: data.tiers.map(tier => ({
            name: tier.name,
            commissionType: tier.commissionType,
            rate: tier.rate,
            minimumAmount: tier.minimumAmount,
            maximumAmount: tier.maximumAmount,
            flatAmount: tier.flatAmount,
            triggerEvent: tier.triggerEvent,
            conditions: tier.conditions,
          })),
        } : undefined,
      },
      include: { tiers: true },
    });

    return plan;
  },

  /**
   * Update plan tiers
   */
  async updatePlanTiers(planId, tiers) {
    // Delete existing tiers
    await prisma.commissionTier.deleteMany({
      where: { planId },
    });

    // Create new tiers
    await prisma.commissionTier.createMany({
      data: tiers.map(tier => ({
        planId,
        name: tier.name,
        commissionType: tier.commissionType,
        rate: tier.rate,
        minimumAmount: tier.minimumAmount,
        maximumAmount: tier.maximumAmount,
        flatAmount: tier.flatAmount,
        triggerEvent: tier.triggerEvent,
        conditions: tier.conditions,
      })),
    });
  },

  /**
   * Approve commission (manager action)
   */
  async approveCommission(commissionId, approverId, notes = null) {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
    });

    if (!commission) {
      throw new Error('Commission not found');
    }

    if (commission.status !== 'PENDING') {
      throw new Error(`Cannot approve commission with status: ${commission.status}`);
    }

    const updated = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedById: approverId,
        notes: notes ? `${commission.notes || ''}\n[Approved] ${notes}` : commission.notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: commissionId,
        action: 'UPDATE',
        oldValues: { status: 'PENDING' },
        newValues: { status: 'APPROVED', approvedAt: new Date() },
        userId: approverId,
        source: 'commission_service',
      },
    });

    return updated;
  },

  /**
   * Mark commission as paid
   */
  async markCommissionPaid(commissionId, paidById, paymentDetails = {}) {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
    });

    if (!commission) {
      throw new Error('Commission not found');
    }

    if (commission.status !== 'APPROVED') {
      throw new Error(`Cannot pay commission with status: ${commission.status}`);
    }

    const updated = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentReference: paymentDetails.reference,
        notes: paymentDetails.notes
          ? `${commission.notes || ''}\n[Paid] ${paymentDetails.notes}`
          : commission.notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: commissionId,
        action: 'UPDATE',
        oldValues: { status: 'APPROVED' },
        newValues: { status: 'PAID', paidAt: new Date() },
        userId: paidById,
        source: 'commission_service',
      },
    });

    return updated;
  },

  /**
   * Adjust commission amount
   */
  async adjustCommission(commissionId, adjustedById, adjustment) {
    const commission = await prisma.commission.findUnique({
      where: { id: commissionId },
    });

    if (!commission) {
      throw new Error('Commission not found');
    }

    if (commission.status === 'PAID') {
      throw new Error('Cannot adjust a paid commission');
    }

    const oldNet = parseFloat(commission.netCommission);
    const adjustmentAmount = parseFloat(adjustment.amount);
    const newNet = adjustment.type === 'SET'
      ? adjustmentAmount
      : oldNet + adjustmentAmount;

    const updated = await prisma.commission.update({
      where: { id: commissionId },
      data: {
        netCommission: newNet,
        adjustmentReason: adjustment.reason,
        adjustedAt: new Date(),
        adjustedById,
        notes: `${commission.notes || ''}\n[Adjustment] ${adjustment.reason}: ${adjustment.type === 'SET' ? 'Set to' : 'Changed by'} ${adjustmentAmount}`,
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'commissions',
        recordId: commissionId,
        action: 'UPDATE',
        oldValues: { netCommission: oldNet },
        newValues: { netCommission: newNet, adjustmentReason: adjustment.reason },
        userId: adjustedById,
        source: 'commission_service',
      },
    });

    return updated;
  },

  /**
   * Get commissions for approval queue
   */
  async getApprovalQueue(filters = {}) {
    return prisma.commission.findMany({
      where: {
        status: 'PENDING',
        ...(filters.commissionType && { commissionType: filters.commissionType }),
        ...(filters.minAmount && { grossCommission: { gte: filters.minAmount } }),
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true, stage: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Get commission history for a record
   */
  async getCommissionHistory(recordType, recordId) {
    const where = {};

    switch (recordType) {
      case 'account':
        where.accountId = recordId;
        break;
      case 'opportunity':
        where.opportunityId = recordId;
        break;
      case 'serviceContract':
        where.serviceContractId = recordId;
        break;
      case 'user':
        where.ownerId = recordId;
        break;
    }

    return prisma.commission.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ==========================================================================
  // COMMISSION RULES - Editable rules displayed in admin UI
  // ==========================================================================

  /**
   * Get all commission rules
   */
  async getRules(includeInactive = false) {
    return prisma.commissionRule.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  },

  /**
   * Get a single commission rule by ID
   */
  async getRuleById(ruleId) {
    return prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });
  },

  /**
   * Create a new commission rule
   */
  async createRule(data, createdById) {
    const rule = await prisma.commissionRule.create({
      data: {
        name: data.name,
        description: data.description,
        ruleType: data.ruleType || 'PERCENTAGE',
        rate: data.rate,
        flatAmount: data.flatAmount,
        commissionType: data.commissionType,
        isActive: data.isActive ?? true,
        priority: data.priority || 0,
        conditions: data.conditions,
        appliesToRole: data.appliesToRole,
        appliesToDepartment: data.appliesToDepartment,
        appliesToUserId: data.appliesToUserId,
        createdById,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commission_rules',
        recordId: rule.id,
        action: 'CREATE',
        newValues: {
          name: rule.name,
          ruleType: rule.ruleType,
          rate: rule.rate,
          flatAmount: rule.flatAmount,
          isActive: rule.isActive,
        },
        userId: createdById,
        source: 'commission_service',
      },
    });

    logger.info(`Commission rule created: ${rule.id} - ${rule.name}`);
    return rule;
  },

  /**
   * Update an existing commission rule
   */
  async updateRule(ruleId, data, updatedById) {
    const existing = await prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Commission rule not found');
    }

    const rule = await prisma.commissionRule.update({
      where: { id: ruleId },
      data: {
        name: data.name,
        description: data.description,
        ruleType: data.ruleType,
        rate: data.rate,
        flatAmount: data.flatAmount,
        commissionType: data.commissionType,
        isActive: data.isActive,
        priority: data.priority,
        conditions: data.conditions,
        appliesToRole: data.appliesToRole,
        appliesToDepartment: data.appliesToDepartment,
        appliesToUserId: data.appliesToUserId,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commission_rules',
        recordId: rule.id,
        action: 'UPDATE',
        oldValues: {
          name: existing.name,
          ruleType: existing.ruleType,
          rate: existing.rate,
          flatAmount: existing.flatAmount,
          isActive: existing.isActive,
        },
        newValues: {
          name: rule.name,
          ruleType: rule.ruleType,
          rate: rule.rate,
          flatAmount: rule.flatAmount,
          isActive: rule.isActive,
        },
        userId: updatedById,
        source: 'commission_service',
      },
    });

    logger.info(`Commission rule updated: ${rule.id} - ${rule.name}`);
    return rule;
  },

  /**
   * Delete a commission rule
   */
  async deleteRule(ruleId, deletedById) {
    const existing = await prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Commission rule not found');
    }

    await prisma.commissionRule.delete({
      where: { id: ruleId },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commission_rules',
        recordId: ruleId,
        action: 'DELETE',
        oldValues: {
          name: existing.name,
          ruleType: existing.ruleType,
          rate: existing.rate,
          flatAmount: existing.flatAmount,
        },
        userId: deletedById,
        source: 'commission_service',
      },
    });

    logger.info(`Commission rule deleted: ${ruleId} - ${existing.name}`);
    return { success: true, id: ruleId };
  },

  /**
   * Toggle a rule's active status
   */
  async toggleRuleStatus(ruleId, updatedById) {
    const existing = await prisma.commissionRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Commission rule not found');
    }

    const rule = await prisma.commissionRule.update({
      where: { id: ruleId },
      data: {
        isActive: !existing.isActive,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'commission_rules',
        recordId: rule.id,
        action: 'UPDATE',
        oldValues: { isActive: existing.isActive },
        newValues: { isActive: rule.isActive },
        userId: updatedById,
        source: 'commission_service',
      },
    });

    logger.info(`Commission rule ${rule.isActive ? 'activated' : 'deactivated'}: ${rule.id} - ${rule.name}`);
    return rule;
  },

  /**
   * Get applicable rules for a commission calculation
   * Returns rules sorted by priority (highest first)
   */
  async getApplicableRules(context = {}) {
    const rules = await prisma.commissionRule.findMany({
      where: {
        isActive: true,
        ...(context.commissionType && { commissionType: context.commissionType }),
        OR: [
          { appliesToUserId: null, appliesToRole: null, appliesToDepartment: null },
          ...(context.userId ? [{ appliesToUserId: context.userId }] : []),
          ...(context.role ? [{ appliesToRole: context.role }] : []),
          ...(context.department ? [{ appliesToDepartment: context.department }] : []),
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return rules;
  },

  /**
   * Seed default commission rules (for initial setup)
   */
  async seedDefaultRules(createdById = 'system') {
    const defaultRules = [
      {
        name: 'Standard Sales Commission',
        description: 'Base commission rate for all sales',
        ruleType: 'PERCENTAGE',
        rate: 8.0,
        commissionType: 'BACK_END',
        isActive: true,
        priority: 0,
      },
      {
        name: 'Self-Gen Bonus',
        description: 'Additional commission for self-generated leads',
        ruleType: 'BONUS',
        rate: 2.0,
        commissionType: 'SELF_GEN',
        isActive: true,
        priority: 10,
      },
      {
        name: 'Team Lead Override',
        description: 'Override commission for team leads on their team sales',
        ruleType: 'PERCENTAGE',
        rate: 1.5,
        commissionType: 'MANAGER_OVERRIDE',
        isActive: true,
        priority: 5,
      },
      {
        name: 'Insurance Premium',
        description: 'Flat bonus for insurance program sales',
        ruleType: 'FLAT',
        flatAmount: 200.0,
        conditions: { leadSource: 'Insurance Program' },
        isActive: true,
        priority: 20,
      },
      {
        name: 'Quarterly Bonus',
        description: 'Quarterly performance bonus',
        ruleType: 'FLAT',
        flatAmount: 500.0,
        isActive: false, // Inactive by default
        priority: 0,
      },
    ];

    const created = [];
    for (const ruleData of defaultRules) {
      // Check if rule already exists by name
      const existing = await prisma.commissionRule.findFirst({
        where: { name: ruleData.name },
      });

      if (!existing) {
        const rule = await this.createRule(ruleData, createdById);
        created.push(rule);
      }
    }

    logger.info(`Seeded ${created.length} default commission rules`);
    return created;
  },
};

export default commissionService;
