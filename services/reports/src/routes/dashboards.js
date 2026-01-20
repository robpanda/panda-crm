// Dashboard Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/dashboards
 * List dashboards
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { includeWidgets = 'false' } = req.query;

    const where = {
      OR: [
        { createdById: userId },
        { isPublic: true },
        { isDefault: true },
        { sharedWithRoles: { hasSome: req.user?.groups || [] } },
      ],
    };

    const dashboards = await prisma.dashboard.findMany({
      where,
      include: includeWidgets === 'true' ? {
        widgets: {
          orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
        },
      } : undefined,
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: dashboards,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboards/:id
 * Get a single dashboard with widgets
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id },
      include: {
        widgets: {
          include: {
            savedReport: {
              select: { id: true, name: true, reportType: true, chartType: true },
            },
          },
          orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
        },
      },
    });

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    // Check access
    const hasAccess = dashboard.createdById === userId ||
      dashboard.isPublic ||
      dashboard.isDefault ||
      dashboard.sharedWithRoles.some(role => req.user?.groups?.includes(role));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dashboards
 * Create a new dashboard
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const {
      name,
      description,
      layout = 'GRID',
      columns = 2,
      defaultDateRange,
      isPublic = false,
      sharedWithRoles = [],
      widgets = [],
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name is required' },
      });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        name,
        description,
        layout,
        columns,
        defaultDateRange,
        isPublic,
        sharedWithRoles,
        createdById: userId,
        widgets: widgets.length > 0 ? {
          create: widgets.map((w, index) => ({
            widgetType: w.widgetType,
            title: w.title,
            subtitle: w.subtitle,
            positionX: w.positionX ?? (index % columns),
            positionY: w.positionY ?? Math.floor(index / columns),
            width: w.width ?? 1,
            height: w.height ?? 1,
            savedReportId: w.savedReportId,
            dataSource: w.dataSource,
            metricField: w.metricField,
            metricFunction: w.metricFunction,
            groupByField: w.groupByField,
            filters: w.filters,
            comparisonEnabled: w.comparisonEnabled ?? false,
            comparisonType: w.comparisonType,
            formatType: w.formatType,
            iconName: w.iconName,
            iconColor: w.iconColor,
            chartConfig: w.chartConfig,
          })),
        } : undefined,
      },
      include: {
        widgets: {
          orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
        },
      },
    });

    logger.info('Created dashboard:', { dashboardId: dashboard.id, name, userId });

    res.status(201).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/dashboards/:id
 * Update a dashboard
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    // Only owner can update
    if (existing.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the dashboard owner can update' },
      });
    }

    const {
      name,
      description,
      layout,
      columns,
      defaultDateRange,
      isPublic,
      sharedWithRoles,
    } = req.body;

    const dashboard = await prisma.dashboard.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(layout !== undefined && { layout }),
        ...(columns !== undefined && { columns }),
        ...(defaultDateRange !== undefined && { defaultDateRange }),
        ...(isPublic !== undefined && { isPublic }),
        ...(sharedWithRoles !== undefined && { sharedWithRoles }),
      },
      include: {
        widgets: {
          orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
        },
      },
    });

    logger.info('Updated dashboard:', { dashboardId: id, userId });

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/dashboards/:id
 * Delete a dashboard
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const existing = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    if (existing.isDefault) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot delete the default dashboard' },
      });
    }

    if (existing.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the dashboard owner can delete' },
      });
    }

    await prisma.dashboard.delete({
      where: { id },
    });

    logger.info('Deleted dashboard:', { dashboardId: id, userId });

    res.json({
      success: true,
      message: 'Dashboard deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/dashboards/:id/widgets
 * Add a widget to a dashboard
 */
router.post('/:id/widgets', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    if (dashboard.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the dashboard owner can add widgets' },
      });
    }

    const {
      widgetType,
      title,
      subtitle,
      positionX = 0,
      positionY = 0,
      width = 1,
      height = 1,
      savedReportId,
      dataSource,
      metricField,
      metricFunction,
      groupByField,
      filters,
      comparisonEnabled = false,
      comparisonType,
      formatType,
      iconName,
      iconColor,
      chartConfig,
    } = req.body;

    if (!widgetType || !title) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'widgetType and title are required' },
      });
    }

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId: id,
        widgetType,
        title,
        subtitle,
        positionX,
        positionY,
        width,
        height,
        savedReportId,
        dataSource,
        metricField,
        metricFunction,
        groupByField,
        filters,
        comparisonEnabled,
        comparisonType,
        formatType,
        iconName,
        iconColor,
        chartConfig,
      },
    });

    logger.info('Added widget to dashboard:', { dashboardId: id, widgetId: widget.id });

    res.status(201).json({
      success: true,
      data: widget,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/dashboards/:id/widgets/:widgetId
 * Update a widget
 */
router.put('/:id/widgets/:widgetId', async (req, res, next) => {
  try {
    const { id, widgetId } = req.params;
    const userId = req.user?.id;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    if (dashboard.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the dashboard owner can update widgets' },
      });
    }

    const widget = await prisma.dashboardWidget.update({
      where: { id: widgetId },
      data: req.body,
    });

    res.json({
      success: true,
      data: widget,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/dashboards/:id/widgets/:widgetId
 * Remove a widget from a dashboard
 */
router.delete('/:id/widgets/:widgetId', async (req, res, next) => {
  try {
    const { id, widgetId } = req.params;
    const userId = req.user?.id;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id },
    });

    if (!dashboard) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Dashboard not found' },
      });
    }

    if (dashboard.createdById !== userId && !req.user?.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only the dashboard owner can remove widgets' },
      });
    }

    await prisma.dashboardWidget.delete({
      where: { id: widgetId },
    });

    logger.info('Removed widget from dashboard:', { dashboardId: id, widgetId });

    res.json({
      success: true,
      message: 'Widget removed successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
