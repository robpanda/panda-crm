import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReportRuntimeFilters from './ReportRuntimeFilters';
import {
  buildInitialRuntimeFilterValues,
  buildReportRuntimeFilterModel,
} from '../../utils/reportRuntimeFilters';

describe('ReportRuntimeFilters', () => {
  const pipelineFields = [
    { id: 'stage', label: 'Stage', type: 'enum', enumValues: ['LEAD_ASSIGNED', 'SCHEDULED'] },
    { id: 'ownerId', label: 'Owner', type: 'relation' },
    { id: 'createdAt', label: 'Created Date', type: 'datetime', defaultDateField: true },
  ];

  const financialFields = [
    { id: 'status', label: 'Status', type: 'enum', enumValues: ['DRAFT', 'SENT', 'PAID'] },
    { id: 'invoiceDate', label: 'Invoice Date', type: 'date', defaultDateField: true },
  ];

  it('renders only the relevant pipeline report controls', () => {
    const report = {
      baseModule: 'jobs',
      filters: [
        { field: 'stage', operator: 'equals', value: 'LEAD_ASSIGNED' },
        { field: 'ownerId', operator: 'equals', value: 'user-1' },
      ],
      dateRangeField: 'createdAt',
      defaultDateRange: 'thisMonth',
    };
    const model = buildReportRuntimeFilterModel(report, pipelineFields);
    const values = buildInitialRuntimeFilterValues(report, pipelineFields);

    const markup = renderToStaticMarkup(
      <ReportRuntimeFilters
        dateRange={{ preset: 'THIS_MONTH' }}
        onDateRangeChange={() => {}}
        definitions={model.definitions}
        values={values}
        onValueChange={() => {}}
        onRun={() => {}}
      />,
    );

    expect(markup).toContain('This Month');
    expect(markup).toContain('Stage');
    expect(markup).toContain('Owner');
    expect(markup).not.toContain('Status');
  });

  it('renders only the relevant financial report controls and no duplicate date preset when absent', () => {
    const report = {
      baseModule: 'invoices',
      filterableFields: ['status'],
    };
    const model = buildReportRuntimeFilterModel(report, financialFields);
    const values = buildInitialRuntimeFilterValues(report, financialFields);

    const markup = renderToStaticMarkup(
      <ReportRuntimeFilters
        dateRange={null}
        onDateRangeChange={() => {}}
        definitions={model.definitions}
        values={values}
        onValueChange={() => {}}
        onRun={() => {}}
      />,
    );

    expect(markup).toContain('Status');
    expect(markup).not.toContain('This Month');
    expect(markup).not.toContain('Owner');
  });
});
