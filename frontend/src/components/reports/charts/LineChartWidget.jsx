import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = {
  primary: '#667eea',
  secondary: '#764ba2',
  success: '#4ade80',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#8b5cf6',
};

export default function LineChartWidget({
  data,
  lines = [{ dataKey: 'value', name: 'Value', color: 'primary' }],
  xAxisKey = 'date',
  title,
  subtitle,
  formatValue = (v) => v,
  formatXAxis = (v) => {
    try {
      return format(parseISO(v), 'MMM d');
    } catch {
      return v;
    }
  },
  height = 300,
  showArea = false,
  showDots = true,
  showGrid = true,
  loading = false,
  reportId,  // Optional report ID for "View Report" link
  reportFilter, // Optional filter to apply when navigating
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

    let formattedLabel = label;
    try {
      formattedLabel = format(parseISO(label), 'MMM d, yyyy');
    } catch {
      // Keep original label if not a valid date
    }

    return (
      <div className="bg-white p-3 rounded-lg shadow-xl border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 mb-2">{formattedLabel}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center space-x-2 text-sm">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}:</span>
            <span className="font-medium text-gray-900">{formatValue(entry.value)}</span>
          </div>
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

  const ChartComponent = showArea ? AreaChart : LineChart;

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
          <ChartComponent data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis
              dataKey={xAxisKey}
              tickFormatter={formatXAxis}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tickFormatter={formatValue}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: 20 }}
              iconType="circle"
              iconSize={8}
            />

            {lines.map((line) => {
              const strokeColor = COLORS[line.color] || line.color || COLORS.primary;

              if (showArea) {
                return (
                  <Area
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={strokeColor}
                    fill={`${strokeColor}20`}
                    strokeWidth={2}
                    dot={showDots ? { r: 3, fill: strokeColor } : false}
                    activeDot={{ r: 5, fill: strokeColor }}
                  />
                );
              }

              return (
                <Line
                  key={line.dataKey}
                  type="monotone"
                  dataKey={line.dataKey}
                  name={line.name}
                  stroke={strokeColor}
                  strokeWidth={2}
                  dot={showDots ? { r: 3, fill: strokeColor } : false}
                  activeDot={{ r: 5, fill: strokeColor }}
                />
              );
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
