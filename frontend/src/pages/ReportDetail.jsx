import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { GlobalDateRangePicker } from '../components/reports';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';
import { deriveDataSource } from '../utils/analyticsSource';
import { toAnalyticsDateParams } from '../utils/analyticsDateRange';
import { formatDateMDY } from '../utils/formatters';
import KPICard from '../components/reports/KPICard';
import BarChartWidget from '../components/reports/charts/BarChartWidget';
import LineChartWidget from '../components/reports/charts/LineChartWidget';
import TableWidget from '../components/reports/charts/TableWidget';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getSavedReport(id);
      const reportData = response?.data || response;
      if (reportData) {
        setReport(reportData);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const runReport = async (reportConfig = report) => {
    if (!reportConfig) return;

    try {
      setRunning(true);
      const params = toAnalyticsDateParams(dateRange);
      const response = await reportsApi.runReport(reportConfig.id, {
        ...params,
        includeComparison: Boolean(dateRange?.comparison),
      });

      if (response?.success || response?.data) {
        setData(response.data || response);
      }
    } catch (error) {
      console.error('Failed to run report:', error);
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async (format) => {
    try {
      const params = toAnalyticsDateParams(dateRange);
      await reportsApi.exportReport(id, format, params);
    } catch (error) {
      console.error('Failed to export report:', error);
    }
  };

  const handleToggleFavorite = async () => {
    try {
      await reportsApi.toggleFavorite(id);
      setReport(prev => ({ ...prev, isFavorite: !prev.isFavorite }));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const dateRangeLabel = useMemo(() => {
    const presets = {
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
    if (dateRange?.preset === 'CUSTOM' && dateRange?.startDate && dateRange?.endDate) {
      return `${formatDateMDY(dateRange.startDate)} - ${formatDateMDY(dateRange.endDate)}`;
    }
    if (dateRange?.preset === 'ROLLING_CUSTOM' && dateRange?.rollingDays) {
      return `Rolling ${dateRange.rollingDays} Days`;
    }
    return presets[dateRange?.preset] || 'Custom Range';
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500 mb-4">Report not found</div>
        <button
          onClick={() => navigate('/analytics/reports')}
          className="text-panda-primary hover:underline"
        >
          Back to Reports
        </button>
      </div>
    );
  }

  const emptyStateContext = {
    title: report?.name || 'Report',
    source: deriveDataSource(report),
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: data?.rowCount ?? data?.rows?.length ?? 0,
    filters: {
      'Date Range': dateRangeLabel,
    },
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/analytics/reports')}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{report.name}</h1>
            <button
              onClick={handleToggleFavorite}
              className={`p-1 rounded ${report.isFavorite ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
            >
              <svg className="w-5 h-5" fill={report.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>
          {report.description && (
            <p className="text-gray-500">{report.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/analytics/reports/${id}/edit`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Edit
          </button>
          <button
            onClick={() => navigate(`/analytics/reports/advanced/${id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Advanced
          </button>
          <div className="relative group">
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
              Export
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 py-1 z-10">
              <button
                onClick={() => handleExport('csv')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                Export as CSV
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              >
                Export as PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GlobalDateRangePicker
              value={dateRange}
              onChange={setDateRange}
              showComparison={true}
            />
          </div>

          <button
            onClick={() => runReport()}
            disabled={running}
            className="px-6 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {running && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            Run Report
          </button>
        </div>
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-6">
          <div className="text-sm text-gray-500">
            Showing data for: {dateRangeLabel}
          </div>

          {report.chartType === 'KPI' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(data.metrics || []).map((metric, index) => (
                <KPICard
                  key={index}
                  title={metric.label}
                  value={metric.value}
                  previousValue={metric.previousValue}
                  format={metric.format || 'number'}
                  emptyStateContext={emptyStateContext}
                />
              ))}
            </div>
          )}

          {report.chartType === 'BAR' && (
            <BarChartWidget
              title={report.name}
              data={data.chartData || []}
              dataKey="value"
              nameKey="name"
              loading={running}
              emptyStateContext={emptyStateContext}
            />
          )}

          {(report.chartType === 'LINE' || report.chartType === 'AREA') && (
            <LineChartWidget
              title={report.name}
              data={data.chartData || []}
              lines={data.series || [{ dataKey: 'value', name: 'Value', color: 'primary' }]}
              xAxisKey="date"
              loading={running}
              showArea={report.chartType === 'AREA'}
              emptyStateContext={emptyStateContext}
            />
          )}

          {report.chartType === 'TABLE' && (
            <TableWidget
              data={data.rows || []}
              columns={(report.selectedFields || []).map((field) => ({ key: field, label: field }))}
              emptyStateContext={emptyStateContext}
              loading={running}
            />
          )}
        </div>
      )}
    </div>
  );
}
