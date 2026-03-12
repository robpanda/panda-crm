import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyStateDiagnosticsLink from '../../analytics/EmptyStateDiagnosticsLink';

const COLORS = [
  '#667eea', '#764ba2', '#4ade80', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
  '#14b8a6', '#6366f1', '#a855f7', '#22c55e', '#eab308'
];

export default function PieChartWidget({
  data,
  dataKey = 'value',
  nameKey = 'name',
  title,
  subtitle,
  formatValue = (v) => v,
  showLegend = true,
  height = 300,
  innerRadius = 0,  // 0 for pie, >0 for donut
  loading = false,
  reportId,  // Optional report ID for "View Report" link
  reportFilter, // Optional filter to apply when navigating
  emptyStateContext,
}) {
  const navigate = useNavigate();

  const handleViewReport = () => {
    if (!reportId) return;
    const params = new URLSearchParams();
    if (reportFilter) {
      Object.entries(reportFilter).forEach(([key, val]) => {
        params.set(key, val);
      });
    }
    const queryString = params.toString();
    navigate(`/analytics/reports/${reportId}${queryString ? `?${queryString}` : ''}`);
  };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const data = payload[0];
    return (
      <div className="bg-white p-3 rounded-lg shadow-xl border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 mb-1">{data.name}</p>
        <p className="text-sm text-gray-600">
          {formatValue(data.value)} ({data.payload.percentage}%)
        </p>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse">
        {(title || subtitle) && (
          <div className="p-5 border-b border-gray-100">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-1/2" />
          </div>
        )}
        <div className="p-5">
          <div className="h-64 bg-gray-100 rounded-full" />
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {(title || subtitle) && (
          <div className="p-5 border-b border-gray-100">
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
        )}
        <div className="p-5 flex flex-col items-center justify-center h-64 gap-2">
          <p className="text-gray-500 font-medium">No data found</p>
          {emptyStateContext && (
            <EmptyStateDiagnosticsLink context={emptyStateContext} />
          )}
        </div>
      </div>
    );
  }

  // Calculate percentages
  const total = data.reduce((sum, item) => sum + (item[dataKey] || 0), 0);
  const dataWithPercentages = data.map(item => ({
    ...item,
    percentage: total > 0 ? ((item[dataKey] || 0) / total * 100).toFixed(1) : 0
  }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      {(title || subtitle || reportId) && (
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {reportId && (
            <button
              onClick={handleViewReport}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View Report
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="p-5">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={dataWithPercentages}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={height / 2.5}
              fill="#8884d8"
              dataKey={dataKey}
              nameKey={nameKey}
              paddingAngle={2}
            >
              {dataWithPercentages.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {showLegend && (
              <Legend
                wrapperStyle={{ paddingTop: 20 }}
                formatter={(value, entry) => (
                  <span style={{ color: '#374151' }}>
                    {value} ({entry.payload.percentage}%)
                  </span>
                )}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
