import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  Clock,
  User,
  FileText,
  Edit,
  Trash2,
  Eye,
  Plus,
  LogIn,
  LogOut,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Calendar,
  Database,
  Activity,
  AlertCircle,
} from 'lucide-react';
import api from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

const actionColors = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  BULK_DELETE: 'bg-red-100 text-red-700',
  BULK_UPDATE: 'bg-blue-100 text-blue-700',
  BULK_STATUS_UPDATE: 'bg-blue-100 text-blue-700',
  BULK_STAGE_UPDATE: 'bg-blue-100 text-blue-700',
  BULK_REASSIGN: 'bg-purple-100 text-purple-700',
  VIEW: 'bg-gray-100 text-gray-700',
  EXPORT: 'bg-purple-100 text-purple-700',
  LOGIN: 'bg-teal-100 text-teal-700',
  LOGOUT: 'bg-gray-100 text-gray-700',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
  PASSWORD_RESET: 'bg-yellow-100 text-yellow-700',
};

const actionIcons = {
  CREATE: Plus,
  UPDATE: Edit,
  DELETE: Trash2,
  BULK_DELETE: Trash2,
  BULK_UPDATE: Edit,
  BULK_STATUS_UPDATE: Edit,
  BULK_STAGE_UPDATE: Edit,
  BULK_REASSIGN: User,
  VIEW: Eye,
  EXPORT: Download,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  LOGIN_FAILED: LogIn,
  PASSWORD_RESET: RefreshCw,
};

