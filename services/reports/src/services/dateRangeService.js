// Date Range Service
// Handles parsing and calculation of date ranges for reports

import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfYear, endOfYear,
  subDays, subWeeks, subMonths, subYears,
  parseISO, isValid, format
} from 'date-fns';

/**
 * Parse a date range preset string into actual dates
 * Matches AccuLynx-style date range presets
 */
export function parseDateRange(rangeKey, options = {}) {
  const { customStart, customEnd, customRollingDays, timezone = 'America/New_York' } = options;
  const now = new Date();

  switch (rangeKey) {
    case 'allData':
      return {
        start: new Date('2000-01-01'),
        end: endOfDay(now),
        label: 'All Data',
      };

    case 'today':
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        label: 'Today',
      };

    case 'yesterday':
      const yesterday = subDays(now, 1);
      return {
        start: startOfDay(yesterday),
        end: endOfDay(yesterday),
        label: 'Yesterday',
      };

    case 'thisWeek':
      // Week starting Sunday (AccuLynx style)
      return {
        start: startOfWeek(now, { weekStartsOn: 0 }),
        end: endOfWeek(now, { weekStartsOn: 0 }),
        label: 'This Week (Sun)',
      };

    case 'lastWeek':
      const lastWeek = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 0 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 0 }),
        label: 'Last Week (Sun)',
      };

    case 'thisMonth':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: 'This Month',
      };

    case 'lastMonth':
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
        label: 'Last Month',
      };

    case 'thisYear':
      return {
        start: startOfYear(now),
        end: endOfYear(now),
        label: 'This Year',
      };

    case 'lastYear':
      const lastYear = subYears(now, 1);
      return {
        start: startOfYear(lastYear),
        end: endOfYear(lastYear),
        label: 'Last Year',
      };

    case 'rolling7':
      return {
        start: startOfDay(subDays(now, 7)),
        end: endOfDay(now),
        label: 'Rolling 7 Days',
      };

    case 'rolling30':
      return {
        start: startOfDay(subDays(now, 30)),
        end: endOfDay(now),
        label: 'Rolling 30 Days',
      };

    case 'rolling90':
      return {
        start: startOfDay(subDays(now, 90)),
        end: endOfDay(now),
        label: 'Rolling 90 Days',
      };

    case 'rolling365':
      return {
        start: startOfDay(subDays(now, 365)),
        end: endOfDay(now),
        label: 'Rolling 365 Days',
      };

    case 'rollingCustom':
      const days = parseInt(customRollingDays, 10) || 30;
      return {
        start: startOfDay(subDays(now, days)),
        end: endOfDay(now),
        label: `Rolling ${days} Days`,
      };

    case 'custom':
      if (customStart && customEnd) {
        const start = parseISO(customStart);
        const end = parseISO(customEnd);
        if (isValid(start) && isValid(end)) {
          return {
            start: startOfDay(start),
            end: endOfDay(end),
            label: `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`,
          };
        }
      }
      // Fall back to last 30 days if custom dates invalid
      return {
        start: startOfDay(subDays(now, 30)),
        end: endOfDay(now),
        label: 'Last 30 Days',
      };

    default:
      // Default to this month
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
        label: 'This Month',
      };
  }
}

/**
 * Get comparison period based on date range
 */
export function getComparisonPeriod(dateRange, comparisonType = 'previousPeriod') {
  const { start, end } = dateRange;
  const durationMs = end.getTime() - start.getTime();

  if (comparisonType === 'sameLastYear') {
    // Same period last year
    return {
      start: subYears(start, 1),
      end: subYears(end, 1),
      label: 'Same Period Last Year',
    };
  }

  // Previous period (same length, immediately before)
  const prevEnd = new Date(start.getTime() - 1); // 1ms before start
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    start: startOfDay(prevStart),
    end: endOfDay(prevEnd),
    label: 'Previous Period',
  };
}

/**
 * Generate time buckets for time series charts
 */
export function generateTimeBuckets(start, end, granularity = 'auto') {
  const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  // Auto-determine granularity
  let bucketGranularity = granularity;
  if (granularity === 'auto') {
    if (durationDays <= 7) bucketGranularity = 'day';
    else if (durationDays <= 60) bucketGranularity = 'week';
    else if (durationDays <= 365) bucketGranularity = 'month';
    else bucketGranularity = 'quarter';
  }

  const buckets = [];
  let current = new Date(start);

  while (current <= end) {
    let bucketEnd;
    switch (bucketGranularity) {
      case 'day':
        bucketEnd = endOfDay(current);
        buckets.push({
          start: new Date(current),
          end: bucketEnd,
          label: format(current, 'MMM d'),
        });
        current = subDays(current, -1); // Add 1 day
        break;
      case 'week':
        bucketEnd = endOfWeek(current, { weekStartsOn: 0 });
        buckets.push({
          start: new Date(current),
          end: bucketEnd > end ? end : bucketEnd,
          label: `Week of ${format(current, 'MMM d')}`,
        });
        current = subDays(current, -7); // Add 7 days
        break;
      case 'month':
        bucketEnd = endOfMonth(current);
        buckets.push({
          start: new Date(current),
          end: bucketEnd > end ? end : bucketEnd,
          label: format(current, 'MMM yyyy'),
        });
        current = startOfMonth(subMonths(current, -1)); // Next month
        break;
      case 'quarter':
        bucketEnd = endOfMonth(subMonths(current, -3)); // End of quarter
        buckets.push({
          start: new Date(current),
          end: bucketEnd > end ? end : bucketEnd,
          label: `Q${Math.ceil((current.getMonth() + 1) / 3)} ${current.getFullYear()}`,
        });
        current = subMonths(current, -3); // Add 3 months
        break;
      default:
        break;
    }
  }

  return buckets;
}

export default {
  parseDateRange,
  getComparisonPeriod,
  generateTimeBuckets,
};
