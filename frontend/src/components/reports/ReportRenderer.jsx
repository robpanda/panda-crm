import KPICard from './KPICard';
import BarChartWidget from './charts/BarChartWidget';
import LineChartWidget from './charts/LineChartWidget';
import PieChartWidget from './charts/PieChartWidget';
import TableWidget from './charts/TableWidget';
import { formatReportFieldLabel, normalizeReportConfig, normalizeReportRunResult } from '../../utils/reporting';

function getPreferredBarValueKey(chartData) {
  if (!Array.isArray(chartData) || chartData.length === 0) {
    return 'value';
  }

  const sample = chartData[0];
  if (typeof sample.amount === 'number') return 'amount';
  if (typeof sample.value === 'number') return 'value';
  if (typeof sample.count === 'number') return 'count';
  return 'value';
}

function formatMetricValue(value, format) {
  if (format === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value || 0);
  }

  return value;
}

export default function ReportRenderer({
  report,
  payload,
  loading = false,
  title,
  subtitle,
  emptyStateContext,
  pageSize = 10,
}) {
  const normalizedReport = normalizeReportConfig(report);
  const normalized = normalizeReportRunResult(normalizedReport, payload);
  const chartType = String(normalizedReport?.chartType || 'TABLE').toUpperCase();
  const widgetTitle = title || normalizedReport?.name || 'Report';
  const widgetSubtitle = subtitle || normalized.dateRangeLabel || null;
  const chartData = normalized.chartData;
  const rows = normalized.rows;
  const rowKeys = Object.keys(rows?.[0] || {});

  if (chartType === 'KPI') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {normalized.metrics.map((metric) => (
          <KPICard
            key={metric.id}
            title={metric.label}
            value={metric.value}
            format={metric.format}
            loading={loading}
            subtitle={widgetSubtitle}
            emptyStateContext={{
              ...emptyStateContext,
              title: metric.label,
              rowCount: normalized.rowCount,
              isEmpty: !metric.value,
            }}
          />
        ))}
      </div>
    );
  }

  if (chartType === 'BAR') {
    return (
      <BarChartWidget
        title={widgetTitle}
        subtitle={widgetSubtitle}
        data={chartData}
        dataKey={getPreferredBarValueKey(chartData)}
        nameKey="name"
        layout="vertical"
        loading={loading}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  if (chartType === 'PIE') {
    return (
      <PieChartWidget
        title={widgetTitle}
        subtitle={widgetSubtitle}
        data={chartData}
        dataKey={getPreferredBarValueKey(chartData)}
        nameKey="name"
        loading={loading}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  if (chartType === 'LINE' || chartType === 'AREA') {
    const lineData = Array.isArray(rows) ? rows : chartData;

    return (
      <LineChartWidget
        title={widgetTitle}
        subtitle={widgetSubtitle}
        data={lineData}
        lines={[
          {
            dataKey: 'value',
            name: widgetTitle,
            color: chartType === 'AREA' ? 'success' : 'primary',
          },
        ]}
        xAxisKey={lineData[0]?.date ? 'date' : 'name'}
        formatValue={(value) => formatMetricValue(value, 'number')}
        loading={loading}
        showArea={chartType === 'AREA'}
        emptyStateContext={emptyStateContext}
      />
    );
  }

  const useConfiguredColumns = Array.isArray(normalizedReport?.selectedFields)
    && normalizedReport.selectedFields.length > 0
    && (rowKeys.length === 0 || normalizedReport.selectedFields.some((field) => rowKeys.includes(field)));

  const columns = useConfiguredColumns
    ? normalizedReport.selectedFields.map((field) => ({
        key: field,
        label: formatReportFieldLabel(field),
      }))
    : rowKeys.map((field) => ({
        key: field,
        label: formatReportFieldLabel(field),
      }));

  return (
    <TableWidget
      title={widgetTitle}
      subtitle={widgetSubtitle}
      data={rows}
      columns={columns}
      loading={loading}
      pageSize={pageSize}
      emptyStateContext={emptyStateContext}
      emptyMessage="No data found"
    />
  );
}
