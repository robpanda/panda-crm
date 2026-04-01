import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileText, Sparkles } from 'lucide-react';
import { reportsApi } from '../../services/api';
import { toAnalyticsDateParams } from '../../utils/analyticsDateRange';
import { deriveDataSource } from '../../utils/analyticsSource';
import {
  buildPreviewReportSpec,
  formatReportFieldLabel,
  getModuleMetadata,
  getReportTablesUsed,
  normalizeReportConfig,
  normalizeReportRunResult,
} from '../../utils/reporting';
import ReportRenderer from './ReportRenderer';

const WIDGET_KIND_BY_TYPE = {
  KPI_CARD: 'KPI',
  BAR_CHART: 'CHART',
  LINE_CHART: 'CHART',
  AREA_CHART: 'CHART',
  PIE_CHART: 'CHART',
  DONUT_CHART: 'CHART',
  TABLE: 'TABLE',
  REPORT: 'SAVED_REPORT',
  STAT_LIST: 'AI_SUMMARY',
};

const CHART_TYPE_BY_WIDGET_TYPE = {
  KPI_CARD: 'KPI',
  BAR_CHART: 'BAR',
  LINE_CHART: 'LINE',
  AREA_CHART: 'AREA',
  PIE_CHART: 'PIE',
  DONUT_CHART: 'PIE',
  TABLE: 'TABLE',
  REPORT: null,
  STAT_LIST: 'TABLE',
};

function resolveWidgetKind(widgetKind, widgetType) {
  return String(widgetKind || WIDGET_KIND_BY_TYPE[String(widgetType || '').toUpperCase()] || 'SAVED_REPORT').toUpperCase();
}

function resolveChartType(widgetKind, widgetType, visualization = {}, report = {}) {
  const semanticKind = resolveWidgetKind(widgetKind, widgetType);

  if (semanticKind === 'SAVED_REPORT') {
    return String(report?.chartType || 'TABLE').toUpperCase();
  }

  if (semanticKind === 'KPI') {
    return 'KPI';
  }

  if (semanticKind === 'TABLE') {
    return 'TABLE';
  }

  if (semanticKind === 'CHART') {
    return String(visualization?.chartType || CHART_TYPE_BY_WIDGET_TYPE[String(widgetType || '').toUpperCase()] || report?.chartType || 'BAR').toUpperCase();
  }

  if (semanticKind === 'AI_SUMMARY') {
    return 'TABLE';
  }

  return String(report?.chartType || 'TABLE').toUpperCase();
}

function buildWidgetReport(baseReport, { title, subtitle, widgetKind, widgetType, visualization }) {
  const normalizedReport = normalizeReportConfig(baseReport);

  return normalizeReportConfig({
    ...normalizedReport,
    name: title || normalizedReport.name || 'Dashboard Widget',
    description: subtitle || normalizedReport.description || '',
    chartType: resolveChartType(widgetKind, widgetType, visualization, normalizedReport),
    visualization: {
      ...(normalizedReport.visualization || {}),
      ...(visualization || {}),
    },
  });
}

function buildKpiFallback(result) {
  if (result.metrics.length > 0) {
    return result;
  }

  const numericEntry = Object.entries(result.rows?.[0] || {}).find(([, value]) => typeof value === 'number');
  if (numericEntry) {
    const [key, value] = numericEntry;
    return {
      ...result,
      metrics: [
        {
          id: key,
          label: formatReportFieldLabel(key),
          value,
          format: key.toLowerCase().includes('amount') || key.toLowerCase().includes('total') ? 'currency' : 'number',
        },
      ],
    };
  }

  return {
    ...result,
    metrics: [
      {
        id: 'rowCount',
        label: 'Rows',
        value: result.rowCount,
        format: 'number',
      },
    ],
  };
}

function renderAiSummaryLines(report, normalizedResult) {
  const moduleMetadata = getModuleMetadata(report?.baseModule);
  const tablesUsed = getReportTablesUsed(report);
  const topMetric = normalizedResult.metrics[0];

  const lines = [
    `Module: ${moduleMetadata.label}.`,
    `Tables: ${tablesUsed.join(', ') || moduleMetadata.table}.`,
    `Preview returned ${normalizedResult.rowCount} row${normalizedResult.rowCount === 1 ? '' : 's'}.`,
  ];

  if (topMetric) {
    lines.push(`Primary metric: ${topMetric.label} = ${topMetric.value}.`);
  }

  if (Array.isArray(report?.groupByFields) && report.groupByFields.length > 0) {
    lines.push(`Grouped by ${report.groupByFields.map((field) => formatReportFieldLabel(field)).join(', ')}.`);
  }

  return lines;
}

