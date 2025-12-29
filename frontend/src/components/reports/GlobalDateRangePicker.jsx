import { useState, useRef, useEffect } from 'react';
import {
  format,
  subDays,
  subWeeks,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  parseISO
} from 'date-fns';
import { Calendar, ChevronDown, Check } from 'lucide-react';

// AccuLynx-style date range presets
const PRESETS = [
  { label: 'All Data', value: 'ALL_DATA' },
  { label: 'Today', value: 'TODAY' },
  { label: 'Yesterday', value: 'YESTERDAY' },
  { label: 'This Week (Sun)', value: 'THIS_WEEK' },
  { label: 'Last Week (Sun)', value: 'LAST_WEEK' },
  { label: 'This Month', value: 'THIS_MONTH' },
  { label: 'Last Month', value: 'LAST_MONTH' },
  { label: 'This Year', value: 'THIS_YEAR' },
  { label: 'Last Year', value: 'LAST_YEAR' },
  { label: 'Rolling 7 Days', value: 'ROLLING_7' },
  { label: 'Rolling 30 Days', value: 'ROLLING_30' },
  { label: 'Rolling 90 Days', value: 'ROLLING_90' },
  { label: 'Rolling 365 Days', value: 'ROLLING_365' },
  { label: 'Rolling Days', value: 'ROLLING_CUSTOM' },
  { label: 'Custom', value: 'CUSTOM' },
];

export function parseDateRange(range) {
  if (typeof range === 'object' && range.startDate && range.endDate) {
    return {
      startDate: startOfDay(new Date(range.startDate)),
      endDate: endOfDay(new Date(range.endDate)),
    };
  }

  const now = new Date();
  const preset = typeof range === 'string' ? range : range?.preset;

  switch (preset) {
    case 'TODAY':
      return { startDate: startOfDay(now), endDate: endOfDay(now) };

    case 'YESTERDAY':
      const yesterday = subDays(now, 1);
      return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };

    case 'THIS_WEEK':
      // Week starting Sunday
      return {
        startDate: startOfWeek(now, { weekStartsOn: 0 }),
        endDate: endOfWeek(now, { weekStartsOn: 0 })
      };

    case 'LAST_WEEK':
      const lastWeek = subWeeks(now, 1);
      return {
        startDate: startOfWeek(lastWeek, { weekStartsOn: 0 }),
        endDate: endOfWeek(lastWeek, { weekStartsOn: 0 })
      };

    case 'THIS_MONTH':
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };

    case 'LAST_MONTH':
      const lastMonth = subMonths(now, 1);
      return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };

    case 'THIS_YEAR':
      return { startDate: startOfYear(now), endDate: endOfYear(now) };

    case 'LAST_YEAR':
      const lastYear = subYears(now, 1);
      return { startDate: startOfYear(lastYear), endDate: endOfYear(lastYear) };

    case 'ROLLING_7':
      return { startDate: startOfDay(subDays(now, 7)), endDate: endOfDay(now) };

    case 'ROLLING_30':
      return { startDate: startOfDay(subDays(now, 30)), endDate: endOfDay(now) };

    case 'ROLLING_90':
      return { startDate: startOfDay(subDays(now, 90)), endDate: endOfDay(now) };

    case 'ROLLING_365':
      return { startDate: startOfDay(subDays(now, 365)), endDate: endOfDay(now) };

    case 'ALL_DATA':
    default:
      // Return null dates for all data - let the API handle it
      return { startDate: null, endDate: null };
  }
}

export default function GlobalDateRangePicker({
  value,
  onChange,
  showComparison = false,
  className = ''
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [preset, setPreset] = useState(value?.preset || 'THIS_MONTH');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rollingDays, setRollingDays] = useState(30);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonType, setComparisonType] = useState('PREVIOUS_PERIOD');
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync with external value
  useEffect(() => {
    if (value?.preset) {
      setPreset(value.preset);
    }
    if (value?.startDate && value?.endDate) {
      setCustomStart(value.startDate);
      setCustomEnd(value.endDate);
    }
  }, [value]);

  const handlePresetSelect = (presetValue) => {
    setPreset(presetValue);

    if (presetValue === 'ROLLING_CUSTOM') {
      // Don't close, show rolling days input
      return;
    }

    if (presetValue === 'CUSTOM') {
      // Don't close, show custom date inputs
      return;
    }

    onChange({
      preset: presetValue,
      comparison: comparisonEnabled ? comparisonType : null,
    });
    setIsOpen(false);
  };

  const handleRollingDaysApply = () => {
    const dates = {
      startDate: format(subDays(new Date(), rollingDays), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
    };
    onChange({
      preset: 'ROLLING_CUSTOM',
      ...dates,
      rollingDays,
      comparison: comparisonEnabled ? comparisonType : null,
    });
    setIsOpen(false);
  };

  const handleCustomApply = () => {
    if (!customStart || !customEnd) return;

    onChange({
      preset: 'CUSTOM',
      startDate: customStart,
      endDate: customEnd,
      comparison: comparisonEnabled ? comparisonType : null,
    });
    setIsOpen(false);
  };

  const getDisplayLabel = () => {
    if (preset === 'CUSTOM' && customStart && customEnd) {
      return `${format(new Date(customStart), 'MMM d, yyyy')} - ${format(new Date(customEnd), 'MMM d, yyyy')}`;
    }
    if (preset === 'ROLLING_CUSTOM') {
      return `Rolling ${rollingDays} Days`;
    }
    return PRESETS.find(p => p.value === preset)?.label || 'Select Date Range';
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{getDisplayLabel()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-panda-primary to-panda-secondary">
            <h3 className="text-sm font-semibold text-white">Global Date Range</h3>
          </div>

          {/* Preset Options */}
          <div className="max-h-80 overflow-y-auto">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePresetSelect(p.value)}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  preset === p.value ? 'bg-blue-50 text-panda-primary' : 'text-gray-700'
                }`}
              >
                <span className="text-sm">{p.label}</span>
                {preset === p.value && <Check className="w-4 h-4 text-panda-primary" />}
              </button>
            ))}
          </div>

          {/* Rolling Days Input */}
          {preset === 'ROLLING_CUSTOM' && (
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Number of Days
              </label>
              <div className="flex space-x-2">
                <input
                  type="number"
                  value={rollingDays}
                  onChange={(e) => setRollingDays(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="1000"
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
                <button
                  onClick={handleRollingDaysApply}
                  className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Custom Date Range */}
          {preset === 'CUSTOM' && (
            <div className="p-4 border-t border-gray-100 bg-gray-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleCustomApply}
                  disabled={!customStart || !customEnd}
                  className="w-full px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Custom Range
                </button>
              </div>
            </div>
          )}

          {/* Comparison Toggle */}
          {showComparison && (
            <div className="p-4 border-t border-gray-100">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={comparisonEnabled}
                  onChange={(e) => setComparisonEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-panda-primary focus:ring-panda-primary border-gray-300"
                />
                <span className="text-sm text-gray-700">Compare to previous period</span>
              </label>
              {comparisonEnabled && (
                <select
                  value={comparisonType}
                  onChange={(e) => setComparisonType(e.target.value)}
                  className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-panda-primary"
                >
                  <option value="PREVIOUS_PERIOD">Previous Period</option>
                  <option value="SAME_PERIOD_LAST_YEAR">Same Period Last Year</option>
                </select>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
