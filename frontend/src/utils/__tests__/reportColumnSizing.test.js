import { describe, expect, it } from 'vitest';
import {
  applyReportColumnWidths,
  buildPersistableReportColumnWidths,
  clampReportColumnWidth,
  hasCustomReportColumnWidths,
  resolveReportColumnWidths,
} from '../reportColumnSizing';

describe('report column sizing utilities', () => {
  const columns = [
    { key: 'name', label: 'Job Name' },
    { key: 'timeline', label: 'Timeline', width: '320px' },
    { key: 'amount', label: 'Amount', minWidth: '140px', maxWidth: '300px' },
  ];

  it('uses sensible default widths when no saved sizing exists', () => {
    expect(resolveReportColumnWidths(columns, {})).toEqual({
      name: 180,
      timeline: 320,
      amount: 180,
    });
    expect(hasCustomReportColumnWidths(columns, {})).toBe(false);
  });

  it('clamps and preserves resized widths for persistence', () => {
    expect(clampReportColumnWidth(90, columns[0])).toBe(120);
    expect(clampReportColumnWidth(500, columns[2])).toBe(300);
    expect(buildPersistableReportColumnWidths(columns, {
      timeline: 410,
      amount: 500,
    })).toEqual({
      timeline: 410,
      amount: 300,
    });
    expect(hasCustomReportColumnWidths(columns, {
      timeline: 410,
      amount: 500,
    })).toBe(true);
  });

  it('applies width metadata without breaking columns that had no saved sizing', () => {
    expect(applyReportColumnWidths(columns, {
      name: 260,
    })).toEqual([
      { key: 'name', label: 'Job Name', width: '260px', minWidth: '120px', maxWidth: '640px' },
      { key: 'timeline', label: 'Timeline', width: '320px', minWidth: '120px', maxWidth: '640px' },
      { key: 'amount', label: 'Amount', minWidth: '140px', maxWidth: '300px', width: '180px' },
    ]);
  });
});
