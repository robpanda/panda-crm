import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { deriveDataSource } from '../utils/analyticsSource';
import { toAnalyticsDateParams } from '../utils/analyticsDateRange';
import DataSourceBadge from '../components/analytics/DataSourceBadge';
import VerifiedBadge from '../components/analytics/VerifiedBadge';
import {
  GlobalDateRangePicker,
  KPICard,
  BarChartWidget,
} from '../components/reports';
import {
  Target,
  DollarSign,
  FileText,
  Plus,
  Star,
  BarChart3,
  LayoutGrid,
  List,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';

export default function Reports({ embedded = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });
  const [activeTab, setActiveTab] = useState('dashboard');
  const [savedView, setSavedView] = useState('grid');
  const [savedPageSize, setSavedPageSize] = useState(25);
  const [savedPage, setSavedPage] = useState(1);
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };

  const reportTabParam = searchParams.get('reportTab');
  const categoryParam = searchParams.get('category');

  useEffect(() => {
    if (reportTabParam && reportTabParam !== activeTab) {
      setActiveTab(reportTabParam);
      return;
    }
    if (categoryParam && activeTab !== 'saved') {
      setActiveTab('saved');
    }
  }, [reportTabParam, categoryParam, activeTab]);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    const storedView = typeof window !== 'undefined' ? window.localStorage.getItem('reportsSavedView') : null;
    if (storedView === 'grid' || storedView === 'list') {
      setSavedView(storedView);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('reportsSavedView', savedView);
  }, [activeTab, savedView]);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    setSavedPage(1);
  }, [activeTab, savedPageSize]);

  const analyticsDateParams = useMemo(() => toAnalyticsDateParams(dateRange), [dateRange]);

  const { data: kpiResponse, isLoading: kpiLoading } = useQuery({
    queryKey: ['analytics-kpis', analyticsDateParams],
    queryFn: () => reportsApi.getAnalyticsKpis(analyticsDateParams),
    retry: false,
  });

  const { data: pipelineResponse, isLoading: pipelineLoading } = useQuery({
    queryKey: ['analytics-pipeline', analyticsDateParams],
    queryFn: () => reportsApi.getPipelineMetrics(analyticsDateParams),
    retry: false,
  });

  const { data: performanceResponse, isLoading: performanceLoading } = useQuery({
    queryKey: ['analytics-performance', analyticsDateParams],
    queryFn: () => reportsApi.getPerformanceMetrics(analyticsDateParams, {
      groupBy: 'ownerId',
      metric: 'sum',
      field: 'amount',
      limit: 10,
    }),
    retry: false,
  });

  const { data: stateResponse, isLoading: stateLoading } = useQuery({
    queryKey: ['analytics-states', analyticsDateParams],
    queryFn: () => reportsApi.getStateMetrics(analyticsDateParams, {
      entity: 'opportunities',
      metric: 'count',
    }),
    retry: false,
  });

  const { data: leadMetricsResponse, isLoading: leadLoading } = useQuery({
    queryKey: ['analytics-leads', analyticsDateParams],
    queryFn: () => reportsApi.getLeadMetrics(analyticsDateParams),
    retry: false,
  });

  const kpiData = kpiResponse?.data || {};
  const kpiMetrics = kpiData.metrics || {};
  const kpiMeta = kpiData.meta || {};

  const pipelineData = pipelineResponse?.data || {};

  const stageChartData = useMemo(() => {
    const stages = pipelineData.byStage || [];
    return stages.map((stage) => ({
      name: stage.stage || 'Unknown',
      count: stage.count || 0,
      value: stage.value || 0,
    }));
  }, [pipelineData]);

  const repChartData = useMemo(() => {
    const reps = performanceResponse?.data?.results || [];
    return reps.map((rep) => ({
      name: rep.label || rep.key || 'Unassigned',
      count: rep.count || 0,
      value: rep.totalValue || 0,
    }));
  }, [performanceResponse]);

  const stateChartData = useMemo(() => {
    const states = stateResponse?.data?.states || [];
    return states.map((state) => ({
      name: state.state || 'Unknown',
      count: state.count || 0,
      value: state.value || 0,
    }));
  }, [stateResponse]);

  const leadMetrics = leadMetricsResponse?.data || {};
  const leadStatusCounts = useMemo(() => {
    return (leadMetrics.byStatus || []).reduce((acc, item) => {
      const key = item.status || 'UNKNOWN';
      acc[key] = item.count || 0;
      return acc;
    }, {});
  }, [leadMetrics]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
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
      LAST_YEAR: 'Last Year',
      ROLLING_7: 'Rolling 7 Days',
      ROLLING_30: 'Rolling 30 Days',
      ROLLING_90: 'Rolling 90 Days',
      ROLLING_365: 'Rolling 365 Days',
    };
    return labels[dateRange.preset] || dateRange.preset || 'Custom Range';
  };

  const buildEmptyStateContext = (title, extra = {}) => ({
    title,
    source: kpiMeta.source || 'native',
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: kpiMeta.rowCount ?? kpiMetrics.pipelineCount ?? 0,
    filters: {
      'Date Range': getDateRangeLabel(),
    },
    ...extra,
  });

  const isLoading = kpiLoading || pipelineLoading || performanceLoading || stateLoading || leadLoading;
  const isAdmin =
    user?.role?.roleType?.toLowerCase?.() === 'admin' ||
    user?.role?.roleType?.toLowerCase?.() === 'super_admin' ||
    user?.roleType?.toLowerCase?.() === 'admin' ||
    user?.roleType?.toLowerCase?.() === 'super_admin';

  const { data: savedReportsData, isLoading: savedReportsLoading } = useQuery({
    queryKey: ['saved-reports', 'reports-page', savedPage, savedPageSize, isAdmin],
    queryFn: () => reportsApi.getSavedReports({
      limit: savedPageSize,
      offset: (savedPage - 1) * savedPageSize,
      includeAll: isAdmin ? 'true' : undefined,
    }),
    enabled: activeTab === 'saved',
  });

  const savedReports = Array.isArray(savedReportsData)
    ? savedReportsData
    : (savedReportsData?.data?.reports || savedReportsData?.data || []);
  const savedPagination = savedReportsData?.data?.pagination || {};
  const savedTotal = savedPagination.total ?? savedReports.length;
  const savedTotalPages = Math.max(1, Math.ceil(savedTotal / savedPageSize));
  const savedStart = savedTotal === 0 ? 0 : (savedPage - 1) * savedPageSize + 1;
  const savedEnd = Math.min(savedPage * savedPageSize, savedTotal);

  useEffect(() => {
    if (activeTab !== 'saved') return;
    if (savedPage > savedTotalPages) {
      setSavedPage(savedTotalPages);
    }
  }, [activeTab, savedPage, savedTotalPages]);

  return (
    <div className="space-y-6">
      {/* Header - hidden when embedded */}
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
            <p className="text-gray-500">Track performance and business metrics</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <GlobalDateRangePicker
              value={dateRange}
              onChange={setDateRange}
              showComparison={true}
            />
            <button
              onClick={() => navigate('/analytics/reports/new')}
              className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 transition-opacity shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Report</span>
            </button>
            <button
              onClick={() => navigate('/analytics/reports/advanced/new')}
              className="flex items-center space-x-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Advanced Editor</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          !embedded ? { id: 'dashboards', label: 'Dashboards', icon: LayoutGrid, link: '/analytics/dashboards' } : null,
          { id: 'saved', label: 'Saved Reports', icon: FileText },
          { id: 'favorites', label: 'Favorites', icon: Star },
        ].filter(Boolean).map((tab) => {
          const Icon = tab.icon;
          if (tab.link) {
            return (
              <Link
                key={tab.id}
                to={tab.link}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg transition-all text-gray-600 hover:text-gray-900"
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
              </Link>
            );
          }
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'dashboard' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Pipeline Count"
              value={kpiMetrics.activeDeals || kpiMetrics.pipelineCount || 0}
              format="number"
              icon={Target}
              iconColor="from-blue-500 to-blue-600"
              subtitle={getDateRangeLabel()}
              source={kpiMeta.source || 'native'}
              verifiedStatus={verification.status}
              verifiedReason={verification.reason}
              emptyStateContext={buildEmptyStateContext('Pipeline Count')}
            />
            <KPICard
              title="Pipeline Volume"
              value={kpiMetrics.pipelineVolume || 0}
              format="currency"
              icon={DollarSign}
              iconColor="from-green-500 to-emerald-600"
              subtitle={getDateRangeLabel()}
              source={kpiMeta.source || 'native'}
              verifiedStatus={verification.status}
              verifiedReason={verification.reason}
              emptyStateContext={buildEmptyStateContext('Pipeline Volume')}
            />
            <KPICard
              title="Balance Due"
              value={kpiMetrics.balanceDue || 0}
              format="currency"
              icon={DollarSign}
              iconColor="from-purple-500 to-purple-600"
              subtitle={getDateRangeLabel()}
              source={kpiMeta.source || 'native'}
              verifiedStatus={verification.status}
              verifiedReason={verification.reason}
              emptyStateContext={buildEmptyStateContext('Balance Due')}
            />
            <KPICard
              title="Jobs on Hold"
              value={kpiMetrics.onHoldCount || 0}
              format="number"
              icon={Target}
              iconColor="from-orange-500 to-orange-600"
              subtitle={getDateRangeLabel()}
              source={kpiMeta.source || 'native'}
              verifiedStatus={verification.status}
              verifiedReason={verification.reason}
              emptyStateContext={buildEmptyStateContext('Jobs on Hold')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BarChartWidget
              data={stageChartData}
              dataKey="count"
              nameKey="name"
              title="Pipeline by Status"
              subtitle={getDateRangeLabel()}
              layout="vertical"
              height={350}
              emptyStateContext={buildEmptyStateContext('Pipeline by Status', { rowCount: stageChartData.length })}
            />
            <BarChartWidget
              data={repChartData}
              dataKey="value"
              nameKey="name"
              title="Pipeline by Sales Rep"
              subtitle="Top 10 by volume"
              formatValue={formatCurrency}
              layout="vertical"
              height={350}
              emptyStateContext={buildEmptyStateContext('Pipeline by Sales Rep', { rowCount: repChartData.length })}
            />
          </div>
        </>
      )}

      {activeTab === 'saved' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Saved Reports</h2>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Rows</span>
                <select
                  value={savedPageSize}
                  onChange={(event) => setSavedPageSize(parseInt(event.target.value, 10))}
                  className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
                >
                  {[25, 50, 100].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{savedStart}-{savedEnd} of {savedTotal}</span>
                <button
                  type="button"
                  onClick={() => setSavedPage((prev) => Math.max(1, prev - 1))}
                  disabled={savedPage === 1 || savedReportsLoading}
                  className="px-2 py-1 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setSavedPage((prev) => Math.min(savedTotalPages, prev + 1))}
                  disabled={savedPage >= savedTotalPages || savedReportsLoading}
                  className="px-2 py-1 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSavedView('grid')}
                  className={`p-2 rounded-lg ${savedView === 'grid' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSavedView('list')}
                  className={`p-2 rounded-lg ${savedView === 'list' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {savedReportsLoading ? (
            <div className="text-sm text-gray-500">Loading saved reports...</div>
          ) : savedReports.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900">No saved reports yet</h3>
              <p className="text-sm text-gray-500 mt-2">Create your first report to get started</p>
              <button
                onClick={() => navigate('/analytics/reports/new')}
                className="mt-4 px-6 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
              >
                Create Report
              </button>
            </div>
          ) : savedView === 'list' ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Report</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Source</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {savedReports.map((report) => (
                    <tr key={report.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{report.name}</div>
                        {report.description && (
                          <div className="text-xs text-gray-500 line-clamp-1">{report.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <DataSourceBadge source={deriveDataSource(report)} />
                      </td>
                      <td className="px-4 py-3">
                        <VerifiedBadge status={verification.status} reason={verification.reason} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => navigate(`/analytics/reports/${report.id}`)}
                          className="text-sm text-indigo-600 hover:text-indigo-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedReports.map((report) => (
                <div key={report.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{report.name}</h3>
                      {report.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">{report.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <DataSourceBadge source={deriveDataSource(report)} />
                    <VerifiedBadge status={verification.status} reason={verification.reason} />
                  </div>
                  <div className="mt-4">
                    <button
                      onClick={() => navigate(`/analytics/reports/${report.id}`)}
                      className="text-sm text-indigo-600 hover:text-indigo-700"
                    >
                      View Report
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <Star className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900">Favorites coming soon</h3>
          <p className="text-sm text-gray-500">Pin key reports to access them quickly.</p>
        </div>
      )}
    </div>
  );
}
