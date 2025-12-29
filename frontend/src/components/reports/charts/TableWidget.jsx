import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ArrowUpDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  emptyMessage = 'No data available',
  compact = false,
  reportId,  // Optional report ID for "View All" link
  reportFilter, // Optional filter to apply when navigating
}) {
  const navigate = useNavigate();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortable) return data || [];

    return [...(data || [])].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

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
  }, [data, sortConfig, sortable]);

  // Paginate data
  const paginatedData = useMemo(() => {
    if (!showPagination) return sortedData;

    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, showPagination]);

  const totalPages = Math.ceil((sortedData?.length || 0) / pageSize);

  const handleSort = (key) => {
    if (!sortable) return;

    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (key) => {
    if (!sortable) return null;

    if (sortConfig.key !== key) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />;
    }

    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-panda-primary" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-panda-primary" />
    );
  };

  const formatCellValue = (value, column) => {
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

    if (column.format === 'date') {
      return new Date(value).toLocaleDateString();
    }

    if (column.render) {
      return column.render(value);
    }

    return value;
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
    navigate(`/reports/${reportId}${queryString ? `?${queryString}` : ''}`);
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
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 ${compact ? 'py-2' : 'py-3'} text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                    sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => handleSort(column.key)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {getSortIcon(column.key)}
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
                  {emptyMessage}
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
                      {formatCellValue(row[column.key], column)}
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
