// Commission Service - Business Logic for Commission Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

export const commissionService = {
  /**
   * Get dashboard summary with counts by status and totals
   */
  async getDashboardSummary({ ownerId, startDate, endDate } = {}) {
    const where = {};

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get counts by status
    const statusCounts = await prisma.commission.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
      _sum: { commissionAmount: true },
    });

    // Get counts by type
    const typeCounts = await prisma.commission.groupBy({
      by: ['type'],
      where,
      _count: { id: true },
      _sum: { commissionAmount: true },
    });

    // Get total
    const totals = await prisma.commission.aggregate({
      where,
      _count: { id: true },
      _sum: { commissionAmount: true },
    });

    // Format results
    const byStatus = statusCounts.reduce((acc, s) => {
      acc[s.status] = {
        count: s._count.id,
        amount: s._sum.commissionAmount || 0,
      };
      return acc;
    }, {});

    const byType = typeCounts.reduce((acc, t) => {
      acc[t.type] = {
        count: t._count.id,
        amount: t._sum.commissionAmount || 0,
      };
      return acc;
    }, {});

    return {
      total: {
        count: totals._count.id,
        amount: totals._sum.commissionAmount || 0,
      },
      byStatus,
      byType,
    };
  },

  /**
   * Get commissions with pagination and filtering
   */
  async getCommissions({
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc',
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
  } = {}) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (status) {
      // Support comma-separated status values
      const statuses = status.split(',').map(s => s.trim());
      where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
    }

    if (type) {
      const types = type.split(',').map(t => t.trim());
      where.type = types.length > 1 ? { in: types } : types[0];
    }

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    if (serviceContractId) {
      where.serviceContractId = serviceContractId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { owner: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Filter by paidDate for paid commissions
    if (paidDateFrom || paidDateTo) {
      where.paidDate = {};
      if (paidDateFrom) where.paidDate.gte = new Date(paidDateFrom);
      if (paidDateTo) where.paidDate.lte = new Date(paidDateTo);
    }

    if (minAmount || maxAmount) {
      where.commissionAmount = {};
      if (minAmount) where.commissionAmount.gte = parseFloat(minAmount);
      if (maxAmount) where.commissionAmount.lte = parseFloat(maxAmount);
    }

    // Build orderBy
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    // Execute query
    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          owner: {
            select: {
              id: true,
              fullName: true,
              firstName: true,
              lastName: true,
              email: true,
              title: true,
              department: true,
            },
          },
          opportunity: {
            select: {
              id: true,
              name: true,
              stage: true,
              amount: true,
              accountId: true,
              account: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          serviceContract: {
            select: {
              id: true,
              name: true,
              contractNumber: true,
              contractTotal: true,
            },
          },
        },
      }),
      prisma.commission.count({ where }),
    ]);

    return {
      data: commissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single commission by ID
   */
  async getCommissionById(id) {
    const commission = await prisma.commission.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            fullName: true,
            firstName: true,
            lastName: true,
            email: true,
            title: true,
            department: true,
            commissionRate: true,
            preCommissionRate: true,
            companyLeadRate: true,
            selfGenRate: true,
            overridePercent: true,
          },
        },
        opportunity: {
          select: {
            id: true,
            name: true,
            stageName: true,
            amount: true,
            accountId: true,
            account: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        serviceContract: {
          select: {
            id: true,
            name: true,
            contractNumber: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!commission) {
      const error = new Error('Commission not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    return commission;
  },

  /**
   * Create a new commission
   */
  async createCommission(data) {
    // Calculate commission amount if not provided
    if (!data.commissionAmount && data.commissionValue && data.commissionRate) {
      data.commissionAmount = parseFloat(data.commissionValue) * (parseFloat(data.commissionRate) / 100);
    }

    const commission = await prisma.commission.create({
      data: {
        name: data.name,
        type: data.type,
        status: data.status || 'NEW',
        commissionValue: data.commissionValue,
        commissionRate: data.commissionRate,
        commissionAmount: data.commissionAmount,
        notes: data.notes,
        ownerId: data.ownerId,
        opportunityId: data.opportunityId,
        serviceContractId: data.serviceContractId,
      },
      include: {
        owner: {
          select: { id: true, fullName: true },
        },
      },
    });

    logger.info(`Commission created: ${commission.id} for ${commission.owner.fullName}`);
    return commission;
  },

  /**
   * Update commission
   */
  async updateCommission(id, data) {
    // Validate commission exists
    await this.getCommissionById(id);

    // Track status changes for timestamps
    const updateData = { ...data };

    if (data.status === 'REQUESTED' && !data.requestedDate) {
      updateData.requestedDate = new Date();
    }
    if (data.status === 'APPROVED' && !data.approvedDate) {
      updateData.approvedDate = new Date();
    }
    if (data.status === 'PAID' && !data.paidDate) {
      updateData.paidDate = new Date();
    }

    // Recalculate amount if value or rate changed
    if (data.commissionValue || data.commissionRate) {
      const existing = await prisma.commission.findUnique({ where: { id } });
      const value = data.commissionValue || existing.commissionValue;
      const rate = data.commissionRate || existing.commissionRate;
      updateData.commissionAmount = parseFloat(value) * (parseFloat(rate) / 100);
    }

    const updated = await prisma.commission.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, fullName: true },
        },
      },
    });

    logger.info(`Commission updated: ${id}`);
    return updated;
  },

  /**
   * Update commission status
   */
  async updateStatus(id, newStatus, notes, reason) {
    const updateData = {
      status: newStatus,
    };

    if (notes) {
      updateData.notes = notes;
    }

    // Set appropriate timestamps and reasons
    switch (newStatus) {
      case 'REQUESTED':
        updateData.requestedDate = new Date();
        break;
      case 'APPROVED':
        updateData.approvedDate = new Date();
        break;
      case 'PAID':
        updateData.paidDate = new Date();
        break;
      case 'HOLD':
        if (reason) updateData.holdReason = reason;
        break;
      case 'DENIED':
        if (reason) updateData.deniedReason = reason;
        break;
    }

    return this.updateCommission(id, updateData);
  },

  /**
   * Bulk update commission status
   */
  async bulkUpdateStatus(commissionIds, newStatus, notes, reason) {
    const updateData = {
      status: newStatus,
    };

    if (notes) {
      updateData.notes = notes;
    }

    // Set appropriate timestamps
    switch (newStatus) {
      case 'REQUESTED':
        updateData.requestedDate = new Date();
        break;
      case 'APPROVED':
        updateData.approvedDate = new Date();
        break;
      case 'PAID':
        updateData.paidDate = new Date();
        break;
      case 'HOLD':
        if (reason) updateData.holdReason = reason;
        break;
      case 'DENIED':
        if (reason) updateData.deniedReason = reason;
        break;
    }

    const result = await prisma.commission.updateMany({
      where: { id: { in: commissionIds } },
      data: updateData,
    });

    logger.info(`Bulk status update: ${result.count} commissions updated to ${newStatus}`);
    return { updated: result.count };
  },

  /**
   * Delete commission
   */
  async deleteCommission(id) {
    await this.getCommissionById(id);

    await prisma.commission.delete({
      where: { id },
    });

    logger.info(`Commission deleted: ${id}`);
    return { success: true };
  },

  /**
   * Get commission profile for a user (their rates and commission summary)
   */
  async getUserCommissionProfile(userId) {
    const [user, summary] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          fullName: true,
          email: true,
          title: true,
          department: true,
          commissionRate: true,
          preCommissionRate: true,
          companyLeadRate: true,
          selfGenRate: true,
          overridePercent: true,
          supplementsCommissionable: true,
        },
      }),
      this.getDashboardSummary({ ownerId: userId }),
    ]);

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    return {
      user,
      summary,
    };
  },

  /**
   * Get commissions for a specific user
   */
  async getUserCommissions(userId, options = {}) {
    return this.getCommissions({ ...options, ownerId: userId });
  },

  /**
   * Get commissions for an opportunity
   */
  async getOpportunityCommissions(opportunityId) {
    return prisma.commission.findMany({
      where: { opportunityId },
      include: {
        owner: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Get commissions for a service contract
   */
  async getServiceContractCommissions(serviceContractId) {
    return prisma.commission.findMany({
      where: { serviceContractId },
      include: {
        owner: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Calculate commission amount based on type and user rates
   */
  async calculateCommission(userId, type, value) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        commissionRate: true,
        preCommissionRate: true,
        companyLeadRate: true,
        selfGenRate: true,
        overridePercent: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    let rate;
    switch (type) {
      case 'PRE_COMMISSION':
        rate = user.preCommissionRate || 0;
        break;
      case 'BACK_END':
        rate = user.commissionRate || 0;
        break;
      case 'COMPANY_LEAD':
        rate = user.companyLeadRate || 0;
        break;
      case 'SELF_GEN':
        rate = user.selfGenRate || 0;
        break;
      case 'SUPPLEMENT_OVERRIDE':
        rate = user.overridePercent || 0;
        break;
      case 'PM_COMMISSION':
        rate = user.commissionRate || 0;
        break;
      default:
        rate = user.commissionRate || 0;
    }

    const amount = parseFloat(value) * (parseFloat(rate) / 100);

    return {
      rate,
      value: parseFloat(value),
      amount,
    };
  },

  /**
   * Get commission statistics
   */
  async getStats({ startDate, endDate } = {}) {
    const where = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, paid, pending, topEarners] = await Promise.all([
      prisma.commission.aggregate({
        where,
        _count: { id: true },
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { ...where, status: 'PAID' },
        _count: { id: true },
        _sum: { commissionAmount: true },
      }),
      prisma.commission.aggregate({
        where: { ...where, status: { in: ['NEW', 'REQUESTED', 'APPROVED'] } },
        _count: { id: true },
        _sum: { commissionAmount: true },
      }),
      prisma.commission.groupBy({
        by: ['ownerId'],
        where: { ...where, status: 'PAID' },
        _sum: { commissionAmount: true },
        orderBy: { _sum: { commissionAmount: 'desc' } },
        take: 10,
      }),
    ]);

    // Get owner details for top earners
    const ownerIds = topEarners.map(t => t.ownerId);
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, fullName: true },
    });

    const ownerMap = owners.reduce((acc, o) => {
      acc[o.id] = o;
      return acc;
    }, {});

    return {
      total: {
        count: total._count.id,
        amount: total._sum.commissionAmount || 0,
      },
      paid: {
        count: paid._count.id,
        amount: paid._sum.commissionAmount || 0,
      },
      pending: {
        count: pending._count.id,
        amount: pending._sum.commissionAmount || 0,
      },
      topEarners: topEarners.map(t => ({
        owner: ownerMap[t.ownerId],
        amount: t._sum.commissionAmount || 0,
      })),
    };
  },
};

export default commissionService;
