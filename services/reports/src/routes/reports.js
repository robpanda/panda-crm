// Saved Reports Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const router = Router();
const prisma = new PrismaClient();

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
        baseModule: baseModule || null,     // Store new field
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
        ...(baseModule !== undefined && { baseModule }),
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
    const mergedFilters = {
      ...(report.filters || {}),
      ...(runtimeFilters || {}),
    };

    // Execute report based on type and configuration
    // This is a simplified version - production would have more complex query building
    const aggregationService = await import('../services/aggregationService.js');

    let result;
    switch (report.baseObject.toLowerCase()) {
      case 'opportunity':
        result = await aggregationService.getPipelineMetrics({
          dateRange: dateRange || report.defaultDateRange || 'thisMonth',
          dateRangeOptions,
          filters: mergedFilters,
        });
        break;
      case 'lead':
        result = await aggregationService.getLeadMetrics({
          dateRange: dateRange || report.defaultDateRange || 'thisMonth',
          dateRangeOptions,
          filters: mergedFilters,
        });
        break;
      default:
        result = await aggregationService.getTimeSeriesData({
          dateRange: dateRange || report.defaultDateRange || 'thisMonth',
          dateRangeOptions,
          entity: report.baseObject.toLowerCase() + 's',
          filters: mergedFilters,
        });
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
