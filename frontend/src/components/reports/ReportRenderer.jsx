import { useMemo } from 'react';
import {
  BarChartWidget,
  KPICard,
  LineChartWidget,
  PieChartWidget,
  TableWidget,
} from './index';
import { humanizeFieldLabel } from '../../utils/reporting';

function normalizeRows(payload) {
  const results = payload?.data?.results || payload?.results || payload?.data || payload || {};
  const rows = Array.isArray(results?.rows)
    ? results.rows
    : Array.isArray(results?.data)
    ? results.data
    : Array.isArray(results)
    ? results
    : [];

  return {
    rows,
    rowCount: results?.rowCount || rows.length,
    metadata: results?.metadata || {},
  };
}

function inferColumns(rows, selectedFields) {
  if (Array.isArray(selectedFields) && selectedFields.length > 0) {
    return selectedFields.map((field) => {
      const fieldId = typeof field === 'string' ? field : field?.id || field?.field || field?.key || field?.name;
      return {
        key: fieldId,
        label: humanizeFieldLabel(fieldId),
      };
    });
  }

  const firstRow = rows[0];
  if (!firstRow || typeof firstRow !== 'object') return [];

  return Object.keys(firstRow).map((key) => ({
    key,
    label: humanizeFieldLabel(key),
  }));
}

export default function ReportRenderer({
  report,
  payload,
  loading = false,
  title,
  subtitle,
  emptyStateContext,
}) {
  const { rows, rowCount } = useMemo(() => normalizeRows(payload), [payload]);
  const chartType = String(report?.chartType || 'TABLE').toUpperCase();
  const columns = useMemo(() => inferColumns(rows, report?.selectedFields), [rows, report?.selectedFields]);

  const chartRows = rows.map((row, index) => ({
    id: row?.id || `row-${index}`,
    ...row,
  }));

  if (chartType === 'KPI') {
    const value = rowCount;
    return (
      <KPICard
        title={title}
        value={value}
        subtitle={subtitle}
        loading={loading}
        source="native"
        emptyStateContext={emptyStateContext}
      />
    );
  }

  if (chartType === 'BAR') {
    const nameKey = columns[0]?.key || 'name';
    const dataKey = columns[1]?.key || columns[0]?.key || 'value';
    return (
      <BarChartWidget
        title={title}
        subtitle={subtitle}
        loading={loading}
        data={chartRows}
        nameKey={nameKey}
        dataKey={dataKey}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  if (chartType === 'LINE' || chartType === 'AREA') {
    const xAxisKey = columns[0]?.key || 'name';
    const lineField = columns[1]?.key || columns[0]?.key || 'value';

    return (
      <LineChartWidget
        title={title}
        subtitle={subtitle}
        loading={loading}
        data={chartRows}
        xAxisKey={xAxisKey}
        lines={[{ dataKey: lineField, name: humanizeFieldLabel(lineField), color: 'primary' }]}
        showArea={chartType === 'AREA'}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  if (chartType === 'PIE') {
    const nameKey = columns[0]?.key || 'name';
    const dataKey = columns[1]?.key || columns[0]?.key || 'value';

    return (
      <PieChartWidget
        title={title}
        subtitle={subtitle}
        loading={loading}
        data={chartRows}
        nameKey={nameKey}
        dataKey={dataKey}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  return (
    <TableWidget
      title={title}
      subtitle={subtitle}
      loading={loading}
      data={chartRows}
      columns={columns}
      emptyStateContext={emptyStateContext}
      emptyMessage="No data found"
    />
  );
}
