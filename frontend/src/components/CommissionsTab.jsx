import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commissionsApi, usersApi } from '../services/api';
import {
  Percent,
  DollarSign,
  User,
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  X,
  Edit,
  Eye,
  Building2,
  Tag,
  Info,
  TrendingUp,
  Receipt,
  CreditCard,
  Shield,
  Loader2,
  Plus,
} from 'lucide-react';

// Commission Type Display Configuration with explicit Tailwind classes
const COMMISSION_TYPES = {
  PRE_COMMISSION: { label: 'Pre-Commission', bgClass: 'bg-blue-100', textClass: 'text-blue-600', description: 'Paid at onboarding completion' },
  BACK_END: { label: 'Back-End Commission', bgClass: 'bg-green-100', textClass: 'text-green-600', description: 'Paid when job is paid in full' },
  BONUS: { label: 'Bonus', bgClass: 'bg-pink-100', textClass: 'text-pink-600', description: 'Manual bonus commission' },
  SALES_OP: { label: 'Sales Op Commission', bgClass: 'bg-purple-100', textClass: 'text-purple-600', description: 'Override for sales operations' },
  SUPPLEMENT_OVERRIDE: { label: 'Supplement Override', bgClass: 'bg-orange-100', textClass: 'text-orange-600', description: 'Commission on approved supplements' },
  PM_COMMISSION: { label: 'PM Commission', bgClass: 'bg-indigo-100', textClass: 'text-indigo-600', description: 'Project Manager add-on commission' },
  MANAGER_OVERRIDE: { label: 'Manager Override', bgClass: 'bg-cyan-100', textClass: 'text-cyan-600', description: 'Team lead override commission' },
  REGIONAL_MANAGER_OVERRIDE: { label: 'Regional Manager Override', bgClass: 'bg-teal-100', textClass: 'text-teal-600', description: 'Regional manager override' },
  DIRECTOR_OVERRIDE: { label: 'Director Override', bgClass: 'bg-violet-100', textClass: 'text-violet-600', description: 'Director level override' },
  EXECUTIVE_OVERRIDE: { label: 'Executive Override', bgClass: 'bg-rose-100', textClass: 'text-rose-600', description: 'Executive level override' },
  SALES_FLIP: { label: 'Sales Flip', bgClass: 'bg-amber-100', textClass: 'text-amber-600', description: 'PandaClaims commission' },
  PAYROLL_ADJUSTMENT: { label: 'Payroll Adjustment', bgClass: 'bg-gray-100', textClass: 'text-gray-600', description: 'Manual adjustment' },
  COMPANY_LEAD: { label: 'Company Lead', bgClass: 'bg-sky-100', textClass: 'text-sky-600', description: 'Company-generated lead commission' },
  SELF_GEN: { label: 'Self-Gen', bgClass: 'bg-emerald-100', textClass: 'text-emerald-600', description: 'Self-generated lead commission' },
};

