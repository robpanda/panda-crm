// Cross-Module Query Engine
// Builds Prisma queries with intelligent joins for cross-module reporting
// Uses moduleMetadata.js for field definitions and relationships

import { PrismaClient } from '@prisma/client';
import {
  MODULES,
  getModule,
  getModuleFields,
  getModuleRelationships,
  getDefaultDateField,
} from './moduleMetadata.js';

const prisma = new PrismaClient();

// Map module names to Prisma model names
const MODULE_TO_PRISMA = {
  leads: 'lead',
  accounts: 'account',
  contacts: 'contact',
  jobs: 'opportunity',
  users: 'user',
  invoices: 'invoice',
  commissions: 'commission',
  workOrders: 'workOrder',
};

// Operator mappings for filter conditions
const OPERATORS = {
  equals: (value) => value,
  not: (value) => ({ not: value }),
  contains: (value) => ({ contains: value, mode: 'insensitive' }),
  startsWith: (value) => ({ startsWith: value, mode: 'insensitive' }),
  endsWith: (value) => ({ endsWith: value, mode: 'insensitive' }),
  gt: (value) => ({ gt: value }),
  gte: (value) => ({ gte: value }),
  lt: (value) => ({ lt: value }),
  lte: (value) => ({ lte: value }),
  in: (value) => ({ in: Array.isArray(value) ? value : [value] }),
  notIn: (value) => ({ notIn: Array.isArray(value) ? value : [value] }),
  isNull: () => null,
  isNotNull: () => ({ not: null }),
  between: (value) => ({ gte: value[0], lte: value[1] }),
};

/**
 * Build a Prisma where clause from report filters
 * @param {string} moduleName - The module being queried
 * @param {Array} filters - Array of filter objects { field, operator, value }
 * @returns {Object} Prisma where clause
 */
export function buildWhereClause(moduleName, filters = []) {
  if (!filters || filters.length === 0) return {};

  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  const conditions = [];

  for (const filter of filters) {
    const { field, operator = 'equals', value, logic = 'AND' } = filter;

    // Handle nested fields (e.g., "owner.firstName")
    if (field.includes('.')) {
      const [relationName, nestedField] = field.split('.');
      const relationship = module.relationships?.[relationName];

      if (relationship) {
        const nestedCondition = {
          [relationName]: {
            [nestedField]: OPERATORS[operator]?.(value) ?? value,
          },
        };
        conditions.push(nestedCondition);
      }
    } else {
      // Direct field filter
      const fieldDef = module.fields[field];
      if (fieldDef) {
        let prismaValue = OPERATORS[operator]?.(value) ?? value;

        // Type coercion based on field type
        if (fieldDef.type === 'number' && typeof value === 'string') {
          prismaValue = OPERATORS[operator]?.(parseFloat(value)) ?? parseFloat(value);
        }
        if (fieldDef.type === 'boolean' && typeof value === 'string') {
          prismaValue = value === 'true';
        }
        if (fieldDef.type === 'date' || fieldDef.type === 'datetime') {
          if (typeof value === 'string') {
            prismaValue = OPERATORS[operator]?.(new Date(value)) ?? new Date(value);
          } else if (Array.isArray(value)) {
            // Date range
            prismaValue = {
              gte: new Date(value[0]),
              lte: new Date(value[1]),
            };
          }
        }

        conditions.push({ [field]: prismaValue });
      }
    }
  }

  // Combine with AND by default
  if (conditions.length === 1) return conditions[0];
  return { AND: conditions };
}

/**
 * Build Prisma select/include clause for requested fields
 * @param {string} moduleName - The module being queried
 * @param {Array} fields - Array of field names to include
 * @returns {Object} Prisma select clause
 */
