import { describe, expect, it } from 'vitest';
import {
  buildTimelineDisplay,
  filterReportTableRows,
  getReportTableFilterDefinitions,
} from '../reporting';

describe('reporting table helpers', () => {
  it('builds a compact timeline from full milestone data', () => {
    const timeline = buildTimelineDisplay({
      created_at: '2026-03-27',
      lead_assigned_date: '2026-03-28',
      appointment_date: '2026-03-29',
      scheduled_date: '2026-03-30',
      inspected_date: '2026-03-31',
      close_date: '2026-04-01',
    }, {
      selectedFields: [
        'created_at',
        'lead_assigned_date',
        'appointment_date',
        'scheduled_date',
        'inspected_date',
        'close_date',
      ],
    });

    expect(timeline).toBe(
      'Created Mar 27 • Lead Assigned Mar 28 • Appointment Mar 29 • Scheduled Mar 30 • Inspected Mar 31 • Close Apr 1'
    );
  });

  it('builds a compact timeline from partial milestone data', () => {
    const timeline = buildTimelineDisplay({
      created_at: '2026-03-27',
      scheduled_date: '2026-03-28',
    }, {
      selectedFields: ['created_at', 'scheduled_date'],
    });

    expect(timeline).toBe('Created Mar 27 • Scheduled Mar 28');
  });

  it('returns an em dash when no milestone data exists', () => {
    expect(buildTimelineDisplay({ name: 'No milestone row' }, { selectedFields: ['name'] })).toBe('—');
  });

  it('builds explicit dynamic filter definitions from report config', () => {
    const definitions = getReportTableFilterDefinitions({
      baseModule: 'jobs',
      selectedFields: ['name', 'stage', 'ownerId', 'createdAt'],
      visualization: {
        table: {
          filterableFields: [
            'stage',
            { field: 'ownerId', type: 'multiSelect', multiple: true },
            { field: 'createdAt', type: 'dateRange' },
          ],
        },
      },
    }, [
      { id: 'stage', label: 'Stage', type: 'enum', filterable: true, enumValues: ['Lead Assigned', 'Approved'] },
      { id: 'ownerId', label: 'Owner', type: 'relation', filterable: true },
      { id: 'createdAt', label: 'Created At', type: 'date', filterable: true },
    ], [
      { stage: 'Lead Assigned', ownerId: 'Rob Winters', createdAt: '2026-03-27' },
      { stage: 'Approved', ownerId: 'Adewale Banjo', createdAt: '2026-03-28' },
    ]);

    expect(definitions).toEqual([
      expect.objectContaining({ field: 'stage', type: 'select', label: 'Stage' }),
      expect.objectContaining({ field: 'ownerId', type: 'multiSelect', multiple: true, label: 'Owner' }),
      expect.objectContaining({ field: 'createdAt', type: 'dateRange', label: 'Created At' }),
    ]);
  });

  it('falls back to search-only for reports without filterable fields', () => {
    const definitions = getReportTableFilterDefinitions({
      baseModule: 'jobs',
      selectedFields: ['contractTotal'],
    }, [
      { id: 'contractTotal', label: 'Contract Total', type: 'currency', filterable: false },
    ], [
      { contractTotal: 25000 },
    ]);

    expect(definitions).toEqual([]);
  });

  it('keeps existing reports backward compatible when no table filters are active', () => {
    const rows = [
      { name: 'Alpha', stage: 'Lead Assigned' },
      { name: 'Beta', stage: 'Approved' },
    ];

    expect(filterReportTableRows(rows, [], {}, '')).toEqual(rows);
  });
});