function AiSummaryCard({ report, payload, title, subtitle, loading, error }) {
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-gray-900">{title || 'AI Summary'}</h3>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="h-5 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 space-y-2">
          <div className="h-4 animate-pulse rounded bg-gray-100" />
          <div className="h-4 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  const normalizedResult = buildKpiFallback(normalizeReportRunResult(report, payload));
  const summaryLines = renderAiSummaryLines(report, normalizedResult);

  return (
    <div className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">{title || report?.name || 'AI Summary'}</h3>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-gray-700">
        {summaryLines.map((line, index) => (
          <p key={`${line}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}

export default function DashboardReportWidget({
  reportId,
  reportSpec,
  visualization,
  chartConfig,
  widgetType,
  widgetKind,
  dateRange,
  title,
  subtitle,
  verification,
}) {
  const analyticsDateParams = useMemo(() => toAnalyticsDateParams(dateRange), [dateRange]);
  const semanticKind = useMemo(
    () => resolveWidgetKind(widgetKind || chartConfig?.widgetKind, widgetType),
    [chartConfig?.widgetKind, widgetKind, widgetType]
  );
  const metabaseId = chartConfig?.metabaseId || chartConfig?.metabaseDashboardId || chartConfig?.metabaseQuestionId || null;
  const metabaseType = chartConfig?.metabaseType || (chartConfig?.metabaseQuestionId ? 'question' : 'dashboard');
  const isMetabaseWidget = semanticKind === 'METABASE' || Boolean(metabaseId);

  const {
    data: savedReport,
    isLoading: reportLoading,
    error: reportError,
  } = useQuery({
    queryKey: ['saved-report', reportId, 'dashboard-widget'],
    queryFn: () => reportsApi.getSavedReport(reportId),
    enabled: Boolean(reportId),
  });

  const displayReport = useMemo(() => {
    if (reportId && savedReport) {
      return buildWidgetReport(savedReport, {
        title,
        subtitle,
        widgetKind: semanticKind,
        widgetType,
        visualization: visualization || chartConfig?.visualization,
      });
    }

    if (reportSpec) {
      return buildWidgetReport(reportSpec, {
        title,
        subtitle,
        widgetKind: semanticKind,
        widgetType,
        visualization: visualization || chartConfig?.visualization,
      });
    }

    return null;
  }, [chartConfig?.visualization, reportId, reportSpec, savedReport, semanticKind, subtitle, title, visualization, widgetType]);

  const previewDateRange = analyticsDateParams?.dateRange || undefined;
  const previewDateRangeOptions = useMemo(() => {
    const { dateRange: ignored, ...rest } = analyticsDateParams || {};
    return rest;
  }, [analyticsDateParams]);

  const {
    data: resultsPayload,
    isLoading: resultsLoading,
    error: resultsError,
  } = useQuery({
    queryKey: ['dashboard-widget-results', reportId || 'inline', displayReport, analyticsDateParams],
    queryFn: async () => {
      if (reportId) {
        return reportsApi.runReport(reportId, {
          ...analyticsDateParams,
          includeComparison: false,
        });
      }

      return reportsApi.previewReport({
        reportSpec: buildPreviewReportSpec(displayReport),
        limit: 100,
        dateRange: previewDateRange,
        dateRangeOptions: previewDateRangeOptions,
      });
    },
    enabled: Boolean((reportId || displayReport) && !isMetabaseWidget),
  });

  if (isMetabaseWidget && metabaseId) {
    return (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-lg font-semibold text-gray-900">{title || 'Metabase Widget'}</h3>
          {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="p-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            External dashboard widgets are temporarily hidden while the reports embed APIs are stabilized.
          </div>
        </div>
      </div>
    );
  }

  if (reportError || resultsError) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title || 'Report widget'}</h3>
            <p className="mt-2 text-sm text-rose-700">
              {(reportError || resultsError)?.response?.data?.error?.message || (reportError || resultsError)?.message || 'This widget could not load its report.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!reportId && !displayReport) {
    return (
      <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{title || 'Report widget'}</h3>
            <p className="mt-2 text-sm text-amber-700">This widget requires a saved report or widget report configuration.</p>
          </div>
        </div>
      </div>
    );
  }

  if (semanticKind === 'AI_SUMMARY') {
    return (
      <AiSummaryCard
        report={displayReport}
        payload={resultsPayload}
        title={title}
        subtitle={subtitle}
        loading={reportLoading || resultsLoading}
        error={resultsError?.response?.data?.error?.message || resultsError?.message || null}
      />
    );
  }

  const emptyStateContext = {
    title: title || displayReport?.name || 'Dashboard report',
    source: deriveDataSource(displayReport || savedReport),
    verifiedStatus: verification?.status,
    verifiedReason: verification?.reason,
    failedChecks: verification?.failedChecks || [],
    rowCount: 0,
    filters: {
      'Date Range': dateRange?.preset || 'THIS_MONTH',
      Tables: getReportTablesUsed(displayReport || savedReport || {}).join(', '),
    },
  };

  return (
    <ReportRenderer
      report={displayReport}
      payload={resultsPayload}
      loading={reportLoading || resultsLoading}
      title={title || displayReport?.name}
      subtitle={subtitle}
      emptyStateContext={emptyStateContext}
      pageSize={6}
    />
  );
}
