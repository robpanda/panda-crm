import {
  endOfQuarter,
  format,
  startOfQuarter,
  subQuarters,
} from 'date-fns';

const BUILDER_PRESET_TO_RUNTIME_PRESET = {
  allData: 'ALL_DATA',
  today: 'TODAY',
  yesterday: 'YESTERDAY',
  thisWeek: 'THIS_WEEK',
  lastWeek: 'LAST_WEEK',
  thisMonth: 'THIS_MONTH',
  lastMonth: 'LAST_MONTH',
  thisYear: 'THIS_YEAR',
  lastYear: 'LAST_YEAR',
  rolling7: 'ROLLING_7',
  rolling30: 'ROLLING_30',
  rolling90: 'ROLLING_90',
  rolling365: 'ROLLING_365',
  rollingCustom: 'ROLLING_CUSTOM',
  custom: 'CUSTOM',
  ALL_DATA: 'ALL_DATA',
  TODAY: 'TODAY',
  YESTERDAY: 'YESTERDAY',
  THIS_WEEK: 'THIS_WEEK',
  LAST_WEEK: 'LAST_WEEK',
  THIS_MONTH: 'THIS_MONTH',
  LAST_MONTH: 'LAST_MONTH',
  THIS_YEAR: 'THIS_YEAR',
  LAST_YEAR: 'LAST_YEAR',
  ROLLING_7: 'ROLLING_7',
  ROLLING_30: 'ROLLING_30',
  ROLLING_90: 'ROLLING_90',
  ROLLING_365: 'ROLLING_365',
  ROLLING_CUSTOM: 'ROLLING_CUSTOM',
  CUSTOM: 'CUSTOM',
};

const RESOLVED_CUSTOM_PRESET_MAP = {
  thisQuarter: 'THIS_QUARTER',
  lastQuarter: 'LAST_QUARTER',
  THIS_QUARTER: 'THIS_QUARTER',
  LAST_QUARTER: 'LAST_QUARTER',
};

const DATE_RANGE_LABELS = {
  ALL_DATA: 'All Data',
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  THIS_WEEK: 'This Week',
  LAST_WEEK: 'Last Week',
  THIS_MONTH: 'This Month',
  LAST_MONTH: 'Last Month',
  THIS_QUARTER: 'This Quarter',
  LAST_QUARTER: 'Last Quarter',
  THIS_YEAR: 'This Year',
  LAST_YEAR: 'Last Year',
  ROLLING_7: 'Rolling 7 Days',
  ROLLING_30: 'Rolling 30 Days',
  ROLLING_90: 'Rolling 90 Days',
  ROLLING_365: 'Rolling 365 Days',
};

function toObject(value) {
  if (typeof value === 'string') {
    return { defaultDateRange: value };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  return null;
}

function toDisplayDate(value) {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value || '');
  }

  return `${parsedDate.getMonth() + 1}/${parsedDate.getDate()}/${parsedDate.getFullYear()}`;
}

function toIsoDate(value) {
  return format(value, 'yyyy-MM-dd');
}

export function normalizeReportRuntimeDateRange(value, options = {}) {
  const source = toObject(value);
  if (!source) {
    return null;
  }

  const rawStart = source.startDate || source.customStart || null;
  const rawEnd = source.endDate || source.customEnd || null;
  const comparison = source.comparison || null;
  const rawPreset = [
    source.preset,
    source.dateRange,
    source.defaultDateRange,
  ].find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0) || '';

  if (!rawPreset && rawStart && rawEnd) {
    return {
      preset: 'CUSTOM',
      startDate: rawStart,
      endDate: rawEnd,
      ...(comparison ? { comparison } : {}),
    };
  }

  if (!rawPreset) {
    return null;
  }

  const preset = BUILDER_PRESET_TO_RUNTIME_PRESET[rawPreset];
  if (preset === 'CUSTOM') {
    if (!rawStart || !rawEnd) {
      return null;
    }

    return {
      preset,
      startDate: rawStart,
      endDate: rawEnd,
      ...(comparison ? { comparison } : {}),
    };
  }

  if (preset === 'ROLLING_CUSTOM') {
    const rollingDays = Number(source.rollingDays || source.customRollingDays || 30);
    return {
      preset,
      rollingDays: Number.isFinite(rollingDays) && rollingDays > 0 ? rollingDays : 30,
      ...(comparison ? { comparison } : {}),
    };
  }

  if (preset) {
    return {
      preset,
      ...(comparison ? { comparison } : {}),
    };
  }

  const resolvedCustomPreset = RESOLVED_CUSTOM_PRESET_MAP[rawPreset];
  if (!resolvedCustomPreset) {
    return null;
  }

  const now = options.now ? new Date(options.now) : new Date();
  const referenceDate = resolvedCustomPreset === 'LAST_QUARTER'
    ? subQuarters(now, 1)
    : now;

  return {
    preset: 'CUSTOM',
    startDate: toIsoDate(startOfQuarter(referenceDate)),
    endDate: toIsoDate(endOfQuarter(referenceDate)),
    sourcePreset: resolvedCustomPreset,
    ...(comparison ? { comparison } : {}),
  };
}

export function hasReportRuntimeDateRange(value, options = {}) {
  return Boolean(normalizeReportRuntimeDateRange(value, options));
}

export function getReportDateRangeLabel(value) {
  if (!value) {
    return null;
  }

  const source = toObject(value) || value;
  const preset = source?.sourcePreset || source?.preset || source?.dateRange || null;

  if (preset === 'ROLLING_CUSTOM') {
    const rollingDays = Number(source?.rollingDays || source?.customRollingDays || 30);
    return `Rolling ${Number.isFinite(rollingDays) && rollingDays > 0 ? rollingDays : 30} Days`;
  }

  if (preset === 'CUSTOM' && source?.startDate && source?.endDate) {
    return `${toDisplayDate(source.startDate)} - ${toDisplayDate(source.endDate)}`;
  }

  return DATE_RANGE_LABELS[preset] || null;
}

export default normalizeReportRuntimeDateRange;