export function buildSelectClause(moduleName, fields = []) {
  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  // If no fields specified, return all fields
  if (!fields || fields.length === 0) {
    return undefined; // Prisma will return all fields
  }

  const select = {};
  const include = {};

  for (const field of fields) {
    // Handle nested fields (e.g., "owner.firstName", "account.name")
    if (field.includes('.')) {
      const parts = field.split('.');
      const relationName = parts[0];
      const nestedField = parts.slice(1).join('.');

      if (!include[relationName]) {
        include[relationName] = { select: {} };
      }
      include[relationName].select[nestedField.split('.')[0]] = true;
    } else {
      select[field] = true;
    }
  }

  // Always include id
  select.id = true;

  // Merge include into select if there are relations
  if (Object.keys(include).length > 0) {
    return { select: { ...select }, include };
  }

  return { select };
}

/**
 * Build Prisma orderBy clause
 * @param {string} moduleName - The module being queried
 * @param {Array} sortBy - Array of sort objects { field, direction }
 * @returns {Array} Prisma orderBy clause
 */
export function buildOrderByClause(moduleName, sortBy = []) {
  if (!sortBy || sortBy.length === 0) {
    // Default sort by createdAt desc
    return [{ createdAt: 'desc' }];
  }

  return sortBy.map(({ field, direction = 'asc' }) => {
    // Handle nested fields
    if (field.includes('.')) {
      const [relationName, nestedField] = field.split('.');
      return { [relationName]: { [nestedField]: direction } };
    }
    return { [field]: direction };
  });
}

/**
 * Build group by aggregation query
 * @param {string} moduleName - The module being queried
 * @param {Array} groupBy - Fields to group by
 * @param {Array} aggregations - Aggregation functions { field, function: count|sum|avg|min|max }
 * @param {Object} filters - Filter conditions
 * @returns {Object} Prisma groupBy query parameters
 */
export function buildGroupByQuery(moduleName, groupBy = [], aggregations = [], filters = {}) {
  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  const query = {
    by: groupBy,
    where: buildWhereClause(moduleName, filters),
    _count: true,
  };

  // Build aggregations
  for (const agg of aggregations) {
    const { field, function: aggFunc } = agg;

    switch (aggFunc) {
      case 'sum':
        if (!query._sum) query._sum = {};
        query._sum[field] = true;
        break;
      case 'avg':
        if (!query._avg) query._avg = {};
        query._avg[field] = true;
        break;
      case 'min':
        if (!query._min) query._min = {};
        query._min[field] = true;
        break;
      case 'max':
        if (!query._max) query._max = {};
        query._max[field] = true;
        break;
      // count is always included via _count: true
    }
  }

  return query;
}

/**
 * Execute a cross-module report query
 * @param {Object} reportConfig - Report configuration
 * @returns {Promise<Object>} Query results with data and metadata
 */
