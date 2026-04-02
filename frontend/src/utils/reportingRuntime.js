import {
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  formatISO,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import { formatReportFieldLabel } from './reporting';

const LEGACY_OBJECT_TO_MODULE = {
  Opportunity: 'jobs',
  opportunity: 'jobs',
  opportunities: 'jobs',
  Job: 'jobs',
  job: 'jobs',
  jobs: 'jobs',
  Lead: 'leads',
  lead: 'leads',
  leads: 'leads',
  Account: 'accounts',
  account: 'accounts',
  accounts: 'accounts',
  Contact: 'contacts',
  contact: 'contacts',
  contacts: 'contacts',
  WorkOrder: 'workOrders',
  workorder: 'workOrders',
  workOrder: 'workOrders',
  workOrders: 'workOrders',
};

const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
const CURRENCY_FIELD_PATTERN = /(amount|price|cost|total|revenue|balance|value|contract)/i;
const PERCENT_FIELD_PATTERN = /(percent|rate|ratio|conversion)/i;
const DATE_FIELD_PATTERN = /(date|time|_at|At)$/i;
const CURRENCY_LABEL_PATTERN = /(amount|price|cost|revenue|balance|value|contract|pipeline|collected|invoiced|outstanding)/i;
const PERCENT_LABEL_PATTERN = /(percent|rate|ratio|conversion|win rate)/i;
const KNOWN_MODULES = new Set([
  'jobs',
  'leads',
  'accounts',
  'contacts',
  'workOrders',
  'users',
  'invoices',
  'commissions',
]);

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapFieldTypeToFormat(fieldType) {
  switch (String(fieldType || '').toLowerCase()) {
    case 'currency':
      return 'currency';
    case 'decimal':
      return 'number';
    case 'number':
    case 'integer':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'percent':
      return 'percent';
    default:
      return null;
  }
}

function inferMetricFormat(label, value) {
  if (typeof value === 'string' && value.trim().endsWith('%')) {
    return 'percent';
  }

  if (PERCENT_LABEL_PATTERN.test(label || '')) {
    return 'percent';
  }

  if (CURRENCY_LABEL_PATTERN.test(label || '')) {
    return 'currency';
  }

  return 'number';
}

function dedupe(values) {
  return [...new Set(toArray(values).filter(Boolean))];
}

export function buildFieldMap(fieldDefinitions = []) {
  return new Map(
    toArray(fieldDefinitions)
      .filter((field) => field?.id)
      .map((field) => [field.id, field]),
  );
}

function isRenderableTableValue(value) {
  return value == null || typeof value !== 'object' || value instanceof Date;
}

function isDateLikeValue(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value !== 'string' || !ISO_DATE_PREFIX_PATTERN.test(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function toDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function toNumericValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/[$,%\s,]/g, '');
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function serializeGroupValue(value) {
  if (value == null || value === '') {
    return 'Empty';
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (isDateLikeValue(value)) {
    return String(value).slice(0, 10);
  }

  return String(value);
}

function normalizeFilters(filters) {
  if (!filters) return [];

  if (Array.isArray(filters)) {
    return filters.filter((filter) => filter?.field);
  }

  if (typeof filters !== 'object') {
    return [];
  }

  return Object.entries(filters).flatMap(([field, value]) => {
    if (value === undefined) {
      return [];
    }

    if (value === null) {
      return [{ field, operator: 'isNull' }];
    }

    if (Array.isArray(value)) {
      return [{ field, operator: 'in', value }];
    }

    if (typeof value === 'object') {
      if (Array.isArray(value.in)) {
        return [{ field, operator: 'in', value: value.in }];
      }
      if (Array.isArray(value.notIn)) {
        return [{ field, operator: 'notIn', value: value.notIn }];
      }
      if (value.not === null) {
        return [{ field, operator: 'isNotNull' }];
      }
      if (value.gte !== undefined && value.lte !== undefined) {
        return [{ field, operator: 'between', value: [value.gte, value.lte] }];
      }
      if (value.gte !== undefined) {
        return [{ field, operator: 'gte', value: value.gte }];
      }
      if (value.lte !== undefined) {
        return [{ field, operator: 'lte', value: value.lte }];
      }
      if (value.contains !== undefined) {
        return [{ field, operator: 'contains', value: value.contains }];
      }
    }

    return [{ field, operator: 'equals', value }];
  });
}

function normalizeSort(sortBy, sortDirection) {
  if (Array.isArray(sortBy)) {
    return sortBy
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { field: item, direction: sortDirection || 'asc' };
        }
        if (!item.field) return null;
        return {
          field: item.field,
          direction: item.direction || sortDirection || 'asc',
        };
      })
      .filter(Boolean);
  }

  if (typeof sortBy === 'string' && sortBy) {
    return [{ field: sortBy, direction: sortDirection || 'asc' }];
  }

  return [];
}