// Commission Status Display Configuration with explicit Tailwind classes
const STATUS_CONFIG = {
  NEW: { label: 'New', bgClass: 'bg-gray-100', textClass: 'text-gray-700', icon: Clock, description: 'Commission created' },
  REQUESTED: { label: 'Requested', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700', icon: AlertCircle, description: 'Pending approval' },
  APPROVED: { label: 'Approved', bgClass: 'bg-blue-100', textClass: 'text-blue-700', icon: CheckCircle, description: 'Approved for payment' },
  HOLD: { label: 'On Hold', bgClass: 'bg-orange-100', textClass: 'text-orange-700', icon: AlertCircle, description: 'Payment on hold' },
  PAID: { label: 'Paid', bgClass: 'bg-green-100', textClass: 'text-green-700', icon: CheckCircle, description: 'Payment complete' },
  DENIED: { label: 'Denied', bgClass: 'bg-red-100', textClass: 'text-red-700', icon: XCircle, description: 'Commission denied' },
};

// Individual Commission Card Component
function CommissionCard({ commission, onSelect, isExpanded, isPotentialDuplicate, duplicateIds }) {
  const type = COMMISSION_TYPES[commission.type] || { label: commission.type?.replace(/_/g, ' '), bgClass: 'bg-gray-100', textClass: 'text-gray-600', description: '' };
  const status = STATUS_CONFIG[commission.status] || { label: commission.status, bgClass: 'bg-gray-100', textClass: 'text-gray-700', icon: Clock };
  const StatusIcon = status.icon || Clock;

  // Calculate display values
  const commissionValue = parseFloat(commission.commissionValue || 0);
  const commissionRate = parseFloat(commission.commissionRate || 0);
  const commissionAmount = parseFloat(commission.commissionAmount || 0);
  const requestedAmount = parseFloat(commission.requestedAmount || commissionAmount);
  const paidAmount = parseFloat(commission.paidAmount || 0);

  return (
    <div
      className={`border rounded-xl transition-all duration-200 ${
        isPotentialDuplicate
          ? 'border-amber-300 bg-amber-50/50'
          : isExpanded
          ? 'border-panda-primary bg-panda-primary/5 shadow-md'
          : 'border-gray-200 hover:border-panda-primary/50 bg-white'
      }`}
    >
      {/* Header - Always Visible */}
      <div
        className="p-4 cursor-pointer"
        onClick={() => onSelect(commission.id)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${type.bgClass}`}>
              <Percent className={`w-5 h-5 ${type.textClass}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-medium text-gray-900">{type.label}</h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center space-x-1 ${status.bgClass} ${status.textClass}`}>
                  <StatusIcon className="w-3 h-3" />
                  <span>{status.label}</span>
                </span>
              </div>
              <div className="flex items-center space-x-2 mt-0.5">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-500">
                  {commission.owner?.firstName || commission.owner?.name || ''} {commission.owner?.lastName || ''}
                </span>
                {(commission.isCompanyLead || commission.isSelfGen) && (
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    commission.isSelfGen ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
                  }`}>
                    {commission.isSelfGen ? 'Self-Gen' : 'Company Lead'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="font-bold text-lg text-green-600">${requestedAmount.toLocaleString()}</p>
              <p className="text-xs text-gray-500">{commissionRate}% of ${commissionValue.toLocaleString()}</p>
            </div>
            {isExpanded ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-gray-200 bg-white rounded-b-xl">
          {/* Financial Details Grid */}
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Commission Value</p>
              <p className="text-lg font-semibold text-gray-900">${commissionValue.toLocaleString()}</p>
              <p className="text-xs text-gray-400">Base amount for calculation</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Rate</p>
              <p className="text-lg font-semibold text-gray-900">{commissionRate}%</p>
              <p className="text-xs text-gray-400">{type.description}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-600 uppercase tracking-wide">Requested Amount</p>
              <p className="text-lg font-semibold text-blue-700">${requestedAmount.toLocaleString()}</p>
              <p className="text-xs text-blue-400">Value × Rate</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-xs text-green-600 uppercase tracking-wide">Paid Amount</p>
              <p className="text-lg font-semibold text-green-700">${paidAmount.toLocaleString()}</p>
              <p className="text-xs text-green-400">{commission.paidDate ? new Date(commission.paidDate).toLocaleDateString() : 'Not yet paid'}</p>
            </div>
          </div>

          {/* Pre-Commission Deduction (if applicable) */}
          {commission.preCommissionAmount && parseFloat(commission.preCommissionAmount) > 0 && (
            <div className="px-4 pb-4">
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700">Pre-Commission Deducted</span>
                </div>
                <span className="font-medium text-amber-700">-${parseFloat(commission.preCommissionAmount).toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Status Timeline */}
          <div className="px-4 pb-4">
            <div className="flex items-center space-x-1 overflow-x-auto">
              {Object.entries(STATUS_CONFIG).map(([key, config], idx) => {
                const isComplete = ['PAID', 'APPROVED'].includes(commission.status) &&
                  ['NEW', 'REQUESTED', 'APPROVED'].indexOf(key) <= ['NEW', 'REQUESTED', 'APPROVED'].indexOf(commission.status);
                const isCurrent = commission.status === key;
                const Icon = config.icon || Clock;

                return (
                  <div key={key} className="flex items-center">
                    <div className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                      isCurrent ? `${config.bgClass} ${config.textClass} font-medium` :
                      isComplete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                    }`}>
                      <Icon className="w-3 h-3" />
                      <span>{config.label}</span>
                    </div>
                    {idx < Object.keys(STATUS_CONFIG).length - 1 && key !== 'DENIED' && key !== 'HOLD' && (
                      <ArrowRight className="w-3 h-3 text-gray-300 mx-1" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dates & Notes Section */}
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Timeline</h5>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="text-gray-900">{commission.createdAt ? new Date(commission.createdAt).toLocaleDateString() : '-'}</span>
                </div>
                {commission.requestedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Requested</span>
                    <span className="text-gray-900">{new Date(commission.requestedDate).toLocaleDateString()}</span>
                  </div>
                )}
                {commission.approvedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Approved</span>
                    <span className="text-gray-900">{new Date(commission.approvedDate).toLocaleDateString()}</span>
                  </div>
                )}
                {commission.paidDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Paid</span>
                    <span className="text-green-600 font-medium">{new Date(commission.paidDate).toLocaleDateString()}</span>
                  </div>
                )}
                {commission.holdDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Held</span>
                    <span className="text-orange-600">{new Date(commission.holdDate).toLocaleDateString()}</span>
                  </div>
                )}
                {commission.deniedDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Denied</span>
                    <span className="text-red-600">{new Date(commission.deniedDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes & Reasons */}
            <div className="space-y-2">
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</h5>
              {commission.holdReason && (
                <div className="p-2 bg-orange-50 border border-orange-100 rounded text-sm">
                  <span className="font-medium text-orange-700">Hold Reason: </span>
                  <span className="text-orange-600">{commission.holdReason}</span>
                </div>
              )}
              {commission.deniedReason && (
                <div className="p-2 bg-red-50 border border-red-100 rounded text-sm">
                  <span className="font-medium text-red-700">Denied Reason: </span>
                  <span className="text-red-600">{commission.deniedReason}</span>
                </div>
              )}
              {commission.notes && (
                <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{commission.notes}</p>
              )}
              {!commission.holdReason && !commission.deniedReason && !commission.notes && (
                <p className="text-sm text-gray-400 italic">No notes</p>
              )}
            </div>
          </div>

          {/* Related Overrides (if any) */}
          {commission.payrollAdjustments && commission.payrollAdjustments.length > 0 && (
            <div className="px-4 pb-4">
              <h5 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Linked Overrides</h5>
              <div className="space-y-2">
                {commission.payrollAdjustments.map((adj) => (
                  <div key={adj.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-700">{COMMISSION_TYPES[adj.type]?.label || adj.type}</span>
                    <span className="font-medium text-gray-900">${parseFloat(adj.commissionAmount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Summary Header Component
function CommissionsSummary({ commissions, summary, opportunity }) {
  // Calculate totals
  const totalRequested = commissions?.reduce((sum, c) => sum + parseFloat(c.requestedAmount || c.commissionAmount || 0), 0) || 0;
  const totalPaid = commissions?.reduce((sum, c) => sum + parseFloat(c.paidAmount || 0), 0) || 0;
  const pendingCount = commissions?.filter(c => ['NEW', 'REQUESTED'].includes(c.status)).length || 0;
  const approvedCount = commissions?.filter(c => c.status === 'APPROVED').length || 0;
  const paidCount = commissions?.filter(c => c.status === 'PAID').length || 0;

  // Account context from opportunity
  const contractValue = summary?.financials?.contractValue || opportunity?.amount || 0;
  const collectedPercent = summary?.financials?.collectedPercent ||
    (contractValue > 0 ? ((summary?.financials?.totalPaid || 0) / contractValue * 100).toFixed(1) : 0);

  return (
    <div className="mb-6 space-y-4">
      {/* Account Context Bar */}
      <div className="bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">Contract Value:</span>
              <span className="font-semibold text-gray-900">${contractValue.toLocaleString()}</span>
            </div>
            <div className="h-4 border-l border-gray-300" />
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">Collected:</span>
              <span className="font-semibold text-green-600">{collectedPercent}%</span>
            </div>
            {summary?.financials?.supplementsTotal > 0 && (
              <>
                <div className="h-4 border-l border-gray-300" />
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-600">Supplements:</span>
                  <span className="font-semibold text-purple-600">${summary.financials.supplementsTotal.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              opportunity?.stage === 'CLOSED_WON' ? 'bg-green-100 text-green-700' :
              opportunity?.stage?.includes('APPROVED') ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {opportunity?.stage?.replace(/_/g, ' ') || 'Unknown Stage'}
            </span>
          </div>
        </div>
      </div>

      {/* Commission Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Requested</p>
          <p className="text-2xl font-bold text-blue-600">${totalRequested.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{commissions?.length || 0} commissions</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Paid</p>
          <p className="text-2xl font-bold text-green-600">${totalPaid.toLocaleString()}</p>
          <p className="text-xs text-gray-400">{paidCount} paid</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
          <p className="text-xs text-gray-400">Awaiting approval</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Approved</p>
          <p className="text-2xl font-bold text-blue-600">{approvedCount}</p>
          <p className="text-xs text-gray-400">Ready for payment</p>
        </div>
      </div>
    </div>
  );
}

// New Commission Modal Component
function NewCommissionModal({ isOpen, onClose, opportunityId, accountId, onSuccess }) {
  const [formData, setFormData] = useState({
    ownerId: '',
    type: 'BONUS',
    status: 'REQUESTED',
    requestedAmount: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  // Fetch users for dropdown
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
    enabled: isOpen,
  });

  // Create commission mutation
  const createMutation = useMutation({
    mutationFn: (data) => commissionsApi.createCommission(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunity', opportunityId] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      onSuccess?.();
      onClose();
      setFormData({ ownerId: '', type: 'BONUS', status: 'REQUESTED', requestedAmount: '', notes: '' });
      setError('');
    },
    onError: (err) => {
      setError(err.response?.data?.error?.message || 'Failed to create commission');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!formData.ownerId) {
      setError('Please select a Commission Owner');
      return;
    }
    if (!formData.requestedAmount || parseFloat(formData.requestedAmount) <= 0) {
      setError('Please enter a valid Requested Amount');
      return;
    }

    createMutation.mutate({
      ownerId: formData.ownerId,
      type: formData.type,
      status: formData.status,
      requestedAmount: parseFloat(formData.requestedAmount),
      opportunityId,
      accountId,
      notes: formData.notes || null,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">New Commission</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Commission Owner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Commission Owner <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.ownerId}
              onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              disabled={usersLoading}
            >
              <option value="">Select a user...</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} {user.email ? `(${user.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Commission Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Commission Type <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
            >
              {Object.entries(COMMISSION_TYPES).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
            >
              <option value="REQUESTED">Requested</option>
              <option value="NEW">New</option>
              <option value="APPROVED">Approved</option>
            </select>
          </div>

          {/* Requested Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Requested Amount <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.requestedAmount}
                onChange={(e) => setFormData({ ...formData, requestedAmount: e.target.value })}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              placeholder="Optional notes..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 text-white bg-panda-primary hover:bg-panda-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Commission</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Detect potential duplicate commissions
function detectDuplicates(commissions) {
  if (!commissions || commissions.length < 2) return {};

  const duplicateMap = {};

  commissions.forEach((c1, i) => {
    commissions.forEach((c2, j) => {
      if (i >= j) return; // Only compare once

      // Check for same owner and same type
      const sameOwner = c1.owner?.id === c2.owner?.id;
      const sameType = c1.type === c2.type;

      // Check if created within 7 days of each other
      const date1 = new Date(c1.createdAt);
      const date2 = new Date(c2.createdAt);
      const daysDiff = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
      const closeDate = daysDiff <= 7;

      // Check if amounts are similar (within 5%)
      const amount1 = parseFloat(c1.requestedAmount || c1.commissionAmount || 0);
      const amount2 = parseFloat(c2.requestedAmount || c2.commissionAmount || 0);
      const avgAmount = (amount1 + amount2) / 2;
      const similarAmount = avgAmount > 0 && Math.abs(amount1 - amount2) / avgAmount < 0.05;

      // Flag as potential duplicate if same owner+type and (close date or similar amount)
      if (sameOwner && sameType && (closeDate || similarAmount)) {
        if (!duplicateMap[c1.id]) duplicateMap[c1.id] = [];
        if (!duplicateMap[c2.id]) duplicateMap[c2.id] = [];
        duplicateMap[c1.id].push(c2.id);
        duplicateMap[c2.id].push(c1.id);
      }
    });
  });

  return duplicateMap;
}

// Main CommissionsTab Component
export default function CommissionsTab({ commissions, commissionSummary, summary, opportunity, isLoading }) {
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all'); // all, pending, approved, paid
  const [showNewCommissionModal, setShowNewCommissionModal] = useState(false);

  const handleSelect = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Detect potential duplicates
  const duplicateMap = detectDuplicates(commissions);
  const duplicateCount = Object.keys(duplicateMap).length;

  // Filter commissions
  const filteredCommissions = commissions?.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'pending') return ['NEW', 'REQUESTED'].includes(c.status);
    if (filter === 'approved') return c.status === 'APPROVED';
    if (filter === 'paid') return c.status === 'PAID';
    if (filter === 'hold') return c.status === 'HOLD';
    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-panda-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <CommissionsSummary
        commissions={commissions}
        summary={summary}
        opportunity={opportunity}
      />

      {/* Filter Tabs with New Button */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <div className="flex items-center space-x-2">
          {[
            { key: 'all', label: 'All', count: commissions?.length || 0 },
            { key: 'pending', label: 'Pending', count: commissions?.filter(c => ['NEW', 'REQUESTED'].includes(c.status)).length || 0 },
            { key: 'approved', label: 'Approved', count: commissions?.filter(c => c.status === 'APPROVED').length || 0 },
            { key: 'paid', label: 'Paid', count: commissions?.filter(c => c.status === 'PAID').length || 0 },
            { key: 'hold', label: 'On Hold', count: commissions?.filter(c => c.status === 'HOLD').length || 0 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-panda-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  filter === tab.key ? 'bg-white/20' : 'bg-gray-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {/* New Commission Button */}
        <button
          onClick={() => setShowNewCommissionModal(true)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>New</span>
        </button>
      </div>

      {/* Duplicate Warning Banner */}
      {duplicateCount > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">
              {duplicateCount} potential duplicate{duplicateCount > 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Commissions with the same owner, type, and similar dates/amounts are flagged for review.
            </p>
          </div>
        </div>
      )}

      {/* Commission Cards */}
      <div className="space-y-3">
        {filteredCommissions.length > 0 ? (
          filteredCommissions.map((commission) => (
            <CommissionCard
              key={commission.id}
              commission={commission}
              onSelect={handleSelect}
              isExpanded={expandedId === commission.id}
              isPotentialDuplicate={!!duplicateMap[commission.id]}
              duplicateIds={duplicateMap[commission.id]}
            />
          ))
        ) : (
          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-300">
            <Percent className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No commissions found</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter !== 'all'
                ? `No commissions with "${filter}" status`
                : 'Commissions will appear here when the job qualifies'}
            </p>
          </div>
        )}
      </div>

      {/* Qualification Info */}
      {commissions?.length === 0 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">Commission Qualification</h4>
              <p className="text-sm text-blue-600 mt-1">
                Commissions are created when a job meets qualification criteria:
              </p>
              <ul className="text-sm text-blue-600 mt-2 space-y-1 list-disc list-inside">
                <li><strong>Pre-Commission:</strong> Job approved + contract received</li>
                <li><strong>Back-End Commission:</strong> Job approved + 100% collection OR 30% collection (depending on type)</li>
                <li><strong>Supplement Override:</strong> Supplement approved and closed</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* New Commission Modal */}
      <NewCommissionModal
        isOpen={showNewCommissionModal}
        onClose={() => setShowNewCommissionModal(false)}
        opportunityId={opportunity?.id}
        accountId={opportunity?.accountId}
        onSuccess={() => {
          // Toast or notification could go here
        }}
      />
    </div>
  );
}
