import { useState, useEffect } from 'react';
import {
  Search,
  Download,
  Filter,
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
} from 'lucide-react';
import api from '../../services/api';

const actionColors = {
  CREATE: 'bg-green-100 text-green-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  VIEW: 'bg-gray-100 text-gray-700',
  EXPORT: 'bg-purple-100 text-purple-700',
  LOGIN: 'bg-teal-100 text-teal-700',
  LOGOUT: 'bg-gray-100 text-gray-700',
  LOGIN_FAILED: 'bg-red-100 text-red-700',
};

const actionIcons = {
  CREATE: Plus,
  UPDATE: Edit,
  DELETE: Trash2,
  VIEW: Eye,
  EXPORT: Download,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  LOGIN_FAILED: LogIn,
};

const tableLabels = {
  accounts: 'Accounts',
  contacts: 'Contacts',
  leads: 'Leads',
  opportunities: 'Opportunities',
  quotes: 'Quotes',
  orders: 'Orders',
  invoices: 'Invoices',
  workorders: 'Work Orders',
  commissions: 'Commissions',
  users: 'Users',
  roles: 'Roles',
  auth: 'Authentication',
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [dateRange, setDateRange] = useState('today');
  const [expandedLog, setExpandedLog] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const stats = {
    today: 342,
    thisWeek: 2156,
    totalUsers: 45,
    topAction: 'UPDATE',
  };

  useEffect(() => {
    loadLogs();
  }, [actionFilter, tableFilter, dateRange]);

  const loadLogs = async () => {
    try {
      // const response = await api.get('/audit', { params: { action: actionFilter, table: tableFilter, dateRange } });
      // setLogs(response.data.logs);
      // Mock data
      setLogs([
        {
          id: '1',
          tableName: 'opportunities',
          recordId: 'opp-12345',
          action: 'UPDATE',
          changedFields: ['stage', 'amount', 'expectedCloseDate'],
          oldValues: { stage: 'Proposal', amount: 15000, expectedCloseDate: '2025-12-20' },
          newValues: { stage: 'Negotiation', amount: 16500, expectedCloseDate: '2025-12-25' },
          userId: 'user-1',
          userEmail: 'john.smith@pandaexteriors.com',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          source: 'web',
          createdAt: '2025-12-18T10:30:00Z',
        },
        {
          id: '2',
          tableName: 'contacts',
          recordId: 'contact-67890',
          action: 'CREATE',
          changedFields: ['firstName', 'lastName', 'email', 'phone'],
          oldValues: null,
          newValues: { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com', phone: '+1234567890' },
          userId: 'user-2',
          userEmail: 'sarah.johnson@pandaexteriors.com',
          ipAddress: '192.168.1.101',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          source: 'web',
          createdAt: '2025-12-18T10:25:00Z',
        },
        {
          id: '3',
          tableName: 'auth',
          recordId: 'mike.davis@pandaexteriors.com',
          action: 'LOGIN',
          changedFields: [],
          oldValues: null,
          newValues: { loginMethod: 'password', mfaUsed: true },
          userId: 'user-3',
          userEmail: 'mike.davis@pandaexteriors.com',
          ipAddress: '192.168.1.102',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
          source: 'auth',
          createdAt: '2025-12-18T10:20:00Z',
        },
        {
          id: '4',
          tableName: 'commissions',
          recordId: 'comm-11111',
          action: 'UPDATE',
          changedFields: ['status'],
          oldValues: { status: 'pending' },
          newValues: { status: 'approved' },
          userId: 'user-4',
          userEmail: 'emily.chen@pandaexteriors.com',
          ipAddress: '192.168.1.103',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          source: 'web',
          createdAt: '2025-12-18T10:15:00Z',
        },
        {
          id: '5',
          tableName: 'accounts',
          recordId: 'acc-22222',
          action: 'EXPORT',
          changedFields: [],
          oldValues: null,
          newValues: { recordCount: 150, format: 'csv', filters: { status: 'active' } },
          userId: 'user-1',
          userEmail: 'john.smith@pandaexteriors.com',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          source: 'web',
          createdAt: '2025-12-18T10:10:00Z',
        },
        {
          id: '6',
          tableName: 'workorders',
          recordId: 'wo-33333',
          action: 'DELETE',
          changedFields: [],
          oldValues: { id: 'wo-33333', status: 'cancelled', description: 'Duplicate work order' },
          newValues: null,
          userId: 'user-3',
          userEmail: 'mike.davis@pandaexteriors.com',
          ipAddress: '192.168.1.102',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
          source: 'web',
          createdAt: '2025-12-18T10:05:00Z',
        },
        {
          id: '7',
          tableName: 'auth',
          recordId: 'unknown@test.com',
          action: 'LOGIN_FAILED',
          changedFields: [],
          oldValues: null,
          newValues: { reason: 'Invalid credentials', attemptCount: 3 },
          userId: null,
          userEmail: 'unknown@test.com',
          ipAddress: '203.0.113.50',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          source: 'auth',
          createdAt: '2025-12-18T10:00:00Z',
        },
      ]);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    // await api.get('/audit/export', { params: { action: actionFilter, table: tableFilter, dateRange }, responseType: 'blob' });
    alert('Exporting audit logs...');
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.recordId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.tableName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesTable = tableFilter === 'all' || log.tableName === tableFilter;
    return matchesSearch && matchesAction && matchesTable;
  });

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
            <span className="ml-2 text-gray-900">{log.ipAddress}</span>
          </div>
          <div>
            <span className="text-gray-500">Source:</span>
            <span className="ml-2 text-gray-900 capitalize">{log.source}</span>
          </div>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">User Agent:</span>
          <p className="mt-1 text-gray-900 text-xs font-mono bg-white p-2 rounded border">{log.userAgent}</p>
        </div>

        {log.changedFields?.length > 0 && (
          <div>
            <span className="text-sm text-gray-500">Changed Fields:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {log.changedFields.map((field, i) => (
                <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded">
                  {field}
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track all system activity and data changes
          </p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center justify-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5 mr-2" />
          <span>Export Logs</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
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
              <p className="text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
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

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by user, record ID..."
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
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="VIEW">View</option>
            <option value="EXPORT">Export</option>
            <option value="LOGIN">Login</option>
            <option value="LOGIN_FAILED">Failed Login</option>
          </select>
          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="all">All Objects</option>
            {Object.entries(tableLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
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
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p>No audit logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
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

                    <div className={`p-2 rounded-lg mr-4 ${actionColors[log.action]}`}>
                      <ActionIcon className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColors[log.action]}`}>
                          {log.action}
                        </span>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {tableLabels[log.tableName] || log.tableName}
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
                          {log.userEmail || 'Unknown'}
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-4 h-4 mr-1" />
                          {formatRelativeTime(log.createdAt)}
                        </span>
                      </div>
                      {log.changedFields?.length > 0 && !isExpanded && (
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

      {/* Pagination would go here */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {filteredLogs.length} of {logs.length} logs
        </p>
        <div className="flex space-x-2">
          <button className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Previous
          </button>
          <button className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