export async function executeReport(reportConfig) {
  const {
    module: moduleName,
    fields = [],
    filters = [],
    sortBy = [],
    groupBy = [],
    aggregations = [],
    pagination = { page: 1, pageSize: 50 },
    includeRelations = [],
  } = reportConfig;

  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  const prismaModel = MODULE_TO_PRISMA[moduleName];
  if (!prismaModel) throw new Error(`No Prisma model for module: ${moduleName}`);

  try {
    // Grouped/aggregated report
    if (groupBy.length > 0) {
      const groupByQuery = buildGroupByQuery(moduleName, groupBy, aggregations, filters);
      const results = await prisma[prismaModel].groupBy(groupByQuery);

      return {
        success: true,
        data: results,
        metadata: {
          module: moduleName,
          moduleName: module.name,
          type: 'grouped',
          groupBy,
          aggregations,
          totalGroups: results.length,
        },
      };
    }

    // Standard list report
    const where = buildWhereClause(moduleName, filters);
    const orderBy = buildOrderByClause(moduleName, sortBy);

    // Build include for relations
    const include = {};
    for (const rel of includeRelations) {
      const relationship = module.relationships?.[rel];
      if (relationship) {
        include[rel] = true;
      }
    }

    // Count total records
    const totalCount = await prisma[prismaModel].count({ where });

    // Calculate pagination
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Execute query
    const selectClause = buildSelectClause(moduleName, fields);
    const queryOptions = {
      where,
      orderBy,
      skip,
      take,
      ...(Object.keys(include).length > 0 && { include }),
      ...(selectClause?.select && { select: selectClause.select }),
    };

    const data = await prisma[prismaModel].findMany(queryOptions);

    return {
      success: true,
      data,
      metadata: {
        module: moduleName,
        moduleName: module.name,
        type: 'list',
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
        hasNextPage: skip + take < totalCount,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    console.error('Report execution error:', error);
    throw new Error(`Failed to execute report: ${error.message}`);
  }
}

/**
 * Execute a cross-module join query
 * @param {Object} joinConfig - Join configuration
 * @returns {Promise<Object>} Query results
 */
export async function executeCrossModuleQuery(joinConfig) {
  const {
    baseModule,
    joins = [],
    fields = [],
    filters = [],
    sortBy = [],
    pagination = { page: 1, pageSize: 50 },
  } = joinConfig;

  const module = getModule(baseModule);
  if (!module) throw new Error(`Unknown base module: ${baseModule}`);

  const prismaModel = MODULE_TO_PRISMA[baseModule];
  if (!prismaModel) throw new Error(`No Prisma model for module: ${baseModule}`);

  try {
    const where = buildWhereClause(baseModule, filters);
    const orderBy = buildOrderByClause(baseModule, sortBy);

    // Build include for joins
    const include = {};
    for (const join of joins) {
      const { relation, select: joinFields = [] } = join;
      const relationship = module.relationships?.[relation];

      if (relationship) {
        if (joinFields.length > 0) {
          include[relation] = {
            select: joinFields.reduce((acc, f) => ({ ...acc, [f]: true }), { id: true }),
          };
        } else {
          include[relation] = true;
        }
      }
    }

    // Count total
    const totalCount = await prisma[prismaModel].count({ where });

    // Pagination
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    // Execute
    const data = await prisma[prismaModel].findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
      include,
    });

    return {
      success: true,
      data,
      metadata: {
        baseModule,
        joins: joins.map((j) => j.relation),
        totalCount,
        page,
        pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  } catch (error) {
    console.error('Cross-module query error:', error);
    throw new Error(`Failed to execute cross-module query: ${error.message}`);
  }
}

/**
 * Get quick summary metrics for a module
 * @param {string} moduleName - The module name
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} Summary metrics
 */
export async function getModuleSummary(moduleName, filters = []) {
  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  const prismaModel = MODULE_TO_PRISMA[moduleName];
  if (!prismaModel) throw new Error(`No Prisma model for module: ${moduleName}`);

  const where = buildWhereClause(moduleName, filters);

  try {
    // Get total count
    const totalCount = await prisma[prismaModel].count({ where });

    // Get aggregatable fields for summary
    const aggregatableFields = Object.entries(module.fields)
      .filter(([_, f]) => f.aggregatable)
      .map(([key]) => key);

    // Build aggregate query
    const aggregateQuery = {
      where,
      _count: true,
    };

    if (aggregatableFields.length > 0) {
      aggregateQuery._sum = {};
      aggregateQuery._avg = {};
      for (const field of aggregatableFields) {
        aggregateQuery._sum[field] = true;
        aggregateQuery._avg[field] = true;
      }
    }

    const aggregates = await prisma[prismaModel].aggregate(aggregateQuery);

    // Build metric values from predefined metrics
    const metrics = {};
    for (const [key, metric] of Object.entries(module.metrics || {})) {
      switch (metric.aggregation) {
        case 'count':
          if (metric.filter) {
            const filteredCount = await prisma[prismaModel].count({
              where: { ...where, ...metric.filter },
            });
            metrics[key] = { label: metric.label, value: filteredCount };
          } else {
            metrics[key] = { label: metric.label, value: totalCount };
          }
          break;
        case 'sum':
          metrics[key] = {
            label: metric.label,
            value: aggregates._sum?.[metric.field] ?? 0,
          };
          break;
        case 'avg':
          metrics[key] = {
            label: metric.label,
            value: aggregates._avg?.[metric.field] ?? 0,
          };
          break;
        case 'percentage':
          // Will be calculated after all counts are done
          break;
      }
    }

    // Calculate percentages
    for (const [key, metric] of Object.entries(module.metrics || {})) {
      if (metric.aggregation === 'percentage') {
        const numerator = metrics[metric.numerator]?.value ?? 0;
        const denominator = metrics[metric.denominator]?.value ?? 0;
        metrics[key] = {
          label: metric.label,
          value: denominator > 0 ? ((numerator / denominator) * 100).toFixed(1) : 0,
          suffix: '%',
        };
      }
    }

    return {
      success: true,
      module: moduleName,
      moduleName: module.name,
      totalCount,
      metrics,
      aggregates: {
        sum: aggregates._sum,
        avg: aggregates._avg,
      },
    };
  } catch (error) {
    console.error('Module summary error:', error);
    throw new Error(`Failed to get module summary: ${error.message}`);
  }
}

/**
 * Get time series data for a module
 * @param {string} moduleName - The module name
 * @param {Object} options - Time series options
 * @returns {Promise<Object>} Time series data
 */
export async function getTimeSeries(moduleName, options = {}) {
  const {
    dateField,
    interval = 'day', // day, week, month, quarter, year
    startDate,
    endDate,
    filters = [],
    aggregations = [{ function: 'count' }],
  } = options;

  const module = getModule(moduleName);
  if (!module) throw new Error(`Unknown module: ${moduleName}`);

  const prismaModel = MODULE_TO_PRISMA[moduleName];
  if (!prismaModel) throw new Error(`No Prisma model for module: ${moduleName}`);

  const actualDateField = dateField || getDefaultDateField(moduleName);

  // Build date filter
  const dateFilter = {};
  if (startDate) dateFilter.gte = new Date(startDate);
  if (endDate) dateFilter.lte = new Date(endDate);

  const where = {
    ...buildWhereClause(moduleName, filters),
    ...(Object.keys(dateFilter).length > 0 && { [actualDateField]: dateFilter }),
  };

  try {
    // Get raw data
    const records = await prisma[prismaModel].findMany({
      where,
      select: {
        [actualDateField]: true,
        ...aggregations.reduce((acc, agg) => {
          if (agg.field) acc[agg.field] = true;
          return acc;
        }, {}),
      },
      orderBy: { [actualDateField]: 'asc' },
    });

    // Group by interval
    const groupedData = {};
    for (const record of records) {
      const date = record[actualDateField];
      if (!date) continue;

      let key;
      const d = new Date(date);
      switch (interval) {
        case 'day':
          key = d.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(d);
          weekStart.setDate(d.getDate() - d.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'quarter':
          const quarter = Math.floor(d.getMonth() / 3) + 1;
          key = `${d.getFullYear()}-Q${quarter}`;
          break;
        case 'year':
          key = String(d.getFullYear());
          break;
        default:
          key = d.toISOString().split('T')[0];
      }

      if (!groupedData[key]) {
        groupedData[key] = { period: key, count: 0, sum: {}, records: [] };
      }
      groupedData[key].count++;
      groupedData[key].records.push(record);

      // Calculate aggregations
      for (const agg of aggregations) {
        if (agg.function === 'sum' && agg.field) {
          const val = parseFloat(record[agg.field]) || 0;
          groupedData[key].sum[agg.field] = (groupedData[key].sum[agg.field] || 0) + val;
        }
      }
    }

    // Convert to array and clean up
    const timeSeries = Object.values(groupedData).map(({ period, count, sum }) => ({
      period,
      count,
      ...sum,
    }));

    return {
      success: true,
      module: moduleName,
      dateField: actualDateField,
      interval,
      data: timeSeries,
      totalRecords: records.length,
      periodCount: timeSeries.length,
    };
  } catch (error) {
    console.error('Time series error:', error);
    throw new Error(`Failed to get time series: ${error.message}`);
  }
}

export default {
  buildWhereClause,
  buildSelectClause,
  buildOrderByClause,
  buildGroupByQuery,
  executeReport,
  executeCrossModuleQuery,
  getModuleSummary,
  getTimeSeries,
  OPERATORS,
  MODULE_TO_PRISMA,
};
