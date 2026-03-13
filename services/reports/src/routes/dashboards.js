// Dashboard Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const router = Router();
const prisma = new PrismaClient();

const VALID_WIDGET_TYPES = new Set([
  'KPI_CARD',
  'BAR_CHART',
  'LINE_CHART',
  'AREA_CHART',
  'PIE_CHART',
  'DONUT_CHART',
  'TABLE',
  'STAT_LIST',
]);

const WIDGET_TYPE_ALIASES = {
  KPI: 'KPI_CARD',
  BAR: 'BAR_CHART',
  LINE: 'LINE_CHART',
  AREA: 'AREA_CHART',
  PIE: 'PIE_CHART',
  DONUT: 'DONUT_CHART',
  LIST: 'STAT_LIST',
  REPORT: 'REPORT',
};

const CHART_TYPE_TO_WIDGET_TYPE = {
  KPI: 'KPI_CARD',
  BAR: 'BAR_CHART',
  LINE: 'LINE_CHART',
  AREA: 'AREA_CHART',
  PIE: 'PIE_CHART',
  DONUT: 'DONUT_CHART',
  TABLE: 'TABLE',
};

function resolveExplicitWidgetType(widget = {}) {
  const chartConfig = widget.chartConfig && typeof widget.chartConfig === 'object' ? widget.chartConfig : {};
  const widgetKind = String(chartConfig.widgetKind || '').toUpperCase();
  const visualizationChartType = String(chartConfig.visualization?.chartType || '').toUpperCase();

  if (widgetKind === 'KPI') {
    return 'KPI_CARD';
  }

  if (widgetKind === 'TABLE') {
    return 'TABLE';
  }

  if (widgetKind === 'AI_SUMMARY') {
    return 'STAT_LIST';
  }

  if (widgetKind === 'METABASE') {
    return 'TABLE';
  }

  if (widgetKind === 'CHART') {
    return CHART_TYPE_TO_WIDGET_TYPE[visualizationChartType] || 'BAR_CHART';
  }

  return null;
}

async function loadSavedReportsById(client, widgets = []) {
  const savedReportIds = [...new Set(
    widgets
      .map((widget) => widget?.savedReportId)
      .filter(Boolean),
  )];

  if (savedReportIds.length === 0) {
    return new Map();
  }

  const savedReports = await client.savedReport.findMany({
    where: { id: { in: savedReportIds } },
    select: {
      id: true,
      chartType: true,
      name: true,
    },
  });

  return new Map(savedReports.map((report) => [report.id, report]));
}

function getMissingSavedReportIds(widgets = [], savedReportsById = new Map()) {
  return [...new Set(
    widgets
      .map((widget) => widget?.savedReportId)
      .filter(Boolean)
      .filter((reportId) => !savedReportsById.has(reportId)),
  )];
}

function resolveWidgetType(widget = {}, savedReportsById = new Map()) {
  const rawWidgetType = String(widget.widgetType || '').toUpperCase();
  const aliasedWidgetType = WIDGET_TYPE_ALIASES[rawWidgetType] || rawWidgetType;
  const explicitWidgetType = resolveExplicitWidgetType(widget);

  if (explicitWidgetType) {
    return explicitWidgetType;
  }

  if (widget.savedReportId) {
    const savedReport = savedReportsById.get(widget.savedReportId);
    const savedReportWidgetType = CHART_TYPE_TO_WIDGET_TYPE[String(savedReport?.chartType || '').toUpperCase()];

    if (savedReportWidgetType) {
      return savedReportWidgetType;
    }

    if (VALID_WIDGET_TYPES.has(aliasedWidgetType)) {
      return aliasedWidgetType;
    }

    return 'TABLE';
  }

  if (VALID_WIDGET_TYPES.has(aliasedWidgetType)) {
    return aliasedWidgetType;
  }

  return null;
}

