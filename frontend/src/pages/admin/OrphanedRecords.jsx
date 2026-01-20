import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Link2,
  SkipForward,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Briefcase,
  Calendar,
  Users,
  FileCheck,
  Receipt,
  ClipboardList,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { orphanedRecordsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// Salesforce type labels and icons
const SF_TYPE_CONFIG = {
  WorkOrder: { label: 'Work Orders', icon: Briefcase, color: 'text-blue-600' },
  ServiceAppointment: { label: 'Service Appointments', icon: Calendar, color: 'text-purple-600' },
  Quote: { label: 'Quotes', icon: FileText, color: 'text-green-600' },
  ServiceContract: { label: 'Service Contracts', icon: FileCheck, color: 'text-orange-600' },
  Invoice: { label: 'Invoices', icon: Receipt, color: 'text-red-600' },
  Commission: { label: 'Commissions', icon: Users, color: 'text-yellow-600' },
  Task: { label: 'Tasks', icon: ClipboardList, color: 'text-indigo-600' },
  Case: { label: 'Cases', icon: AlertTriangle, color: 'text-pink-600' },
};

// Status colors and labels
const STATUS_CONFIG = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  REVIEWING: { label: 'Reviewing', color: 'bg-blue-100 text-blue-800', icon: Eye },
  LINKED: { label: 'Linked', color: 'bg-green-100 text-green-800', icon: Link2 },
  SKIPPED: { label: 'Skipped', color: 'bg-gray-100 text-gray-800', icon: SkipForward },
  DELETED: { label: 'Deleted', color: 'bg-red-100 text-red-800', icon: Trash2 },
};

// Orphan reason labels
const REASON_LABELS = {
  NULL_ACCOUNT_ID: 'Missing Account ID',
  INVALID_ACCOUNT_ID: 'Invalid Account ID',
  NULL_OPPORTUNITY_ID: 'Missing Opportunity ID',
  INVALID_OPPORTUNITY_ID: 'Invalid Opportunity ID',
  NULL_CONTACT_ID: 'Missing Contact ID',
  INVALID_CONTACT_ID: 'Invalid Contact ID',
  NULL_WORK_ORDER_ID: 'Missing Work Order ID',
  INVALID_WORK_ORDER_ID: 'Invalid Work Order ID',
  NULL_SERVICE_CONTRACT_ID: 'Missing Service Contract ID',
  INVALID_SERVICE_CONTRACT_ID: 'Invalid Service Contract ID',
  NULL_USER_ID: 'Missing User ID',
  INVALID_USER_ID: 'Invalid User ID',
  MISSING_PARENT: 'Missing Parent Record',
  VALIDATION_ERROR: 'Validation Error',
};

