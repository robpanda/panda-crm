const RANGE_MAP = {
  ALL_DATA: 'allData',
  TODAY: 'today',
  YESTERDAY: 'yesterday',
  THIS_WEEK: 'thisWeek',
  LAST_WEEK: 'lastWeek',
  THIS_MONTH: 'thisMonth',
  LAST_MONTH: 'lastMonth',
  THIS_YEAR: 'thisYear',
  LAST_YEAR: 'lastYear',
  ROLLING_7: 'rolling7',
  ROLLING_30: 'rolling30',
  ROLLING_90: 'rolling90',
  ROLLING_365: 'rolling365',
  ROLLING_CUSTOM: 'rollingCustom',
  CUSTOM: 'custom',
};

const COMPARISON_MAP = {
  PREVIOUS_PERIOD: 'previousPeriod',
  SAME_LAST_YEAR: 'sameLastYear',
};

export function toAnalyticsDateParams(range = {}) {
  const preset = range?.preset || range?.dateRange || 'THIS_MONTH';
  const dateRange = RANGE_MAP[preset] || preset || 'thisMonth';
  const params = { dateRange };

  if (dateRange === 'custom') {
    if (range.startDate) params.customStart = range.startDate;
    if (range.endDate) params.customEnd = range.endDate;
  }

  if (dateRange === 'rollingCustom') {
    params.customRollingDays = range.rollingDays || range.customRollingDays || 30;
  }

  if (range.comparison) {
    params.includeComparison = true;
    params.comparisonType = COMPARISON_MAP[range.comparison] || range.comparison;
  }

  return params;
}

export default toAnalyticsDateParams;
