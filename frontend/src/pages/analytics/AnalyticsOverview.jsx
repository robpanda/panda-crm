import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportsApi } from '../../services/api';
import LoadingSpinner from '../../components/LoadingSpinner';
import { DollarSign, Target, TrendingUp, Activity, ChevronRight } from 'lucide-react';
import DataSourceBadge from '../../components/analytics/DataSourceBadge';
import VerifiedBadge from '../../components/analytics/VerifiedBadge';
import { deriveDataSource } from '../../utils/analyticsSource';
import { useAnalyticsBadgeContext } from '../../components/analytics/AnalyticsBadgeContext';
import EmptyStateDiagnosticsLink from '../../components/analytics/EmptyStateDiagnosticsLink';

function StatCard({
  title,
  value,
  rawValue,
  change,
  icon: Icon,
  color = 'indigo',
  loading = false,
  source,
  verifiedStatus,
  verifiedReason,
  emptyStateContext,
}) {
  const colorClasses = {
    indigo: 'bg-indigo-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <DataSourceBadge source={source} />
            <VerifiedBadge status={verifiedStatus} reason={verifiedReason} />
          </div>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">
            {loading ? '—' : value}
          </p>
          {!loading && emptyStateContext && (rawValue === null || rawValue === undefined || rawValue === 0) && (
            <EmptyStateDiagnosticsLink context={emptyStateContext} />
          )}
          {change !== null && change !== undefined && (
            <p className={`text-xs ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {change >= 0 ? '+' : ''}{change}% vs last period
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} text-white flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ dashboard, verification }) {
  return (
    <Link
      to={`/analytics/dashboards/${dashboard.id}`}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
    >
      <div className="font-medium text-gray-900 dark:text-white truncate">{dashboard.name}</div>
      {dashboard.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {dashboard.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        <DataSourceBadge source={deriveDataSource(dashboard)} />
        <VerifiedBadge status={verification.status} reason={verification.reason} />
      </div>
      <div className="mt-3 text-xs text-gray-400">
        {dashboard.widgetCount || dashboard.widgets?.length || dashboard._count?.widgets || 0} widgets
      </div>
    </Link>
  );
}

export default function AnalyticsOverview() {
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };
  const { data: dashboardsData, isLoading: dashboardsLoading } = useQuery({
    queryKey: ['dashboards', 'overview'],
    queryFn: () => reportsApi.getDashboards(),
  });

  const { data: kpiResponse, isLoading: metricsLoading } = useQuery({
    queryKey: ['analytics-kpis', 'overview'],
    queryFn: () => reportsApi.getAnalyticsKpis(),
    retry: false,
  });

  const dashboards = Array.isArray(dashboardsData)
    ? dashboardsData
    : (dashboardsData?.data?.dashboards || dashboardsData?.data || []);

  const kpiData = kpiResponse?.data || {};
  const rawMetrics = kpiData.metrics || {};
  const comparison = kpiData.comparison || null;
  const meta = kpiData.meta || {};
  const periodLabel = kpiData.period?.label || 'This Month';

  const metrics = {
    totalValue: rawMetrics.pipelineVolume || 0,
    activeDeals: rawMetrics.activeDeals || rawMetrics.pipelineCount || 0,
    winRate: rawMetrics.winRate || 0,
    avgDealSize: rawMetrics.avgDealSize || 0,
    valueChange: comparison?.valueChange ?? null,
    dealsChange: comparison?.dealChange ?? null,
  };

  const buildEmptyStateContext = (title) => ({
    title,
    source: meta.source || 'native',
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: meta.rowCount ?? rawMetrics.pipelineCount ?? 0,
    filters: {
      'Date Range': periodLabel,
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Pipeline Value"
          value={metrics.totalValue ? `$${(metrics.totalValue / 1000000).toFixed(1)}M` : '-'}
          rawValue={metrics.totalValue}
          change={metrics.valueChange}
          icon={DollarSign}
          color="green"
          loading={metricsLoading}
          source="native"
          verifiedStatus={verification.status}
          verifiedReason={verification.reason}
          emptyStateContext={buildEmptyStateContext('Pipeline Value')}
        />
        <StatCard
          title="Active Deals"
          value={metrics.activeDeals || '-'}
          rawValue={metrics.activeDeals}
          change={metrics.dealsChange}
          icon={Target}
          color="blue"
          loading={metricsLoading}
          source="native"
          verifiedStatus={verification.status}
          verifiedReason={verification.reason}
          emptyStateContext={buildEmptyStateContext('Active Deals')}
        />
        <StatCard
          title="Win Rate"
          value={metrics.winRate ? `${metrics.winRate}%` : '-'}
          rawValue={metrics.winRate}
          change={metrics.winRateChange}
          icon={TrendingUp}
          color="indigo"
          loading={metricsLoading}
          source="native"
          verifiedStatus={verification.status}
          verifiedReason={verification.reason}
          emptyStateContext={buildEmptyStateContext('Win Rate')}
        />
        <StatCard
          title="Avg Deal Size"
          value={metrics.avgDealSize ? `$${(metrics.avgDealSize / 1000).toFixed(0)}K` : '-'}
          rawValue={metrics.avgDealSize}
          change={metrics.avgSizeChange}
          icon={Activity}
          color="purple"
          loading={metricsLoading}
          source="native"
          verifiedStatus={verification.status}
          verifiedReason={verification.reason}
          emptyStateContext={buildEmptyStateContext('Avg Deal Size')}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Dashboards</h2>
          <Link
            to="/analytics/dashboards"
            className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            View all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        {dashboardsLoading ? (
          <LoadingSpinner message="Loading dashboards..." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.slice(0, 3).map((dashboard) => (
              <DashboardCard key={dashboard.id} dashboard={dashboard} verification={verification} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
