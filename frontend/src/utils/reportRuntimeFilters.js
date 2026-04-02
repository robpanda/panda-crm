import { formatReportFieldLabel } from './reporting';

const VALUELESS_OPERATORS = new Set(['isNull', 'isNotNull']);
const MULTI_VALUE_OPERATORS = new Set(['in', 'notIn']);
const RANGE_OPERATOR = 'between';
const DATE_FIELD_TYPES = new Set(['date', 'datetime']);
const NUMERIC_FIELD_TYPES = new Set(['number', 'integer', 'decimal', 'currency', 'percent']);
const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];
const OPERATOR_LABELS = {
  equals: 'Equals',
  not: 'Not Equal',
  contains: 'Contains',
  startsWith: 'Starts With',
  endsWith: 'Ends With',
  gt: 'Greater Than',
  gte: 'Greater Than or Equal',
  lt: 'Less Than',
  lte: 'Less Than or Equal',
  in: 'In List',
  notIn: 'Not In List',
  isNull: 'Is Empty',
  isNotNull: 'Is Not Empty',
  between: 'Between',
};

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasDisplayValue(value) {
  if (typeof value === 'number') {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value != null;
}

function normalizeFieldMap(fieldDefinitions = []) {
  const fieldMap = new Map();

  toArray(fieldDefinitions).forEach((field) => {
    if (!field?.id) {
      return;
    }

    const aliases = [field.id, field.canonicalId, ...toArray(field.legacyIds)].filter(Boolean);
    aliases.forEach((alias) => {
      fieldMap.set(alias, field);
    });
  });

  return fieldMap;
}

function normalizeFilterArray(filters) {
  if (!filters) {
    return [];
  }

  if (Array.isArray(filters)) {
    return filters
      .filter((filter) => filter?.field)
      .map((filter) => ({
        field: filter.field,
        operator: filter.operator || 'equals',
        value: filter.value,
      }));
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

function getFieldLabel(fieldKey, fieldMap = null) {
  return fieldMap?.get(fieldKey)?.label || formatReportFieldLabel(fieldKey);
}

function defaultOperatorForField(field = null) {
  const fieldType = String(field?.type || '').toLowerCase();
  if (fieldType === 'string' || fieldType === 'text') {
    return 'contains';
  }

  return 'equals';
}

function isDuplicateRuntimeDateFilter(filter, report, field = null, explicitRuntimeControls = false) {
  if (explicitRuntimeControls) {
    return false;
  }

  if (!report?.dateRangeField || filter?.field !== report.dateRangeField) {
    return false;
  }

  if (!field) {
    return true;
  }

  return DATE_FIELD_TYPES.has(String(field?.type || '').toLowerCase());
}

function isEditableFilter(filter) {
  return Boolean(filter?.field) && !VALUELESS_OPERATORS.has(filter.operator || 'equals');
}

function deriveRowOptions(fieldKey, rows = [], field = null) {
  if (String(field?.type || '').toLowerCase() === 'relation') {
    return [];
  }

  const uniqueValues = [...new Set(
    toArray(rows)
      .map((row) => row?.[fieldKey])
      .filter(hasDisplayValue)
      .map((value) => String(value)),
  )];

  if (uniqueValues.length === 0 || uniqueValues.length > 25) {
    return [];
  }

  return uniqueValues
    .sort((left, right) => left.localeCompare(right))
    .map((value) => ({ value, label: value }));
}

function deriveFilterOptions(fieldKey, field = null, rows = []) {
  if (Array.isArray(field?.enumValues) && field.enumValues.length > 0) {
    return field.enumValues.map((value) => ({ value: String(value), label: String(value) }));
  }

  if (String(field?.type || '').toLowerCase() === 'boolean') {
    return BOOLEAN_OPTIONS;
  }

  return deriveRowOptions(fieldKey, rows, field);
}

function normalizeControlValue(controlType, value) {
  if (controlType === 'multi-select') {
    return Array.isArray(value)
      ? value.map((item) => String(item))
      : [];
  }

  if (controlType === 'date-range' || controlType === 'range') {
    const values = Array.isArray(value) ? value : [];
    return {
      start: values[0] != null ? String(values[0]).slice(0, 10) : '',
      end: values[1] != null ? String(values[1]).slice(0, 10) : '',
    };
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function coerceScalarValue(value, field = null) {
  const fieldType = String(field?.type || '').toLowerCase();

  if (fieldType === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }

  if (NUMERIC_FIELD_TYPES.has(fieldType)) {
    const numeric = Number(String(value || '').trim());
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return value;
}

function normalizeExplicitRuntimeField(entry, index, fieldMap = null, rows = []) {
  const normalizedEntry = typeof entry === 'string'
    ? { field: entry }
    : (entry && typeof entry === 'object' ? entry : null);

  const fieldKey = normalizedEntry?.field || normalizedEntry?.id;
  if (!fieldKey) {
    return null;
  }

  const field = fieldMap?.get(fieldKey) || null;
  const operator = normalizedEntry.operator || defaultOperatorForField(field);
  const options = Array.isArray(normalizedEntry.options) && normalizedEntry.options.length > 0
    ? normalizedEntry.options.map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return {
        value: String(option?.value ?? option?.label ?? ''),
        label: String(option?.label ?? option?.value ?? ''),
      };
    })
    : deriveFilterOptions(fieldKey, field, rows);

  const controlType = normalizedEntry.type
    || (DATE_FIELD_TYPES.has(String(field?.type || '').toLowerCase()) && operator === RANGE_OPERATOR
      ? 'date-range'
      : MULTI_VALUE_OPERATORS.has(operator)
        ? 'multi-select'
        : options.length > 0
          ? 'select'
          : 'text');

  return {
    id: normalizedEntry.id || `field-${index}-${fieldKey}`,
    field: fieldKey,
    label: normalizedEntry.label || getFieldLabel(fieldKey, fieldMap),
    operator,
    operatorLabel: OPERATOR_LABELS[operator] || formatReportFieldLabel(operator),
    fieldType: field?.type || normalizedEntry.fieldType || 'string',
    controlType,
    options,
    initialValue: normalizedEntry.value,
    explicit: true,
  };
}

function buildSavedFilterDefinitions(savedFilters, report, fieldMap = null, rows = []) {
  const fieldCounts = savedFilters.reduce((counts, filter) => {
    const key = String(filter?.field || '');
    if (!key) {
      return counts;
    }

    return {
      ...counts,
      [key]: (counts[key] || 0) + 1,
    };
  }, {});

  return savedFilters.flatMap((filter, index) => {
    const field = fieldMap?.get(filter.field) || null;
    if (!isEditableFilter(filter) || isDuplicateRuntimeDateFilter(filter, report, field, false)) {
      return [];
    }

    const options = deriveFilterOptions(filter.field, field, rows);
    const fieldType = String(field?.type || '').toLowerCase();
    const controlType = filter.operator === RANGE_OPERATOR
      ? (DATE_FIELD_TYPES.has(fieldType) ? 'date-range' : 'range')
      : MULTI_VALUE_OPERATORS.has(filter.operator)
        ? 'multi-select'
        : (fieldType === 'date' || fieldType === 'datetime')
          ? 'date'
          : (options.length > 0 ? 'select' : 'text');
    const baseLabel = getFieldLabel(filter.field, fieldMap);
    const label = fieldCounts[filter.field] > 1 || filter.operator !== defaultOperatorForField(field)
      ? `${baseLabel} (${OPERATOR_LABELS[filter.operator] || formatReportFieldLabel(filter.operator)})`
      : baseLabel;

    return [{
      id: `saved-filter-${index}`,
      field: filter.field,
      label,
      operator: filter.operator || 'equals',
      operatorLabel: OPERATOR_LABELS[filter.operator] || formatReportFieldLabel(filter.operator),
      fieldType: field?.type || 'string',
      controlType,
      options,
      initialValue: filter.value,
      savedFilterIndex: index,
    }];
  });
}

function findMatchingSavedFilterIndex(savedFilters, definition, usedIndices = new Set()) {
  const exactMatch = savedFilters.findIndex((filter, index) => (
    !usedIndices.has(index)
    && filter.field === definition.field
    && filter.operator === definition.operator
  ));

  if (exactMatch >= 0) {
    return exactMatch;
  }

  return savedFilters.findIndex((filter, index) => (
    !usedIndices.has(index)
    && filter.field === definition.field
  ));
}

function hydrateExplicitDefinitions(explicitDefinitions, savedFilters) {
  const usedIndices = new Set();

  const definitions = explicitDefinitions.map((definition) => {
    const matchedIndex = findMatchingSavedFilterIndex(savedFilters, definition, usedIndices);
    if (matchedIndex < 0) {
      return definition;
    }

    usedIndices.add(matchedIndex);
    const savedFilter = savedFilters[matchedIndex];
    return {
      ...definition,
      operator: definition.operator || savedFilter.operator || 'equals',
      operatorLabel: OPERATOR_LABELS[definition.operator || savedFilter.operator] || definition.operatorLabel,
      initialValue: savedFilter.value,
      matchedSavedFilterIndex: matchedIndex,
    };
  });

  return {
    definitions,
    usedSavedIndices: usedIndices,
  };
}

export function buildReportRuntimeFilterModel(report, fieldDefinitions = [], rows = []) {
  const fieldMap = normalizeFieldMap(fieldDefinitions);
  const savedFilters = normalizeFilterArray(report?.filters);
  const explicitEntries = [
    ...toArray(report?.runtimeFilters),
    ...toArray(report?.filterableFields),
  ];

  const explicitDefinitions = explicitEntries
    .map((entry, index) => normalizeExplicitRuntimeField(entry, index, fieldMap, rows))
    .filter(Boolean);

  if (explicitDefinitions.length > 0) {
    const hydrated = hydrateExplicitDefinitions(explicitDefinitions, savedFilters);
    const staticFilters = savedFilters.filter((_, index) => !hydrated.usedSavedIndices.has(index));

    return {
      definitions: hydrated.definitions,
      staticFilters,
    };
  }

  const definitions = buildSavedFilterDefinitions(savedFilters, report, fieldMap, rows);
  const exposedSavedIndices = new Set(definitions.map((definition) => definition.savedFilterIndex));
  const staticFilters = savedFilters.filter((filter, index) => {
    if (exposedSavedIndices.has(index)) {
      return false;
    }

    const field = fieldMap.get(filter.field) || null;
    return VALUELESS_OPERATORS.has(filter.operator || 'equals')
      || isDuplicateRuntimeDateFilter(filter, report, field, false);
  });

  return {
    definitions,
    staticFilters,
  };
}

export function buildInitialRuntimeFilterValues(report, fieldDefinitions = []) {
  const model = buildReportRuntimeFilterModel(report, fieldDefinitions);

  return model.definitions.reduce((values, definition) => ({
    ...values,
    [definition.id]: normalizeControlValue(definition.controlType, definition.initialValue),
  }), {});
}

function buildFilterFromControl(definition, rawValue) {
  if (!definition?.field || VALUELESS_OPERATORS.has(definition.operator)) {
    return null;
  }

  if (definition.controlType === 'multi-select') {
    const values = Array.isArray(rawValue) ? rawValue.filter(hasDisplayValue) : [];
    if (values.length === 0) {
      return null;
    }

    return {
      field: definition.field,
      operator: definition.operator,
      value: values.map((value) => coerceScalarValue(value, { type: definition.fieldType })),
    };
  }

  if (definition.controlType === 'date-range' || definition.controlType === 'range') {
    const start = rawValue?.start ? String(rawValue.start).trim() : '';
    const end = rawValue?.end ? String(rawValue.end).trim() : '';

    if (!start && !end) {
      return null;
    }

    if (start && end) {
      return {
        field: definition.field,
        operator: RANGE_OPERATOR,
        value: [
          coerceScalarValue(start, { type: definition.fieldType }),
          coerceScalarValue(end, { type: definition.fieldType }),
        ],
      };
    }

    return {
      field: definition.field,
      operator: start ? 'gte' : 'lte',
      value: coerceScalarValue(start || end, { type: definition.fieldType }),
    };
  }

  const stringValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  if (!hasDisplayValue(stringValue)) {
    return null;
  }

  return {
    field: definition.field,
    operator: definition.operator,
    value: coerceScalarValue(stringValue, { type: definition.fieldType }),
  };
}

export function buildRuntimeFiltersFromValues(model, values = {}) {
  const dynamicFilters = toArray(model?.definitions)
    .map((definition) => buildFilterFromControl(definition, values[definition.id]))
    .filter(Boolean);

  return [
    ...toArray(model?.staticFilters),
    ...dynamicFilters,
  ];
}

function formatSummaryValue(definition, rawValue) {
  if (definition.controlType === 'multi-select') {
    return toArray(rawValue).join(', ');
  }

  if (definition.controlType === 'date-range' || definition.controlType === 'range') {
    const start = rawValue?.start || '';
    const end = rawValue?.end || '';
    if (start && end) {
      return `${start} to ${end}`;
    }
    return start || end || '';
  }

  if (rawValue === 'true') {
    return 'Yes';
  }

  if (rawValue === 'false') {
    return 'No';
  }

  return rawValue || '';
}

export function buildRuntimeFilterSummaryEntries(model, values = {}) {
  return toArray(model?.definitions)
    .map((definition) => ({
      label: definition.label,
      value: formatSummaryValue(definition, values[definition.id]),
    }))
    .filter((entry) => hasDisplayValue(entry.value));
}

export default buildReportRuntimeFilterModel;
