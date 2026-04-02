import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import TableWidget from './TableWidget';

describe('TableWidget grouped rendering', () => {
  it('renders grouped sections with summary chips, detail rows, and subtotals', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TableWidget
          data={[]}
          groups={[
            {
              key: 'stage-lead-assigned',
              label: 'Stage: Lead Assigned',
              rowCount: 2,
              rows: [
                { id: '1', name: 'Job 1', stage: 'Lead Assigned', amount: 100 },
                { id: '2', name: 'Job 2', stage: 'Lead Assigned', amount: 50 },
              ],
              totals: {
                amount: 150,
              },
              summaryEntries: [
                { key: 'rowCount', label: 'Records', value: 2, format: 'number' },
                { key: 'amount', label: 'Total Amount', value: 150, format: 'currency' },
              ],
            },
          ]}
          columns={[
            { key: 'name', label: 'Job Name', format: null },
            { key: 'stage', label: 'Stage', format: null },
            { key: 'amount', label: 'Amount', format: 'currency' },
          ]}
          showPagination={false}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('Group');
    expect(markup).toContain('Stage: Lead Assigned');
    expect(markup).toContain('Records');
    expect(markup).toContain('2 records');
    expect(markup).toContain('Total Amount');
    expect(markup).toContain('Job 1');
    expect(markup).toContain('Job 2');
    expect(markup).toContain('Subtotal');
    expect(markup).toContain('$150');
  });

  it('renders report row links in a new tab when a safe destination exists', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TableWidget
          data={[
            { id: 'job-db-123', jobId: 'J-1001', lastName: 'Smith' },
          ]}
          columns={[
            { key: 'jobId', label: 'Job Number', format: null },
            { key: 'lastName', label: 'Last Name', format: null },
          ]}
          recordModule="jobs"
          showPagination={false}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/jobs/job-db-123"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('J-1001');
    expect(markup).toContain('Smith');
  });

  it('renders resize handles and applied width styles only when report resizing is enabled', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TableWidget
          data={[
            { id: '1', name: 'Job 1', timeline: 'Created' },
          ]}
          columns={[
            { key: 'name', label: 'Job Name', width: '240px', minWidth: '120px', maxWidth: '400px' },
            { key: 'timeline', label: 'Timeline', width: '320px', minWidth: '160px', maxWidth: '640px' },
          ]}
          showPagination={false}
          resizableColumns={true}
          onColumnWidthChange={() => {}}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('data-column-resize-handle="name"');
    expect(markup).toContain('data-column-resize-handle="timeline"');
    expect(markup).toContain('width:240px');
    expect(markup).toContain('min-width:120px');
    expect(markup).toContain('max-width:400px');
    expect(markup).toContain('min-width:560px');
  });
});
