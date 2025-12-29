import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLORS = {
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  primary: '#667eea',
  secondary: '#764ba2',
  info: '#06b6d4',
};

export default function GaugeWidget({
  value = 0,
  min = 0,
  max = 100,
  title,
  subtitle,
  format = 'number', // 'number', 'currency', 'percent'
  thresholds = null, // { warning: 50, danger: 25 } - lower is worse
  invertThresholds = false, // if true, higher values are worse
  showTarget = false,
  target = null,
  size = 'medium', // 'small', 'medium', 'large'
  loading = false,
  reportId,  // Optional report ID for "View Report" link
  reportFilter, // Optional filter to apply when navigating
  onClick, // Optional custom click handler
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (reportId) {
      const params = new URLSearchParams();
      if (reportFilter) {
        Object.entries(reportFilter).forEach(([key, val]) => {
          params.set(key, val);
        });
      }
      const queryString = params.toString();
      navigate(`/reports/${reportId}${queryString ? `?${queryString}` : ''}`);
    }
  };

  const isClickable = onClick || reportId;
  // Calculate percentage for gauge
  const percentage = useMemo(() => {
    const range = max - min;
    if (range === 0) return 0;
    return Math.max(0, Math.min(100, ((value - min) / range) * 100));
  }, [value, min, max]);

  // Determine color based on thresholds
  const gaugeColor = useMemo(() => {
    if (!thresholds) return COLORS.primary;

    const { warning, danger } = thresholds;

    if (invertThresholds) {
      // Higher is worse (e.g., error rate)
      if (value >= danger) return COLORS.danger;
      if (value >= warning) return COLORS.warning;
      return COLORS.success;
    } else {
      // Lower is worse (e.g., conversion rate)
      if (value <= danger) return COLORS.danger;
      if (value <= warning) return COLORS.warning;
      return COLORS.success;
    }
  }, [value, thresholds, invertThresholds]);

  // Format the displayed value
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(val);
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat('en-US').format(val);
    }
  };

  // Size configurations
  const sizeConfig = {
    small: { width: 120, strokeWidth: 8, fontSize: 'text-xl', padding: 'p-3' },
    medium: { width: 160, strokeWidth: 10, fontSize: 'text-3xl', padding: 'p-4' },
    large: { width: 200, strokeWidth: 12, fontSize: 'text-4xl', padding: 'p-5' },
  };

  const config = sizeConfig[size] || sizeConfig.medium;
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Target line position (if showing target)
  const targetPercentage = target ? Math.max(0, Math.min(100, ((target - min) / (max - min)) * 100)) : 0;
  const targetAngle = (targetPercentage / 100) * 360 - 90; // Start from top

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse">
        {(title || subtitle) && (
          <div className={config.padding}>
            <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
          </div>
        )}
        <div className={`${config.padding} flex items-center justify-center`}>
          <div
            className="rounded-full bg-gray-100"
            style={{ width: config.width, height: config.width }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); } : undefined}
    >
      {(title || subtitle || reportId) && (
        <div className={`${config.padding} border-b border-gray-100 flex items-start justify-between`}>
          <div>
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {reportId && (
            <ExternalLink className="w-4 h-4 text-gray-400" />
          )}
        </div>
      )}

      <div className={`${config.padding} flex flex-col items-center justify-center`}>
        {/* SVG Gauge */}
        <div className="relative" style={{ width: config.width, height: config.width }}>
          <svg
            width={config.width}
            height={config.width}
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={config.width / 2}
              cy={config.width / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={config.strokeWidth}
            />

            {/* Foreground circle (progress) */}
            <circle
              cx={config.width / 2}
              cy={config.width / 2}
              r={radius}
              fill="none"
              stroke={gaugeColor}
              strokeWidth={config.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-500 ease-out"
            />

            {/* Target marker */}
            {showTarget && target !== null && (
              <line
                x1={config.width / 2}
                y1={config.strokeWidth / 2}
                x2={config.width / 2}
                y2={config.strokeWidth + 4}
                stroke="#374151"
                strokeWidth={3}
                strokeLinecap="round"
                transform={`rotate(${targetAngle + 90}, ${config.width / 2}, ${config.width / 2})`}
              />
            )}
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`${config.fontSize} font-bold text-gray-900`}>
              {formatValue(value)}
            </span>
            {showTarget && target !== null && (
              <span className="text-xs text-gray-500 mt-1">
                Target: {formatValue(target)}
              </span>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Min:</span>
            <span className="font-medium text-gray-600">{formatValue(min)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">Max:</span>
            <span className="font-medium text-gray-600">{formatValue(max)}</span>
          </div>
        </div>

        {/* Threshold indicators */}
        {thresholds && (
          <div className="mt-2 flex items-center justify-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-500">Good</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-gray-500">Warning</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-500">Critical</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
