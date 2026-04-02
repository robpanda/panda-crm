import { useEffect, useState, useMemo, useRef } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyStateDiagnosticsLink from '../../analytics/EmptyStateDiagnosticsLink';
import { formatDateMDY } from '../../../utils/formatters';
import { resolveReportRowLink } from '../../../utils/reportRowLinks';

const ISO_DATE_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;

function isDateLikeValue(value) {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }

  if (typeof value !== 'string' || !ISO_DATE_PREFIX_PATTERN.test(value)) {
    return false;
  }

  return !Number.isNaN(new Date(value).getTime());
}

function hasDisplayValue(value) {
  if (typeof value === 'number') {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return value != null;
}

function getColumnSortKey(column) {
  return column?.sortKey || column?.key;
}

function hasTimelineEntries(value) {
  return Array.isArray(value?.entries) && value.entries.length > 0;
}

function isNumericSummaryFormat(format) {
  return format === 'number' || format === 'currency' || format === 'percent';
}

function formatRecordCount(value) {
  const count = typeof value === 'number' ? value : Number(value) || 0;
  return `${count} ${count === 1 ? 'record' : 'records'}`;
}

function renderTimelineValue(value) {
  if (!hasTimelineEntries(value)) {
    return <span className="text-gray-400">—</span>;
  }

  return (
    <div className="flex min-w-[14rem] flex-wrap gap-1.5">
      {value.entries.map((entry) => (
        <span
          key={entry.key}
          className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
        >
          <span className="font-semibold text-gray-500">{entry.label}</span>
          <span>{isDateLikeValue(entry.value) ? formatDateMDY(entry.value) : String(entry.value)}</span>
        </span>
      ))}
    </div>
  );
}

export default function TableWidget({
  data,
  groups = [],
  columns,
  title,
  subtitle,
  loading = false,
  pageSize = 10,
  showPagination = true,
  sortable = true,
  onRowClick,
  emptyMessage = 'No data available',
  compact = false,
  reportId,  // Optional report ID for "View All" link
  reportFilter, // Optional filter to apply when navigating
  emptyStateContext,
  recordModule,
  currentPage: controlledPage = null,
  totalItems = null,
  onPageChange,
  serverSidePagination = false,
  resizableColumns = false,
  onColumnWidthChange,
}) {
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState({});
  const resizeStateRef = useRef(null);
  const activePage = serverSidePagination ? (controlledPage || 1) : currentPage;

  const isColumnSortable = (column) => sortable && column?.sortable !== false;
  const isColumnResizable = (column) => resizableColumns && typeof onColumnWidthChange === 'function' && column?.resizable !== false;

  const parsePixelWidth = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized.endsWith('px')) {
      const numeric = Number(normalized.slice(0, -2));
      return Number.isFinite(numeric) ? numeric : null;
    }

    if (/^\d+(\.\d+)?$/.test(normalized)) {
      const numeric = Number(normalized);
      return Number.isFinite(numeric) ? numeric : null;
    }

    return null;
  };

  const getColumnStyle = (column) => {
    const style = {};

    if (column?.width != null) {
      style.width = column.width;
    }

    if (column?.minWidth != null) {
      style.minWidth = column.minWidth;
    }

    if (column?.maxWidth != null) {
      style.maxWidth = column.maxWidth;
    }

    return Object.keys(style).length > 0 ? style : undefined;
  };

  const sortRows = (rows = []) => {
    if (!sortConfig.key || !sortable) return rows;

    const activeSortColumn = columns.find((column) => getColumnSortKey(column) === sortConfig.key);
    if (activeSortColumn && !isColumnSortable(activeSortColumn)) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue == null) return 1;
      if (bValue == null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      if (isDateLikeValue(aValue) && isDateLikeValue(bValue)) {
        const aDate = new Date(aValue).getTime();
        const bDate = new Date(bValue).getTime();
        return sortConfig.direction === 'asc' ? aDate - bDate : bDate - aDate;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  };

  useEffect(() => {
    if (!groups.length) {
      return;
    }

    setExpandedGroups((prev) => {
      const nextState = { ...prev };
      groups.forEach((group) => {
        if (!(group.key in nextState)) {
          nextState[group.key] = true;
        }
      });
      return nextState;
    });
  }, [groups]);

  useEffect(() => {
    if (!resizableColumns || typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerMove = (event) => {
      if (!resizeStateRef.current) {
        return;
      }

      const nextWidth = Math.min(
        resizeStateRef.current.maxWidth,
        Math.max(
          resizeStateRef.current.minWidth,
          resizeStateRef.current.startWidth + (event.clientX - resizeStateRef.current.startX),
        ),
      );

      onColumnWidthChange?.(resizeStateRef.current.columnKey, nextWidth);
    };

    const handlePointerUp = () => {
      if (!resizeStateRef.current) {
        return;
      }

      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      if (resizeStateRef.current) {
        resizeStateRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, [onColumnWidthChange, resizableColumns]);

  // Sort data
  const sortedData = useMemo(() => sortRows(data || []), [columns, data, sortConfig, sortable]);

  const sortedGroups = useMemo(
    () => groups.map((group) => ({
      ...group,
      rows: sortRows(group.rows || []),
    })),
    [columns, groups, sortConfig, sortable],
  );

  // Paginate data
  const paginatedData = useMemo(() => {
    if (serverSidePagination) {
      return sortedData;
    }

    if (!showPagination) return sortedData;

    const start = (activePage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, activePage, pageSize, serverSidePagination, showPagination]);

  const effectiveTotalItems = serverSidePagination
    ? (typeof totalItems === 'number' ? totalItems : sortedData.length)
    : sortedData.length;
  const totalPages = Math.max(1, Math.ceil((effectiveTotalItems || 0) / pageSize));

  const handleSort = (column) => {
    if (!isColumnSortable(column)) return;

    const key = getColumnSortKey(column);

    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (column) => {
    if (!isColumnSortable(column)) return null;

    const key = getColumnSortKey(column);

    if (sortConfig.key !== key) {
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
      return column.render(value, row, column);
    }

    if (column.format === 'timeline') {
      return renderTimelineValue(value);
    }

    if (value == null) return '-';

    if (column.format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(value);
    }

    if (column.format === 'percent') {
      return `${value.toFixed(1)}%`;
    }

    if (column.format === 'number') {
      return new Intl.NumberFormat('en-US').format(value);
    }

    if (column.format === 'date' || column.format === 'datetime' || isDateLikeValue(value)) {
      return formatDateMDY(value);
    }

    return value;
  };

  const formatSummaryEntryValue = (entry) => {
    if (!entry) {
      return '-';
    }

    if (entry.key === 'rowCount') {
      return formatRecordCount(entry.value);
    }

    return formatCellValue(entry.value, {
      key: entry.key,
      label: entry.label,
      format: entry.format,
    });
  };

  const renderBodyRows = (rows, keyPrefix = 'row') => (
    rows.map((row, rowIndex) => (
      <tr
        key={row.id || `${keyPrefix}-${rowIndex}`}
        className={`border-b border-gray-50 ${
          onRowClick
            ? 'cursor-pointer hover:bg-gray-50'
            : 'hover:bg-gray-25'
        }`}
        onClick={() => onRowClick?.(row)}
      >
        {columns.map((column) => {
          const cellValue = row[column.key];
          const cellContent = formatCellValue(cellValue, column, row);
          const cellHref = resolveReportRowLink(recordModule, row, column);

          return (
            <td
              key={column.key}
              className={`px-4 ${compact ? 'py-2' : 'py-3'} text-sm text-gray-700 ${
                column.format === 'timeline' ? 'align-top' : ''
              }`}
              style={getColumnStyle(column)}
            >
              {cellHref ? (
                <a
                  href={cellHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {cellContent}
                </a>
              ) : (
                cellContent
              )}
            </td>
          );
        })}
      </tr>
    ))
  );

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

  const handlePreviousPage = () => {
    const nextPage = Math.max(1, activePage - 1);
    if (serverSidePagination) {
      onPageChange?.(nextPage);
      return;
    }
    setCurrentPage(nextPage);
  };

  const handleNextPage = () => {
    const nextPage = Math.min(totalPages, activePage + 1);
    if (serverSidePagination) {
      onPageChange?.(nextPage);
      return;
    }
    setCurrentPage(nextPage);
  };

  const paginationStart = effectiveTotalItems > 0 ? ((activePage - 1) * pageSize) + 1 : 0;
  const paginationEnd = effectiveTotalItems > 0
    ? Math.min(paginationStart + paginatedData.length - 1, effectiveTotalItems)
    : 0;
  const tableMinWidth = useMemo(() => {
    const totalWidth = columns.reduce((sum, column) => {
      const parsedWidth = parsePixelWidth(column?.width);
      return sum + (parsedWidth || 0);
    }, 0);

    return totalWidth > 0 ? `${totalWidth}px` : undefined;
  }, [columns]);

  const handleResizeStart = (event, column) => {
    if (!isColumnResizable(column)) {
      return;
    }

    const headerElement = event.currentTarget.closest('th');
    const startWidth = headerElement?.getBoundingClientRect().width
      || parsePixelWidth(column?.width)
      || 180;
    const minWidth = parsePixelWidth(column?.minWidth) || 120;
    const maxWidth = parsePixelWidth(column?.maxWidth) || 640;

    resizeStateRef.current = {
      columnKey: column.key,
      startX: event.clientX,
      startWidth,
      minWidth,
      maxWidth,
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    event.preventDefault();
    event.stopPropagation();
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

      <div className="overflow-x-auto">
        <table className="w-full" style={tableMinWidth ? { minWidth: tableMinWidth } : undefined}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`relative px-4 ${compact ? 'py-2' : 'py-3'} text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                    isColumnSortable(column) ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={getColumnStyle(column)}
                  onClick={() => handleSort(column)}
                >
                  <div className="flex items-center gap-1 pr-2">
                    {column.label}
                    {getSortIcon(column)}
                  </div>
                  {isColumnResizable(column) && (
                    <button
                      type="button"
                      aria-label={`Resize ${column.label} column`}
                      data-column-resize-handle={column.key}
                      onMouseDown={(event) => handleResizeStart(event, column)}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none bg-transparent hover:bg-panda-primary/10"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedGroups.length > 0 ? (
              sortedGroups.flatMap((group) => {
                const isExpanded = expandedGroups[group.key] !== false;

                return [
                  (
                    <tr key={`${group.key}-header`} className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={columns.length} className="px-4 py-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <button
                            type="button"
                            onClick={() => setExpandedGroups((prev) => ({
                              ...prev,
                              [group.key]: !isExpanded,
                            }))}
                            className="flex min-w-0 flex-1 items-start gap-2 text-left"
                          >
                            <span className="pt-0.5">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                                Group
                              </span>
                              <span className="block text-sm font-semibold text-gray-800">
                                {group.label}
                              </span>
                            </span>
                          </button>
                          {Array.isArray(group.summaryEntries) && group.summaryEntries.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                              {group.summaryEntries.map((entry) => (
                                <span
                                  key={`${group.key}-${entry.key}`}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200"
                                >
                                  <span className="text-gray-500">{entry.label}</span>
                                  <span className="text-gray-800">{formatSummaryEntryValue(entry)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ),
                  ...(isExpanded ? renderBodyRows(group.rows || [], group.key) : []),
                  ...(isExpanded && group.totals && Object.keys(group.totals).length > 0
                    ? [
                      (
                        <tr
                          key={`${group.key}-totals`}
                          className="border-b border-gray-100 bg-gray-50/60"
                        >
                          {columns.map((column, columnIndex) => (
                            <td
                              key={column.key}
                              className={`px-4 ${compact ? 'py-2' : 'py-3'} text-sm font-medium text-gray-700`}
                              style={getColumnStyle(column)}
                            >
                              {columnIndex === 0
                                ? `Subtotal • ${formatRecordCount(group.rowCount)}`
                                : (isNumericSummaryFormat(column.format) && Object.prototype.hasOwnProperty.call(group.totals || {}, column.key))
                                  ? formatCellValue(group.totals[column.key], column)
                                  : ''}
                            </td>
                          ))}
                        </tr>
                      ),
                    ]
                    : []),
                ];
              })
            ) : paginatedData.length === 0 ? (
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
              renderBodyRows(paginatedData)
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {showPagination && (serverSidePagination || sortedGroups.length === 0) && totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Showing {paginationStart} to {paginationEnd} of {effectiveTotalItems}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePreviousPage}
              disabled={activePage === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {activePage} of {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={activePage === totalPages}
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
