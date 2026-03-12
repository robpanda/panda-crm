// Saved Reports Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { executeReport } from '../services/crossModuleQueryEngine.js';
import { parseDateRange } from '../services/dateRangeService.js';
import { getDefaultDateField } from '../services/moduleMetadata.js';

const router = Router();
const prisma = new PrismaClient();

const REPORT_MODULE_ALIASES = {
  opportunity: 'jobs',
  opportunities: 'jobs',
  job: 'jobs',
  jobs: 'jobs',
  lead: 'leads',
  leads: 'leads',
  account: 'accounts',
  accounts: 'accounts',
  contact: 'contacts',
  contacts: 'contacts',
  invoice: 'invoices',
  invoices: 'invoices',
  payment: 'payments',
  payments: 'payments',
  user: 'users',
  users: 'users',
  workorder: 'workOrders',
  workorders: 'workOrders',
  work_order: 'workOrders',
  work_orders: 'workOrders',
  commission: 'commissions',
  commissions: 'commissions',
};

const AGGREGATION_ENTITY_BY_MODULE = {
  jobs: 'opportunities',
  leads: 'leads',
  accounts: 'accounts',
  contacts: 'contacts',
  invoices: 'invoices',
  payments: 'payments',
  users: 'users',
};

const SIMPLE_FILTER_OPERATORS = {
  equals: 'equals',
  not: 'not',
  contains: 'contains',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  in: 'in',
  notIn: 'notIn',
  between: 'between',
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasLogicalOperators(filters) {
  return isPlainObject(filters)
    && ['AND', 'OR', 'NOT'].some((key) => Object.prototype.hasOwnProperty.call(filters, key));
}

function normalizeReportModule(report = {}) {
  const rawModule =
    report.base_module ||
    report.baseModule ||
    report.baseObject ||
    report.base_object ||
    '';

  if (!rawModule) {
    return '';
  }

  const normalizedKey = String(rawModule).trim().replace(/\s+/g, '').toLowerCase();
  return REPORT_MODULE_ALIASES[normalizedKey] || rawModule;
}

function normalizeObjectFilter(field, value) {
  if (value === undefined) {
    return [];
  }

  if (value === null) {
    return [{ field, operator: 'isNull' }];
  }

  if (Array.isArray(value)) {
    return [{ field, operator: 'in', value }];
  }

  if (!isPlainObject(value)) {
    return [{ field, operator: 'equals', value }];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'not') && value.not === null) {
    return [{ field, operator: 'isNotNull' }];
  }

  if (Object.prototype.hasOwnProperty.call(value, 'gte') || Object.prototype.hasOwnProperty.call(value, 'lte')) {
    if (value.gte !== undefined && value.lte !== undefined) {
      return [{ field, operator: 'between', value: [value.gte, value.lte] }];
    }

    return [
      ...(value.gte !== undefined ? [{ field, operator: 'gte', value: value.gte }] : []),
      ...(value.lte !== undefined ? [{ field, operator: 'lte', value: value.lte }] : []),
    ];
  }

  const operatorEntries = Object.entries(value).filter(([key]) => SIMPLE_FILTER_OPERATORS[key]);
  if (operatorEntries.length > 0) {
    return operatorEntries.map(([key, operatorValue]) => ({
      field,
      operator: SIMPLE_FILTER_OPERATORS[key],
      value: operatorValue,
    }));
  }

  return [{ field, operator: 'equals', value }];
}

function normalizeFiltersToArray(filters) {
  if (!filters) {
    return [];
  }

  if (Array.isArray(filters)) {
    return filters.filter((filter) => filter && typeof filter === 'object' && filter.field);
  }

  if (!isPlainObject(filters) || hasLogicalOperators(filters)) {
    return [];
  }

  return Object.entries(filters).flatMap(([field, value]) => normalizeObjectFilter(field, value));
}

function mergeReportFilters(savedFilters, runtimeFilters) {
  const savedFilterArray = normalizeFiltersToArray(savedFilters);
  const runtimeFilterArray = normalizeFiltersToArray(runtimeFilters);

  if (savedFilterArray.length > 0 || runtimeFilterArray.length > 0) {
    return [...savedFilterArray, ...runtimeFilterArray];
  }

  const mergedObject = {
    ...(isPlainObject(savedFilters) ? savedFilters : {}),
    ...(isPlainObject(runtimeFilters) ? runtimeFilters : {}),
  };

  return Object.keys(mergedObject).length > 0 ? mergedObject : [];
}

