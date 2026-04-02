import { formatReportFieldLabel } from './reporting';

const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
const DATE_FIELD_PATTERN = /(date|time|_at|At)$/i;
const DATE_DISPLAY_MODES = new Set(['raw', 'timeline', 'compact']);
const TIMELINE_COLUMN_KEY = 'timeline';
const TIMELINE_COLUMN_LABEL = 'Timeline';

const TIMELINE_STAGES = [
  {
    rank: 0,
    label: 'Created',
    aliases: ['created', 'createdat', 'createddate', 'createdon'],
  },
  {
    rank: 1,
    label: 'Lead Assigned',
    aliases: ['leadassigned', 'leadassignedat', 'leadassigneddate'],
  },
  {
    rank: 2,
    label: 'Appointment',
    aliases: ['appointment', 'appointmentat', 'appointmentdate'],
  },
  {
    rank: 3,
    label: 'Scheduled',
    aliases: ['scheduled', 'scheduledat', 'scheduleddate'],
  },
  {
    rank: 4,
    label: 'Inspected',
    aliases: ['inspected', 'inspectedat', 'inspecteddate', 'inspectiondate'],
  },
  {
    rank: 5,
    label: 'Approved',
    aliases: ['approved', 'approvedat', 'approveddate'],
  },
  {
    rank: 6,
    label: 'Sold',
    aliases: ['sold', 'soldat', 'solddate'],
  },
  {
    rank: 7,
    label: 'Closed',
    aliases: ['closed', 'closedat', 'closeddate', 'close', 'closeat', 'closeout', 'closeoutdate'],
  },
];

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function dedupe(values) {
  return [...new Set(toArray(values).filter(Boolean))];
}

