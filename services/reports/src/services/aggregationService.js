// Aggregation Service
// Handles data aggregation for reports and analytics

import { PrismaClient } from '@prisma/client';
import { parseDateRange, getComparisonPeriod, generateTimeBuckets } from './dateRangeService.js';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

/**
 * Get pipeline metrics with optional comparison
 */
export async function getPipelineMetrics(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    groupBy,
    includeComparison = false,
    comparisonType = 'previousPeriod',
    filters = {},
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);
  const dateFilter = {
    createdAt: {
      gte: range.start,
      lte: range.end,
    },
    ...filters,
  };

  try {
    // Base metrics
    const [
      totalCount,
      totalAmount,
      stageBreakdown,
      typeBreakdown,
    ] = await Promise.all([
      // Total pipeline count
      prisma.opportunity.count({ where: dateFilter }),

      // Total pipeline amount
      prisma.opportunity.aggregate({
        where: dateFilter,
        _sum: { amount: true },
      }),

      // By stage
      prisma.opportunity.groupBy({
        by: ['stage'],
        where: dateFilter,
        _count: { _all: true },
        _sum: { amount: true },
      }),

      // By type
      prisma.opportunity.groupBy({
        by: ['type'],
        where: dateFilter,
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    let comparisonData = null;
    if (includeComparison) {
      const compRange = getComparisonPeriod(range, comparisonType);
      const compFilter = {
        createdAt: {
          gte: compRange.start,
          lte: compRange.end,
        },
        ...filters,
      };

      const [compCount, compAmount] = await Promise.all([
        prisma.opportunity.count({ where: compFilter }),
        prisma.opportunity.aggregate({
          where: compFilter,
          _sum: { amount: true },
        }),
      ]);

      comparisonData = {
        period: compRange.label,
        count: compCount,
        amount: compAmount._sum.amount || 0,
      };
    }

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      metrics: {
        totalCount,
        totalAmount: totalAmount._sum.amount || 0,
      },
      byStage: stageBreakdown.map(s => ({
        stage: s.stage,
        count: s._count._all,
        amount: s._sum.amount || 0,
      })),
      byType: typeBreakdown.map(t => ({
        type: t.type,
        count: t._count._all,
        amount: t._sum.amount || 0,
      })),
      comparison: comparisonData,
    };
  } catch (error) {
    logger.error('Error in getPipelineMetrics:', error);
    throw error;
  }
}

/**
 * Get time series data for charts
 */
export async function getTimeSeriesData(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    entity = 'opportunities',
    metric = 'count',
    field = 'amount',
    granularity = 'auto',
    filters = {},
    includeComparison = false,
    comparisonType = 'previousPeriod',
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);
  const buckets = generateTimeBuckets(range.start, range.end, granularity);

  try {
    const model = getModelByEntity(entity);
    const dateField = getDateFieldByEntity(entity);

    // Get data for each bucket
    const data = await Promise.all(buckets.map(async (bucket) => {
      const where = {
        [dateField]: {
          gte: bucket.start,
          lte: bucket.end,
        },
        ...filters,
      };

      let value;
      if (metric === 'count') {
        value = await model.count({ where });
      } else if (metric === 'sum') {
        const agg = await model.aggregate({
          where,
          _sum: { [field]: true },
        });
        value = agg._sum[field] || 0;
      } else if (metric === 'avg') {
        const agg = await model.aggregate({
          where,
          _avg: { [field]: true },
        });
        value = agg._avg[field] || 0;
      }

      return {
        date: bucket.start.toISOString(),
        label: bucket.label,
        value: Number(value) || 0,
      };
    }));

    let comparisonData = null;
    if (includeComparison) {
      const compRange = getComparisonPeriod(range, comparisonType);
      const compBuckets = generateTimeBuckets(compRange.start, compRange.end, granularity);

      comparisonData = await Promise.all(compBuckets.map(async (bucket, index) => {
        const where = {
          [dateField]: {
            gte: bucket.start,
            lte: bucket.end,
          },
          ...filters,
        };

        let value;
        if (metric === 'count') {
          value = await model.count({ where });
        } else if (metric === 'sum') {
          const agg = await model.aggregate({
            where,
            _sum: { [field]: true },
          });
          value = agg._sum[field] || 0;
        }

        return {
          date: bucket.start.toISOString(),
          label: bucket.label,
          value: Number(value) || 0,
          // Map to current period bucket for comparison
          correspondingLabel: data[index]?.label,
        };
      }));
    }

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      granularity,
      data,
      comparison: comparisonData,
    };
  } catch (error) {
    logger.error('Error in getTimeSeriesData:', error);
    throw error;
  }
}