function buildDateRangeContext(report, moduleName, dateRange, dateRangeOptions) {
  const effectiveDateRange = dateRange || report?.defaultDateRange;
  const dateField = report?.dateRangeField || getDefaultDateField(moduleName);

  if (!effectiveDateRange || !dateField) {
    return { filters: [], label: null };
  }

  if (effectiveDateRange === 'allData') {
    return { filters: [], label: 'All Data' };
  }

  const range = parseDateRange(effectiveDateRange, dateRangeOptions || {});
  if (!range?.start || !range?.end) {
    return { filters: [], label: null };
  }

  return {
    filters: [
      {
        field: dateField,
        operator: 'between',
        value: [range.start.toISOString(), range.end.toISOString()],
      },
    ],
    label: range.label,
  };
}

function buildSortConfig(report) {
  if (!report?.sortBy) {
    return [];
  }

  return [
    {
      field: report.sortBy,
      direction: String(report.sortDirection || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
    },
  ];
}

function shouldUseQueryEngine(report, moduleName) {
  const chartType = String(report?.chartType || 'TABLE').toUpperCase();
  const reportType = String(report?.reportType || '').toLowerCase();

  return chartType === 'TABLE'
    || reportType === 'tabular'
    || reportType === 'custom'
    || !AGGREGATION_ENTITY_BY_MODULE[moduleName];
}

function flattenGroupedRow(row = {}) {
  const flattened = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === '_count' && isPlainObject(value)) {
      flattened.count = value.id ?? value._all ?? Object.values(value).find((entry) => typeof entry === 'number') ?? 0;
      continue;
    }

    if (key.startsWith('_') && isPlainObject(value)) {
      const prefix = key.slice(1);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        flattened[`${prefix}_${nestedKey}`] = nestedValue;
      }
      continue;
    }

    flattened[key] = value;
  }

  return flattened;
}

function normalizeQueryEngineResult(result, periodLabel) {
  const rows = Array.isArray(result?.data)
    ? result.metadata?.type === 'grouped'
      ? result.data.map((row) => flattenGroupedRow(row))
      : result.data
    : [];

  return {
    period: periodLabel || null,
    rows,
    rowCount: result?.metadata?.totalCount || rows.length,
    metadata: result?.metadata || {},
  };
}

/**
 * GET /api/reports
 * List saved reports
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      category,
      isPublic,
      isFavorite,
      search,
      limit = 50,
      offset = 0,
    } = req.query;

    const userId = req.user?.id;

    const where = {
      OR: [
        { createdById: userId },
        { isPublic: true },
        { sharedWithRoles: { hasSome: req.user?.groups || [] } },
      ],
    };

    if (category) {
      where.category = category;
    }

    if (isPublic === 'true') {
      where.isPublic = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    let reports = await prisma.savedReport.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        favorites: {
          where: { userId },
        },
        _count: {
          select: { favorites: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: parseInt(limit, 10),
      skip: parseInt(offset, 10),
    });

    // If filtering by favorites
    if (isFavorite === 'true') {
      reports = reports.filter(r => r.favorites.length > 0);
    }

    const total = await prisma.savedReport.count({ where });

    res.json({
      success: true,
      data: {
        reports: reports.map(r => ({
          ...r,
          isFavorite: r.favorites.length > 0,
          favoriteCount: r._count.favorites,
          favorites: undefined,
          _count: undefined,
        })),
        pagination: {
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:id
 * Get a single report configuration
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const report = await prisma.savedReport.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
        favorites: {
          where: { userId },
        },
      },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Check access
    const hasAccess = report.createdById === userId ||
      report.isPublic ||
      report.sharedWithRoles.some(role => req.user?.groups?.includes(role));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({
      success: true,
      data: {
        ...report,
        isFavorite: report.favorites.length > 0,
        favorites: undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports
 * Create a new saved report
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const {
      name,
      description,
      category = 'CUSTOM',
      reportType,
      chartType = 'TABLE',
      baseModule,       // New: module name (jobs, leads, accounts, etc.)
      baseObject,       // Legacy: object name (Opportunity, Lead, Account, etc.)
      selectedFields = [],
      groupByFields = [],
      sortBy,
      sortDirection,
      filters,
      dateRangeField,
      defaultDateRange,
      aggregations,
      isPublic = false,
      sharedWithRoles = [],
    } = req.body;

    // Accept either baseModule (new) or baseObject (legacy)
    const effectiveModule = baseModule || baseObject;
    if (!name || !reportType || !effectiveModule) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Name, reportType, and baseModule are required',
        },
      });
    }

    const report = await prisma.savedReport.create({
      data: {
        name,
        description,
        category,
        reportType,
        chartType,
        base_module: baseModule || null,    // Store new field
        baseObject: baseObject || null,     // Store legacy field for backwards compat
        selectedFields,
        groupByFields,
        sortBy,
        sortDirection,
        filters,
        dateRangeField,
        defaultDateRange,
        aggregations,
        isPublic,
        sharedWithRoles,
        createdById: userId,
      },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    logger.info('Created report:', { reportId: report.id, name, userId });

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/reports/:id
 * Update a saved report
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await prisma.savedReport.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Only owner can update
    if (existing.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the report owner can update' },
      });
    }

    const {
      name,
      description,
      category,
      reportType,
      chartType,
      baseModule,       // New: module name
      baseObject,       // Legacy: object name
      selectedFields,
      groupByFields,
      sortBy,
      sortDirection,
      filters,
      dateRangeField,
      defaultDateRange,
      aggregations,
      isPublic,
      sharedWithRoles,
    } = req.body;

    const report = await prisma.savedReport.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(reportType !== undefined && { reportType }),
        ...(chartType !== undefined && { chartType }),
        ...(baseModule !== undefined && { base_module: baseModule }),
        ...(baseObject !== undefined && { baseObject }),
        ...(selectedFields !== undefined && { selectedFields }),
        ...(groupByFields !== undefined && { groupByFields }),
        ...(sortBy !== undefined && { sortBy }),
        ...(sortDirection !== undefined && { sortDirection }),
        ...(filters !== undefined && { filters }),
        ...(dateRangeField !== undefined && { dateRangeField }),
        ...(defaultDateRange !== undefined && { defaultDateRange }),
        ...(aggregations !== undefined && { aggregations }),
        ...(isPublic !== undefined && { isPublic }),
        ...(sharedWithRoles !== undefined && { sharedWithRoles }),
      },
      include: {
        createdBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    logger.info('Updated report:', { reportId: id, userId });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/reports/:id
 * Delete a saved report
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await prisma.savedReport.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Only owner can delete
    if (existing.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the report owner can delete' },
      });
    }

    await prisma.savedReport.delete({
      where: { id },
    });

    logger.info('Deleted report:', { reportId: id, userId });

    res.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports/:id/favorite
 * Toggle favorite status
 */