function normalizeFieldKey(fieldKey) {
  return String(fieldKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
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

function isDateLikeValue(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value !== 'string' || !ISO_DATE_PREFIX_PATTERN.test(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function mapFieldTypeToFormat(fieldType) {
  switch (String(fieldType || '').toLowerCase()) {
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    default:
      return null;
  }
}

function buildFieldMap(fieldDefinitions = []) {
  const fieldMap = new Map();

  toArray(fieldDefinitions).forEach((field) => {
    if (!field?.id) {
      return;
    }

    dedupe([field.id, field.canonicalId, ...toArray(field.legacyIds)])
      .forEach((fieldKey) => fieldMap.set(fieldKey, field));
  });

  return fieldMap;
}

function resolveFieldLabel(fieldKey, fieldMap = null) {
  return fieldMap?.get(fieldKey)?.label || formatReportFieldLabel(fieldKey);
}

function inferFieldFormat(fieldKey, rows = [], fieldMap = null) {
  const fieldFormat = mapFieldTypeToFormat(fieldMap?.get(fieldKey)?.type);
  if (fieldFormat) {
    return fieldFormat;
  }

  const sampleValue = rows
    .map((row) => row?.[fieldKey])
    .find((value) => value != null && value !== '');

  if (DATE_FIELD_PATTERN.test(String(fieldKey || '')) || isDateLikeValue(sampleValue)) {
    return typeof sampleValue === 'string' && sampleValue.includes('T') ? 'datetime' : 'date';
  }

  return null;
}

function isDateColumn(column, rows = [], fieldMap = null) {
  const format = column?.format || inferFieldFormat(column?.key, rows, fieldMap);
  return format === 'date' || format === 'datetime';
}

function resolveVisibleFieldKey(requestedFieldKey, visibleFieldKeys = [], fieldMap = null) {
  if (!requestedFieldKey) {
    return null;
  }

  if (visibleFieldKeys.includes(requestedFieldKey)) {
    return requestedFieldKey;
  }

  const requestedField = fieldMap?.get(requestedFieldKey);
  const requestedCanonical = requestedField?.canonicalId || requestedField?.id || requestedFieldKey;

  return visibleFieldKeys.find((visibleFieldKey) => {
    const visibleField = fieldMap?.get(visibleFieldKey);
    const visibleCanonical = visibleField?.canonicalId || visibleField?.id || visibleFieldKey;
    return visibleCanonical === requestedCanonical;
  }) || null;
}

function resolveTimelineStage(fieldKey, fieldMap = null) {
  const normalizedFieldKey = normalizeFieldKey(fieldKey);
  const normalizedLabel = normalizeFieldKey(resolveFieldLabel(fieldKey, fieldMap));

  return TIMELINE_STAGES.find((stage) => stage.aliases.some((alias) => {
    const normalizedAlias = normalizeFieldKey(alias);
    return normalizedFieldKey === normalizedAlias
      || normalizedFieldKey.includes(normalizedAlias)
      || normalizedLabel.includes(normalizedAlias);
  })) || null;
}

function sortTimelineFieldKeys(fieldKeys = [], fieldMap = null) {
  return dedupe(fieldKeys)
    .map((fieldKey, index) => {
      const stage = resolveTimelineStage(fieldKey, fieldMap);
      return {
        fieldKey,
        index,
        rank: stage?.rank ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((left, right) => (left.rank - right.rank) || (left.index - right.index))
    .map((entry) => entry.fieldKey);
}

function resolveDateDisplayMode(report, visibleDateFieldKeys = []) {
  const configuredMode = String(report?.dateDisplayMode || '').trim().toLowerCase();
  if (DATE_DISPLAY_MODES.has(configuredMode)) {
    return configuredMode;
  }

  if (report?.compactDateDisplay === false) {
    return 'raw';
  }

  return visibleDateFieldKeys.length >= 2 ? 'timeline' : 'raw';
}

function resolveTimelineFieldKeys(report, visibleDateFieldKeys = [], fieldMap = null) {
  const configuredTimelineFields = dedupe(toArray(report?.timelineFields))
    .map((fieldKey) => resolveVisibleFieldKey(fieldKey, visibleDateFieldKeys, fieldMap))
    .filter(Boolean);

  if (configuredTimelineFields.length > 0) {
    return configuredTimelineFields;
  }

  return sortTimelineFieldKeys(visibleDateFieldKeys, fieldMap);
}

function resolvePrimaryVisibleDateField(report, visibleDateFieldKeys = [], fieldMap = null) {
  const configuredPrimary = resolveVisibleFieldKey(report?.dateRangeField, visibleDateFieldKeys, fieldMap);
  if (configuredPrimary) {
    return configuredPrimary;
  }

  return resolveTimelineFieldKeys(report, visibleDateFieldKeys, fieldMap)[0]
    || visibleDateFieldKeys[0]
    || null;
}

function resolveTimelineLabel(fieldKey, fieldMap = null) {
  return resolveTimelineStage(fieldKey, fieldMap)?.label || resolveFieldLabel(fieldKey, fieldMap);
}

export function buildTimelineDisplay(row = {}, report = {}, options = {}) {
  const fieldMap = buildFieldMap(options.fieldDefinitions);
  const rowObject = row && typeof row === 'object' ? row : {};
  const candidateFieldKeys = dedupe(
    toArray(options.fieldKeys).length > 0
      ? options.fieldKeys
      : [
        ...toArray(report?.timelineFields),
        ...toArray(report?.selectedFields),
        ...toArray(report?.groupByFields),
        report?.dateRangeField,
      ],
  );
  const availableFieldKeys = candidateFieldKeys.length > 0
    ? candidateFieldKeys
    : Object.keys(rowObject);
  const visibleDateFieldKeys = availableFieldKeys.filter((fieldKey) => {
    const format = inferFieldFormat(fieldKey, [rowObject], fieldMap);
    return format === 'date' || format === 'datetime';
  });
  const timelineFieldKeys = resolveTimelineFieldKeys(report, visibleDateFieldKeys, fieldMap);

  if (timelineFieldKeys.length === 0) {
    return null;
  }

  const entries = timelineFieldKeys.flatMap((fieldKey) => {
    const value = rowObject[fieldKey];
    if (!hasDisplayValue(value)) {
      return [];
    }

    return [{
      key: fieldKey,
      label: resolveTimelineLabel(fieldKey, fieldMap),
      value,
      format: inferFieldFormat(fieldKey, [rowObject], fieldMap) || 'date',
    }];
  });

  if (entries.length === 0) {
    return null;
  }

  return {
    fieldKeys: timelineFieldKeys,
    entries,
  };
}

function buildTimelineColumn(timelineFieldKeys) {
  return {
    key: TIMELINE_COLUMN_KEY,
    label: TIMELINE_COLUMN_LABEL,
    format: 'timeline',
    sortable: false,
    width: '320px',
    sourceFields: timelineFieldKeys,
  };
}

function addTimelineToRows(rows, report, options) {
  return toArray(rows).map((row) => ({
    ...row,
    [TIMELINE_COLUMN_KEY]: buildTimelineDisplay(row, report, options),
  }));
}

export function buildReportTablePresentation(report = {}, presentation = {}, options = {}) {
  const fieldMap = buildFieldMap(options.fieldDefinitions);
  const rows = toArray(presentation?.rows);
  const tableColumns = toArray(presentation?.tableColumns);
  const groupedRows = toArray(presentation?.groupedRows);
  const visibleDateColumns = tableColumns.filter((column) => isDateColumn(column, rows, fieldMap));
  const visibleDateFieldKeys = visibleDateColumns.map((column) => column.key);
  const dateDisplayMode = resolveDateDisplayMode(report, visibleDateFieldKeys);
  const baseMetadata = {
    ...(presentation?.metadata || {}),
    dateDisplayMode: visibleDateFieldKeys.length >= 2 ? dateDisplayMode : 'raw',
    hiddenDateFieldKeys: [],
    timelineFields: [],
    primaryVisibleDateField: visibleDateFieldKeys[0] || null,
  };

  if (visibleDateFieldKeys.length < 2 || dateDisplayMode === 'raw') {
    return {
      ...presentation,
      metadata: baseMetadata,
    };
  }

  if (dateDisplayMode === 'compact') {
    const primaryVisibleDateField = resolvePrimaryVisibleDateField(report, visibleDateFieldKeys, fieldMap);
    const hiddenDateFieldKeys = visibleDateFieldKeys.filter((fieldKey) => fieldKey !== primaryVisibleDateField);
    const hiddenFieldSet = new Set(hiddenDateFieldKeys);

    return {
      ...presentation,
      tableColumns: tableColumns.filter((column) => !hiddenFieldSet.has(column.key)),
      metadata: {
        ...baseMetadata,
        dateDisplayMode: 'compact',
        hiddenDateFieldKeys,
        primaryVisibleDateField,
      },
    };
  }

  const timelineFieldKeys = resolveTimelineFieldKeys(report, visibleDateFieldKeys, fieldMap);
  if (timelineFieldKeys.length < 2) {
    return {
      ...presentation,
      metadata: baseMetadata,
    };
  }

  const hiddenDateFieldKeys = timelineFieldKeys;
  const hiddenFieldSet = new Set(hiddenDateFieldKeys);
  const firstDateColumnIndex = tableColumns.findIndex((column) => hiddenFieldSet.has(column.key));
  const timelineOptions = {
    fieldDefinitions: options.fieldDefinitions,
    fieldKeys: timelineFieldKeys,
  };

  return {
    ...presentation,
    rows: addTimelineToRows(rows, report, timelineOptions),
    groupedRows: groupedRows.map((group) => ({
      ...group,
      rows: addTimelineToRows(group.rows, report, timelineOptions),
    })),
    tableColumns: tableColumns.flatMap((column, index) => {
      if (!hiddenFieldSet.has(column.key)) {
        return [column];
      }

      return index === firstDateColumnIndex
        ? [buildTimelineColumn(timelineFieldKeys)]
        : [];
    }),
    metadata: {
      ...baseMetadata,
      dateDisplayMode: 'timeline',
      hiddenDateFieldKeys,
      timelineFields: timelineFieldKeys,
      primaryVisibleDateField: null,
    },
  };
}

export default {
  buildReportTablePresentation,
  buildTimelineDisplay,
};
