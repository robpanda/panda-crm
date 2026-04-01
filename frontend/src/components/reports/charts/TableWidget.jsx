import { useEffect, useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, ExternalLink, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyStateDiagnosticsLink from '../../analytics/EmptyStateDiagnosticsLink';
import { getRenderableReportValue } from '../../../utils/reporting';

const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/;

function isDateLikeValue(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  return typeof value === 'string' && ISO_DATE_PREFIX_PATTERN.test(value);
}

function formatDateValue(value) {
  if (typeof value === 'string') {
    const match = value.match(ISO_DATE_PREFIX_PATTERN);
    if (match) {
      const [, year, month, day] = match;
      return `${month}/${day}/${year}`;
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  return value;
}

export default function TableWidget({
  data,
  columns,
  title,
  subtitle,
  loading = false,
  pageSize = 10,
  showPagination = true,
  sortable = true,
  onRowClick,
  emptyMessage = 'No data found',
  compact = false,
  reportId,  // Optional report ID for "View All" link
  reportFilter, // Optional filter to apply when navigating
  emptyStateContext,
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search visible data...',
  filterDefinitions = [],
  filterValues = {},
  onFilterChange,
}) {
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [data, pageSize]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortable) return data || [];

    return [...(data || [])].sort((a, b) => {
      const sortableColumn = columns.find((column) => column.key === sortConfig.key);
      if (sortableColumn?.sortable === false) {
        return 0;
      }

      const aValue = getRenderableReportValue(a[sortConfig.key]);
      const bValue = getRenderableReportValue(b[sortConfig.key]);

      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [columns, data, sortConfig, sortable]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!showPagination) return sortedData;

    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, showPagination]);

  const totalPages = Math.ceil((sortedData?.length || 0) / pageSize);

  const handleSort = (column) => {
    if (!sortable) return;
    if (column?.sortable === false) return;

    setSortConfig((prev) => ({
      key: column.key,
      direction: prev.key === column.key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (column) => {
    if (!sortable || column?.sortable === false) return null;

    if (sortConfig.key !== column.key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    }

    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-panda-primary" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-panda-primary" />
    );
  };

  const formatCellValue = (value, column, row) => {
    if (column.render) {
      return column.render(getRenderableReportValue(value), row);
    }

    if (value == null) {
      return '-';
    }

    const safeValue = getRenderableReportValue(value);

    if (safeValue == null) {
      return '-';
    }

    if (column.format === 'currency') {
      return typeof safeValue === 'number'
        ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(safeValue)
        : safeValue;
    }

    if (column.format === 'percent') {
      return typeof safeValue === 'number' ? `${safeValue.toFixed(1)}%` : safeValue;
    }

    if (column.format === 'number') {
      return typeof safeValue === 'number'
        ? new Intl.NumberFormat('en-US').format(safeValue)
        : safeValue;
    }

    if (column.format === 'date') {
      return formatDateValue(safeValue);
    }

    if (isDateLikeValue(safeValue)) {
      return formatDateValue(safeValue);
    }

    return safeValue;
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
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleViewAll = () => {
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

  const hasFilterBar = filterDefinitions.length > 0 || typeof onSearchChange === 'function';

  const renderFilterControl = (filterDefinition) => {
    const value = filterValues?.[filterDefinition.field];

    if (filterDefinition.type === 'dateRange') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value?.start || ''}
            onChange={(event) => onFilterChange?.(filterDefinition.field, {
              start: event.target.value,
              end: value?.end || '',
            })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={value?.end || ''}
            onChange={(event) => onFilterChange?.(filterDefinition.field, {
              start: value?.start || '',
              end: event.target.value,
            })}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
          />
        </div>
      );
    }

    if (filterDefinition.type === 'multiSelect') {
      return (
        <select
          multiple
          value={Array.isArray(value) ? value : []}
          onChange={(event) => {
            const nextValue = Array.from(event.target.selectedOptions).map((option) => option.value);
            onFilterChange?.(filterDefinition.field, nextValue);
          }}
          className="min-h-24 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
        >
          {filterDefinition.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (filterDefinition.type === 'text') {
      return (
        <input
          type="text"
          value={value || ''}
          onChange={(event) => onFilterChange?.(filterDefinition.field, event.target.value)}
          placeholder={filterDefinition.placeholder}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
        />
      );
    }

    return (
      <select
        value={value || ''}
        onChange={(event) => onFilterChange?.(filterDefinition.field, event.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
      >
        <option value="">All</option>
        {filterDefinition.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };

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
              onClick={handleViewAll}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View All
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {hasFilterBar && (
        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex flex-col gap-4">
            {filterDefinitions.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {filterDefinitions.map((filterDefinition) => (
                  <label key={filterDefinition.field} className="flex min-w-[180px] flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {filterDefinition.label}
                    </span>
                    {renderFilterControl(filterDefinition)}
                  </label>
                ))}
              </div>
            )}

            {typeof onSearchChange === 'function' && (
              <label className="relative max-w-xl">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchValue}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-700 shadow-sm focus:border-panda-primary focus:outline-none focus:ring-2 focus:ring-panda-primary/15"
                />
              </label>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 ${compact ? 'py-2' : 'py-3'} text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                    sortable && column.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => handleSort(column)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {getSortIcon(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <span>{emptyMessage}</span>
                    {emptyStateContext && (
                      <EmptyStateDiagnosticsLink context={emptyStateContext} />
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  className={`border-b border-gray-50 ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-gray-50'
                      : 'hover:bg-gray-25'
                  }`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 ${compact ? 'py-2' : 'py-3'} text-sm text-gray-700`}
                    >
                      {formatCellValue(row[column.key], column, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showPagination && totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
