import { describe, expect, it } from 'vitest';
import { buildReportPresentationData } from '../reportingRuntime';
import {
  buildReportTablePresentation,
  buildTimelineDisplay,
} from '../reportTablePresentation';

describe('report table presentation', () => {
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

  it('leaves reports with no date fields in raw table mode', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['name', 'stage', 'amount'],
    };

    const basePresentation = buildReportPresentationData(report, {
      rows: [
        { id: '1', name: 'Job 1', stage: 'New', amount: 1000 },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });
    const result = buildReportTablePresentation(report, basePresentation, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'name', label: 'Job Name', format: null },
      { key: 'stage', label: 'Stage', format: null },
      { key: 'amount', label: 'Amount', format: 'currency' },
    ]);
    expect(result.metadata.dateDisplayMode).toBe('raw');
    expect(result.metadata.hiddenDateFieldKeys).toEqual([]);
  });

  it('keeps a single visible date field unchanged in the report table', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: ['name', 'createdAt', 'stage'],
    };

    const basePresentation = buildReportPresentationData(report, {
      rows: [
        { id: '1', name: 'Job 1', createdAt: '2026-01-01T10:00:00.000Z', stage: 'New' },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });
    const result = buildReportTablePresentation(report, basePresentation, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'name', label: 'Job Name', format: null },
      { key: 'createdAt', label: 'Created Date', format: 'datetime' },
      { key: 'stage', label: 'Stage', format: null },
    ]);
    expect(result.metadata.dateDisplayMode).toBe('raw');
    expect(result.rows[0].createdAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('builds a compact timeline from only the milestone dates present on the row', () => {
    const report = {
      baseModule: 'jobs',
      selectedFields: ['createdAt', 'scheduledDate', 'approvedDate', 'closeDate'],
    };

    const timeline = buildTimelineDisplay({
      id: '1',
      createdAt: '2026-01-01T10:00:00.000Z',
      scheduledDate: '2026-01-05',
      approvedDate: null,
      closeDate: '2026-01-12',
    }, report, {
      fieldDefinitions,
    });

    expect(timeline).toEqual({
      fieldKeys: ['createdAt', 'scheduledDate', 'approvedDate', 'closeDate'],
      entries: [
        {
          key: 'createdAt',
          label: 'Created',
          value: '2026-01-01T10:00:00.000Z',
          format: 'datetime',
        },
        {
          key: 'scheduledDate',
          label: 'Scheduled',
          value: '2026-01-05',
          format: 'date',
        },
        {
          key: 'closeDate',
          label: 'Closed',
          value: '2026-01-12',
          format: 'date',
        },
      ],
    });
  });

  it('replaces multiple visible milestone date columns with a computed timeline column', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      selectedFields: [
        'name',
        'createdAt',
        'leadAssignedDate',
        'appointmentDate',
        'scheduledDate',
        'inspectedDate',
        'approvedDate',
        'soldDate',
        'closeDate',
        'amount',
      ],
    };

    const basePresentation = buildReportPresentationData(report, {
      rows: [
        {
          id: '1',
          name: 'Job 1',
          createdAt: '2026-01-01T10:00:00.000Z',
          leadAssignedDate: '2026-01-02',
          appointmentDate: '2026-01-03T09:00:00.000Z',
          scheduledDate: '2026-01-04',
          inspectedDate: '2026-01-05',
          approvedDate: '2026-01-06',
          soldDate: '2026-01-07',
          closeDate: '2026-01-08',
          amount: 1000,
        },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });
    const result = buildReportTablePresentation(report, basePresentation, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'name', label: 'Job Name', format: null },
      {
        key: 'timeline',
        label: 'Timeline',
        format: 'timeline',
        sortable: false,
        width: '320px',
        sourceFields: [
          'createdAt',
          'leadAssignedDate',
          'appointmentDate',
          'scheduledDate',
          'inspectedDate',
          'approvedDate',
          'soldDate',
          'closeDate',
        ],
      },
      { key: 'amount', label: 'Amount', format: 'currency' },
    ]);
    expect(result.metadata.dateDisplayMode).toBe('timeline');
    expect(result.metadata.hiddenDateFieldKeys).toEqual([
      'createdAt',
      'leadAssignedDate',
      'appointmentDate',
      'scheduledDate',
      'inspectedDate',
      'approvedDate',
      'soldDate',
      'closeDate',
    ]);
    expect(result.rows[0].createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.rows[0].closeDate).toBe('2026-01-08');
    expect(result.rows[0].timeline?.entries?.map((entry) => entry.label)).toEqual([
      'Created',
      'Lead Assigned',
      'Appointment',
      'Scheduled',
      'Inspected',
      'Approved',
      'Sold',
      'Closed',
    ]);
  });

  it('supports reduced visible date mode while keeping raw date fields on the row', () => {
    const report = {
      baseModule: 'jobs',
      chartType: 'TABLE',
      dateDisplayMode: 'compact',
      dateRangeField: 'scheduledDate',
      selectedFields: ['name', 'createdAt', 'scheduledDate', 'closeDate', 'stage'],
    };

    const basePresentation = buildReportPresentationData(report, {
      rows: [
        {
          id: '1',
          name: 'Job 1',
          createdAt: '2026-01-01T10:00:00.000Z',
          scheduledDate: '2026-01-04',
          closeDate: '2026-01-08',
          stage: 'Sold',
        },
      ],
      rowCount: 1,
    }, {
      fieldDefinitions,
    });
    const result = buildReportTablePresentation(report, basePresentation, {
      fieldDefinitions,
    });

    expect(result.tableColumns).toEqual([
      { key: 'name', label: 'Job Name', format: null },
      { key: 'scheduledDate', label: 'Scheduled Date', format: 'date' },
      { key: 'stage', label: 'Stage', format: null },
    ]);
    expect(result.metadata.dateDisplayMode).toBe('compact');
    expect(result.metadata.primaryVisibleDateField).toBe('scheduledDate');
    expect(result.metadata.hiddenDateFieldKeys).toEqual(['createdAt', 'closeDate']);
    expect(result.rows[0].createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.rows[0].closeDate).toBe('2026-01-08');
  });
});
