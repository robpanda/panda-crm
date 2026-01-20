// Module Metadata Routes
// Provides API endpoints for dynamic report building based on module definitions
import { Router } from 'express';
import { logger } from '../middleware/logger.js';
import {
  getModule,
  getAvailableModules,
  getModuleFields,
  getModuleRelationships,
  getRelatedModuleFields,
  getDefaultDateField,
  getModuleMetrics,
  MODULES,
} from '../services/moduleMetadata.js';
import {
  executeReport,
  executeCrossModuleQuery,
  getModuleSummary,
  getTimeSeries,
  OPERATORS,
} from '../services/crossModuleQueryEngine.js';

const router = Router();

/**
 * GET /api/modules
 * List all available modules for reporting
 */
router.get('/', async (req, res, next) => {
  try {
    const modules = getAvailableModules();

    res.json({
      success: true,
      data: {
        modules,
        count: modules.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName
 * Get detailed information about a specific module
 */
router.get('/:moduleName', async (req, res, next) => {
  try {
    const { moduleName } = req.params;
    const module = getModule(moduleName);

    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    res.json({
      success: true,
      data: {
        id: moduleName,
        ...module,
        defaultDateField: getDefaultDateField(moduleName),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName/fields
 * Get available fields for a module with optional filtering
 */
router.get('/:moduleName/fields', async (req, res, next) => {
  try {
    const { moduleName } = req.params;
    const {
      filterable,
      sortable,
      groupable,
      aggregatable,
      searchable,
    } = req.query;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    const options = {};
    if (filterable === 'true') options.filterable = true;
    if (sortable === 'true') options.sortable = true;
    if (groupable === 'true') options.groupable = true;
    if (aggregatable === 'true') options.aggregatable = true;
    if (searchable === 'true') options.searchable = true;

    const fields = getModuleFields(moduleName, options);

    res.json({
      success: true,
      data: {
        module: moduleName,
        fields,
        count: fields.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName/relationships
 * Get available relationships for cross-module joins
 */
router.get('/:moduleName/relationships', async (req, res, next) => {
  try {
    const { moduleName } = req.params;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    const relationships = getModuleRelationships(moduleName);

    res.json({
      success: true,
      data: {
        module: moduleName,
        relationships,
        count: relationships.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName/related-fields/:relationshipPath
 * Get fields from a related module for cross-module reporting
 */
router.get('/:moduleName/related-fields/:relationshipPath', async (req, res, next) => {
  try {
    const { moduleName, relationshipPath } = req.params;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    const relatedFields = getRelatedModuleFields(moduleName, relationshipPath);

    if (relatedFields.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RELATIONSHIP_NOT_FOUND',
          message: `Relationship path "${relationshipPath}" not found for module "${moduleName}"`,
        },
      });
    }

    res.json({
      success: true,
      data: {
        module: moduleName,
        relationshipPath,
        fields: relatedFields,
        count: relatedFields.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName/metrics
 * Get predefined metrics for a module
 */
router.get('/:moduleName/metrics', async (req, res, next) => {
  try {
    const { moduleName } = req.params;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    const metrics = getModuleMetrics(moduleName);

    res.json({
      success: true,
      data: {
        module: moduleName,
        metrics,
        count: metrics.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/modules/:moduleName/summary
 * Get quick summary stats for a module
 */
router.get('/:moduleName/summary', async (req, res, next) => {
  try {
    const { moduleName } = req.params;
    const { filters } = req.query;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    const parsedFilters = filters ? JSON.parse(filters) : [];
    const summary = await getModuleSummary(moduleName, parsedFilters);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/modules/:moduleName/query
 * Execute a report query against a module
 */
router.post('/:moduleName/query', async (req, res, next) => {
  try {
    const { moduleName } = req.params;
    const {
      fields = [],
      filters = [],
      sortBy = [],
      groupBy = [],
      aggregations = [],
      pagination = { page: 1, pageSize: 50 },
      includeRelations = [],
    } = req.body;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    logger.info('Executing module query', {
      module: moduleName,
      userId: req.user?.id,
      hasFilters: filters.length > 0,
      hasGroupBy: groupBy.length > 0,
    });

    const result = await executeReport({
      module: moduleName,
      fields,
      filters,
      sortBy,
      groupBy,
      aggregations,
      pagination,
      includeRelations,
    });

    res.json(result);
  } catch (error) {
    logger.error('Module query error:', error);
    next(error);
  }
});

/**
 * POST /api/modules/cross-query
 * Execute a cross-module join query
 */
router.post('/cross-query', async (req, res, next) => {
  try {
    const {
      baseModule,
      joins = [],
      fields = [],
      filters = [],
      sortBy = [],
      pagination = { page: 1, pageSize: 50 },
    } = req.body;

    if (!baseModule) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'baseModule is required' },
      });
    }

    const module = getModule(baseModule);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${baseModule}" not found` },
      });
    }

    logger.info('Executing cross-module query', {
      baseModule,
      joins: joins.map(j => j.relation),
      userId: req.user?.id,
    });

    const result = await executeCrossModuleQuery({
      baseModule,
      joins,
      fields,
      filters,
      sortBy,
      pagination,
    });

    res.json(result);
  } catch (error) {
    logger.error('Cross-module query error:', error);
    next(error);
  }
});

/**
 * POST /api/modules/:moduleName/time-series
 * Get time series data for a module
 */
router.post('/:moduleName/time-series', async (req, res, next) => {
  try {
    const { moduleName } = req.params;
    const {
      dateField,
      interval = 'day',
      startDate,
      endDate,
      filters = [],
      aggregations = [{ function: 'count' }],
    } = req.body;

    const module = getModule(moduleName);
    if (!module) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: `Module "${moduleName}" not found` },
      });
    }

    logger.info('Fetching time series', {
      module: moduleName,
      interval,
      userId: req.user?.id,
    });

    const result = await getTimeSeries(moduleName, {
      dateField,
      interval,
      startDate,
      endDate,
      filters,
      aggregations,
    });

    res.json(result);
  } catch (error) {
    logger.error('Time series error:', error);
    next(error);
  }
});

/**
 * GET /api/modules/operators
 * Get available filter operators
 */
router.get('/filter/operators', async (req, res, next) => {
  try {
    const operators = [
      { id: 'equals', label: 'Equals', types: ['string', 'number', 'boolean', 'enum', 'date', 'datetime'] },
      { id: 'not', label: 'Not Equal', types: ['string', 'number', 'boolean', 'enum', 'date', 'datetime'] },
      { id: 'contains', label: 'Contains', types: ['string'] },
      { id: 'startsWith', label: 'Starts With', types: ['string'] },
      { id: 'endsWith', label: 'Ends With', types: ['string'] },
      { id: 'gt', label: 'Greater Than', types: ['number', 'currency', 'date', 'datetime'] },
      { id: 'gte', label: 'Greater Than or Equal', types: ['number', 'currency', 'date', 'datetime'] },
      { id: 'lt', label: 'Less Than', types: ['number', 'currency', 'date', 'datetime'] },
      { id: 'lte', label: 'Less Than or Equal', types: ['number', 'currency', 'date', 'datetime'] },
      { id: 'in', label: 'In List', types: ['string', 'number', 'enum'] },
      { id: 'notIn', label: 'Not In List', types: ['string', 'number', 'enum'] },
      { id: 'isNull', label: 'Is Empty', types: ['string', 'number', 'date', 'datetime', 'relation'] },
      { id: 'isNotNull', label: 'Is Not Empty', types: ['string', 'number', 'date', 'datetime', 'relation'] },
      { id: 'between', label: 'Between', types: ['number', 'currency', 'date', 'datetime'] },
    ];

    res.json({
      success: true,
      data: { operators },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