/**
 * Get performance metrics (by sales rep, etc.)
 */
export async function getPerformanceMetrics(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    groupBy = 'ownerId',
    entity = 'opportunities',
    metric = 'count',
    field = 'amount',
    limit = 10,
    filters = {},
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);

  try {
    const model = getModelByEntity(entity);
    const dateField = getDateFieldByEntity(entity);

    const where = {
      [dateField]: {
        gte: range.start,
        lte: range.end,
      },
      ...filters,
    };

    // Group by the specified field
    const grouped = await model.groupBy({
      by: [groupBy],
      where,
      _count: { _all: true },
      _sum: field ? { [field]: true } : undefined,
      orderBy: {
        _count: { _all: 'desc' },
      },
      take: limit,
    });

    // Enrich with user names if groupBy is ownerId
    let enrichedData = grouped;
    if (groupBy === 'ownerId') {
      const ownerIds = grouped.map(g => g.ownerId).filter(Boolean);
      const users = await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, fullName: true, email: true },
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      enrichedData = grouped.map(g => ({
        ...g,
        ownerName: userMap.get(g.ownerId)?.fullName || 'Unknown',
        ownerEmail: userMap.get(g.ownerId)?.email,
      }));
    }

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      groupBy,
      data: enrichedData.map(item => ({
        id: item[groupBy],
        name: item.ownerName || item[groupBy],
        email: item.ownerEmail,
        count: item._count._all,
        total: field && item._sum ? Number(item._sum[field]) || 0 : null,
      })),
    };
  } catch (error) {
    logger.error('Error in getPerformanceMetrics:', error);
    throw error;
  }
}

/**
 * Get lead metrics
 */
export async function getLeadMetrics(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    includeComparison = false,
    comparisonType = 'previousPeriod',
    filters = {},
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);
  const dateFilter = {
    createdAt: {
      gte: range.start,
      lte: range.end,
    },
    ...filters,
  };

  try {
    const [
      totalCount,
      statusBreakdown,
      sourceBreakdown,
      convertedCount,
    ] = await Promise.all([
      prisma.lead.count({ where: dateFilter }),

      prisma.lead.groupBy({
        by: ['status'],
        where: dateFilter,
        _count: { _all: true },
      }),

      prisma.lead.groupBy({
        by: ['source'],
        where: { ...dateFilter, source: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { _all: 'desc' } },
        take: 10,
      }),

      prisma.lead.count({
        where: {
          ...dateFilter,
          isConverted: true,
        },
      }),
    ]);

    let comparisonData = null;
    if (includeComparison) {
      const compRange = getComparisonPeriod(range, comparisonType);
      const compFilter = {
        createdAt: {
          gte: compRange.start,
          lte: compRange.end,
        },
        ...filters,
      };

      const [compCount, compConverted] = await Promise.all([
        prisma.lead.count({ where: compFilter }),
        prisma.lead.count({ where: { ...compFilter, isConverted: true } }),
      ]);

      comparisonData = {
        period: compRange.label,
        count: compCount,
        converted: compConverted,
        conversionRate: compCount > 0 ? (compConverted / compCount) * 100 : 0,
      };
    }

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      metrics: {
        totalCount,
        convertedCount,
        conversionRate: totalCount > 0 ? (convertedCount / totalCount) * 100 : 0,
      },
      byStatus: statusBreakdown.map(s => ({
        status: s.status,
        count: s._count._all,
      })),
      bySource: sourceBreakdown.map(s => ({
        source: s.source || 'Unknown',
        count: s._count._all,
      })),
      comparison: comparisonData,
    };
  } catch (error) {
    logger.error('Error in getLeadMetrics:', error);
    throw error;
  }
}

/**
 * Get revenue metrics
 */
