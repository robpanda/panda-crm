import { TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function KPICard({
  title,
  value,
  previousValue,
  format = 'number',  // 'number', 'currency', 'percent'
  icon: Icon,
  iconColor = 'from-blue-500 to-blue-600',
  loading = false,
  subtitle,
  size = 'default', // 'default', 'large', 'small'
  reportId,  // Optional report ID to link to
  reportFilter, // Optional filter to apply when navigating to report
  onClick, // Optional custom click handler
}) {
  const navigate = useNavigate();
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';

    switch (format) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0
        }).format(val);
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        return new Intl.NumberFormat('en-US').format(val);
    }
  };

  const getChange = () => {
    if (!previousValue || previousValue === 0) return null;
    const change = ((value - previousValue) / previousValue) * 100;
    return change;
  };

  const change = getChange();

  const getTrendIcon = () => {
    if (change === null) return null;
    if (change > 0) return <TrendingUp className="w-4 h-4" />;
    if (change < 0) return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  const getTrendColor = () => {
    if (change === null) return 'text-gray-500';
    if (change > 0) return 'text-green-600';
    if (change < 0) return 'text-red-600';
    return 'text-gray-500';
  };

  const getTrendBg = () => {
    if (change === null) return 'bg-gray-100';
    if (change > 0) return 'bg-green-100';
    if (change < 0) return 'bg-red-100';
    return 'bg-gray-100';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
        <div className="h-8 bg-gray-200 rounded w-3/4 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
      </div>
    );
  }

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

  // Size-based classes
  const sizeClasses = {
    small: 'p-3',
    default: 'p-5',
    large: 'p-5',
  };

  const valueSizeClasses = {
    small: 'text-xl',
    default: 'text-3xl',
    large: 'text-4xl',
  };

  const iconSizeClasses = {
    small: 'w-8 h-8',
    default: 'w-12 h-12',
    large: 'w-14 h-14',
  };

  const iconInnerClasses = {
    small: 'w-4 h-4',
    default: 'w-6 h-6',
    large: 'w-7 h-7',
  };

  return (
    <div
      className={`bg-white rounded-xl ${sizeClasses[size]} shadow-sm border border-gray-100 hover:shadow-md transition-all ${
        isClickable ? 'cursor-pointer hover:border-blue-200 group' : ''
      }`}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleClick() : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-500">{title}</p>
            {isClickable && (
              <ExternalLink className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
          <p className={`${valueSizeClasses[size]} font-bold text-gray-900 mt-1`}>{formatValue(value)}</p>

          {/* Trend indicator */}
          {change !== null && (
            <div className={`inline-flex items-center space-x-1 mt-2 px-2 py-1 rounded-full text-xs font-medium ${getTrendBg()} ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{Math.abs(change).toFixed(1)}%</span>
              <span className="text-gray-400 font-normal">vs prev</span>
            </div>
          )}

          {/* Subtitle */}
          {subtitle && !change && (
            <p className="text-xs text-gray-400 mt-2">{subtitle}</p>
          )}
        </div>

        {/* Icon */}
        {Icon && (
          <div className={`${iconSizeClasses[size]} rounded-xl bg-gradient-to-br ${iconColor} flex items-center justify-center flex-shrink-0 shadow-lg`}>
            <Icon className={`${iconInnerClasses[size]} text-white`} />
          </div>
        )}
      </div>
    </div>
  );
}