function resolveDateRange(range) {
  if (typeof range === 'object' && range?.startDate && range?.endDate) {
    return {
      startDate: startOfDay(new Date(range.startDate)),
      endDate: endOfDay(new Date(range.endDate)),
    };
  }

  const now = new Date();
  const preset = typeof range === 'string' ? range : range?.preset;

  switch (preset) {
    case 'TODAY':
      return { startDate: startOfDay(now), endDate: endOfDay(now) };
    case 'YESTERDAY': {
      const yesterday = subDays(now, 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
    }
    case 'THIS_WEEK':
      return {
        startDate: startOfWeek(now, { weekStartsOn: 0 }),
        endDate: endOfWeek(now, { weekStartsOn: 0 }),
      };
    case 'LAST_WEEK': {
      const lastWeek = subWeeks(now, 1);
      return {
        startDate: startOfWeek(lastWeek, { weekStartsOn: 0 }),
        endDate: endOfWeek(lastWeek, { weekStartsOn: 0 }),
      };
    }
    case 'THIS_MONTH':
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };
    case 'LAST_MONTH': {
      const lastMonth = subMonths(now, 1);
      return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };
    }
    case 'THIS_YEAR':
      return { startDate: startOfYear(now), endDate: endOfYear(now) };
    case 'LAST_YEAR': {
      const lastYear = subYears(now, 1);
      return { startDate: startOfYear(lastYear), endDate: endOfYear(lastYear) };
    }
    case 'ROLLING_7':
      return { startDate: startOfDay(subDays(now, 7)), endDate: endOfDay(now) };
    case 'ROLLING_30':
      return { startDate: startOfDay(subDays(now, 30)), endDate: endOfDay(now) };
    case 'ROLLING_90':
      return { startDate: startOfDay(subDays(now, 90)), endDate: endOfDay(now) };
    case 'ROLLING_365':
      return { startDate: startOfDay(subDays(now, 365)), endDate: endOfDay(now) };
    case 'ROLLING_CUSTOM': {
      const rollingDays = Number(range?.rollingDays || range?.customRollingDays || 30);
      return {
        startDate: startOfDay(subDays(now, rollingDays)),
        endDate: endOfDay(now),
      };
    }
    case 'ALL_DATA':
    default:
      return { startDate: null, endDate: null };
  }
}

function inferFieldFormat(fieldKey, rows = [], fieldMap = null) {
  const fieldFormat = mapFieldTypeToFormat(fieldMap?.get(fieldKey)?.type);
  if (fieldFormat) {
    return fieldFormat;
  }

  const normalizedKey = String(fieldKey || '');
  const sampleValue = rows
    .map((row) => row?.[fieldKey])
    .find((value) => value != null && value !== '' && isRenderableTableValue(value));

  if (DATE_FIELD_PATTERN.test(normalizedKey) || isDateLikeValue(sampleValue)) {
    return 'date';
  }

  const numericSample = sampleValue != null ? toNumericValue(sampleValue) : null;
  if (PERCENT_FIELD_PATTERN.test(normalizedKey)) {
    return 'percent';
  }
  if (numericSample != null && CURRENCY_FIELD_PATTERN.test(normalizedKey)) {
    return 'currency';
  }
  if (numericSample != null) {
    return 'number';
  }

  return null;
}

function buildDateRangeFilter(report, dateRange) {
  const dateField = report?.dateRangeField;
  if (!dateField || !dateRange) {
    return null;
  }

  const parsedRange = resolveDateRange(dateRange);
  if (!parsedRange?.startDate || !parsedRange?.endDate) {
    return null;
  }

  return {
    field: dateField,
    operator: 'between',
    value: [
      parsedRange.startDate.toISOString(),
      parsedRange.endDate.toISOString(),
    ],
  };
}

