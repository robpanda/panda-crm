import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  MessageSquare,
  User,
  DollarSign,
  Percent,
  FileText,
  Shield,
  Send,
  ArrowUp,
  Loader2,
  Check,
  X,
} from 'lucide-react';

const APPROVAL_TYPE_LABELS = {
  DISCOUNT: 'Discount',
  COMMISSION: 'Commission',
  PRICE_OVERRIDE: 'Price Override',
  CREDIT: 'Credit/Refund',
  SUPPLEMENT: 'Supplement',
  CHANGE_ORDER: 'Change Order',
  EXCEPTION: 'Exception',
};

const APPROVAL_TYPE_ICONS = {
  DISCOUNT: Percent,
  COMMISSION: DollarSign,
  PRICE_OVERRIDE: DollarSign,
  CREDIT: DollarSign,
  SUPPLEMENT: FileText,
  CHANGE_ORDER: FileText,
  EXCEPTION: Shield,
};

const STATUS_STYLES = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_REVIEW: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  ESCALATED: 'bg-orange-100 text-orange-800',
};

export default function ApprovalQueue({
  opportunityId = null,
  mode = 'queue', // 'queue' | 'submitted' | 'all'
  compact = false,
  showCreateButton = true,
  onSelect = null,
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch approvals based on mode
  const { data: approvalsData, isLoading } = useQuery({
    queryKey: ['approvals', mode, opportunityId, user?.id],
    queryFn: () => {
      if (mode === 'queue' && user?.id) {
        return approvalsApi.getPending(user.id);
      } else if (mode === 'submitted' && user?.id) {
        return approvalsApi.getSubmitted(user.id);
      } else {
        return approvalsApi.getApprovals({
          opportunityId,
          page: 1,
          limit: 50,
        });
      }
    },
    enabled: !!user?.id || (mode === 'all' && !!opportunityId),
  });

  const approvals = approvalsData?.data || [];

  // Decision mutation
  const decideMutation = useMutation({
    mutationFn: ({ id, decision, reason }) =>
      approvalsApi.decide(id, {
        decision,
        decisionReason: reason,
        decidedById: user?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['approvals']);
      setShowDecisionModal(false);
      setSelectedApproval(null);
      setDecisionReason('');
    },
  });

  const handleDecision = () => {
    if (!selectedApproval || !decisionType) return;
    decideMutation.mutate({
      id: selectedApproval.id,
      decision: decisionType,
      reason: decisionReason,
    });
  };

  const openDecisionModal = (approval, type) => {
    setSelectedApproval(approval);
    setDecisionType(type);
    setShowDecisionModal(true);
  };

  const formatCurrency = (value) => {
    if (!value) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const then = new Date(date);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-panda-primary" />
      </div>
    );
  }

  if (approvals.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">
          {mode === 'queue' ? 'No pending approvals' : 'No approval requests'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => {
        const TypeIcon = APPROVAL_TYPE_ICONS[approval.type] || FileText;
        const isPending = approval.status === 'PENDING' || approval.status === 'IN_REVIEW';
        const canDecide = mode === 'queue' && isPending && approval.approverId === user?.id;

        return (
          <div
            key={approval.id}
            className={`bg-white border rounded-lg p-4 hover:border-panda-primary/30 transition-colors ${
              compact ? 'p-3' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: Icon and Info */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className={`p-2 rounded-lg ${STATUS_STYLES[approval.status]?.split(' ')[0] || 'bg-gray-100'}`}>
                  <TypeIcon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-gray-900 truncate">
                      {approval.subject}
                    </h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[approval.status]}`}>
                      {approval.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {approval.requester?.firstName} {approval.requester?.lastName}
                    </span>
                    <span>{getTimeAgo(approval.submittedAt)}</span>
                    {approval.requestedValue && (
                      <span className="font-medium text-gray-700">
                        {formatCurrency(approval.requestedValue)}
                      </span>
                    )}
                  </div>
                  {approval.description && !compact && (
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                      {approval.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                {canDecide && (
                  <>
                    <button
                      onClick={() => openDecisionModal(approval, 'APPROVE')}
                      className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Approve"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => openDecisionModal(approval, 'REJECT')}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Reject"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => onSelect ? onSelect(approval) : setSelectedApproval(approval)}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                  title="View Details"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Expanded Details */}
            {selectedApproval?.id === approval.id && !showDecisionModal && (
              <div className="mt-4 pt-4 border-t space-y-3">
                {approval.originalValue && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Original Value</span>
                    <span className="font-medium">{formatCurrency(approval.originalValue)}</span>
                  </div>
                )}
                {approval.discountPercent && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="font-medium">{approval.discountPercent}%</span>
                  </div>
                )}
                {approval.dueDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Due Date</span>
                    <span className="font-medium">{formatDate(approval.dueDate)}</span>
                  </div>
                )}
                {approval.opportunity && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Opportunity</span>
                    <span className="font-medium text-panda-primary">
                      {approval.opportunity.name}
                    </span>
                  </div>
                )}
                {approval._count?.comments > 0 && (
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MessageSquare className="w-4 h-4" />
                    {approval._count.comments} comment{approval._count.comments !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Decision Modal */}
      {showDecisionModal && selectedApproval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {decisionType === 'APPROVE' ? 'Approve Request' : 'Reject Request'}
            </h3>
            <p className="text-gray-600 mb-4">
              <strong>{selectedApproval.subject}</strong>
              {selectedApproval.requestedValue && (
                <span className="block mt-1">
                  Amount: {formatCurrency(selectedApproval.requestedValue)}
                </span>
              )}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {decisionType === 'APPROVE' ? 'Notes (optional)' : 'Reason for rejection'}
              </label>
              <textarea
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                rows={3}
                placeholder={decisionType === 'APPROVE' ? 'Add any notes...' : 'Please provide a reason...'}
                required={decisionType === 'REJECT'}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDecisionModal(false);
                  setDecisionReason('');
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDecision}
                disabled={decideMutation.isPending || (decisionType === 'REJECT' && !decisionReason)}
                className={`px-4 py-2 rounded-lg font-medium text-white ${
                  decisionType === 'APPROVE'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50 flex items-center gap-2`}
              >
                {decideMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {decisionType === 'APPROVE' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stats Card Component for displaying approval metrics
export function ApprovalStats({ userId = null }) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['approvalStats', userId],
    queryFn: () => approvalsApi.getStats(userId),
  });

  if (isLoading) {
    return (
      <div className="animate-pulse flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 h-20 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  const statCards = [
    { label: 'Pending', value: stats?.pending || 0, color: 'text-yellow-600', bg: 'bg-yellow-50', icon: Clock },
    { label: 'Approved', value: stats?.approved || 0, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle },
    { label: 'Rejected', value: stats?.rejected || 0, color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
    { label: 'Expired', value: stats?.expired || 0, color: 'text-gray-600', bg: 'bg-gray-50', icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat) => (
        <div key={stat.label} className={`${stat.bg} rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-sm text-gray-600">{stat.label}</span>
          </div>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

// Create Approval Request Form
export function CreateApprovalForm({
  opportunityId,
  quoteId,
  commissionId,
  orderId,
  onSuccess,
  onCancel,
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    type: 'DISCOUNT',
    subject: '',
    description: '',
    requestedValue: '',
    originalValue: '',
    discountType: 'PERCENTAGE',
    discountPercent: '',
    discountAmount: '',
  });

  const createMutation = useMutation({
    mutationFn: (data) => approvalsApi.createApproval(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['approvals']);
      onSuccess?.();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createMutation.mutate({
      ...formData,
      requesterId: user?.id,
      opportunityId,
      quoteId,
      commissionId,
      orderId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
        >
          {Object.entries(APPROVAL_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
        <input
          type="text"
          value={formData.subject}
          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
          placeholder="Brief description of what needs approval"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
          rows={3}
          placeholder="Detailed explanation and justification..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Requested Value</label>
          <input
            type="number"
            step="0.01"
            value={formData.requestedValue}
            onChange={(e) => setFormData({ ...formData, requestedValue: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Original Value</label>
          <input
            type="number"
            step="0.01"
            value={formData.originalValue}
            onChange={(e) => setFormData({ ...formData, originalValue: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
            placeholder="0.00"
          />
        </div>
      </div>

      {formData.type === 'DISCOUNT' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount %</label>
            <input
              type="number"
              step="0.01"
              max="100"
              value={formData.discountPercent}
              onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount $</label>
            <input
              type="number"
              step="0.01"
              value={formData.discountAmount}
              onChange={(e) => setFormData({ ...formData, discountAmount: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-panda-primary"
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending || !formData.subject}
          className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50 flex items-center gap-2"
        >
          {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Send className="w-4 h-4" />
          Submit for Approval
        </button>
      </div>
    </form>
  );
}
