import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, opportunitiesApi } from '../services/api';
import { deriveDataSource } from '../utils/analyticsSource';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';
import { toAnalyticsDateParams } from '../utils/analyticsDateRange';
import {
  GlobalDateRangePicker,
  KPICard,
  BarChartWidget,
  LineChartWidget,
  TableWidget,
} from '../components/reports';
import DashboardReportWidget from '../components/reports/DashboardReportWidget';
import {
  ArrowLeft,
  Edit,
  RefreshCw,
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
  LayoutGrid,
} from 'lucide-react';

// Map icon names to components
const iconMap = {
  Target,
  DollarSign,
  Building2,
  Users,
  TrendingUp,
  PauseCircle,
};

// Convert preset to { startDate, endDate } for API filters
function parseDateRange(dateRange) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate, endDate;

  switch (dateRange?.preset) {
    case 'TODAY':
      startDate = today; endDate = new Date(today.getTime() + 86400000); break;
    case 'YESTERDAY':
      startDate = new Date(today.getTime() - 86400000); endDate = today; break;
    case 'THIS_WEEK': {
      const day = today.getDay();
      startDate = new Date(today.getTime() - day * 86400000);
      endDate = new Date(startDate.getTime() + 7 * 86400000); break;
    }
    case 'LAST_WEEK': {
      const day = today.getDay();
      const thisWeekStart = new Date(today.getTime() - day * 86400000);
      startDate = new Date(thisWeekStart.getTime() - 7 * 86400000);
      endDate = thisWeekStart; break;
    }
    case 'THIS_MONTH':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1); break;
    case 'LAST_MONTH':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'THIS_YEAR':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear() + 1, 0, 1); break;
    case 'ALL_DATA':
    default:
      return {};
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

