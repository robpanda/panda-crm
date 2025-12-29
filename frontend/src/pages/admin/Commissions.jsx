import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  Filter,
  Download,
  ChevronDown,
  Check,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
  Eye,
  Edit2,
  Pause,
  Ban,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { commissionsApi, usersApi } from '../../services/api';

const STATUS_CONFIG = {
  NEW: { color: 'bg-gray-100 text-gray-700', icon: Clock, label: 'New' },
  REQUESTED: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Requested' },
  APPROVED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Approved' },
  HOLD: { color: 'bg-orange-100 text-orange-700', icon: Pause, label: 'On Hold' },
  PAID: { color: 'bg-blue-100 text-blue-700', icon: DollarSign, label: 'Paid' },
  DENIED: { color: 'bg-red-100 text-red-700', icon: Ban, label: 'Denied' },
};

const TYPE_LABELS = {
  PRE_COMMISSION: 'Pre-Commission',
  BACK_END: 'Back-End',
  SELF_GEN: 'Self-Gen',
  COMPANY_LEAD: 'Company Lead',
  SUPPLEMENT_OVERRIDE: 'Supplement Override',
  PM_COMMISSION: 'PM Commission',
  SALES_OP_COMMISSION: 'Sales Op',
};

export default function Commissions() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCommissions, setSelectedCommissions] = useState([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState(null);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const limit = 20;

  // Fetch commissions
  const { data: commissionsData, isLoading, refetch } = useQuery({
    queryKey: ['commissions', page, statusFilter, typeFilter, ownerFilter, searchTerm],
    queryFn: () => commissionsApi.getCommissions({
      page,
      limit,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      ownerId: ownerFilter || undefined,
      search: searchTerm || undefined,
    }),
  });

  // Fetch summary stats
  const { data: summary } = useQuery({
    queryKey: ['commissions-summary'],
    queryFn: () => commissionsApi.getSummary(),
  });

  // Fetch users for dropdown
  const { data: users } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes, reason }) => commissionsApi.updateStatus(id, status, notes, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: ({ commissionIds, status, notes, reason }) =>
      commissionsApi.bulkUpdateStatus(commissionIds, status, notes, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setSelectedCommissions([]);
      setShowBulkStatusModal(false);
      setBulkStatus('');
      setBulkNotes('');
      setBulkReason('');
    },
  });

  const updateCommissionMutation = useMutation({
    mutationFn: ({ id, data }) => commissionsApi.updateCommission(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setShowEditModal(false);
    },
  });

  const commissions = commissionsData?.data || [];
  const pagination = commissionsData?.pagination || { total: 0, totalPages: 1 };

  const handleStatusChange = (id, newStatus, notes = '', reason = '') => {
    updateStatusMutation.mutate({ id, status: newStatus, notes, reason });
  };

  const handleBulkStatusUpdate = () => {
    if (!bulkStatus || selectedCommissions.length === 0) return;
    bulkUpdateMutation.mutate({
      commissionIds: selectedCommissions,
      status: bulkStatus,
      notes: bulkNotes,
      reason: bulkReason,
    });
  };

  const toggleSelect = (id) => {
    setSelectedCommissions(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedCommissions.length === commissions.length) {
      setSelectedCommissions([]);
    } else {
      setSelectedCommissions(commissions.map(c => c.id));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const StatCard = ({ icon: Icon, label, value, subValue, color }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
      <div className="flex items-center space-x-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{value}</p>
          {subValue && <p className="text-xs text-gray-400">{subValue}</p>}
        </div>
      </div>
    </div>
  );

  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.NEW;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  // Detail Modal
  const DetailModal = () => {
    if (!selectedCommission) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Commission Details</h2>
              <button onClick={() => setShowDetailModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-6 space-y-6">
            {/* Status */}
            <div className="flex items-center justify-between">
              <StatusBadge status={selectedCommission.status} />
              <span className="text-sm text-gray-500">
                Created: {formatDate(selectedCommission.createdAt)}
              </span>
            </div>

            {/* Owner */}
            <div>
              <label className="text-sm text-gray-500">Commission Owner</label>
              <div className="flex items-center mt-1">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                  {selectedCommission.owner?.fullName?.split(' ').map(n => n[0]).join('') || '?'}
                </div>
                <div className="ml-3">
                  <p className="font-medium">{selectedCommission.owner?.fullName || 'Unknown'}</p>
                  <p className="text-sm text-gray-500">{selectedCommission.owner?.email}</p>
                </div>
              </div>
            </div>

            {/* Commission Details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Type</label>
                <p className="font-medium">{TYPE_LABELS[selectedCommission.type] || selectedCommission.type}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Rate</label>
                <p className="font-medium">{selectedCommission.commissionRate}%</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Base Value</label>
                <p className="font-medium">{formatCurrency(selectedCommission.commissionValue)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Commission Amount</label>
                <p className="font-semibold text-green-600">{formatCurrency(selectedCommission.commissionAmount)}</p>
              </div>
            </div>

            {/* Related Records */}
            {(selectedCommission.opportunity || selectedCommission.serviceContract) && (
              <div className="border-t border-gray-100 pt-4">
                <h3 className="font-medium mb-3">Related Records</h3>
                {selectedCommission.opportunity && (
                  <div className="p-3 bg-gray-50 rounded-lg mb-2">
                    <p className="text-sm text-gray-500">Job</p>
                    <p className="font-medium">{selectedCommission.opportunity.name}</p>
                    {selectedCommission.opportunity.account && (
                      <p className="text-sm text-gray-500">{selectedCommission.opportunity.account.name}</p>
                    )}
                  </div>
                )}
                {selectedCommission.serviceContract && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Service Contract</p>
                    <p className="font-medium">{selectedCommission.serviceContract.name || selectedCommission.serviceContract.contractNumber}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {selectedCommission.notes && (
              <div className="border-t border-gray-100 pt-4">
                <label className="text-sm text-gray-500">Notes</label>
                <p className="mt-1 whitespace-pre-wrap">{selectedCommission.notes}</p>
              </div>
            )}

            {/* Timeline */}
            <div className="border-t border-gray-100 pt-4">
              <h3 className="font-medium mb-3">Timeline</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span>{formatDate(selectedCommission.createdAt)}</span>
                </div>
                {selectedCommission.requestedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Requested</span>
                    <span>{formatDate(selectedCommission.requestedDate)}</span>
                  </div>
                )}
                {selectedCommission.approvedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Approved</span>
                    <span>{formatDate(selectedCommission.approvedDate)}</span>
                  </div>
                )}
                {selectedCommission.paidDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Paid</span>
                    <span>{formatDate(selectedCommission.paidDate)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-gray-100 flex justify-between">
            <button
              onClick={() => {
                setShowDetailModal(false);
                setShowEditModal(true);
              }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Edit2 className="w-4 h-4 inline mr-2" />
              Edit
            </button>
            <div className="space-x-2">
              {selectedCommission.status === 'NEW' && (
                <button
                  onClick={() => handleStatusChange(selectedCommission.id, 'REQUESTED')}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
                >
                  Request
                </button>
              )}
              {selectedCommission.status === 'REQUESTED' && (
                <>
                  <button
                    onClick={() => handleStatusChange(selectedCommission.id, 'APPROVED')}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleStatusChange(selectedCommission.id, 'HOLD')}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
                  >
                    Hold
                  </button>
                </>
              )}
              {selectedCommission.status === 'APPROVED' && (
                <button
                  onClick={() => handleStatusChange(selectedCommission.id, 'PAID')}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Mark Paid
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Edit Modal
  const EditModal = () => {
    const [editData, setEditData] = useState({
      commissionValue: selectedCommission?.commissionValue || '',
      commissionRate: selectedCommission?.commissionRate || '',
      notes: selectedCommission?.notes || '',
      status: selectedCommission?.status || 'NEW',
    });

    if (!selectedCommission) return null;

    const calculatedAmount = editData.commissionValue && editData.commissionRate
      ? (parseFloat(editData.commissionValue) * parseFloat(editData.commissionRate) / 100).toFixed(2)
      : 0;

    const handleSave = () => {
      updateCommissionMutation.mutate({
        id: selectedCommission.id,
        data: {
          commissionValue: parseFloat(editData.commissionValue),
          commissionRate: parseFloat(editData.commissionRate),
          notes: editData.notes,
          status: editData.status,
        },
      });
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-lg w-full">
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Edit Commission</h2>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={editData.status}
                onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              >
                {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Commission Value ($)</label>
                <input
                  type="number"
                  value={editData.commissionValue}
                  onChange={(e) => setEditData({ ...editData, commissionValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editData.commissionRate}
                  onChange={(e) => setEditData({ ...editData, commissionRate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600">Calculated Commission Amount:</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(calculatedAmount)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                placeholder="Add notes..."
              />
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 flex justify-end space-x-2">
            <button
              onClick={() => setShowEditModal(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={updateCommissionMutation.isPending}
              className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {updateCommissionMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Bulk Status Modal
  const BulkStatusModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Bulk Update Status</h2>
            <button onClick={() => setShowBulkStatusModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-gray-600">
            Update status for {selectedCommissions.length} selected commission{selectedCommissions.length > 1 ? 's' : ''}.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            >
              <option value="">Select Status...</option>
              {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          {(bulkStatus === 'HOLD' || bulkStatus === 'DENIED') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {bulkStatus === 'HOLD' ? 'Hold Reason' : 'Denial Reason'}
              </label>
              <input
                type="text"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                placeholder="Enter reason..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
              placeholder="Add notes..."
            />
          </div>
        </div>
        <div className="p-6 border-t border-gray-100 flex justify-end space-x-2">
          <button
            onClick={() => setShowBulkStatusModal(false)}
            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleBulkStatusUpdate}
            disabled={!bulkStatus || bulkUpdateMutation.isPending}
            className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {bulkUpdateMutation.isPending ? 'Updating...' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Commission Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Review, approve, and manage sales commissions
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => refetch()}
            className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={Clock}
          label="New"
          value={summary?.byStatus?.NEW?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.NEW?.amount)}
          color="bg-gray-100 text-gray-600"
        />
        <StatCard
          icon={AlertCircle}
          label="Requested"
          value={summary?.byStatus?.REQUESTED?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.REQUESTED?.amount)}
          color="bg-yellow-100 text-yellow-600"
        />
        <StatCard
          icon={CheckCircle}
          label="Approved"
          value={summary?.byStatus?.APPROVED?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.APPROVED?.amount)}
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={DollarSign}
          label="Paid"
          value={summary?.byStatus?.PAID?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.PAID?.amount)}
          color="bg-blue-100 text-blue-600"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search commissions..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Status</option>
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <option key={key} value={key}>{val.label}</option>
            ))}
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
          >
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([key, val]) => (
              <option key={key} value={key}>{val}</option>
            ))}
          </select>

          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => {
              setOwnerFilter(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white min-w-[150px]"
          >
            <option value="">All Owners</option>
            {users?.map(user => (
              <option key={user.id} value={user.id}>{user.fullName}</option>
            ))}
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedCommissions.length > 0 && (
          <div className="mt-4 flex items-center justify-between p-3 bg-panda-primary/5 rounded-lg">
            <span className="text-sm font-medium text-gray-700">
              {selectedCommissions.length} selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setBulkStatus('APPROVED');
                  setShowBulkStatusModal(true);
                }}
                className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 flex items-center"
              >
                <Check className="w-4 h-4 mr-1" />
                Approve
              </button>
              <button
                onClick={() => {
                  setBulkStatus('PAID');
                  setShowBulkStatusModal(true);
                }}
                className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 flex items-center"
              >
                <DollarSign className="w-4 h-4 mr-1" />
                Mark Paid
              </button>
              <button
                onClick={() => setShowBulkStatusModal(true)}
                className="px-3 py-1.5 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600 flex items-center"
              >
                Change Status
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Commission Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedCommissions.length === commissions.length && commissions.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
                  </td>
                </tr>
              ) : commissions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                    No commissions found
                  </td>
                </tr>
              ) : (
                commissions.map((commission) => (
                  <tr key={commission.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedCommissions.includes(commission.id)}
                        onChange={() => toggleSelect(commission.id)}
                        className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-sm font-medium">
                          {commission.owner?.fullName?.split(' ').map(n => n[0]).join('') || '?'}
                        </div>
                        <span className="ml-3 font-medium text-gray-900">{commission.owner?.fullName || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                        {TYPE_LABELS[commission.type] || commission.type}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-900">
                      {formatCurrency(commission.commissionValue)}
                    </td>
                    <td className="px-4 py-4 text-gray-900">
                      {commission.commissionRate}%
                    </td>
                    <td className="px-4 py-4 font-semibold text-green-600">
                      {formatCurrency(commission.commissionAmount)}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={commission.status} />
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {formatDate(commission.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => {
                            setSelectedCommission(commission);
                            setShowDetailModal(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCommission(commission);
                            setShowEditModal(true);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {commission.status === 'REQUESTED' && (
                          <button
                            onClick={() => handleStatusChange(commission.id, 'APPROVED')}
                            className="p-1.5 text-green-500 hover:text-green-600 hover:bg-green-50 rounded"
                            title="Approve"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {commission.status === 'APPROVED' && (
                          <button
                            onClick={() => handleStatusChange(commission.id, 'PAID')}
                            className="p-1.5 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Mark Paid"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of {pagination.total} results
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="p-2 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showDetailModal && <DetailModal />}
      {showEditModal && <EditModal />}
      {showBulkStatusModal && <BulkStatusModal />}
    </div>
  );
}
