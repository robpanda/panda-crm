const CALCULABLE_FORMATS = new Set(['number', 'currency', 'percent']);

export const REPORT_COLUMN_CALCULATION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

const CALCULATION_LABELS = {
  none: 'None',
  sum: 'Total',
  average: 'Average',
  count: 'Count',
  min: 'Min',
  max: 'Max',
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
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

function getCalculationLabel(calculation) {
  return CALCULATION_LABELS[calculation] || calculation;
}

function shouldSkipGroupCalculationEntry(column, calculation) {
  const format = String(column?.format || '').toLowerCase();

  if (calculation === 'sum' && (format === 'number' || format === 'currency')) {
    return true;
  }

  if (calculation === 'average' && format === 'percent') {
    return true;
  }

  return false;
}

export function isCalculableReportColumn(column = {}) {
  return CALCULABLE_FORMATS.has(String(column?.format || '').toLowerCase());
}

export function getCalculableReportColumns(columns = []) {
  return toArray(columns).filter((column) => isCalculableReportColumn(column));
}

export function normalizeReportCalculationSelections(columns = [], selections = {}) {
  const selectionMap = toObject(selections);
  const calculableKeys = new Set(getCalculableReportColumns(columns).map((column) => column.key));
  const validOperations = new Set(REPORT_COLUMN_CALCULATION_OPTIONS.map((option) => option.value));

  return Object.entries(selectionMap).reduce((normalized, [columnKey, calculation]) => {
    if (!calculableKeys.has(columnKey) || !validOperations.has(calculation) || calculation === 'none') {
      return normalized;
    }

    return {
      ...normalized,
      [columnKey]: calculation,
    };
  }, {});
}

export function calculateReportColumnValue(rows = [], column = {}, calculation = 'none') {
  if (!isCalculableReportColumn(column) || calculation === 'none') {
    return null;
  }

  const numericValues = toArray(rows)
    .map((row) => toNumericValue(row?.[column.key]))
    .filter((value) => value != null);

  let value = 0;

  switch (calculation) {
    case 'sum':
      value = numericValues.reduce((sum, item) => sum + item, 0);
      break;
    case 'average':
      value = numericValues.length > 0
        ? numericValues.reduce((sum, item) => sum + item, 0) / numericValues.length
        : 0;
      break;
    case 'count':
      value = numericValues.length;
      break;
    case 'min':
      value = numericValues.length > 0 ? Math.min(...numericValues) : 0;
      break;
    case 'max':
      value = numericValues.length > 0 ? Math.max(...numericValues) : 0;
      break;
    default:
      return null;
  }

  return {
    key: `calc:${calculation}:${column.key}`,
    columnKey: column.key,
    calculation,
    label: `${getCalculationLabel(calculation)} ${column.label}`,
    value,
    format: calculation === 'count' ? 'number' : (column.format || 'number'),
  };
}

export function buildReportCalculationEntries(columns = [], rows = [], selections = {}) {
  const normalizedSelections = normalizeReportCalculationSelections(columns, selections);

  return getCalculableReportColumns(columns).flatMap((column) => {
    const calculation = normalizedSelections[column.key] || 'none';
    const entry = calculateReportColumnValue(rows, column, calculation);
    return entry ? [entry] : [];
  });
}

export function applyGroupCalculationSelections(groups = [], columns = [], selections = {}) {
  const normalizedSelections = normalizeReportCalculationSelections(columns, selections);

  if (Object.keys(normalizedSelections).length === 0) {
    return toArray(groups);
  }

  return toArray(groups).map((group) => {
    const calculationEntries = getCalculableReportColumns(columns).flatMap((column) => {
      const calculation = normalizedSelections[column.key] || 'none';
      if (calculation === 'none' || shouldSkipGroupCalculationEntry(column, calculation)) {
        return [];
      }

      const entry = calculateReportColumnValue(group?.rows || [], column, calculation);
      return entry ? [entry] : [];
    });

    if (calculationEntries.length === 0) {
      return group;
    }

    const existingLabels = new Set(
      toArray(group?.summaryEntries).map((entry) => String(entry?.label || '')).filter(Boolean),
    );
    const mergedEntries = calculationEntries.filter((entry) => !existingLabels.has(entry.label));

    if (mergedEntries.length === 0) {
      return group;
    }

    return {
      ...group,
      summaryEntries: [
        ...toArray(group?.summaryEntries),
        ...mergedEntries,
      ],
    };
  });
}

export function formatReportCalculationValue(entry = {}) {
  const value = typeof entry?.value === 'number' ? entry.value : Number(entry?.value) || 0;

  if (entry?.format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (entry?.format === 'percent') {
    return `${value.toFixed(1)}%`;
  }

  return new Intl.NumberFormat('en-US').format(value);
}

export default {
  applyGroupCalculationSelections,
  buildReportCalculationEntries,
  calculateReportColumnValue,
  formatReportCalculationValue,
  getCalculableReportColumns,
  isCalculableReportColumn,
  normalizeReportCalculationSelections,
  REPORT_COLUMN_CALCULATION_OPTIONS,
};