export async function getRevenueMetrics(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    includeComparison = false,
    comparisonType = 'previousPeriod',
    filters = {},
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);

  try {
    // Revenue from closed won opportunities
    const oppFilter = {
      soldDate: {
        gte: range.start,
        lte: range.end,
      },
      stage: 'CLOSED_WON',
      ...filters,
    };

    const [closedWon, invoiceData, paymentData] = await Promise.all([
      prisma.opportunity.aggregate({
        where: oppFilter,
        _sum: { contractTotal: true },
        _count: { _all: true },
      }),

      prisma.invoice.aggregate({
        where: {
          createdAt: { gte: range.start, lte: range.end },
        },
        _sum: { total: true, amountPaid: true, balanceDue: true },
      }),

      prisma.payment.aggregate({
        where: {
          paymentDate: { gte: range.start, lte: range.end },
          status: 'SETTLED',
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    let comparisonData = null;
    if (includeComparison) {
      const compRange = getComparisonPeriod(range, comparisonType);
      const compOppFilter = {
        soldDate: {
          gte: compRange.start,
          lte: compRange.end,
        },
        stage: 'CLOSED_WON',
        ...filters,
      };

      const compClosedWon = await prisma.opportunity.aggregate({
        where: compOppFilter,
        _sum: { contractTotal: true },
        _count: { _all: true },
      });

      comparisonData = {
        period: compRange.label,
        revenue: compClosedWon._sum.contractTotal || 0,
        deals: compClosedWon._count._all,
      };
    }

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      metrics: {
        closedWonRevenue: closedWon._sum.contractTotal || 0,
        closedWonDeals: closedWon._count._all,
        averageDealSize: closedWon._count._all > 0
          ? (closedWon._sum.contractTotal || 0) / closedWon._count._all
          : 0,
        invoicedAmount: invoiceData._sum.total || 0,
        collectedAmount: invoiceData._sum.amountPaid || 0,
        outstandingBalance: invoiceData._sum.balanceDue || 0,
        settledPayments: paymentData._sum.amount || 0,
        paymentCount: paymentData._count._all,
      },
      comparison: comparisonData,
    };
  } catch (error) {
    logger.error('Error in getRevenueMetrics:', error);
    throw error;
  }
}

/**
 * Get state-based metrics
 */
export async function getStateMetrics(options = {}) {
  const {
    dateRange = 'thisMonth',
    dateRangeOptions = {},
    entity = 'opportunities',
    metric = 'count',
    filters = {},
  } = options;

  const range = parseDateRange(dateRange, dateRangeOptions);
  const model = getModelByEntity(entity);
  const dateField = getDateFieldByEntity(entity);

  try {
    const where = {
      [dateField]: {
        gte: range.start,
        lte: range.end,
      },
      state: { not: null },
      ...filters,
    };

    const grouped = await model.groupBy({
      by: ['state'],
      where,
      _count: { _all: true },
      _sum: metric === 'sum' ? { amount: true } : undefined,
      orderBy: { _count: { _all: 'desc' } },
    });

    return {
      period: range.label,
      dateRange: { start: range.start, end: range.end },
      data: grouped.map(g => ({
        state: g.state,
        count: g._count._all,
        amount: g._sum?.amount ? Number(g._sum.amount) : null,
      })),
    };
  } catch (error) {
    logger.error('Error in getStateMetrics:', error);
    throw error;
  }
}

// Helper functions
function getModelByEntity(entity) {
  switch (entity) {
    case 'opportunities':
      return prisma.opportunity;
    case 'leads':
      return prisma.lead;
    case 'accounts':
      return prisma.account;
    case 'contacts':
      return prisma.contact;
    case 'invoices':
      return prisma.invoice;
    case 'payments':
      return prisma.payment;
    default:
      return prisma.opportunity;
  }
}

function getDateFieldByEntity(entity) {
  switch (entity) {
    case 'opportunities':
      return 'createdAt';
    case 'leads':
      return 'createdAt';
    case 'accounts':
      return 'createdAt';
    case 'contacts':
      return 'createdAt';
    case 'invoices':
      return 'invoiceDate';
    case 'payments':
      return 'paymentDate';
    default:
      return 'createdAt';
  }
}

export default {
  getPipelineMetrics,
  getTimeSeriesData,
  getPerformanceMetrics,
  getLeadMetrics,
  getRevenueMetrics,
  getStateMetrics,
};
