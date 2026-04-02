import { describe, expect, it } from 'vitest';
import {
  buildChartDataFromGroupedResults,
  buildChartDataFromTimeSeriesResults,
  buildGroupedChartQuery,
  buildKpiMetricsFromSummary,
  buildRawReportQuery,
  buildReportPresentationData,
  buildTimeSeriesQuery,
  resolveReportModule,
} from '../reportingRuntime';

describe('reporting utilities', () => {
  const fieldDefinitions = [
    { id: 'name', label: 'Job Name', type: 'string' },
    { id: 'stage', label: 'Stage', type: 'enum', groupable: true },
    { id: 'amount', label: 'Amount', type: 'currency', aggregatable: true },
    { id: 'createdAt', label: 'Created Date', type: 'datetime' },
    { id: 'leadAssignedDate', label: 'Lead Assigned Date', type: 'date' },
    { id: 'appointmentDate', label: 'Appointment Date', type: 'datetime' },
    { id: 'scheduledDate', label: 'Scheduled Date', type: 'date' },
    { id: 'inspectedDate', label: 'Inspected Date', type: 'date' },
    { id: 'approvedDate', label: 'Approved Date', type: 'date' },
    { id: 'soldDate', label: 'Sold Date', type: 'date' },
    { id: 'closeDate', label: 'Close Date', type: 'date' },
  ];

  it('keeps raw date columns intact in shared report presentation data', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['name', 'createdAt', 'stage'],
    };

    const result = buildReportPresentationData(report, {
      rows: [
        { id: '1', name: 'Job 1', createdAt: '2026-01-01T10:00:00.000Z', stage: 'New' },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'name', label: 'Job Name', format: null },
      { key: 'createdAt', label: 'Created Date', format: 'datetime' },
      { key: 'stage', label: 'Stage', format: null },
    ]);
    expect(result.rows[0].createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.metadata.dateDisplayMode).toBeUndefined();
  });

  it('uses selected field order as the default report column order', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['amount', 'name', 'stage'],
    };

    const result = buildReportPresentationData(report, {
      rows: [
        { id: '1', name: 'Job 1', stage: 'New', amount: 250 },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'amount', label: 'Amount', format: 'currency' },
      { key: 'name', label: 'Job Name', format: null },
      { key: 'stage', label: 'Stage', format: null },
    ]);
  });

  it('resolves legacy report modules and builds a raw report query config', () => {
    const report = {
      baseObject: 'Opportunity',
      selectedFields: ['stage', 'amount'],
      groupByFields: ['stage'],
      filters: {
        stage: 'Won',
        amount: { gte: 1000 },
      },
      dateRangeField: 'createdAt',
      includeRelations: ['account', 'account'],
    };

    const result = buildRawReportQuery(report, {
      preset: 'CUSTOM',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });

    expect(resolveReportModule(report)).toBe('jobs');
    expect(result.module).toBe('jobs');
    expect(result.queryConfig.fields).toEqual(['stage', 'amount', 'createdAt']);
    expect(result.queryConfig.includeRelations).toEqual(['account']);
    expect(result.queryConfig.filters).toEqual([
      { field: 'stage', operator: 'equals', value: 'Won' },
      { field: 'amount', operator: 'gte', value: 1000 },
      {
        field: 'createdAt',
        operator: 'between',
        value: expect.arrayContaining([
          expect.any(String),
          expect.any(String),
        ]),
      },
    ]);
  });

  it('does not inject a report date filter when no runtime date range is active', () => {
    const report = {
      baseModule: 'jobs',
      selectedFields: ['stage', 'amount'],
      filters: {
        stage: 'Won',
      },
      dateRangeField: 'createdAt',
    };

    const result = buildRawReportQuery(report, null);

    expect(result.queryConfig.filters).toEqual([
      { field: 'stage', operator: 'equals', value: 'Won' },
    ]);
  });

  it('builds grouped bar-chart data and grouped table rows from raw records', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'BAR',
      selectedFields: ['stage', 'amount'],
      groupByFields: ['stage'],
    };

    const result = buildReportPresentationData(report, {
      rows: [
        { id: '1', stage: 'New', amount: 100 },
        { id: '2', stage: 'New', amount: 50 },
        { id: '3', stage: 'Won', amount: 200 },
      ],
      rowCount: 3,
    });

    expect(result.metrics).toEqual([
      { label: 'Rows', value: 3, format: 'number' },
      { label: 'Total Amount', value: 350, format: 'currency' },
    ]);
    expect(result.chartData).toEqual([
      { name: 'Won', count: 1, value: 200 },
      { name: 'New', count: 2, value: 150 },
    ]);
    expect(result.tableColumns).toEqual([
      { key: 'stage', label: 'Stage', format: null },
      { key: 'amount', label: 'Amount', format: 'currency' },
    ]);
    expect(result.groupedRows).toHaveLength(2);
    expect(result.groupedRows[0]).toMatchObject({
      key: JSON.stringify(['New']),
      label: 'Stage: New',
      fieldValues: [
        { key: 'stage', label: 'Stage', value: 'New' },
      ],
      rowCount: 2,
      rows: [
        { id: '1', stage: 'New', amount: 100 },
        { id: '2', stage: 'New', amount: 50 },
      ],
      totals: { amount: 150 },
      summaryEntries: [
        { key: 'rowCount', label: 'Records', value: 2, format: 'number' },
        { key: 'amount', label: 'Total Amount', value: 150, format: 'currency' },
      ],
    });
    expect(result.groupedRows[1]).toMatchObject({
      key: JSON.stringify(['Won']),
      label: 'Stage: Won',
      fieldValues: [
        { key: 'stage', label: 'Stage', value: 'Won' },
      ],
      rowCount: 1,
      rows: [{ id: '3', stage: 'Won', amount: 200 }],
      totals: { amount: 200 },
      summaryEntries: [
        { key: 'rowCount', label: 'Records', value: 1, format: 'number' },
        { key: 'amount', label: 'Total Amount', value: 200, format: 'currency' },
      ],
    });
  });

  it('preserves encounter order and multiple grouping values while keeping detail rows', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['name', 'stage', 'createdAt', 'amount'],
      groupByFields: ['stage', 'createdAt'],
    };

    const result = buildReportPresentationData(report, {
      rows: [
        { id: '1', name: 'Job 1', stage: 'Lead Assigned', createdAt: '2026-01-02T10:00:00.000Z', amount: 100 },
        { id: '2', name: 'Job 2', stage: 'Lead Assigned', createdAt: '2026-01-02T10:00:00.000Z', amount: 50 },
        { id: '3', name: 'Job 3', stage: 'Scheduled', createdAt: '2026-01-03T10:00:00.000Z', amount: 200 },
      ],
      rowCount: 3,
    }, {
      fieldDefinitions,
    });

    expect(result.groupedRows.map((group) => group.label)).toEqual([
      'Stage: Lead Assigned • Created Date: 2026-01-02T10:00:00.000Z',
      'Stage: Scheduled • Created Date: 2026-01-03T10:00:00.000Z',
    ]);
    expect(result.groupedRows[0].fieldValues).toEqual([
      { key: 'stage', label: 'Stage', value: 'Lead Assigned' },
      { key: 'createdAt', label: 'Created Date', value: '2026-01-02T10:00:00.000Z' },
    ]);
    expect(result.groupedRows[0].rows).toEqual([
      { id: '1', name: 'Job 1', stage: 'Lead Assigned', createdAt: '2026-01-02T10:00:00.000Z', amount: 100 },
      { id: '2', name: 'Job 2', stage: 'Lead Assigned', createdAt: '2026-01-02T10:00:00.000Z', amount: 50 },
    ]);
    expect(result.groupedRows[0].summaryEntries).toEqual([
      { key: 'rowCount', label: 'Records', value: 2, format: 'number' },
      { key: 'amount', label: 'Total Amount', value: 150, format: 'currency' },
    ]);
  });

  it('returns no grouped sections when a grouped report has no rows', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['name', 'stage', 'amount'],
      groupByFields: ['stage'],
    };

    const result = buildReportPresentationData(report, {
      rows: [],
      rowCount: 0,
    }, {
      fieldDefinitions,
    });

    expect(result.groupedRows).toEqual([]);
  });

  it('builds a grouped chart query and normalizes grouped results without fetching all rows', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'BAR',
      selectedFields: ['stage', 'amount'],
      groupByFields: ['stage'],
      dateRangeField: 'createdAt',
    };

    const queryPlan = buildGroupedChartQuery(report, { preset: 'THIS_MONTH' }, fieldDefinitions);
    const chartData = buildChartDataFromGroupedResults({
      data: [
        { stage: 'Won', _count: { _all: 1 }, _sum: { amount: 500 } },
        { stage: 'New', _count: { _all: 2 }, _sum: { amount: 150 } },
      ],
    }, queryPlan);

    expect(queryPlan).toMatchObject({
      module: 'jobs',
      categoryField: 'stage',
      measureField: 'amount',
      aggregationFunction: 'sum',
    });
    expect(queryPlan.queryConfig.groupBy).toEqual(['stage']);
    expect(queryPlan.queryConfig.aggregations).toEqual([{ field: 'amount', function: 'sum' }]);
    expect(chartData).toEqual([
      { name: 'Won', count: 1, value: 500 },
      { name: 'New', count: 2, value: 150 },
    ]);
  });

  it('builds line-chart data from raw records using the report date field', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'LINE',
      selectedFields: ['amount'],
      dateRangeField: 'createdAt',
    };

    const result = buildReportPresentationData(report, {
      rows: [
        { id: '1', createdAt: '2026-01-01T10:00:00.000Z', amount: 100 },
        { id: '2', createdAt: '2026-01-02T10:00:00.000Z', amount: 150 },
        { id: '3', createdAt: '2026-01-02T12:00:00.000Z', amount: 100 },
      ],
      rowCount: 3,
    });

    expect(result.chartData).toHaveLength(2);
    expect(result.chartData.map((point) => point.value)).toEqual([100, 250]);
    expect(result.chartData[0].date).toContain('2026-01-01');
    expect(result.chartData[1].date).toContain('2026-01-02');
    expect(result.series).toEqual([
      { dataKey: 'value', name: 'Amount', color: 'primary' },
    ]);
  });

  it('builds time-series queries and KPI metrics with correct total counts', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'KPI',
      selectedFields: ['amount'],
      dateRangeField: 'createdAt',
    };

    const timeSeriesPlan = buildTimeSeriesQuery(
      { ...report, chartType: 'LINE' },
      { preset: 'THIS_MONTH' },
      fieldDefinitions,
    );
    const timeSeriesData = buildChartDataFromTimeSeriesResults({
      data: [
        { period: '2026-01-01', amount: 100 },
        { period: '2026-01-02', amount: 250 },
      ],
    }, timeSeriesPlan);
    const metrics = buildKpiMetricsFromSummary({
      success: true,
      data: {
        totalCount: 43210,
        aggregates: {
          sum: { amount: 987654 },
          avg: {},
        },
        metrics: {},
      },
    }, report, fieldDefinitions);

    expect(timeSeriesPlan).toMatchObject({
      module: 'jobs',
      measureField: 'amount',
    });
    expect(timeSeriesData).toEqual({
      chartData: [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-02', value: 250 },
      ],
      series: [{ dataKey: 'value', name: 'Amount', color: 'primary' }],
    });
    expect(metrics).toEqual([
      { label: 'Rows', value: 43210, format: 'number' },
      { label: 'Total Amount', value: 987654, format: 'currency' },
    ]);
  });
});
