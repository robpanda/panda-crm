import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = [
  '#667eea', '#764ba2', '#4ade80', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
  '#14b8a6', '#6366f1', '#a855f7', '#22c55e', '#eab308'
];

export default function BarChartWidget({
  data,
  dataKey = 'value',
  nameKey = 'name',
  comparisonDataKey = null,
  title,
  subtitle,
  formatValue = (v) => v,
  layout = 'horizontal',  // 'horizontal' or 'vertical'
  showLegend = false,
  height = 300,
  colorByIndex = true,
  barColor = '#667eea',
  loading = false,
  reportId,  // Optional report ID for "View Report" link
  reportFilter, // Optional filter to apply when navigating
  onBarClick, // Optional click handler for individual bars
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
    navigate(`/reports/${reportId}${queryString ? `?${queryString}` : ''}`);
  };
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    return (
      <div className="bg-white p-3 rounded-lg shadow-xl border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-medium">{formatValue(entry.value)}</span>
          </p>
        ))}
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
          <div className="h-64 bg-gray-100 rounded" />
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
        <div className="p-5 flex items-center justify-center h-64">
          <p className="text-gray-400">No data available</p>
        </div>
      </div>
    );
  }

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
          <BarChart
            data={data}
            layout={layout === 'vertical' ? 'vertical' : 'horizontal'}
            margin={{ top: 10, right: 30, left: layout === 'vertical' ? 100 : 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            {layout === 'vertical' ? (
              <>
                <XAxis type="number" tickFormatter={formatValue} tick={{ fontSize: 12 }} />
                <YAxis
                  dataKey={nameKey}
                  type="category"
                  width={90}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                />
              </>
            ) : (
              <>
                <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} />
              </>
            )}
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend />}

            <Bar
              dataKey={dataKey}
              name="Current"
              radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={50}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={colorByIndex ? COLORS[index % COLORS.length] : barColor}
                />
              ))}
            </Bar>

            {comparisonDataKey && (
              <Bar
                dataKey={comparisonDataKey}
                name="Previous"
                fill="#d1d5db"
                radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={50}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
