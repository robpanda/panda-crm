import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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

const DROPDOWN_MIN_WIDTH = 288;
const VIEWPORT_PADDING = 16;
const DROPDOWN_OFFSET = 8;
const DROPDOWN_HEADER_HEIGHT = 52;

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
  const [panelStyle, setPanelStyle] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      const target = event.target;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target) ||
        containerRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelStyle(null);
      return;
    }

    const updatePanelPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxAllowedWidth = Math.max(160, viewportWidth - (VIEWPORT_PADDING * 2));
      const width = Math.min(
        Math.max(Math.ceil(rect.width), DROPDOWN_MIN_WIDTH),
        maxAllowedWidth
      );
      const minLeft = VIEWPORT_PADDING;
      const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING);
      const left = Math.min(Math.max(rect.right - width, minLeft), maxLeft);
      const availableBelow = viewportHeight - rect.bottom - VIEWPORT_PADDING;
      const availableAbove = rect.top - VIEWPORT_PADDING;
      const shouldOpenAbove = availableBelow < 280 && availableAbove > availableBelow;
      const maxHeight = Math.max(
        220,
        Math.min(480, shouldOpenAbove ? availableAbove - DROPDOWN_OFFSET : availableBelow - DROPDOWN_OFFSET)
      );

      setPanelStyle({
        position: 'fixed',
        left,
        top: shouldOpenAbove ? rect.top - DROPDOWN_OFFSET : rect.bottom + DROPDOWN_OFFSET,
        width,
        maxHeight,
        transform: shouldOpenAbove ? 'translateY(-100%)' : undefined,
      });
    };

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen, preset, comparisonEnabled, showComparison]);

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

  const dropdownBodyMaxHeight = panelStyle?.maxHeight
    ? Math.max(panelStyle.maxHeight - DROPDOWN_HEADER_HEIGHT, 168)
    : undefined;

  const dropdownPanel = isOpen && panelStyle
    ? createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="z-[100] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
        >
          <div className="px-4 py-3 bg-gradient-to-r from-panda-primary to-panda-secondary">
            <h3 className="text-sm font-semibold text-white">Global Date Range</h3>
          </div>

          <div
            className="overflow-y-auto"
            style={dropdownBodyMaxHeight ? { maxHeight: dropdownBodyMaxHeight } : undefined}
          >
            <div>
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

            {preset === 'ROLLING_CUSTOM' && (
              <div className="p-4 border-t border-gray-100 bg-gray-50">
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Number of Days
                </label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    value={rollingDays}
                    onChange={(e) => setRollingDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
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
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        ref={triggerRef}
        className="flex items-center space-x-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
      >
        <Calendar className="w-4 h-4 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{getDisplayLabel()}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {dropdownPanel}
    </div>
  );
}
