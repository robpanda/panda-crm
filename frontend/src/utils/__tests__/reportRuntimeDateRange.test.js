import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getReportDateRangeLabel,
  hasReportRuntimeDateRange,
  normalizeReportRuntimeDateRange,
} from '../reportRuntimeDateRange';

describe('report runtime date range utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not inject a runtime date range when the saved report has no date preset', () => {
    expect(normalizeReportRuntimeDateRange({
      dateRangeField: 'createdAt',
    })).toBeNull();
    expect(hasReportRuntimeDateRange({
      dateRangeField: 'createdAt',
    })).toBe(false);
  });

  it('maps builder presets to runtime presets on report load', () => {
    expect(normalizeReportRuntimeDateRange({
      defaultDateRange: 'thisMonth',
    })).toEqual({ preset: 'THIS_MONTH' });

    expect(normalizeReportRuntimeDateRange({
      defaultDateRange: 'today',
    })).toEqual({ preset: 'TODAY' });

    expect(normalizeReportRuntimeDateRange({
      defaultDateRange: 'rolling90',
    })).toEqual({ preset: 'ROLLING_90' });
  });

  it('resolves this quarter relative to the current load date', () => {
    expect(normalizeReportRuntimeDateRange({
      defaultDateRange: 'thisQuarter',
    })).toEqual({
      preset: 'CUSTOM',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      sourcePreset: 'THIS_QUARTER',
    });
  });

  it('preserves custom and rolling custom report date ranges', () => {
    expect(normalizeReportRuntimeDateRange({
      preset: 'CUSTOM',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    })).toEqual({
      preset: 'CUSTOM',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    expect(normalizeReportRuntimeDateRange({
      preset: 'ROLLING_CUSTOM',
      rollingDays: 45,
    })).toEqual({
      preset: 'ROLLING_CUSTOM',
      rollingDays: 45,
    });
  });

  it('formats active report date range labels accurately', () => {
    expect(getReportDateRangeLabel({ preset: 'THIS_MONTH' })).toBe('This Month');
    expect(getReportDateRangeLabel({ preset: 'ROLLING_90' })).toBe('Rolling 90 Days');
    expect(getReportDateRangeLabel({
      preset: 'CUSTOM',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      sourcePreset: 'THIS_QUARTER',
    })).toBe('This Quarter');
    expect(getReportDateRangeLabel({
      preset: 'CUSTOM',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    })).toBe('3/1/2026 - 3/31/2026');
  });
});