function extractFieldKeys(report = {}) {
  return dedupe([
    ...toArray(report?.selectedFields),
    ...toArray(report?.groupByFields),
    report?.dateRangeField,
  ]);
}

function computeAggregateValue(rows, fieldKey, format) {
  const numericValues = rows
    .map((row) => toNumericValue(row?.[fieldKey]))
    .filter((value) => value != null);

  if (numericValues.length === 0) {
    return 0;
  }

  if (format === 'percent') {
    return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  }

  return numericValues.reduce((sum, value) => sum + value, 0);
}

function collapseOverflowGroups(data, limit = 12) {
  if (data.length <= limit) {
    return data;
  }

  const visible = data.slice(0, limit - 1);
  const overflow = data.slice(limit - 1);
  const otherValue = overflow.reduce((sum, item) => sum + (item.value || 0), 0);
  const otherCount = overflow.reduce((sum, item) => sum + (item.count || 0), 0);

  return [
    ...visible,
    {
      name: 'Other',
      value: otherValue,
      count: otherCount,
    },
  ];
}

function pickNumericFields(fieldKeys, rows, fieldMap = null) {
  return fieldKeys.filter((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap);
    return format === 'number' || format === 'currency' || format === 'percent';
  });
}

function pickDateField(report, rows, fieldKeys, fieldMap = null) {
  const groupByFields = dedupe(report?.groupByFields);
  const dateGroupField = groupByFields.find((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap);
    return format === 'date' || format === 'datetime';
  });
  if (dateGroupField) {
    return dateGroupField;
  }

  if (report?.dateRangeField) {
    const format = inferFieldFormat(report.dateRangeField, rows, fieldMap);
    if (format === 'date' || format === 'datetime') {
      return report.dateRangeField;
    }
  }

  return fieldKeys.find((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap);
    return format === 'date' || format === 'datetime';
  }) || null;
}

function pickCategoryField(report, rows, fieldKeys, numericFields, fieldMap = null) {
  const groupByFields = dedupe(report?.groupByFields);
  const nonDateGroupField = groupByFields.find((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap);
    return format !== 'date' && format !== 'datetime';
  });
  if (nonDateGroupField) {
    return nonDateGroupField;
  }

  return fieldKeys.find((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap);
    return !numericFields.includes(fieldKey) && format !== 'date' && format !== 'datetime';
  }) || null;
}

function pickMeasureField(report, fieldKeys, fieldMap = null) {
  const excludedFields = new Set([
    ...toArray(report?.groupByFields),
    report?.dateRangeField,
  ].filter(Boolean));

  const numericCandidates = pickNumericFields(
    fieldKeys.filter((fieldKey) => !excludedFields.has(fieldKey)),
    [],
    fieldMap,
  );

  return numericCandidates[0] || null;
}

function inferAggregationFunction(fieldKey, fieldMap = null) {
  const format = inferFieldFormat(fieldKey, [], fieldMap);
  return format === 'percent' ? 'avg' : 'sum';
}

function resolveFieldLabel(fieldKey, fieldMap = null) {
  return fieldMap?.get(fieldKey)?.label || formatReportFieldLabel(fieldKey);
}

function determineTimeSeriesInterval(dateRange) {
  const resolvedRange = resolveDateRange(dateRange);
  if (!resolvedRange?.startDate || !resolvedRange?.endDate) {
    return 'month';
  }

  const spanDays = differenceInCalendarDays(resolvedRange.endDate, resolvedRange.startDate);
  if (spanDays > 540) {
    return 'year';
  }
  if (spanDays > 90) {
    return 'month';
  }

  return 'day';
}

function extractSummaryPayload(summaryResponse) {
  if (summaryResponse?.data?.metrics || summaryResponse?.data?.aggregates) {
    return summaryResponse.data;
  }

  if (summaryResponse?.metrics || summaryResponse?.aggregates) {
    return summaryResponse;
  }

  return {};
}

function normalizeGroupedValue(group, aggregationFunction, measureField) {
  if (!measureField) {
    return group?._count?._all ?? group?._count ?? 0;
  }

  if (aggregationFunction === 'avg') {
    return group?._avg?.[measureField] ?? 0;
  }

  return group?._sum?.[measureField] ?? 0;
}

