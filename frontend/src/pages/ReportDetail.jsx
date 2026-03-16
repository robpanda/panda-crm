import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Calendar, Copy, Pencil, Play, Star, Trash2 } from 'lucide-react';
import { reportsApi } from '../services/api';
import { GlobalDateRangePicker } from '../components/reports';
import TableWidget from '../components/reports/charts/TableWidget';
import PresentationWidgets from '../components/reports/PresentationWidgets';
import DataSourceBadge from '../components/analytics/DataSourceBadge';
import VerifiedBadge from '../components/analytics/VerifiedBadge';
import { useAnalyticsBadgeContext } from '../components/analytics/AnalyticsBadgeContext';
import { deriveDataSource } from '../utils/analyticsSource';
import { toAnalyticsDateParams } from '../utils/analyticsDateRange';
import {
  buildDuplicateReportPayload,
  formatReportTimestamp,
  getReportCreatedByLabel,
  normalizeReportConfig,
  normalizeReportRunResult,
  getReportTablesUsed,
  formatReportFieldLabel,
} from '../utils/reporting';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const analyticsBadges = useAnalyticsBadgeContext();
  const verification = analyticsBadges?.verification || { status: 'unknown', reason: 'Verification unavailable.' };

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [payload, setPayload] = useState(null);
  const [dateRange, setDateRange] = useState({ preset: 'THIS_MONTH' });

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

    return presets[dateRange?.preset] || 'Custom Range';
  }, [dateRange]);

  useEffect(() => {
    loadReport();
  }, [id]);

  useEffect(() => {
    if (searchParams.get('run') !== '1' || !report) return;

    runReport(report).finally(() => {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('run');
      setSearchParams(nextParams, { replace: true });
    });
  }, [report, searchParams, setSearchParams]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getSavedReport(id);
      setReport(normalizeReportConfig(response));
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

      setPayload(response);
      setReport((prev) => ({
        ...prev,
        lastRunAt: new Date().toISOString(),
      }));
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
      setReport((prev) => ({ ...prev, isFavorite: !prev.isFavorite }));
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleDuplicate = async () => {
    if (!report) return;

    try {
      const duplicate = await reportsApi.createReport(buildDuplicateReportPayload(report));
      navigate(`/analytics/reports/${duplicate.id}`);
    } catch (error) {
      console.error('Failed to duplicate report:', error);
    }
  };

  const handleDelete = async () => {
    if (!report || !window.confirm(`Delete "${report.name}"?`)) return;

    try {
      await reportsApi.deleteReport(report.id);
      navigate('/analytics/reports');
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };

  const safeReport = report || {};
  const emptyStateContext = {
    title: safeReport.name,
    source: deriveDataSource(safeReport),
    verifiedStatus: verification.status,
    verifiedReason: verification.reason,
    failedChecks: verification.failedChecks || [],
    rowCount: 0,
    filters: {
      'Date Range': dateRangeLabel,
      Tables: getReportTablesUsed(safeReport).join(', '),
    },
  };

  const normalizedResult = useMemo(
    () => normalizeReportRunResult(safeReport, payload),
    [payload, safeReport]
  );

  const tableColumns = useMemo(() => {
    const sample = normalizedResult.rows?.[0] || {};
    return Object.keys(sample).map((key) => ({
      key,
      label: formatReportFieldLabel(key),
    }));
  }, [normalizedResult.rows]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/analytics/reports')}
              className="text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Back to Library
            </button>
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`rounded-lg p-2 transition-colors ${
                report.isFavorite ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-300 hover:bg-gray-50 hover:text-amber-500'
              }`}
            >
              <Star className="h-5 w-5" fill={report.isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">{report.name}</h1>
            {report.description && <p className="mt-2 text-gray-500">{report.description}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Data source</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <DataSourceBadge source={deriveDataSource(report)} />
                <VerifiedBadge status={verification.status} reason={verification.reason} />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tables used</div>
              <div className="mt-2 text-gray-900">{getReportTablesUsed(report).join(', ')}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Last run</div>
              <div className="mt-2 text-gray-900">{formatReportTimestamp(report.lastRunAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Created by</div>
              <div className="mt-2 text-gray-900">{getReportCreatedByLabel(report)}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runReport()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Run
          </button>
          <button
            type="button"
            onClick={() => navigate(`/analytics/reports/${id}/edit`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => navigate(`/analytics/reports/${id}/edit?mode=advanced`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-4 w-4" />
            Advanced
          </button>
          <button
            type="button"
            onClick={() => navigate(`/analytics/schedules?reportId=${id}`)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Calendar className="h-4 w-4" />
            Schedule
          </button>
          <button
            type="button"
            onClick={handleDuplicate}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-4 w-4" />
            Duplicate
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="group relative">
            <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Export
            </button>
            <div className="absolute right-0 top-full z-10 mt-2 hidden min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg group-hover:block">
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as CSV
              </button>
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Export as PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <GlobalDateRangePicker
            value={dateRange}
            onChange={setDateRange}
            showComparison={true}
          />
          <div className="text-sm text-gray-500">Showing results for {dateRangeLabel}</div>
        </div>
      </div>

      {payload ? (
        <div className="space-y-6">
          <PresentationWidgets
            report={report}
            payload={payload}
            emptyStateContext={emptyStateContext}
          />
          <TableWidget
            title={report.name}
            subtitle={payload?.data?.results?.period || payload?.results?.period || null}
            data={normalizedResult.rows}
            columns={tableColumns}
            loading={running}
            pageSize={12}
            emptyStateContext={emptyStateContext}
            emptyMessage="No data found"
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <Play className="mx-auto h-10 w-10 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">Run this report to load results</h3>
          <p className="mt-2 text-sm text-gray-500">
            The saved configuration is ready. Use the Run button to execute it for the selected date range.
          </p>
        </div>
      )}
    </div>
  );
}
