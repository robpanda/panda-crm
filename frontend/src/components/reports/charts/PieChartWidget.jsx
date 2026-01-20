import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  height = 300,
  showLegend = true,
  innerRadius = 0,
  outerRadius = '80%',
  loading = false,
  showLabels = false,
  reportId,  // Optional report ID for "View Report" link
  reportFilter, // Optional filter to apply when navigating
  onSliceClick, // Optional click handler for individual slices
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
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;

    const entry = payload[0];
    const total = data.reduce((sum, item) => sum + (item[dataKey] || 0), 0);
    const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : 0;

    return (
      <div className="bg-white p-3 rounded-lg shadow-xl border border-gray-100">
        <p className="text-sm font-semibold text-gray-900 mb-1">{entry.name}</p>
        <p className="text-sm text-gray-600">
          Value: <span className="font-medium">{formatValue(entry.value)}</span>
        </p>
        <p className="text-sm text-gray-600">
          Share: <span className="font-medium">{percentage}%</span>
        </p>
      </div>
    );
  };

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null; // Don't show labels for small slices
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
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
        <div className="p-5 flex items-center justify-center">
          <div className="w-48 h-48 bg-gray-100 rounded-full" />
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
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              dataKey={dataKey}
              nameKey={nameKey}
              label={showLabels ? renderLabel : false}
              labelLine={false}
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.color || COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {showLegend && (
              <Legend
                layout="vertical"
                align="right"
                verticalAlign="middle"
                iconType="circle"
                iconSize={10}
                formatter={(value, entry) => (
                  <span className="text-sm text-gray-700">{value}</span>
                )}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