function extractTotalCount(rawData = {}) {
  return rawData?.rowCount ?? rawData?.metadata?.totalCount ?? toArray(rawData?.rows ?? rawData?.data).length;
}

function extractVisibleRowCount(rawData = {}) {
  return toArray(rawData?.rows ?? rawData?.data).length;
}

function buildDetailMetadata(rawData = {}, overrides = {}) {
  return {
    ...(rawData?.metadata || {}),
    visibleRowCount: extractVisibleRowCount(rawData),
    ...overrides,
  };
}

function buildCategoryChartData({ rows, categoryField, measureField, measureFormat }) {
  if (!categoryField) {
    return [];
  }

  const buckets = new Map();

  rows.forEach((row) => {
    const bucketName = serializeGroupValue(row?.[categoryField]);
    if (!buckets.has(bucketName)) {
      buckets.set(bucketName, {
        name: bucketName,
        count: 0,
        total: 0,
      });
    }

    const bucket = buckets.get(bucketName);
    bucket.count += 1;

    if (measureField) {
      const numericValue = toNumericValue(row?.[measureField]);
      if (numericValue != null) {
        bucket.total += numericValue;
      }
    }
  });

  const data = [...buckets.values()]
    .map((bucket) => ({
      name: bucket.name,
      count: bucket.count,
      value: measureField
        ? (measureFormat === 'percent' ? bucket.total / bucket.count : bucket.total)
        : bucket.count,
    }))
    .sort((left, right) => (right.value - left.value) || (right.count - left.count));

  return collapseOverflowGroups(data);
}

function getTimeBucketStart(date, granularity) {
  if (granularity === 'year') {
    return startOfYear(date);
  }

  if (granularity === 'month') {
    return startOfMonth(date);
  }

  return startOfDay(date);
}

function determineTimeGranularity(rows, timeField) {
  const dates = rows
    .map((row) => toDateValue(row?.[timeField]))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());

  if (dates.length < 2) {
    return 'day';
  }

  const spanDays = differenceInCalendarDays(dates[dates.length - 1], dates[0]);
  if (spanDays > 540) {
    return 'year';
  }
  if (spanDays > 60) {
    return 'month';
  }

  return 'day';
}

