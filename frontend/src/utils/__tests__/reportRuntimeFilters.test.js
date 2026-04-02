import { describe, expect, it } from 'vitest';
import {
  buildInitialRuntimeFilterValues,
  buildReportRuntimeFilterModel,
  buildRuntimeFiltersFromValues,
  buildRuntimeFilterSummaryEntries,
} from '../reportRuntimeFilters';

describe('report runtime filters', () => {
  const jobFields = [
    { id: 'stage', label: 'Stage', type: 'enum', enumValues: ['LEAD_ASSIGNED', 'SCHEDULED'] },
    { id: 'ownerId', label: 'Owner', type: 'relation' },
    { id: 'createdAt', label: 'Created Date', type: 'datetime', defaultDateField: true },
  ];

  const invoiceFields = [
    { id: 'status', label: 'Status', type: 'enum', enumValues: ['DRAFT', 'SENT', 'PAID'] },
    { id: 'invoiceNumber', label: 'Invoice Number', type: 'string' },
    { id: 'invoiceDate', label: 'Invoice Date', type: 'date', defaultDateField: true },
  ];

  it('derives relevant runtime controls from saved pipeline report filters and skips duplicate date controls', () => {
    const report = {
      baseModule: 'jobs',
      filters: [
        { field: 'stage', operator: 'equals', value: 'LEAD_ASSIGNED' },
        { field: 'ownerId', operator: 'equals', value: 'user-1' },
        { field: 'createdAt', operator: 'between', value: ['2026-04-01', '2026-04-30'] },
      ],
      dateRangeField: 'createdAt',
      defaultDateRange: 'thisMonth',
    };

    const model = buildReportRuntimeFilterModel(report, jobFields);

    expect(model.definitions).toEqual([
      expect.objectContaining({
        field: 'stage',
        label: 'Stage',
        controlType: 'select',
      }),
      expect.objectContaining({
        field: 'ownerId',
        label: 'Owner',
        controlType: 'text',
      }),
    ]);
    expect(model.definitions.find((definition) => definition.field === 'createdAt')).toBeUndefined();
    expect(model.staticFilters).toEqual([
      { field: 'createdAt', operator: 'between', value: ['2026-04-01', '2026-04-30'] },
    ]);
  });

  it('skips duplicate report date controls even before field metadata is available', () => {
    const report = {
      baseModule: 'jobs',
      filters: [
        { field: 'createdAt', operator: 'between', value: ['2026-04-01', '2026-04-30'] },
      ],
      dateRangeField: 'createdAt',
      defaultDateRange: 'thisMonth',
    };

    const model = buildReportRuntimeFilterModel(report, []);

    expect(model.definitions).toEqual([]);
    expect(model.staticFilters).toEqual([
      { field: 'createdAt', operator: 'between', value: ['2026-04-01', '2026-04-30'] },
    ]);
  });

  it('supports explicit filterable field configs for financial-style reports', () => {
    const report = {
      baseModule: 'invoices',
      filterableFields: ['status', 'invoiceNumber'],
    };

    const model = buildReportRuntimeFilterModel(report, invoiceFields);

    expect(model.definitions).toEqual([
      expect.objectContaining({
        field: 'status',
        controlType: 'select',
      }),
      expect.objectContaining({
        field: 'invoiceNumber',
        controlType: 'text',
      }),
    ]);
    expect(model.staticFilters).toEqual([]);
  });

  it('builds initial values and runtime filters without losing static saved filters', () => {
    const report = {
      baseModule: 'jobs',
      filters: [
        { field: 'stage', operator: 'equals', value: 'SCHEDULED' },
        { field: 'ownerId', operator: 'isNotNull' },
      ],
    };

    const model = buildReportRuntimeFilterModel(report, jobFields);
    const values = buildInitialRuntimeFilterValues(report, jobFields);
    const activeFilters = buildRuntimeFiltersFromValues(model, values);

    expect(values).toEqual({
      'saved-filter-0': 'SCHEDULED',
    });
    expect(activeFilters).toEqual([
      { field: 'ownerId', operator: 'isNotNull' },
      { field: 'stage', operator: 'equals', value: 'SCHEDULED' },
    ]);
  });

  it('summarizes active runtime filter values for the report UI', () => {
    const report = {
      baseModule: 'invoices',
      filterableFields: ['status', 'invoiceNumber'],
    };

    const model = buildReportRuntimeFilterModel(report, invoiceFields);
    const summary = buildRuntimeFilterSummaryEntries(model, {
      'field-0-status': 'PAID',
      'field-1-invoiceNumber': 'INV-100',
    });

    expect(summary).toEqual([
      { label: 'Status', value: 'PAID' },
      { label: 'Invoice Number', value: 'INV-100' },
    ]);
  });

  it('returns no runtime field controls when a report has no configured runtime filters', () => {
    const report = {
      baseModule: 'jobs',
      filters: [],
    };

    const model = buildReportRuntimeFilterModel(report, jobFields);

    expect(model.definitions).toEqual([]);
    expect(model.staticFilters).toEqual([]);
  });
});