const tableLabels = {
  accounts: 'Accounts',
  auth: 'Authentication',
  commissions: 'Commissions',
  contacts: 'Contacts',
  invoices: 'Invoices',
  leads: 'Leads',
  opportunities: 'Opportunities',
  orders: 'Orders',
  quotes: 'Quotes',
  roles: 'Roles',
  users: 'Users',
  workorders: 'Work Orders',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateRange, setDateRange] = useState('today');
  const [expandedLog, setExpandedLog] = useState(null);
  const [stats, setStats] = useState({
    today: 0,
    thisWeek: 0,
    totalUsers: 0,
    topAction: '-',
  });
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
  });
  const [filters, setFilters] = useState({
    tables: [],
    actions: [],
    users: [],
  });

  // Calculate date range for API
  const getDateRangeParams = useCallback(() => {
    const now = new Date();
    let startDate, endDate;

    switch (dateRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
        break;
      case 'yesterday':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'thisWeek':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        endDate = now;
        break;
      case 'thisMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'last30':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        endDate = now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = now;
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [dateRange]);

  // Load filter options
  const loadFilters = useCallback(async () => {
    try {
      const response = await api.get('/api/audit/filters');
      if (response.data.success) {
        setFilters(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  }, []);

  // Load audit stats
  const loadStats = useCallback(async () => {
    try {
      const response = await api.get('/api/audit/stats');
      if (response.data.success) {
        const data = response.data.data;

        // Find top action
        const actionCounts = data.actionCounts || {};
        const topAction = Object.entries(actionCounts)
          .sort((a, b) => b[1] - a[1])[0];

        setStats({
          today: data.recentActivity?.last24Hours || 0,
          thisWeek: data.recentActivity?.last7Days || 0,
          totalUsers: data.topUsers?.length || 0,
          topAction: topAction ? topAction[0] : '-',
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  // Load audit logs
  const loadLogs = useCallback(async (resetPagination = false) => {
    try {
      setLoading(true);
      setError(null);

      const { startDate, endDate } = getDateRangeParams();
      const offset = resetPagination ? 0 : pagination.offset;

      const params = {
        startDate,
        endDate,
        limit: pagination.limit,
        offset,
      };

      if (actionFilter !== 'all') {
        params.action = actionFilter;
      }
      if (tableFilter !== 'all') {
        params.tableName = tableFilter;
      }
      if (searchTerm) {
        params.userEmail = searchTerm;
      }

      const response = await api.get('/api/audit/logs', { params });

      if (response.data.success) {
        setLogs(response.data.data || []);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination?.total || 0,
          offset: resetPagination ? 0 : prev.offset,
        }));
      } else {
        throw new Error(response.data.error || 'Failed to load logs');
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, tableFilter, dateRange, searchTerm, pagination.limit, pagination.offset, getDateRangeParams]);

  // Initial load
  useEffect(() => {
    loadFilters();
    loadStats();
  }, [loadFilters, loadStats]);

  // Reload logs when filters change
  useEffect(() => {
    loadLogs(true);
  }, [actionFilter, tableFilter, dateRange]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== '') {
        loadLogs(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleExport = async () => {
    try {
      const { startDate, endDate } = getDateRangeParams();
      const params = {
        startDate,
        endDate,
        format: 'csv',
      };
      if (actionFilter !== 'all') params.action = actionFilter;
      if (tableFilter !== 'all') params.tableName = tableFilter;

      const response = await api.get('/api/audit/export', {
        params,
        responseType: 'blob',
      });

      // Download the file
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export:', err);
      alert('Failed to export audit logs');
    }
  };

  const handleRefresh = () => {
    loadStats();
    loadLogs(true);
  };

  const handlePrevPage = () => {
    if (pagination.offset > 0) {
      setPagination(prev => ({
        ...prev,
        offset: Math.max(0, prev.offset - prev.limit),
      }));
      loadLogs();
    }
  };

  const handleNextPage = () => {
    if (pagination.offset + pagination.limit < pagination.total) {
      setPagination(prev => ({
        ...prev,
        offset: prev.offset + prev.limit,
      }));
      loadLogs();
    }
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const LogDetailPanel = ({ log }) => {
    if (!log) return null;

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">IP Address:</span>
            <span className="ml-2 text-gray-900">{log.ipAddress || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Source:</span>
            <span className="ml-2 text-gray-900 capitalize">{log.source || 'N/A'}</span>
          </div>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">User Agent:</span>
          <p className="mt-1 text-gray-900 text-xs font-mono bg-white p-2 rounded border">
            {log.userAgent || 'N/A'}
          </p>
        </div>

        {Array.isArray(log.changedFields) && log.changedFields.length > 0 && (
          <div>
            <span className="text-sm text-gray-500">Changed Fields:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {log.changedFields.map((field, i) => (
                <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                  {String(field)}
                </span>
              ))}
            </div>
          </div>
        )}

        {(log.oldValues || log.newValues) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {log.oldValues && (
              <div>
                <span className="text-sm text-gray-500">Previous Values:</span>
                <pre className="mt-2 p-3 bg-red-50 text-red-800 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(log.oldValues, null, 2)}
                </pre>
              </div>
            )}
            {log.newValues && (
              <div>
                <span className="text-sm text-gray-500">New Values:</span>
                <pre className="mt-2 p-3 bg-green-50 text-green-800 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(log.newValues, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track all system activity and data changes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-5 h-5 mr-2" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.today.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Today</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.thisWeek.toLocaleString()}</p>
              <p className="text-sm text-gray-500">This Week</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <User className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalUsers}</p>
              <p className="text-sm text-gray-500">Active Users</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Database className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.topAction}</p>
              <p className="text-sm text-gray-500">Top Action</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by user email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="all">All Actions</option>
            <optgroup label="Single Operations">
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </optgroup>
            <optgroup label="Bulk Operations">
              <option value="BULK_DELETE">Bulk Delete</option>
              <option value="BULK_UPDATE">Bulk Update</option>
              <option value="BULK_STATUS_UPDATE">Bulk Status Update</option>
              <option value="BULK_STAGE_UPDATE">Bulk Stage Update</option>
              <option value="BULK_REASSIGN">Bulk Reassign</option>
            </optgroup>
            <optgroup label="Other">
              <option value="VIEW">View</option>
              <option value="EXPORT">Export</option>
              <option value="LOGIN">Login</option>
              <option value="LOGIN_FAILED">Failed Login</option>
            </optgroup>
          </select>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="all">All Objects</option>
            {(filters.tables.length > 0 ? filters.tables : Object.keys(tableLabels)).map((table) => (
              <option key={table} value={table}>
                {tableLabels[table] || table}
              </option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="last30">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Log List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
              <p className="mt-2 text-gray-500">Loading audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p>No audit logs found</p>
              <p className="text-sm mt-1">Try adjusting your filters or date range</p>
            </div>
          ) : (
            logs.map((log) => {
              const ActionIcon = actionIcons[log.action] || Activity;
              const isExpanded = expandedLog === log.id;

              return (
                <div key={log.id} className="p-4">
                  <div
                    className="flex items-start cursor-pointer"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className="flex-shrink-0 mr-4">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </div>

                    <div className={`p-2 rounded-lg mr-4 ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      <ActionIcon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-700'}`}>
                          {log.action}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {tableLabels[log.tableName] || String(log.tableName || 'Unknown')}
                        </span>
                        {log.recordId && (
                          <span className="text-xs text-gray-500 font-mono">
                            {log.recordId}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center text-sm text-gray-500 flex-wrap gap-x-4 gap-y-1">
                        <span className="flex items-center">
                          <User className="w-4 h-4 mr-1" />
                          {log.userEmail || 'System'}
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>
                      {Array.isArray(log.changedFields) && log.changedFields.length > 0 && !isExpanded && (
                        <div className="mt-2 text-xs text-gray-500">
                          Changed: {log.changedFields.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="hidden sm:block text-right text-sm text-gray-500">
                      {formatDateTime(log.createdAt)}
                    </div>
                  </div>

                  {isExpanded && <LogDetailPanel log={log} />}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {pagination.offset + 1} - {Math.min(pagination.offset + logs.length, pagination.total)} of {pagination.total.toLocaleString()} logs
        </p>
        <div className="flex space-x-2">
          <button
            onClick={handlePrevPage}
            disabled={pagination.offset === 0}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button
            onClick={handleNextPage}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
      </div>
    </AdminLayout>
  );
}