function buildTimeSeriesData({ rows, timeField, measureField, measureFormat, measureLabel }) {
  if (!timeField) {
    return { chartData: [], series: [] };
  }

  const granularity = determineTimeGranularity(rows, timeField);
  const buckets = new Map();

  rows.forEach((row) => {
    const dateValue = toDateValue(row?.[timeField]);
    if (!dateValue) {
      return;
    }

    const bucketStart = getTimeBucketStart(dateValue, granularity);
    const bucketKey = formatISO(bucketStart);

    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, {
        date: bucketKey,
        count: 0,
        total: 0,
      });
    }

    const bucket = buckets.get(bucketKey);
    bucket.count += 1;

    if (measureField) {
      const numericValue = toNumericValue(row?.[measureField]);
      if (numericValue != null) {
        bucket.total += numericValue;
      }
    }
  });

  const chartData = [...buckets.values()]
    .map((bucket) => ({
      date: bucket.date,
      value: measureField
        ? (measureFormat === 'percent' ? bucket.total / bucket.count : bucket.total)
        : bucket.count,
    }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  return {
    chartData,
    series: chartData.length > 0
      ? [{ dataKey: 'value', name: measureLabel || 'Value', color: 'primary' }]
      : [],
  };
}

function buildMetrics({ rows, rowCount, numericFields, fieldMap = null }) {
  const metrics = [
    {
      label: 'Rows',
      value: rowCount,
      format: 'number',
    },
  ];

  numericFields.slice(0, 3).forEach((fieldKey) => {
    const format = inferFieldFormat(fieldKey, rows, fieldMap) || 'number';
    metrics.push({
      label: format === 'percent'
        ? `Avg ${resolveFieldLabel(fieldKey, fieldMap)}`
        : `Total ${resolveFieldLabel(fieldKey, fieldMap)}`,
      value: computeAggregateValue(rows, fieldKey, format),
      format,
    });
  });

  return metrics;
}

function buildGroupSummaryEntries(group, numericFields = [], fieldMap = null) {
  const entries = [
    {
      key: 'rowCount',
      label: 'Records',
      value: group?.rowCount ?? 0,
      format: 'number',
    },
  ];

  numericFields.forEach((fieldKey) => {
    if (!Object.prototype.hasOwnProperty.call(group?.totals || {}, fieldKey)) {
      return;
    }

    const format = inferFieldFormat(fieldKey, group?.rows || [], fieldMap) || 'number';
    entries.push({
      key: fieldKey,
      label: format === 'percent'
        ? `Avg ${resolveFieldLabel(fieldKey, fieldMap)}`
        : `Total ${resolveFieldLabel(fieldKey, fieldMap)}`,
      value: group.totals[fieldKey],
      format,
    });
  });

  return entries;
}

function buildGroupedRows({ rows, groupByFields, numericFields, fieldMap = null }) {
  if (groupByFields.length === 0) {
    return [];
  }

  const groupedRows = new Map();

  rows.forEach((row) => {
    const keyParts = groupByFields.map((fieldKey) => serializeGroupValue(row?.[fieldKey]));
    const groupKey = JSON.stringify(keyParts);
    const fieldValues = groupByFields.map((fieldKey, index) => ({
      key: fieldKey,
      label: resolveFieldLabel(fieldKey, fieldMap),
      value: keyParts[index],
    }));
    const label = fieldValues
      .map((fieldValue) => `${fieldValue.label}: ${fieldValue.value}`)
      .join(' • ');

    if (!groupedRows.has(groupKey)) {
      groupedRows.set(groupKey, {
        key: groupKey,
        label,
        fieldValues,
        rowCount: 0,
        rows: [],
        totals: {},
        summaryEntries: [],
        index: groupedRows.size,
      });
    }

    const group = groupedRows.get(groupKey);
    group.rowCount += 1;
    group.rows.push(row);
  });

  groupedRows.forEach((group) => {
    numericFields.forEach((fieldKey) => {
      const format = inferFieldFormat(fieldKey, group.rows, fieldMap);
      group.totals[fieldKey] = computeAggregateValue(group.rows, fieldKey, format);
    });

    group.summaryEntries = buildGroupSummaryEntries(group, numericFields, fieldMap);
  });

  return [...groupedRows.values()].sort((left, right) => left.index - right.index);
}

function deriveTableColumns(report, rows, fieldMap = null) {
  const configuredFields = dedupe([
    ...toArray(report?.selectedFields),
    ...toArray(report?.groupByFields),
  ]);

  const firstRow = rows.find((row) => row && typeof row === 'object') || {};
  const configuredColumnsPresent = configuredFields.length > 0
    && configuredFields.some((fieldKey) => Object.prototype.hasOwnProperty.call(firstRow, fieldKey));

  const derivedFields = Object.keys(firstRow).filter(
    (fieldKey) => fieldKey !== '__typename' && isRenderableTableValue(firstRow[fieldKey]),
  );

  const fieldKeys = configuredColumnsPresent ? configuredFields : derivedFields;

  return fieldKeys.map((fieldKey) => ({
    key: fieldKey,
    label: resolveFieldLabel(fieldKey, fieldMap),
    format: inferFieldFormat(fieldKey, rows, fieldMap),
  }));
}

export function resolveReportModule(report = {}) {
  const candidates = [
    report.baseModule,
    report.base_module,
    report.baseObject,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (LEGACY_OBJECT_TO_MODULE[candidate]) {
      return LEGACY_OBJECT_TO_MODULE[candidate];
    }

    const normalized = String(candidate).trim();
    if (LEGACY_OBJECT_TO_MODULE[normalized]) {
      return LEGACY_OBJECT_TO_MODULE[normalized];
    }

    const normalizedLower = normalized.toLowerCase();
    if (LEGACY_OBJECT_TO_MODULE[normalizedLower]) {
      return LEGACY_OBJECT_TO_MODULE[normalizedLower];
    }

    if (KNOWN_MODULES.has(normalized)) {
      return normalized;
    }
  }

  return candidates[0] ? String(candidates[0]).trim() : null;
}

export function buildReportFilters(report, dateRange) {
  const filters = normalizeFilters(report?.filters);
  const dateRangeFilter = buildDateRangeFilter(report, dateRange);

  if (dateRangeFilter) {
    filters.push(dateRangeFilter);
  }

  return filters;
}

export function resolveDateRangeSelection(dateRange) {
  return resolveDateRange(dateRange);
}

export function buildRawReportQuery(report, dateRange, pagination = { page: 1, pageSize: 500 }) {
  const module = resolveReportModule(report);

  return {
    module,
    queryConfig: {
      fields: extractFieldKeys(report),
      filters: buildReportFilters(report, dateRange),
      sortBy: normalizeSort(report?.sortBy, report?.sortDirection),
      pagination,
      includeRelations: dedupe(report?.includeRelations),
    },
  };
}

export function buildGroupedChartQuery(report, dateRange, fieldDefinitions = []) {
  const module = resolveReportModule(report);
  const fieldMap = buildFieldMap(fieldDefinitions);
  const fieldKeys = extractFieldKeys(report);
  const numericFields = pickNumericFields(fieldKeys, [], fieldMap);
  const categoryField = pickCategoryField(report, [], fieldKeys, numericFields, fieldMap);

  if (!module || !categoryField || fieldMap.get(categoryField)?.virtual) {
    return null;
  }

  const measureField = pickMeasureField(report, fieldKeys, fieldMap);
  const aggregationFunction = measureField ? inferAggregationFunction(measureField, fieldMap) : 'count';

  return {
    module,
    categoryField,
    measureField,
    aggregationFunction,
    measureFormat: measureField ? inferFieldFormat(measureField, [], fieldMap) : 'number',
    queryConfig: {
      fields: dedupe([categoryField, measureField]),
      filters: buildReportFilters(report, dateRange),
      groupBy: [categoryField],
      aggregations: measureField
        ? [{ field: measureField, function: aggregationFunction }]
        : [],
      pagination: { page: 1, pageSize: 1000 },
    },
  };
}

export function buildChartDataFromGroupedResults(groupedResponse, plan) {
  if (!plan) {
    return [];
  }

  return toArray(groupedResponse?.data ?? groupedResponse)
    .map((group) => ({
      name: serializeGroupValue(group?.[plan.categoryField]),
      count: group?._count?._all ?? group?._count ?? 0,
      value: normalizeGroupedValue(group, plan.aggregationFunction, plan.measureField),
    }))
    .sort((left, right) => (right.value - left.value) || (right.count - left.count));
}

export function buildTimeSeriesQuery(report, dateRange, fieldDefinitions = []) {
  const module = resolveReportModule(report);
  if (!module) {
    return null;
  }

  const fieldMap = buildFieldMap(fieldDefinitions);
  const fieldKeys = extractFieldKeys(report);
  const measureField = pickMeasureField(report, fieldKeys, fieldMap);
  const resolvedRange = resolveDateRange(dateRange);

  return {
    module,
    measureField,
    measureLabel: measureField ? resolveFieldLabel(measureField, fieldMap) : 'Rows',
    options: {
      dateField: pickDateField(report, [], fieldKeys, fieldMap) || report?.dateRangeField,
      interval: determineTimeSeriesInterval(dateRange),
      startDate: resolvedRange?.startDate?.toISOString(),
      endDate: resolvedRange?.endDate?.toISOString(),
      filters: buildReportFilters(report, dateRange),
      aggregations: measureField
        ? [{ function: 'sum', field: measureField }]
        : [{ function: 'count' }],
    },
  };
}

export function buildChartDataFromTimeSeriesResults(timeSeriesResponse, plan) {
  if (!plan) {
    return { chartData: [], series: [] };
  }

  const chartData = toArray(timeSeriesResponse?.data ?? timeSeriesResponse)
    .map((point) => ({
      date: point?.period || point?.date,
      value: plan.measureField
        ? (point?.[plan.measureField] ?? 0)
        : (point?.count ?? point?.value ?? 0),
    }))
    .sort((left, right) => String(left.date).localeCompare(String(right.date)));

  return {
    chartData,
    series: chartData.length > 0
      ? [{ dataKey: 'value', name: plan.measureLabel || 'Rows', color: 'primary' }]
      : [],
  };
}

export function buildKpiMetricsFromSummary(summaryResponse, report, fieldDefinitions = []) {
  const summary = extractSummaryPayload(summaryResponse);
  const fieldMap = buildFieldMap(fieldDefinitions);
  const selectedNumericFields = pickNumericFields(extractFieldKeys(report), [], fieldMap)
    .filter((fieldKey) => fieldKey !== report?.dateRangeField)
    .filter((fieldKey) => !toArray(report?.groupByFields).includes(fieldKey));

  const metrics = [
    {
      label: 'Rows',
      value: summary?.totalCount ?? 0,
      format: 'number',
    },
  ];

  selectedNumericFields.slice(0, 3).forEach((fieldKey) => {
    const format = inferFieldFormat(fieldKey, [], fieldMap) || 'number';
    const label = resolveFieldLabel(fieldKey, fieldMap);
    const value = format === 'percent'
      ? (summary?.aggregates?.avg?.[fieldKey] ?? 0)
      : (summary?.aggregates?.sum?.[fieldKey] ?? 0);

    metrics.push({
      label: format === 'percent' ? `Avg ${label}` : `Total ${label}`,
      value,
      format,
    });
  });

  if (metrics.length > 1) {
    return metrics;
  }

  return [
    metrics[0],
    ...Object.values(summary?.metrics || {})
      .filter((metric) => metric?.label)
      .filter((metric) => {
        const numericValue = typeof metric.value === 'number' ? metric.value : Number(metric.value);
        return !Number.isFinite(numericValue) || numericValue !== (summary?.totalCount ?? 0);
      })
      .slice(0, 3)
      .map((metric) => {
        const numericValue = typeof metric.value === 'number'
          ? metric.value
          : Number(metric.value);

        return {
          label: metric.label,
          value: Number.isFinite(numericValue) ? numericValue : 0,
          format: inferMetricFormat(metric.label, metric.value),
        };
      }),
  ];
}

export function buildReportPresentationData(report, rawData = {}, options = {}) {
  const fieldMap = buildFieldMap(options.fieldDefinitions);
  const rows = toArray(rawData?.rows ?? rawData?.data);
  const rowCount = extractTotalCount(rawData);
  const tableColumns = deriveTableColumns(report, rows, fieldMap);
  const fieldKeys = dedupe(tableColumns.map((column) => column.key));
  const numericFields = pickNumericFields(fieldKeys, rows, fieldMap);
  const measureField = numericFields[0] || null;
  const measureFormat = measureField ? inferFieldFormat(measureField, rows, fieldMap) : 'number';
  const measureLabel = measureField ? resolveFieldLabel(measureField, fieldMap) : 'Rows';
  const categoryField = pickCategoryField(report, rows, fieldKeys, numericFields, fieldMap);
  const timeField = pickDateField(report, rows, fieldKeys, fieldMap);
  const chartType = report?.chartType || 'TABLE';
  const groupByFields = dedupe(report?.groupByFields);
  const groupedRows = buildGroupedRows({
    rows,
    groupByFields,
    numericFields,
    fieldMap,
  });

  let chartData = [];
  let series = [];

  if (chartType === 'BAR' || chartType === 'PIE') {
    chartData = buildCategoryChartData({
      rows,
      categoryField,
      measureField,
      measureFormat,
    });
  }

  if (chartType === 'LINE' || chartType === 'AREA') {
    const timeSeries = buildTimeSeriesData({
      rows,
      timeField,
      measureField,
      measureFormat,
      measureLabel,
    });

    chartData = timeSeries.chartData;
    series = timeSeries.series;
  }

  return {
    rows,
    rowCount,
    metrics: buildMetrics({
      rows,
      rowCount,
      numericFields,
      fieldMap,
    }),
    chartData,
    series,
    tableColumns,
    groupedRows,
    recordModule: resolveReportModule(report),
    metadata: buildDetailMetadata(rawData, options.metadata),
  };
}

export default {
  buildChartDataFromGroupedResults,
  buildChartDataFromTimeSeriesResults,
  buildFieldMap,
  buildGroupedChartQuery,
  buildKpiMetricsFromSummary,
  buildReportFilters,
  buildRawReportQuery,
  buildReportPresentationData,
  buildTimeSeriesQuery,
  resolveDateRangeSelection,
  resolveReportModule,
};