router.post('/:id/favorite', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check if report exists
    const report = await prisma.savedReport.findUnique({
      where: { id },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Check if already favorited
    const existing = await prisma.reportFavorite.findUnique({
      where: {
        reportId_userId: { reportId: id, userId },
      },
    });

    if (existing) {
      // Remove favorite
      await prisma.reportFavorite.delete({
        where: { id: existing.id },
      });

      res.json({
        success: true,
        data: { isFavorite: false },
      });
    } else {
      // Add favorite
      await prisma.reportFavorite.create({
        data: { reportId: id, userId },
      });

      res.json({
        success: true,
        data: { isFavorite: true },
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/reports/:id/run
 * Execute a report and return results
 */
router.post('/:id/run', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { dateRange, dateRangeOptions, filters: runtimeFilters } = req.body;
    const userId = req.user?.id;

    const report = await prisma.savedReport.findUnique({
      where: { id },
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    // Update last run timestamp
    await prisma.savedReport.update({
      where: { id },
      data: { lastRunAt: new Date() },
    });

    // Merge saved filters with runtime filters
    const moduleName = normalizeReportModule(report) || 'jobs';
    const mergedFilters = mergeReportFilters(report.filters, runtimeFilters);
    const dateRangeContext = buildDateRangeContext(report, moduleName, dateRange, dateRangeOptions);
    const normalizedFilterArray = normalizeFiltersToArray(mergedFilters);
    const queryFilters = [
      ...normalizedFilterArray,
      ...dateRangeContext.filters,
    ];
    const effectiveDateRange = dateRange || report.defaultDateRange || 'thisMonth';

    // Execute report based on type and configuration
    let result;
    if (shouldUseQueryEngine(report, moduleName)) {
      const queryResult = await executeReport({
        module: moduleName,
        fields: Array.isArray(report.selectedFields) ? report.selectedFields : [],
        filters: queryFilters,
        sortBy: buildSortConfig(report),
        groupBy: Array.isArray(report.groupByFields) ? report.groupByFields : [],
        aggregations: Array.isArray(report.aggregations) ? report.aggregations : [],
        pagination: { page: 1, pageSize: 100 },
      });

      result = normalizeQueryEngineResult(queryResult, dateRangeContext.label);
    } else {
      const aggregationService = await import('../services/aggregationService.js');

      switch (moduleName) {
        case 'jobs':
          result = await aggregationService.getPipelineMetrics({
            dateRange: effectiveDateRange,
            dateRangeOptions,
            filters: mergedFilters,
          });
          break;
        case 'leads':
          result = await aggregationService.getLeadMetrics({
            dateRange: effectiveDateRange,
            dateRangeOptions,
            filters: mergedFilters,
          });
          break;
        default:
          result = await aggregationService.getTimeSeriesData({
            dateRange: effectiveDateRange,
            dateRangeOptions,
            entity: AGGREGATION_ENTITY_BY_MODULE[moduleName] || 'opportunities',
            filters: mergedFilters,
          });
      }
    }

    logger.info('Executed report:', { reportId: id, userId });

    res.json({
      success: true,
      data: {
        report: { id: report.id, name: report.name },
        results: result,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
