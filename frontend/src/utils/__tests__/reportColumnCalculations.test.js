import { describe, expect, it } from 'vitest';
import {
  applyGroupCalculationSelections,
  buildReportCalculationEntries,
  calculateReportColumnValue,
  formatReportCalculationValue,
  getCalculableReportColumns,
  normalizeReportCalculationSelections,
} from '../reportColumnCalculations';

describe('report column calculations', () => {
  const columns = [
    { key: 'name', label: 'Job Name', format: null },
    { key: 'amount', label: 'Amount', format: 'currency' },
    { key: 'margin', label: 'Margin', format: 'percent' },
  ];

  const rows = [
    { id: '1', name: 'Job 1', amount: 100, margin: 12.5 },
    { id: '2', name: 'Job 2', amount: 50, margin: 22.5 },
    { id: '3', name: 'Job 3', amount: 200, margin: 10 },
  ];

  it('supports numeric sum average and count calculations', () => {
    expect(calculateReportColumnValue(rows, columns[1], 'sum')).toEqual({
      key: 'calc:sum:amount',
      columnKey: 'amount',
      calculation: 'sum',
      label: 'Total Amount',
      value: 350,
      format: 'currency',
    });
    expect(calculateReportColumnValue(rows, columns[1], 'average')).toEqual({
      key: 'calc:average:amount',
      columnKey: 'amount',
      calculation: 'average',
      label: 'Average Amount',
      value: 350 / 3,
      format: 'currency',
    });
    expect(calculateReportColumnValue(rows, columns[1], 'count')).toEqual({
      key: 'calc:count:amount',
      columnKey: 'amount',
      calculation: 'count',
      label: 'Count Amount',
      value: 3,
      format: 'number',
    });
  });

  it('does not expose invalid numeric calculations for non-numeric columns', () => {
    expect(getCalculableReportColumns(columns)).toEqual([
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'margin', label: 'Margin', format: 'percent' },
    ]);
    expect(calculateReportColumnValue(rows, columns[0], 'sum')).toBeNull();
    expect(normalizeReportCalculationSelections(columns, {
      name: 'sum',
      amount: 'sum',
    })).toEqual({
      amount: 'sum',
    });
  });

  it('calculations reflect the current filtered row set passed in', () => {
    const filteredRows = rows.filter((row) => row.amount >= 100);

    expect(buildReportCalculationEntries(columns, filteredRows, {
      amount: 'sum',
      margin: 'max',
    })).toEqual([
      {
        key: 'calc:sum:amount',
        columnKey: 'amount',
        calculation: 'sum',
        label: 'Total Amount',
        value: 300,
        format: 'currency',
      },
      {
        key: 'calc:max:margin',
        columnKey: 'margin',
        calculation: 'max',
        label: 'Max Margin',
        value: 12.5,
        format: 'percent',
      },
    ]);
  });

  it('adds grouped calculation entries without breaking existing group summaries', () => {
    const groups = [
      {
        key: 'new',
        label: 'Stage: New',
        rows: rows.slice(0, 2),
        summaryEntries: [
          { key: 'rowCount', label: 'Records', value: 2, format: 'number' },
          { key: 'amount', label: 'Total Amount', value: 150, format: 'currency' },
        ],
      },
    ];

    expect(applyGroupCalculationSelections(groups, columns, {
      amount: 'sum',
      margin: 'min',
      amountMissing: 'count',
    })).toEqual([
      {
        key: 'new',
        label: 'Stage: New',
        rows: rows.slice(0, 2),
        summaryEntries: [
          { key: 'rowCount', label: 'Records', value: 2, format: 'number' },
          { key: 'amount', label: 'Total Amount', value: 150, format: 'currency' },
          {
            key: 'calc:min:margin',
            columnKey: 'margin',
            calculation: 'min',
            label: 'Min Margin',
            value: 12.5,
            format: 'percent',
          },
        ],
      },
    ]);
  });

  it('remains backward compatible when no calculation config exists', () => {
    expect(buildReportCalculationEntries(columns, rows, {})).toEqual([]);
    expect(applyGroupCalculationSelections([
      {
        key: 'all',
        label: 'All Rows',
        rows,
        summaryEntries: [{ key: 'rowCount', label: 'Records', value: 3, format: 'number' }],
      },
    ], columns, {})).toEqual([
      {
        key: 'all',
        label: 'All Rows',
        rows,
        summaryEntries: [{ key: 'rowCount', label: 'Records', value: 3, format: 'number' }],
      },
    ]);
  });

  it('formats ribbon values for display', () => {
    expect(formatReportCalculationValue({
      value: 350,
      format: 'currency',
    })).toBe('$350');
    expect(formatReportCalculationValue({
      value: 12.5,
      format: 'percent',
    })).toBe('12.5%');
  });
});