function normalizeWidgetInput(widget = {}, index = 0, columns = 2, savedReportsById = new Map()) {
  const widgetType = resolveWidgetType(widget, savedReportsById);

  if (!widgetType) {
    return null;
  }

  return {
    widgetType,
    title: widget.title,
    subtitle: widget.subtitle,
    positionX: widget.positionX ?? (index % columns),
    positionY: widget.positionY ?? Math.floor(index / columns),
    width: widget.width ?? 1,
    height: widget.height ?? 1,
    savedReportId: widget.savedReportId,
    dataSource: widget.dataSource,
    metricField: widget.metricField,
    metricFunction: widget.metricFunction,
    groupByField: widget.groupByField,
    filters: widget.filters,
    comparisonEnabled: widget.comparisonEnabled ?? false,
    comparisonType: widget.comparisonType,
    formatType: widget.formatType,
    iconName: widget.iconName,
    iconColor: widget.iconColor,
    chartConfig: widget.chartConfig,
  };
}

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
      include: {
        ...(includeWidgets === 'true' ? {
          widgets: {
            orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
          },
        } : {}),
        _count: {
          select: { widgets: true },
        },
      },
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: dashboards.map((dashboard) => ({
        ...dashboard,
        widgetCount: dashboard._count?.widgets || dashboard.widgets?.length || 0,
      })),
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

    const savedReportsById = await loadSavedReportsById(prisma, widgets);
    const missingSavedReportIds = getMissingSavedReportIds(widgets, savedReportsById);

    if (missingSavedReportIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Saved report not found: ${missingSavedReportIds.join(', ')}`,
        },
      });
    }

    const normalizedWidgets = widgets.map((widget, index) =>
      normalizeWidgetInput(widget, index, columns, savedReportsById)
    );

    if (normalizedWidgets.some((widget) => !widget)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'One or more dashboard widgets have an invalid widgetType',
        },
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
        widgets: normalizedWidgets.length > 0 ? {
          create: normalizedWidgets,
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
      widgets,
    } = req.body;

    let normalizedWidgets = null;

    if (widgets !== undefined) {
      const savedReportsById = await loadSavedReportsById(prisma, widgets);
      const missingSavedReportIds = getMissingSavedReportIds(widgets, savedReportsById);

      if (missingSavedReportIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Saved report not found: ${missingSavedReportIds.join(', ')}`,
          },
        });
      }

      normalizedWidgets = widgets.map((widget, index) =>
        normalizeWidgetInput(widget, index, columns || existing.columns || 2, savedReportsById)
      );

      if (normalizedWidgets.some((widget) => !widget)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'One or more dashboard widgets have an invalid widgetType',
          },
        });
      }
    }

    const dashboard = await prisma.$transaction(async (tx) => {
      if (widgets !== undefined) {
        await tx.dashboardWidget.deleteMany({
          where: { dashboardId: id },
        });
      }

      return tx.dashboard.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(layout !== undefined && { layout }),
          ...(columns !== undefined && { columns }),
          ...(defaultDateRange !== undefined && { defaultDateRange }),
          ...(isPublic !== undefined && { isPublic }),
          ...(sharedWithRoles !== undefined && { sharedWithRoles }),
          ...(normalizedWidgets !== null ? {
            widgets: {
              create: normalizedWidgets,
            },
          } : {}),
        },
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

    const savedReportsById = await loadSavedReportsById(prisma, [{ savedReportId }]);
    const missingSavedReportIds = getMissingSavedReportIds([{ savedReportId }], savedReportsById);

    if (missingSavedReportIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Saved report not found: ${missingSavedReportIds.join(', ')}`,
        },
      });
    }

    const normalizedWidget = normalizeWidgetInput({
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
    }, 0, dashboard.columns || 2, savedReportsById);

    if (!normalizedWidget) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid widgetType supplied for dashboard widget',
        },
      });
    }

    const widget = await prisma.dashboardWidget.create({
      data: {
        dashboardId: id,
        ...normalizedWidget,
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

    let data = req.body;

    if (req.body.widgetType !== undefined || req.body.savedReportId !== undefined) {
      const savedReportsById = await loadSavedReportsById(prisma, [req.body]);
      const missingSavedReportIds = getMissingSavedReportIds([req.body], savedReportsById);

      if (missingSavedReportIds.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `Saved report not found: ${missingSavedReportIds.join(', ')}`,
          },
        });
      }

      const normalizedWidgetType = resolveWidgetType(req.body, savedReportsById);

      if (!normalizedWidgetType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid widgetType supplied for dashboard widget',
          },
        });
      }

      data = {
        ...req.body,
        widgetType: normalizedWidgetType,
      };
    }

    const widget = await prisma.dashboardWidget.update({
      where: { id: widgetId },
      data,
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
