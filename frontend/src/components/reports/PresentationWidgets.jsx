import KPICard from './KPICard';
import BarChartWidget from './charts/BarChartWidget';
import LineChartWidget from './charts/LineChartWidget';
import PieChartWidget from './charts/PieChartWidget';
import TableWidget from './charts/TableWidget';
import {
  formatReportFieldLabel,
  getEffectiveReportPresentationWidgets,
  normalizeReportConfig,
  normalizeReportRunResult,
} from '../../utils/reporting';

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function aggregateRows(rows, field, fn) {
  const values = rows
    .map((row) => toNumber(row?.[field]))
    .filter((value) => Number.isFinite(value));

  if (fn === 'AVG') {
    return values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  if (fn === 'MIN') {
    return values.length > 0 ? Math.min(...values) : 0;
  }

  if (fn === 'MAX') {
    return values.length > 0 ? Math.max(...values) : 0;
  }

  if (fn === 'COUNT') {
    return rows.length;
  }

  return values.reduce((sum, value) => sum + value, 0);
}

function buildChartRows(rows, widget, fallbackLabel) {
  const xField = widget.visualization?.xField || rows?.[0] && Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'string') || 'name';
  const yField = widget.visualization?.yField || rows?.[0] && Object.keys(rows[0]).find((key) => typeof rows[0][key] === 'number') || 'value';

  return (rows || []).map((row, index) => ({
    id: row?.id || `${widget.id || 'chart'}_${index + 1}`,
    name: row?.[xField] || row?.name || row?.label || fallbackLabel || `Row ${index + 1}`,
    value: toNumber(row?.[yField] ?? row?.value ?? row?.count ?? 0),
    count: toNumber(row?.count ?? row?.value ?? row?.[yField] ?? 0),
    ...row,
  }));
}

function buildAiSummary(rows, widgets, rowCount) {
  if (!rows.length) {
    return 'No rows are available for this report yet.';
  }

  const sample = rows[0] || {};
  const labelField = Object.keys(sample).find((key) => typeof sample[key] === 'string') || 'name';
  const valueField = Object.keys(sample).find((key) => typeof sample[key] === 'number') || 'value';
  const topRow = [...rows]
    .sort((left, right) => toNumber(right?.[valueField]) - toNumber(left?.[valueField]))[0];

  return `${rowCount} rows returned. Top ${formatReportFieldLabel(labelField)} is ${topRow?.[labelField] || 'Unknown'} with ${formatReportFieldLabel(valueField)} of ${toNumber(topRow?.[valueField]).toLocaleString()}. ${widgets.length > 1 ? 'Widgets are using the same report query.' : 'This summary is generated from the current report query.'}`;
}

function renderWidget(widget, rows, normalized, emptyStateContext, index) {
  const widgetType = String(widget.type || widget.widgetType || 'TABLE').toUpperCase();
  const title = widget.title || `Widget ${index + 1}`;
  const subtitle = widget.subtitle || normalized.dateRangeLabel || null;
  const chartRows = buildChartRows(rows, widget, title);

  switch (widgetType) {
    case 'KPI': {
      const value = widget.metricField
        ? aggregateRows(rows, widget.metricField, String(widget.metricFunction || 'SUM').toUpperCase())
        : normalized.metrics[0]?.value ?? normalized.rowCount;
      const format = widget.visualization?.format || normalized.metrics[0]?.format || 'number';

      return (
        <KPICard
          key={widget.id}
          title={title}
          value={value}
          format={format}
          subtitle={subtitle}
          emptyStateContext={emptyStateContext}
        />
      );
    }
    case 'CHART': {
      const chartType = String(widget.visualization?.chartType || 'BAR').toUpperCase();
      if (chartType === 'PIE') {
        return (
          <PieChartWidget
            key={widget.id}
            title={title}
            subtitle={subtitle}
            data={chartRows}
            dataKey="value"
            nameKey="name"
            emptyStateContext={emptyStateContext}
          />
        );
      }

      if (chartType === 'LINE' || chartType === 'AREA') {
        return (
          <LineChartWidget
            key={widget.id}
            title={title}
            subtitle={subtitle}
            data={chartRows}
            lines={[{ dataKey: 'value', name: title, color: chartType === 'AREA' ? 'success' : 'primary' }]}
            xAxisKey="name"
            showArea={chartType === 'AREA'}
            emptyStateContext={emptyStateContext}
          />
        );
      }

      return (
        <BarChartWidget
          key={widget.id}
          title={title}
          subtitle={subtitle}
          data={chartRows}
          dataKey="value"
          nameKey="name"
          layout="vertical"
          emptyStateContext={emptyStateContext}
        />
      );
    }
    case 'AI_SUMMARY':
      return (
        <div key={widget.id} className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">AI Summary</div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900">{title}</h3>
          <p className="mt-3 text-sm leading-6 text-gray-600">{buildAiSummary(rows, normalized.report?.presentation?.widgets || [], normalized.rowCount)}</p>
        </div>
      );
    case 'TABLE':
    default: {
      const sample = rows?.[0] || {};
      const columns = Object.keys(sample).map((key) => ({
        key,
        label: formatReportFieldLabel(key),
      }));

      return (
        <TableWidget
          key={widget.id}
          title={title}
          subtitle={subtitle}
          data={rows}
          columns={columns}
          pageSize={5}
          emptyStateContext={emptyStateContext}
          emptyMessage="No preview data found"
        />
      );
    }
  }
}

export default function PresentationWidgets({
  report,
  payload,
  widgets,
  emptyStateContext = {},
  className = '',
}) {
  const normalizedReport = normalizeReportConfig(report);
  const normalized = normalizeReportRunResult(normalizedReport, payload);
  const presentationWidgets = Array.isArray(widgets) && widgets.length > 0
    ? widgets
    : getEffectiveReportPresentationWidgets(normalizedReport);

  if (!presentationWidgets.length) {
    return null;
  }

  return (
    <div className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${className}`}>
      {presentationWidgets.map((widget, index) =>
        renderWidget(widget, normalized.rows, normalized, emptyStateContext, index)
      )}
    </div>
  );
}
