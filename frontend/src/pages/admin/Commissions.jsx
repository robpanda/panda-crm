import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
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
  ChevronUp,
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
  FileText,
  History,
  Bookmark,
  XCircle,
  PieChart,
  Layers,
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
  BONUS: 'Bonus',
};

// Colors for donut chart segments
const TYPE_COLORS = {
  PRE_COMMISSION: '#8B5CF6',     // Purple
  BACK_END: '#3B82F6',           // Blue
  SELF_GEN: '#10B981',           // Green
  COMPANY_LEAD: '#F59E0B',       // Amber
  SUPPLEMENT_OVERRIDE: '#EC4899', // Pink
  PM_COMMISSION: '#6366F1',      // Indigo
  SALES_OP_COMMISSION: '#14B8A6', // Teal
  BONUS: '#EF4444',              // Red
};

const STATUS_COLORS = {
  NEW: '#6B7280',      // Gray
  REQUESTED: '#F59E0B', // Amber
  APPROVED: '#10B981',  // Green
  HOLD: '#F97316',      // Orange
  PAID: '#3B82F6',      // Blue
  DENIED: '#EF4444',    // Red
};

// Donut Chart Component
const DonutChart = ({ segments, size = 120, strokeWidth = 14 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let cumulativePercent = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
        />
        {/* Segment circles */}
        {segments.map((segment, index) => {
          const percent = total > 0 ? (segment.value / total) * 100 : 0;
          const strokeDasharray = circumference;
          const strokeDashoffset = circumference - (percent / 100) * circumference;
          const rotation = (cumulativePercent / 100) * 360;
          cumulativePercent += percent;

          return (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: '50% 50%',
                transition: 'stroke-dashoffset 0.5s ease',
              }}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{total}</span>
        <span className="text-xs text-gray-500">Total</span>
      </div>
    </div>
  );
};

// Simple Single Value Donut
const SingleDonutChart = ({ value, total, color, size = 80 }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900">{value}</span>
      </div>
    </div>
  );
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
  const [showPayrollReport, setShowPayrollReport] = useState(false);
  const [sortField, setSortField] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [activeView, setActiveView] = useState(''); // Track which saved view is active
  const limit = 20;

  // Saved view configurations
  const SAVED_VIEWS = {
    preCommissionRequested: {
      label: 'Pre-Commission Requested',
      filters: { status: 'REQUESTED', type: 'PRE_COMMISSION' },
      color: 'bg-purple-100 text-purple-700 border-purple-300',
    },
    approvedUnpaid: {
      label: 'Approved - Unpaid',
      filters: { status: 'APPROVED' },
      color: 'bg-green-100 text-green-700 border-green-300',
    },
    pendingApproval: {
      label: 'Pending Approval',
      filters: { status: 'REQUESTED' },
      color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    },
    onHold: {
      label: 'On Hold',
      filters: { status: 'HOLD' },
      color: 'bg-orange-100 text-orange-700 border-orange-300',
    },
    backEndRequested: {
      label: 'Back-End Requested',
      filters: { status: 'REQUESTED', type: 'BACK_END' },
      color: 'bg-indigo-100 text-indigo-700 border-indigo-300',
    },
    selfGenPending: {
      label: 'Self-Gen Pending',
      filters: { status: 'REQUESTED', type: 'SELF_GEN' },
      color: 'bg-cyan-100 text-cyan-700 border-cyan-300',
    },
  };

  // Apply a saved view
  const applySavedView = (viewKey) => {
    if (activeView === viewKey) {
      // If clicking the same view, clear filters
      clearFilters();
    } else {
      const view = SAVED_VIEWS[viewKey];
      if (view) {
        setStatusFilter(view.filters.status || '');
        setTypeFilter(view.filters.type || '');
        setActiveView(viewKey);
        setPage(1);
      }
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('');
    setTypeFilter('');
    setOwnerFilter('');
    setSearchTerm('');
    setActiveView('');
    setPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = statusFilter || typeFilter || ownerFilter || searchTerm;

  // Fetch commissions
  const { data: commissionsData, isLoading, refetch } = useQuery({
    queryKey: ['commissions', page, statusFilter, typeFilter, ownerFilter, searchTerm, sortField, sortDirection],
    queryFn: () => commissionsApi.getCommissions({
      page,
      limit,
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      ownerId: ownerFilter || undefined,
      search: searchTerm || undefined,
      sortBy: sortField,
      sortOrder: sortDirection,
    }),
  });

  // Fetch summary stats
  const { data: summary } = useQuery({
    queryKey: ['commissions-summary'],
    queryFn: () => commissionsApi.getSummary(),
  });

  // Fetch payroll changes for Payroll Change Report
  const { data: payrollChangesData, isLoading: payrollChangesLoading } = useQuery({
    queryKey: ['payroll-changes'],
    queryFn: () => commissionsApi.getPayrollChanges(),
    enabled: showPayrollReport,
  });
  // Ensure payrollChanges is always an array
  const payrollChanges = Array.isArray(payrollChangesData) ? payrollChangesData : [];

  // Fetch users for dropdown
  const { data: usersResponse } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
  });
  // Extract users array from response - handles both {success, data} and direct array formats
  const users = Array.isArray(usersResponse) ? usersResponse : (usersResponse?.data || []);

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

  // Dedicated bulk approve mutation (per Scribehow workflow)
  const bulkApproveMutation = useMutation({
    mutationFn: ({ commissionIds, notes }) => commissionsApi.bulkApprove(commissionIds, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setSelectedCommissions([]);
      setShowBulkStatusModal(false);
      setBulkNotes('');
    },
  });

  // Dedicated bulk pay mutation (per Scribehow workflow)
  // Sets status=PAID, paidDate=Today, paidAmount=requestedAmount
  const bulkPayMutation = useMutation({
    mutationFn: ({ commissionIds, notes }) => commissionsApi.bulkPay(commissionIds, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setSelectedCommissions([]);
      setShowBulkStatusModal(false);
      setBulkNotes('');
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

  // Ensure commissions is always an array (handles different API response formats)
  const commissionsRaw = commissionsData?.data || commissionsData || [];
  const commissions = Array.isArray(commissionsRaw) ? commissionsRaw : [];
  const pagination = commissionsData?.pagination || { total: 0, totalPages: 1 };

  const handleStatusChange = (id, newStatus, notes = '', reason = '') => {
    updateStatusMutation.mutate({ id, status: newStatus, notes, reason });
  };

  const handleBulkStatusUpdate = () => {
    if (!bulkStatus || selectedCommissions.length === 0) return;

    // Use dedicated endpoints for APPROVED and PAID per Scribehow workflow
    if (bulkStatus === 'APPROVED') {
      bulkApproveMutation.mutate({
        commissionIds: selectedCommissions,
        notes: bulkNotes,
      });
    } else if (bulkStatus === 'PAID') {
      // Per Scribehow: Sets status=PAID, paidDate=Today, paidAmount=requestedAmount
      bulkPayMutation.mutate({
        commissionIds: selectedCommissions,
        notes: bulkNotes,
      });
    } else {
      // Generic status update for other statuses
      bulkUpdateMutation.mutate({
        commissionIds: selectedCommissions,
        status: bulkStatus,
        notes: bulkNotes,
        reason: bulkReason,
      });
    }
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

  // Handle column sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setPage(1); // Reset to first page when sorting changes
  };

  // Sortable column header component
  const SortableHeader = ({ field, label }) => {
    const isActive = sortField === field;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center space-x-1">
          <span>{label}</span>
          {isActive ? (
            sortDirection === 'asc' ? (
              <ChevronUp className="w-4 h-4 text-panda-primary" />
            ) : (
              <ChevronDown className="w-4 h-4 text-panda-primary" />
            )
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-300" />
          )}
        </div>
      </th>
    );
  };

  const StatCard = ({ icon: Icon, label, value, subValue, color, onClick, isActive }) => (
    <div
      className={`bg-white rounded-xl shadow-sm border p-4 sm:p-6 cursor-pointer transition-all hover:shadow-md ${
        isActive ? 'border-panda-primary ring-2 ring-panda-primary/20' : 'border-gray-100 hover:border-gray-200'
      }`}
      onClick={onClick}
    >
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

  // Mutation for updating paid amount (per Scribehow workflow)
  const updatePaidAmountMutation = useMutation({
    mutationFn: ({ id, paidAmount, notes }) => commissionsApi.updatePaidAmount(id, paidAmount, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setShowEditModal(false);
    },
  });

  // Mutation for reverting manual override
  const revertOverrideMutation = useMutation({
    mutationFn: (id) => commissionsApi.revertOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setShowEditModal(false);
    },
  });

  // Edit Modal - Enhanced with Paid Amount editing and Manual Override per Scribehow workflow
  const EditModal = () => {
    const [editData, setEditData] = useState({
      commissionValue: selectedCommission?.commissionValue || '',
      commissionRate: selectedCommission?.commissionRate || '',
      paidAmount: selectedCommission?.paidAmount || '',
      notes: selectedCommission?.notes || '',
      status: selectedCommission?.status || 'NEW',
    });
    const [paidAmountNotes, setPaidAmountNotes] = useState('');
    const [isManualOverride, setIsManualOverride] = useState(false);
    const [overrideReason, setOverrideReason] = useState('');

    if (!selectedCommission) return null;

    const calculatedAmount = editData.commissionValue && editData.commissionRate
      ? (parseFloat(editData.commissionValue) * parseFloat(editData.commissionRate) / 100).toFixed(2)
      : 0;

    const isPaidAmountChanged = selectedCommission?.paidAmount !== editData.paidAmount &&
      editData.paidAmount !== '' && editData.paidAmount !== null;

    // Check if commission amount is being changed (triggers override tracking)
    const isAmountChanged = editData.commissionValue &&
      parseFloat(editData.commissionValue) !== parseFloat(selectedCommission.commissionValue || 0);

    const handleSave = () => {
      // If paid amount changed, use the dedicated endpoint (tracks payrollUpdateDate)
      if (isPaidAmountChanged) {
        updatePaidAmountMutation.mutate({
          id: selectedCommission.id,
          paidAmount: parseFloat(editData.paidAmount),
          notes: paidAmountNotes,
        });
      }

      // Build update data
      const updateData = {
        commissionValue: parseFloat(editData.commissionValue),
        commissionRate: parseFloat(editData.commissionRate),
        notes: editData.notes,
        status: editData.status,
      };

      // If amount changed and manual override is enabled, include override data
      if (isAmountChanged && isManualOverride) {
        updateData.isManualOverride = true;
        updateData.overrideReason = overrideReason;
      }

      // Update other fields
      updateCommissionMutation.mutate({
        id: selectedCommission.id,
        data: updateData,
      });
    };

    const handleRevertOverride = () => {
      if (window.confirm('Are you sure you want to revert this commission to its original calculated amount?')) {
        revertOverrideMutation.mutate(selectedCommission.id);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
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

            {/* Manual Override Section */}
            {selectedCommission.isManualOverride && selectedCommission.originalAmount && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertCircle className="w-5 h-5 text-orange-600 mr-2" />
                    <h3 className="font-medium text-orange-900">Manual Override Active</h3>
                  </div>
                  <button
                    onClick={handleRevertOverride}
                    disabled={revertOverrideMutation.isPending}
                    className="px-3 py-1 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 disabled:opacity-50"
                  >
                    {revertOverrideMutation.isPending ? 'Reverting...' : 'Revert to Original'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Original Amount:</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(selectedCommission.originalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Current (Overridden):</p>
                    <p className="font-semibold text-orange-700">{formatCurrency(selectedCommission.commissionAmount)}</p>
                  </div>
                </div>
                {selectedCommission.overrideReason && (
                  <div className="text-sm">
                    <p className="text-gray-600">Reason:</p>
                    <p className="text-gray-800">{selectedCommission.overrideReason}</p>
                  </div>
                )}
                {selectedCommission.overrideDate && (
                  <p className="text-xs text-orange-600">
                    Overridden on: {formatDate(selectedCommission.overrideDate)}
                  </p>
                )}
              </div>
            )}

            {/* Override Toggle - shown when amount is being changed */}
            {isAmountChanged && !selectedCommission.isManualOverride && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isManualOverride}
                    onChange={(e) => setIsManualOverride(e.target.checked)}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <span className="ml-2 text-sm font-medium text-amber-900">
                    Mark as Manual Override
                  </span>
                </label>
                <p className="text-xs text-amber-700">
                  Enable this to track this as a manual override. The original calculated amount will be preserved for audit purposes.
                </p>
                {isManualOverride && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Override Reason (required)</label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                      placeholder="Enter reason for override..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* Paid Amount Section - Per Scribehow: Edit Commission Record's "Paid Amount" field */}
            {selectedCommission.status === 'PAID' && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 text-blue-600 mr-2" />
                  <h3 className="font-medium text-blue-900">Paid Amount (Payroll Adjustment)</h3>
                </div>
                <p className="text-sm text-blue-700">
                  Changes to paid amount are tracked for the Payroll Change Report.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editData.paidAmount}
                    onChange={(e) => setEditData({ ...editData, paidAmount: e.target.value })}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                    placeholder="Enter paid amount..."
                  />
                </div>
                {isPaidAmountChanged && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Change</label>
                    <input
                      type="text"
                      value={paidAmountNotes}
                      onChange={(e) => setPaidAmountNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      placeholder="Enter reason for payroll adjustment..."
                    />
                  </div>
                )}
                {selectedCommission.payrollUpdateDate && (
                  <p className="text-xs text-blue-600">
                    Last payroll update: {formatDate(selectedCommission.payrollUpdateDate)}
                  </p>
                )}
              </div>
            )}

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
              disabled={
                updateCommissionMutation.isPending ||
                updatePaidAmountMutation.isPending ||
                (isManualOverride && isAmountChanged && !overrideReason.trim())
              }
              className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {(updateCommissionMutation.isPending || updatePaidAmountMutation.isPending) ? 'Saving...' : 'Save Changes'}
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
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
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
          onClick={() => {
            setStatusFilter(statusFilter === 'NEW' ? '' : 'NEW');
            setPage(1);
          }}
          isActive={statusFilter === 'NEW'}
        />
        <StatCard
          icon={AlertCircle}
          label="Requested"
          value={summary?.byStatus?.REQUESTED?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.REQUESTED?.amount)}
          color="bg-yellow-100 text-yellow-600"
          onClick={() => {
            setStatusFilter(statusFilter === 'REQUESTED' ? '' : 'REQUESTED');
            setPage(1);
          }}
          isActive={statusFilter === 'REQUESTED'}
        />
        <StatCard
          icon={CheckCircle}
          label="Approved"
          value={summary?.byStatus?.APPROVED?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.APPROVED?.amount)}
          color="bg-green-100 text-green-600"
          onClick={() => {
            setStatusFilter(statusFilter === 'APPROVED' ? '' : 'APPROVED');
            setPage(1);
          }}
          isActive={statusFilter === 'APPROVED'}
        />
        <StatCard
          icon={DollarSign}
          label="Paid"
          value={summary?.byStatus?.PAID?.count || 0}
          subValue={formatCurrency(summary?.byStatus?.PAID?.amount)}
          color="bg-blue-100 text-blue-600"
          onClick={() => {
            setStatusFilter(statusFilter === 'PAID' ? '' : 'PAID');
            setPage(1);
          }}
          isActive={statusFilter === 'PAID'}
        />
      </div>

      {/* Dashboard with Donut Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <PieChart className="w-5 h-5 mr-2 text-panda-primary" />
              By Status
            </h3>
          </div>
          <div className="flex items-center justify-center gap-8">
            {/* Donut Chart */}
            <DonutChart
              segments={[
                { value: summary?.byStatus?.NEW?.count || 0, color: STATUS_COLORS.NEW, label: 'New' },
                { value: summary?.byStatus?.REQUESTED?.count || 0, color: STATUS_COLORS.REQUESTED, label: 'Requested' },
                { value: summary?.byStatus?.APPROVED?.count || 0, color: STATUS_COLORS.APPROVED, label: 'Approved' },
                { value: summary?.byStatus?.HOLD?.count || 0, color: STATUS_COLORS.HOLD, label: 'Hold' },
                { value: summary?.byStatus?.PAID?.count || 0, color: STATUS_COLORS.PAID, label: 'Paid' },
                { value: summary?.byStatus?.DENIED?.count || 0, color: STATUS_COLORS.DENIED, label: 'Denied' },
              ].filter(s => s.value > 0)}
              size={140}
              strokeWidth={16}
            />
            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {[
                { key: 'NEW', label: 'New', color: STATUS_COLORS.NEW },
                { key: 'REQUESTED', label: 'Requested', color: STATUS_COLORS.REQUESTED },
                { key: 'APPROVED', label: 'Approved', color: STATUS_COLORS.APPROVED },
                { key: 'HOLD', label: 'On Hold', color: STATUS_COLORS.HOLD },
                { key: 'PAID', label: 'Paid', color: STATUS_COLORS.PAID },
                { key: 'DENIED', label: 'Denied', color: STATUS_COLORS.DENIED },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => {
                    setStatusFilter(statusFilter === item.key ? '' : item.key);
                    setPage(1);
                  }}
                  className={`flex items-center text-sm hover:bg-gray-50 rounded px-1 py-0.5 transition-colors ${
                    statusFilter === item.key ? 'bg-gray-100' : ''
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-gray-600 text-xs">{item.label}</span>
                  <span className="ml-1 font-medium text-gray-900 text-xs">
                    {formatCurrency(summary?.byStatus?.[item.key]?.amount || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Type Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Layers className="w-5 h-5 mr-2 text-panda-secondary" />
              By Type
            </h3>
          </div>
          <div className="flex items-center justify-center gap-8">
            {/* Donut Chart */}
            <DonutChart
              segments={Object.entries(summary?.byType || {}).map(([type, data]) => ({
                value: data.count || 0,
                color: TYPE_COLORS[type] || '#9CA3AF',
                label: TYPE_LABELS[type] || type,
              })).filter(s => s.value > 0)}
              size={140}
              strokeWidth={16}
            />
            {/* Legend */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(summary?.byType || {})
                .filter(([, data]) => data.count > 0)
                .sort((a, b) => b[1].amount - a[1].amount)
                .map(([type, data]) => (
                  <button
                    key={type}
                    onClick={() => {
                      setTypeFilter(typeFilter === type ? '' : type);
                      setPage(1);
                    }}
                    className={`flex items-center text-sm hover:bg-gray-50 rounded px-1 py-0.5 transition-colors ${
                      typeFilter === type ? 'bg-gray-100' : ''
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[type] || '#9CA3AF' }}
                    />
                    <span className="text-gray-600 text-xs truncate">{TYPE_LABELS[type] || type}</span>
                    <span className="ml-1 font-medium text-gray-900 text-xs flex-shrink-0">
                      {formatCurrency(data.amount || 0)}
                    </span>
                  </button>
                ))}
              {!summary?.byType || Object.keys(summary.byType).length === 0 ? (
                <span className="text-sm text-gray-400 italic">No data</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        {/* Row 1: Search and Dropdowns */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search - prominent and wider */}
          <div className="relative flex-1 min-w-0 lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, job, owner..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none text-sm"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setActiveView('');
                setPage(1);
              }}
              className="px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white text-sm min-w-[120px]"
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
                setActiveView('');
                setPage(1);
              }}
              className="px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white text-sm min-w-[120px]"
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
                setActiveView('');
                setPage(1);
              }}
              className="px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white text-sm min-w-[140px]"
            >
              <option value="">All Owners</option>
              {users?.map(user => (
                <option key={user.id} value={user.id}>{user.fullName}</option>
              ))}
            </select>

            {/* Clear filters button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center"
              >
                <XCircle className="w-4 h-4 mr-1" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Quick Filter Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-medium text-gray-500 flex-shrink-0">Quick:</span>
          <button
            onClick={() => applySavedView('preCommissionRequested')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex items-center flex-shrink-0 ${
              activeView === 'preCommissionRequested'
                ? 'bg-purple-100 text-purple-700 border-purple-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
            title="Pre-Commission type with Requested status"
          >
            <Bookmark className="w-3 h-3 mr-1" />
            Pre-Comm Requested
          </button>
          <button
            onClick={() => applySavedView('approvedUnpaid')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${
              activeView === 'approvedUnpaid'
                ? 'bg-green-100 text-green-700 border-green-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            Approved - Unpaid
          </button>
          <button
            onClick={() => applySavedView('pendingApproval')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${
              activeView === 'pendingApproval'
                ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            Pending Approval
          </button>
          <button
            onClick={() => applySavedView('onHold')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${
              activeView === 'onHold'
                ? 'bg-orange-100 text-orange-700 border-orange-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            On Hold
          </button>
          <button
            onClick={() => applySavedView('backEndRequested')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${
              activeView === 'backEndRequested'
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            Back-End Requested
          </button>
          <button
            onClick={() => applySavedView('selfGenPending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors flex-shrink-0 ${
              activeView === 'selfGenPending'
                ? 'bg-teal-100 text-teal-700 border-teal-300'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            }`}
          >
            Self-Gen Pending
          </button>
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
                <SortableHeader field="ownerName" label="Owner" />
                <SortableHeader field="commissionType" label="Type" />
                <SortableHeader field="commissionValue" label="Value" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rate
                </th>
                <SortableHeader field="commissionAmount" label="Amount" />
                <SortableHeader field="status" label="Status" />
                <SortableHeader field="collectedPercent" label="Collected" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job
                </th>
                <SortableHeader field="soldDate" label="Sold Date" />
                <SortableHeader field="onboardDate" label="Onboard" />
                <SortableHeader field="createdAt" label="Created" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
                  </td>
                </tr>
              ) : commissions.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
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
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${commission.isManualOverride ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(commission.commissionAmount)}
                        </span>
                        {commission.isManualOverride && (
                          <span className="px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded" title={commission.overrideReason || 'Manual Override'}>
                            Override
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={commission.status} />
                    </td>
                    <td className="px-4 py-4">
                      {/* Collected % from serviceContract or account */}
                      {(() => {
                        const collectedPct = commission.serviceContract?.collectedPercent ?? commission.account?.collectedPercent;
                        if (collectedPct == null) return <span className="text-gray-400">—</span>;
                        const pct = parseFloat(collectedPct);
                        const colorClass = pct >= 100 ? 'text-green-600 bg-green-50' :
                                          pct >= 30 ? 'text-blue-600 bg-blue-50' :
                                          'text-orange-600 bg-orange-50';
                        return (
                          <span className={`px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
                            {pct.toFixed(0)}%
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4">
                      {/* Job info from opportunity */}
                      {commission.opportunity ? (
                        <a
                          href={`/jobs/${commission.opportunity.id}`}
                          className="text-panda-primary hover:underline text-sm font-medium"
                        >
                          {commission.opportunity.jobId || commission.opportunity.name?.substring(0, 20)}
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {/* Sold Date from opportunity.closeDate */}
                      {formatDate(commission.opportunity?.closeDate)}
                    </td>
                    <td className="px-4 py-4 text-gray-500 text-sm">
                      {/* Onboard Date from serviceContract.startDate */}
                      {formatDate(commission.serviceContract?.startDate)}
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

      {/* Payroll Change Report - Per Scribehow workflow */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowPayrollReport(!showPayrollReport)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-gray-900">Payroll Change Report</h3>
              <p className="text-sm text-gray-500">View commissions with modified paid amounts</p>
            </div>
          </div>
          {showPayrollReport ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {showPayrollReport && (
          <div className="border-t border-gray-100">
            {payrollChangesLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-sm text-gray-500 mt-2">Loading payroll changes...</p>
              </div>
            ) : !payrollChanges || payrollChanges.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <History className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p>No payroll changes found</p>
                <p className="text-sm">Paid amount modifications will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Commission Owner
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Job / Contract
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Original Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Paid Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Difference
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payroll Update Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payrollChanges.map((commission) => {
                      const originalAmount = parseFloat(commission.requestedAmount || commission.commissionAmount || 0);
                      const paidAmount = parseFloat(commission.paidAmount || 0);
                      const difference = paidAmount - originalAmount;

                      return (
                        <tr key={commission.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="flex items-center">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                                {(commission.owner?.firstName?.[0] || '') + (commission.owner?.lastName?.[0] || commission.owner?.name?.[0] || '?')}
                              </div>
                              <span className="ml-3 font-medium text-gray-900">
                                {commission.owner?.firstName && commission.owner?.lastName
                                  ? `${commission.owner.firstName} ${commission.owner.lastName}`
                                  : commission.owner?.name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              {commission.opportunity?.name || commission.opportunity?.jobId || '-'}
                              {commission.serviceContract?.contractNumber && (
                                <span className="text-xs text-gray-500 block">
                                  Contract: {commission.serviceContract.contractNumber}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                              {TYPE_LABELS[commission.type] || commission.type}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-900">
                            {formatCurrency(originalAmount)}
                          </td>
                          <td className="px-4 py-4 font-semibold text-blue-600">
                            {formatCurrency(paidAmount)}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`font-medium ${difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {difference >= 0 ? '+' : ''}{formatCurrency(difference)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-500 text-sm">
                            {formatDate(commission.payrollUpdateDate)}
                            {commission.changeHistory?.[0]?.user && (
                              <span className="block text-xs text-gray-400">
                                by {commission.changeHistory[0].user.firstName || commission.changeHistory[0].user.name}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>

        {/* Modals */}
        {showDetailModal && <DetailModal />}
        {showEditModal && <EditModal />}
        {showBulkStatusModal && <BulkStatusModal />}
      </div>
    </AdminLayout>
  );
}