export default function DashboardView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const filters = useMemo(() => parseDateRange(dateRange), [dateRange]);
  const analyticsDateParams = useMemo(() => toAnalyticsDateParams(dateRange), [dateRange]);
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };

  // Fetch dashboard with widgets
  const { data: dashboardData, isLoading: dashboardLoading, refetch } = useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => reportsApi.getDashboard(id),
    enabled: !!id,
  });

  const { data: kpiResponse } = useQuery({
    queryKey: ['analytics-kpis', analyticsDateParams],
    queryFn: () => reportsApi.getAnalyticsKpis(analyticsDateParams),
    retry: false,
  });

  const { data: pipelineResponse } = useQuery({
    queryKey: ['analytics-pipeline', analyticsDateParams],
    queryFn: () => reportsApi.getPipelineMetrics(analyticsDateParams),
    retry: false,
  });

  const { data: performanceResponse } = useQuery({
    queryKey: ['analytics-performance', analyticsDateParams],
    queryFn: () => reportsApi.getPerformanceMetrics(analyticsDateParams, {
      groupBy: 'ownerId',
      metric: 'sum',
      field: 'amount',
      limit: 10,
    }),
    retry: false,
  });

  const dashboard = dashboardData?.data;

  const kpiData = kpiResponse?.data || {};
  const kpiMetrics = kpiData.metrics || {};
  const kpiMeta = kpiData.meta || {};

  // Derive metrics from unified KPI snapshot
  const metrics = useMemo(() => {
    return {
      pipelineCount: kpiMetrics.activeDeals || kpiMetrics.pipelineCount || 0,
      pipelineVolume: kpiMetrics.pipelineVolume || 0,
      balanceDue: kpiMetrics.balanceDue || 0,
      onHoldCount: kpiMetrics.onHoldCount || 0,
      closedWon: kpiMetrics.closedWon || 0,
      closedLost: kpiMetrics.closedLost || 0,
      newLeads: kpiMetrics.newLeads || 0,
    };
  }, [kpiMetrics]);

  // Stage chart data
  const stageChartData = useMemo(() => {
    const stages = pipelineResponse?.data?.byStage || [];
    return stages.map((stage) => ({
      name: stage.stage || 'Unknown',
      count: stage.count || 0,
      value: stage.value || 0,
    }));
  }, [pipelineResponse]);

  const repChartData = useMemo(() => {
    const reps = performanceResponse?.data?.results || [];
    return reps.map((rep) => ({
      name: rep.label || rep.key || 'Unassigned',
      count: rep.count || 0,
      value: rep.totalValue || 0,
    }));
  }, [performanceResponse]);

  // Monthly trends (server-side aggregation)
  const { data: monthlyTrendsData } = useQuery({
    queryKey: ['monthlyTrends', filters],
    queryFn: () => opportunitiesApi.getMonthlyTrends(filters),
  });
  const timeSeriesData = monthlyTrendsData?.data || [];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  const getLegacyMetricConfig = (widget) => {
    const title = `${widget?.title || ''} ${widget?.id || ''}`.toLowerCase();

    if (title.includes('avg deal')) {
      const closedWon = Math.max(metrics.closedWon || 0, 1);
      return {
        value: metrics.pipelineVolume ? Math.round(metrics.pipelineVolume / closedWon) : 0,
        format: 'currency',
      };
    }

    if (title.includes('close rate') || title.includes('completion rate')) {
      const total = (metrics.closedWon || 0) + (metrics.closedLost || 0);
      return {
        value: total > 0 ? ((metrics.closedWon || 0) / total) * 100 : 0,
        format: 'percent',
      };
    }

    if (title.includes('revenue')) {
      return {
        value: metrics.pipelineVolume || 0,
        format: 'currency',
      };
    }

    if (title.includes('deal') || title.includes('job')) {
      return {
        value: metrics.closedWon || metrics.pipelineCount || 0,
        format: 'number',
      };
    }

    return null;
  };

  const getLegacyTableConfig = (widget) => {
    const title = `${widget?.title || ''} ${widget?.id || ''}`.toLowerCase();

    if (title.includes('rep')) {
      return {
        data: repChartData.map((row) => ({
          id: row.name,
          name: row.name,
          deals: row.count,
          revenue: row.value,
        })),
        columns: [
          { key: 'name', label: 'Rep' },
          { key: 'deals', label: 'Deals', format: 'number' },
          { key: 'revenue', label: 'Revenue', format: 'currency' },
        ],
      };
    }

    return null;
  };

  const getLegacyBarData = (widget) => {
    const title = `${widget?.title || ''} ${widget?.id || ''}`.toLowerCase();
    if (title.includes('rep')) {
      return repChartData;
    }

    return stageChartData;
  };

  const getDateRangeLabel = () => {
    const labels = {
      ALL_DATA: 'All Data',
      TODAY: 'Today',
      YESTERDAY: 'Yesterday',
      THIS_WEEK: 'This Week',
      LAST_WEEK: 'Last Week',
      THIS_MONTH: 'This Month',
      LAST_MONTH: 'Last Month',
      THIS_YEAR: 'This Year',
    };
    return labels[dateRange.preset] || 'Custom Range';
  };

  // Render widget based on type
  const renderWidget = (widget) => {
    if (
      widget.savedReportId
      || widget.reportSpec
      || widget.widgetKind
      || widget.chartConfig?.metabaseId
      || widget.chartConfig?.metabaseDashboardId
      || widget.chartConfig?.metabaseQuestionId
    ) {
      return (
        <DashboardReportWidget
          key={widget.id}
          reportId={widget.savedReportId}
          reportSpec={widget.reportSpec}
          chartConfig={widget.chartConfig}
          widgetType={widget.widgetType}
          widgetKind={widget.widgetKind}
          visualization={widget.visualization}
          dateRange={dateRange}
          title={widget.title}
          subtitle={widget.subtitle}
          verification={verification}
        />
      );
    }

    if (widget.widgetType === 'LEGACY_WIDGET') {
      const emptyStateContext = buildEmptyStateContext(widget.title, {
        rowCount:
          widget.compatibilityType === 'metric'
            ? Number(Boolean(getLegacyMetricConfig(widget)))
            : widget.compatibilityType === 'line'
            ? timeSeriesData.length
            : getLegacyBarData(widget).length,
        source: 'legacy',
      });

      if (widget.compatibilityType === 'metric') {
        const metric = getLegacyMetricConfig(widget);

        if (metric) {
          return (
            <KPICard
              key={widget.id}
              title={widget.title}
              value={metric.value}
              format={metric.format}
              icon={Target}
              subtitle={widget.dataSource || getDateRangeLabel()}
              source="legacy"
              verifiedStatus={verification.status}
              verifiedReason={verification.reason}
              emptyStateContext={emptyStateContext}
            />
          );
        }
      }

      if (widget.compatibilityType === 'line') {
        return (
          <LineChartWidget
            key={widget.id}
            data={timeSeriesData}
            lines={[
              { dataKey: 'amount', name: 'Revenue', color: 'primary' },
              { dataKey: 'count', name: 'Count', color: 'success' },
            ]}
            xAxisKey="month"
            title={widget.title}
            subtitle={widget.dataSource || widget.legacyWidgetType}
            height={300}
            showArea
            emptyStateContext={emptyStateContext}
          />
        );
      }

      if (widget.compatibilityType === 'bar') {
        const data = getLegacyBarData(widget);
        const title = `${widget?.title || ''}`.toLowerCase();

        return (
          <BarChartWidget
            key={widget.id}
            data={data}
            dataKey={title.includes('revenue') || title.includes('value') ? 'value' : 'count'}
            nameKey="name"
            title={widget.title}
            subtitle={widget.dataSource || widget.legacyWidgetType}
            layout="vertical"
            height={350}
            emptyStateContext={emptyStateContext}
          />
        );
      }

      if (widget.compatibilityType === 'table') {
        const tableConfig = getLegacyTableConfig(widget);

        if (tableConfig) {
          return (
            <TableWidget
              key={widget.id}
              data={tableConfig.data}
              columns={tableConfig.columns}
              title={widget.title}
              subtitle={widget.dataSource || widget.legacyWidgetType}
              emptyStateContext={emptyStateContext}
              pageSize={6}
            />
          );
        }
      }

      return (
        <div key={widget.id} className="bg-white rounded-xl shadow-sm border border-amber-200 p-5">
          <h3 className="font-semibold text-gray-900">{widget.title}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {widget.dataSource || widget.legacyWidgetType || 'Legacy widget'}
          </p>
          <p className="mt-3 text-sm text-amber-700">
            This legacy dashboard widget remains viewable in the current dashboards service while report-backed dashboard rendering rolls out.
          </p>
        </div>
      );
    }

    const IconComponent = iconMap[widget.iconName] || Target;

    switch (widget.widgetType) {
      case 'KPI_CARD':
        let value = 0;
        if (widget.dataSource === 'pipeline') {
          if (widget.metricField === 'count') value = metrics.pipelineCount;
          if (widget.metricField === 'amount') value = metrics.pipelineVolume;
        } else if (widget.dataSource === 'revenue') {
          value = metrics.pipelineVolume;
        } else if (widget.dataSource === 'leads') {
          value = metrics.newLeads;
        }

        return (
          <KPICard
            key={widget.id}
            title={widget.title}
            value={value}
            format={widget.formatType || 'number'}
            icon={IconComponent}
            iconColor={widget.iconColor || 'from-blue-500 to-blue-600'}
            subtitle={widget.subtitle || getDateRangeLabel()}
            source={dashboardSource}
            verifiedStatus={verification.status}
            verifiedReason={verification.reason}
            emptyStateContext={buildEmptyStateContext(widget.title, { rowCount: value, isEmpty: value === 0 })}
          />
        );

      case 'BAR_CHART':
        const barData = widget.dataSource === 'pipeline' ? stageChartData : repChartData;
        return (
          <BarChartWidget
            key={widget.id}
            data={barData}
            dataKey={widget.metricField || 'count'}
            nameKey="name"
            title={widget.title}
            subtitle={widget.subtitle}
            layout="vertical"
            height={350}
            emptyStateContext={buildEmptyStateContext(widget.title, { rowCount: barData.length })}
          />
        );

      case 'LINE_CHART':
        return (
          <LineChartWidget
            key={widget.id}
            data={timeSeriesData}
            lines={[
              { dataKey: 'count', name: 'Job Count', color: 'primary' },
              { dataKey: 'amount', name: 'Volume ($)', color: 'success' },
            ]}
            xAxisKey="month"
            title={widget.title}
            subtitle={widget.subtitle}
            height={300}
            showArea
            emptyStateContext={buildEmptyStateContext(widget.title, { rowCount: timeSeriesData.length, source: 'legacy' })}
          />
        );

      default:
        return (
          <div key={widget.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-2">{widget.title}</h3>
            <p className="text-sm text-gray-500">Widget type: {widget.widgetType}</p>
          </div>
        );
    }
  };

  if (dashboardLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Dashboard not found</h2>
        <p className="mt-2 text-sm text-gray-500">The dashboard could not be loaded or is no longer available.</p>
      </div>
    );
  }

  const displayDashboard = dashboard;

  const hasWidgets = displayDashboard.widgets?.length > 0;
  const dashboardSource = kpiMeta?.source || (dashboard ? deriveDataSource(displayDashboard) : 'native');
  const buildEmptyStateContext = (title, extra = {}) => ({
    title,
    source: extra.source || dashboardSource,
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: extra.rowCount ?? kpiMeta?.rowCount ?? kpiMetrics.pipelineCount ?? 0,
    filters: {
      'Date Range': getDateRangeLabel(),
    },
    ...extra,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/analytics/dashboards')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors mt-0.5"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{displayDashboard.name}</h1>
              {displayDashboard.isDefault && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  Default
                </span>
              )}
              {displayDashboard.isLegacy && (
                <span className="px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-full">
                  Legacy
                </span>
              )}
            </div>
            {displayDashboard.description && (
              <p className="text-gray-500 mt-1">{displayDashboard.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <GlobalDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            showComparison={false}
          />
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {displayDashboard?.capabilities?.canEdit && (
            <button
              onClick={() => navigate(`/analytics/dashboards/${displayDashboard.id}/edit`)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              <Edit className="w-4 h-4" />
              Edit
            </button>
          )}
        </div>
      </div>

      {displayDashboard.isLegacy && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-gray-700">
          This dashboard is currently served by the existing dashboards backend. Viewing is supported here; edit actions stay hidden until the backend is unified with saved-report widgets.
        </div>
      )}

      {/* Dashboard Content */}
      {hasWidgets ? (
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns: `repeat(${displayDashboard.columns || 4}, 1fr)`
          }}
        >
          {displayDashboard.widgets.map((widget) => (
            <div
              key={widget.id}
              style={{
                gridColumn: `span ${Math.min(widget.width || 1, displayDashboard.columns || 4)}`,
              }}
            >
              {renderWidget(widget)}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <LayoutGrid className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            {displayDashboard.widgetCount > 0
              ? 'This dashboard could not load its widgets.'
              : 'This dashboard requires configuration.'}
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            {displayDashboard.widgetCount > 0
              ? 'The dashboard definition loaded, but the current widget payload was unavailable.'
              : 'Add one or more report widgets in the dashboard builder to display saved report output here.'}
          </p>
        </div>
      )}
    </div>
  );
}
