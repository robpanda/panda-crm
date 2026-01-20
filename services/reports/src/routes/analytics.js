// Analytics Routes
import { Router } from 'express';
import * as aggregationService from '../services/aggregationService.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * GET /api/analytics/pipeline
 * Get pipeline metrics with groupings
 */
router.get('/pipeline', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      groupBy,
      includeComparison,
      comparisonType,
      stage,
      type,
      ownerId,
    } = req.query;

    const filters = {};
    if (stage) filters.stage = stage;
    if (type) filters.type = type;
    if (ownerId) filters.ownerId = ownerId;

    const result = await aggregationService.getPipelineMetrics({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      groupBy,
      includeComparison: includeComparison === 'true',
      comparisonType,
      filters,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/time-series
 * Get time series data for charts
 */
router.get('/time-series', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      entity = 'opportunities',
      metric = 'count',
      field = 'amount',
      granularity = 'auto',
      includeComparison,
      comparisonType,
      stage,
      type,
      ownerId,
    } = req.query;

    const filters = {};
    if (stage) filters.stage = stage;
    if (type) filters.type = type;
    if (ownerId) filters.ownerId = ownerId;

    const result = await aggregationService.getTimeSeriesData({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      entity,
      metric,
      field,
      granularity,
      includeComparison: includeComparison === 'true',
      comparisonType,
      filters,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/revenue
 * Get revenue metrics
 */
router.get('/revenue', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      includeComparison,
      comparisonType,
    } = req.query;

    const result = await aggregationService.getRevenueMetrics({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      includeComparison: includeComparison === 'true',
      comparisonType,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/performance
 * Get performance metrics by rep/team
 */
router.get('/performance', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      groupBy = 'ownerId',
      entity = 'opportunities',
      metric = 'count',
      field = 'amount',
      limit = 10,
    } = req.query;

    const result = await aggregationService.getPerformanceMetrics({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      groupBy,
      entity,
      metric,
      field,
      limit: parseInt(limit, 10),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/leads
 * Get lead metrics
 */
router.get('/leads', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      includeComparison,
      comparisonType,
      status,
      source,
      ownerId,
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (source) filters.source = source;
    if (ownerId) filters.ownerId = ownerId;

    const result = await aggregationService.getLeadMetrics({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      includeComparison: includeComparison === 'true',
      comparisonType,
      filters,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/analytics/states
 * Get metrics by state
 */
router.get('/states', async (req, res, next) => {
  try {
    const {
      dateRange = 'thisMonth',
      customStart,
      customEnd,
      customRollingDays,
      entity = 'opportunities',
      metric = 'count',
    } = req.query;

    const result = await aggregationService.getStateMetrics({
      dateRange,
      dateRangeOptions: { customStart, customEnd, customRollingDays },
      entity,
      metric,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/analytics/aggregate
 * Custom aggregation query (advanced)
 */
router.post('/aggregate', async (req, res, next) => {
  try {
    const {
      entity,
      dateRange,
      dateRangeOptions,
      groupBy,
      metrics,
      filters,
      orderBy,
      limit,
    } = req.body;

    // This is a more flexible aggregation endpoint
    // that accepts custom configurations
    logger.info('Custom aggregation request:', { entity, dateRange, groupBy, metrics });

    // Build and execute query based on provided config
    // For now, delegate to existing service methods based on entity
    let result;

    switch (entity) {
      case 'opportunities':
        result = await aggregationService.getPipelineMetrics({
          dateRange,
          dateRangeOptions,
          filters,
        });
        break;
      case 'leads':
        result = await aggregationService.getLeadMetrics({
          dateRange,
          dateRangeOptions,
          filters,
        });
        break;
      default:
        result = await aggregationService.getTimeSeriesData({
          dateRange,
          dateRangeOptions,
          entity,
          filters,
        });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