export default function OrphanedRecords() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Filter state
  const [activeTab, setActiveTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(25);

  // Selection state for bulk actions
  const [selectedRecords, setSelectedRecords] = useState(new Set());

  // Modal state
  const [detailModal, setDetailModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState('');

  // Build query params
  const queryParams = {
    page,
    limit,
    ...(activeTab !== 'all' && { salesforceType: activeTab }),
    ...(statusFilter && { status: statusFilter }),
    ...(reasonFilter && { orphanReason: reasonFilter }),
    ...(searchQuery && { search: searchQuery }),
  };

  // Fetch orphaned records
  const { data: recordsData, isLoading, refetch } = useQuery({
    queryKey: ['orphanedRecords', queryParams],
    queryFn: () => orphanedRecordsApi.getRecords(queryParams),
  });

  // Fetch statistics
  const { data: statsData } = useQuery({
    queryKey: ['orphanedRecordsStats'],
    queryFn: () => orphanedRecordsApi.getStats(),
  });

  // Fetch potential matches when link modal is open
  const { data: matchesData, isLoading: matchesLoading } = useQuery({
    queryKey: ['potentialMatches', linkModal?.id],
    queryFn: () => orphanedRecordsApi.getPotentialMatches(linkModal.id),
    enabled: !!linkModal,
  });

  // Mutations
  const linkMutation = useMutation({
    mutationFn: ({ id, linkedRecordId, linkedRecordType }) =>
      orphanedRecordsApi.linkRecord(id, { linkedRecordId, linkedRecordType, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setLinkModal(null);
    },
  });

  const skipMutation = useMutation({
    mutationFn: ({ id, reason }) =>
      orphanedRecordsApi.skipRecord(id, { reason, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setActionModal(null);
      setActionReason('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }) =>
      orphanedRecordsApi.deleteRecord(id, { reason, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setActionModal(null);
      setActionReason('');
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, note }) =>
      orphanedRecordsApi.markForReview(id, { note, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setActionModal(null);
      setActionReason('');
    },
  });

  const bulkSkipMutation = useMutation({
    mutationFn: ({ recordIds, reason }) =>
      orphanedRecordsApi.bulkSkip({ recordIds, reason, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setSelectedRecords(new Set());
      setActionModal(null);
      setActionReason('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ recordIds, reason }) =>
      orphanedRecordsApi.bulkDelete({ recordIds, reason, userId: user?.id }),
    onSuccess: () => {
      queryClient.invalidateQueries(['orphanedRecords']);
      queryClient.invalidateQueries(['orphanedRecordsStats']);
      setSelectedRecords(new Set());
      setActionModal(null);
      setActionReason('');
    },
  });

  const records = recordsData?.data || [];
  const pagination = recordsData?.pagination || { page: 1, pages: 1, total: 0 };
  const stats = statsData?.data || { total: 0, byType: [], byReason: [], byStatus: [] };

  // Toggle record selection
  const toggleSelection = (id) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRecords(newSelected);
  };

  // Select all on current page
  const selectAllOnPage = () => {
    const newSelected = new Set(selectedRecords);
    records.forEach((r) => newSelected.add(r.id));
    setSelectedRecords(newSelected);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedRecords(new Set());
  };

  // Handle action modal submission
  const handleActionSubmit = () => {
    if (!actionModal) return;

    if (actionModal.action === 'skip') {
      if (actionModal.bulk) {
        bulkSkipMutation.mutate({ recordIds: Array.from(selectedRecords), reason: actionReason });
      } else {
        skipMutation.mutate({ id: actionModal.id, reason: actionReason });
      }
    } else if (actionModal.action === 'delete') {
      if (actionModal.bulk) {
        bulkDeleteMutation.mutate({ recordIds: Array.from(selectedRecords), reason: actionReason });
      } else {
        deleteMutation.mutate({ id: actionModal.id, reason: actionReason });
      }
    } else if (actionModal.action === 'review') {
      reviewMutation.mutate({ id: actionModal.id, note: actionReason });
    }
  };

  // Get type count from stats
  const getTypeCount = (type) => {
    const found = stats.byType?.find((t) => t.type === type);
    return found?.count || 0;
  };

  // Get pending count
  const getPendingCount = () => {
    const found = stats.byStatus?.find((s) => s.status === 'PENDING');
    return found?.count || 0;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-7 h-7 text-orange-500" />
              Orphaned Records
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Manage records that couldn't be migrated due to missing relationships
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Orphaned</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total?.toLocaleString() || 0}</p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Review</p>
                <p className="text-2xl font-bold text-yellow-600">{getPendingCount().toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Linked</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats.byStatus?.find((s) => s.status === 'LINKED')?.count?.toLocaleString() || 0}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Skipped/Deleted</p>
                <p className="text-2xl font-bold text-gray-600">
                  {(
                    (stats.byStatus?.find((s) => s.status === 'SKIPPED')?.count || 0) +
                    (stats.byStatus?.find((s) => s.status === 'DELETED')?.count || 0)
                  ).toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <XCircle className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Type Tabs */}
      <div className="px-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex -mb-px">
              <button
                onClick={() => {
                  setActiveTab('all');
                  setPage(1);
                }}
                className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                All Types ({stats.total?.toLocaleString() || 0})
              </button>
              {Object.entries(SF_TYPE_CONFIG).map(([type, config]) => {
                const count = getTypeCount(type);
                if (count === 0) return null;
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setActiveTab(type);
                      setPage(1);
                    }}
                    className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 ${
                      activeTab === type
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    {config.label} ({count.toLocaleString()})
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, number, or Salesforce ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                <option key={status} value={status}>
                  {config.label}
                </option>
              ))}
            </select>

            {/* Reason Filter */}
            <select
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">All Reasons</option>
              {Object.entries(REASON_LABELS).map(([reason, label]) => (
                <option key={reason} value={reason}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Bulk Actions */}
          {selectedRecords.size > 0 && (
            <div className="p-4 bg-orange-50 border-b border-orange-200 flex items-center gap-4">
              <span className="text-sm text-orange-800 font-medium">
                {selectedRecords.size} record{selectedRecords.size !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={() => setActionModal({ action: 'skip', bulk: true })}
                className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 flex items-center gap-1"
              >
                <SkipForward className="w-4 h-4" />
                Bulk Skip
              </button>
              <button
                onClick={() => setActionModal({ action: 'delete', bulk: true })}
                className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Bulk Delete
              </button>
              <button onClick={clearSelection} className="text-sm text-orange-600 hover:text-orange-800">
                Clear Selection
              </button>
            </div>
          )}

          {/* Records Table */}
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" />
                <p className="text-gray-500 mt-2">Loading records...</p>
              </div>
            ) : records.length === 0 ? (
              <div className="p-12 text-center">
                <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto" />
                <p className="text-gray-500 mt-2">No orphaned records found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        onChange={(e) => (e.target.checked ? selectAllOnPage() : clearSelection())}
                        checked={records.length > 0 && records.every((r) => selectedRecords.has(r.id))}
                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Record
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records.map((record) => {
                    const typeConfig = SF_TYPE_CONFIG[record.salesforceType] || {
                      label: record.salesforceType,
                      icon: FileText,
                      color: 'text-gray-600',
                    };
                    const TypeIcon = typeConfig.icon;
                    const statusConfig = STATUS_CONFIG[record.status] || STATUS_CONFIG.PENDING;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr key={record.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record.id)}
                            onChange={() => toggleSelection(record.id)}
                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {record.recordName || record.recordNumber || 'Unnamed Record'}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">{record.salesforceId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                            <span className="text-sm text-gray-700">{typeConfig.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">
                            {REASON_LABELS[record.orphanReason] || record.orphanReason}
                          </span>
                          {record.missingFieldName && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Field: {record.missingFieldName}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(record.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDetailModal(record)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {record.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => setLinkModal(record)}
                                  className="p-1.5 text-green-500 hover:text-green-700 hover:bg-green-50 rounded"
                                  title="Link to Record"
                                >
                                  <Link2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setActionModal({ id: record.id, action: 'review' })}
                                  className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                                  title="Mark for Review"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setActionModal({ id: record.id, action: 'skip' })}
                                  className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                                  title="Skip"
                                >
                                  <SkipForward className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setActionModal({ id: record.id, action: 'delete' })}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(pagination.page - 1) * limit + 1} to{' '}
                {Math.min(pagination.page * limit, pagination.total)} of {pagination.total.toLocaleString()}{' '}
                records
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page === pagination.pages}
                  className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Orphaned Record Details</h2>
              <button
                onClick={() => setDetailModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Record Name</p>
                    <p className="font-medium">{detailModal.recordName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Record Number</p>
                    <p className="font-medium">{detailModal.recordNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Salesforce ID</p>
                    <p className="font-mono text-sm">{detailModal.salesforceId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Salesforce Type</p>
                    <p className="font-medium">{detailModal.salesforceType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Orphan Reason</p>
                    <p className="font-medium">
                      {REASON_LABELS[detailModal.orphanReason] || detailModal.orphanReason}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Missing Field</p>
                    <p className="font-medium">{detailModal.missingFieldName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Missing Value</p>
                    <p className="font-mono text-sm">{detailModal.missingFieldValue || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_CONFIG[detailModal.status]?.color || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {STATUS_CONFIG[detailModal.status]?.label || detailModal.status}
                    </span>
                  </div>
                </div>

                {detailModal.resolvedBy && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">Resolved By</p>
                    <p className="font-medium">
                      {detailModal.resolvedBy.firstName} {detailModal.resolvedBy.lastName}
                    </p>
                    <p className="text-sm text-gray-500">{detailModal.resolvedBy.email}</p>
                    {detailModal.resolvedAt && (
                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(detailModal.resolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {detailModal.salesforceData && (
                  <div className="mt-4">
                    <p className="text-sm text-gray-500 mb-2">Original Salesforce Data</p>
                    <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
                      {JSON.stringify(detailModal.salesforceData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Link to CRM Record</h2>
              <button
                onClick={() => setLinkModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="font-medium text-orange-800">{linkModal.recordName || linkModal.recordNumber}</p>
                <p className="text-sm text-orange-600 mt-1">
                  {REASON_LABELS[linkModal.orphanReason] || linkModal.orphanReason}
                </p>
              </div>

              <h3 className="font-medium text-gray-900 mb-3">Potential Matches</h3>

              {matchesLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-500 mx-auto" />
                  <p className="text-sm text-gray-500 mt-2">Searching for matches...</p>
                </div>
              ) : matchesData?.data?.potentialMatches?.length > 0 ? (
                <div className="space-y-2">
                  {matchesData.data.potentialMatches.map((match) => (
                    <div
                      key={match.id}
                      className="p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 cursor-pointer transition-colors"
                      onClick={() => {
                        linkMutation.mutate({
                          id: linkModal.id,
                          linkedRecordId: match.id,
                          linkedRecordType: 'Account',
                        });
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{match.name}</p>
                          <p className="text-sm text-gray-500">
                            {match.billingStreet}, {match.billingCity}, {match.billingState}
                          </p>
                          {match.phone && <p className="text-sm text-gray-500">{match.phone}</p>}
                        </div>
                        <ArrowRight className="w-5 h-5 text-green-500" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  <p>No potential matches found</p>
                  <p className="text-sm mt-1">You may need to create the parent record first</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Modal (Skip, Delete, Review) */}
      {actionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {actionModal.action === 'skip' && (actionModal.bulk ? 'Bulk Skip Records' : 'Skip Record')}
                {actionModal.action === 'delete' &&
                  (actionModal.bulk ? 'Bulk Delete Records' : 'Delete Record')}
                {actionModal.action === 'review' && 'Mark for Review'}
              </h2>
            </div>
            <div className="p-6">
              {actionModal.bulk && (
                <p className="text-sm text-gray-600 mb-4">
                  This will affect {selectedRecords.size} selected record
                  {selectedRecords.size !== 1 ? 's' : ''}.
                </p>
              )}
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {actionModal.action === 'review' ? 'Note (optional)' : 'Reason (optional)'}
              </label>
              <textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder={
                  actionModal.action === 'review'
                    ? 'Add a note about why this needs review...'
                    : 'Enter a reason...'
                }
              />
            </div>
            <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => {
                  setActionModal(null);
                  setActionReason('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleActionSubmit}
                disabled={
                  skipMutation.isPending ||
                  deleteMutation.isPending ||
                  reviewMutation.isPending ||
                  bulkSkipMutation.isPending ||
                  bulkDeleteMutation.isPending
                }
                className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
                  actionModal.action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : actionModal.action === 'review'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {(skipMutation.isPending ||
                  deleteMutation.isPending ||
                  reviewMutation.isPending ||
                  bulkSkipMutation.isPending ||
                  bulkDeleteMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                {actionModal.action === 'skip' && 'Skip'}
                {actionModal.action === 'delete' && 'Delete'}
                {actionModal.action === 'review' && 'Mark for Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
