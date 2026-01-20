import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { GlobalDateRangePicker, parseDateRange, KPICard, BarChartWidget, LineChartWidget } from '../components/reports';

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [data, setData] = useState(null);
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customStart, setCustomStart] = useState(null);
  const [customEnd, setCustomEnd] = useState(null);
  const [includeComparison, setIncludeComparison] = useState(false);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const response = await reportsApi.getReport(id);
      if (response.success) {
        setReport(response.data);
        // Auto-run report if it has a default date range
        if (response.data.defaultDateRange) {
          setDateRange(response.data.defaultDateRange);
          runReport(response.data);
        }
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
      const response = await reportsApi.runReport(reportConfig.id, {
        dateRange,
        customStart: dateRange === 'custom' ? customStart : undefined,
        customEnd: dateRange === 'custom' ? customEnd : undefined,
        includeComparison,
      });

      if (response.success) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Failed to run report:', error);
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async (format) => {
    try {
      await reportsApi.exportReport(id, format, { dateRange, customStart, customEnd });
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

  const handleDateRangeChange = (newRange, start, end) => {
    setDateRange(newRange);
    setCustomStart(start);
    setCustomEnd(end);
  };

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
          onClick={() => navigate('/reports')}
          className="text-panda-primary hover:underline"
        >
          Back to Reports
        </button>
      </div>
    );
  }

  const dateRangeInfo = parseDateRange(dateRange, { customStart, customEnd });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={() => navigate('/reports')}
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
            onClick={() => navigate(`/reports/builder/${id}`)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Edit
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
              onChange={handleDateRangeChange}
              customStart={customStart}
              customEnd={customEnd}
            />

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeComparison}
                onChange={(e) => setIncludeComparison(e.target.checked)}
                className="rounded text-panda-primary focus:ring-panda-primary"
              />
              <span className="text-sm text-gray-600">Compare to previous period</span>
            </label>
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
          {/* Date range label */}
          <div className="text-sm text-gray-500">
            Showing data for: {dateRangeInfo.label}
          </div>

          {/* Chart or Table based on report type */}
          {report.chartType === 'KPI' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {data.metrics?.map((metric, index) => (
                <KPICard
                  key={index}
                  title={metric.label}
                  value={metric.value}
                  previousValue={includeComparison ? metric.previousValue : undefined}
                  format={metric.format || 'number'}
                  icon={metric.icon}
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
            />
          )}

          {(report.chartType === 'LINE' || report.chartType === 'AREA') && (
            <LineChartWidget
              title={report.name}
              data={data.chartData || []}
              lines={data.series || [{ dataKey: 'value', name: 'Value', color: '#667eea' }]}
              xAxisKey="date"
              loading={running}
              showArea={report.chartType === 'AREA'}
            />
          )}

          {report.chartType === 'TABLE' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {report.selectedFields.map(field => (
                        <th key={field} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {(data.rows || []).map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        {report.selectedFields.map(field => (
                          <td key={field} className="px-4 py-3 text-sm text-gray-900">
                            {row[field] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {(!data.rows || data.rows.length === 0) && (
                      <tr>
                        <td colSpan={report.selectedFields.length} className="px-4 py-8 text-center text-gray-500">
                          No data found for the selected criteria
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {data.rows && data.rows.length > 0 && (
                <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
                  Showing {data.rows.length} rows
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!data && !running && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Ready to run</h3>
          <p className="text-gray-500 mb-4">Select your filters and click "Run Report" to see results</p>
        </div>
      )}
    </div>
  );
}
