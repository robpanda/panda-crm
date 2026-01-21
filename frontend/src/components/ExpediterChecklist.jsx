import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { opportunitiesApi, casesApi, usersApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Camera,
  Home,
  Zap,
  FileText,
  FileCheck,
  UserCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
  Save,
  Loader2,
  Plus,
  X,
  Briefcase,
  Clock,
  User,
  MessageSquare,
  ClipboardCheck,
  DollarSign,
  CreditCard,
  Receipt,
  Hash,
  Building,
  Send,
} from 'lucide-react';

// Onboarding verification fields (migrated from Salesforce Project Expediting)
const ONBOARDING_VERIFICATION = [
  { id: 'hoaRequired', label: 'HOA Required', icon: Home, type: 'select', options: [
    { value: '', label: 'Select...' },
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'unknown', label: 'Unknown' },
  ], triggerHoaCase: true },
  { id: 'hoaApproved', label: 'HOA Approved', icon: CheckCircle, type: 'checkbox', conditionalOn: 'hoaRequired', conditionalValue: 'yes' },
  { id: 'piiComplete', label: 'PII Complete', icon: UserCheck, type: 'select', options: [
    { value: '', label: 'Select...' },
    { value: 'no', label: 'No - Needs Follow-up' },
    { value: 'not_required', label: 'Not Required' },
    { value: 'yes', label: 'Yes - Complete' },
  ], triggerPiiCase: true },
  { id: 'changeOrderSigned', label: 'Change Order Signed', icon: FileText, type: 'checkbox' },
  { id: 'solarDnrRequired', label: 'Solar DNR Required', icon: Zap, type: 'checkbox' },
];

// Job complexity review fields
const JOB_COMPLEXITY = [
  { id: 'jobComplexityPhotosReviewed', label: 'Job Complexity Photos Reviewed', icon: Camera, type: 'checkbox' },
  { id: 'jobComplexityNotes', label: 'Job Complexity Notes', icon: FileText, type: 'textarea' },
  { id: 'flatRoof', label: 'Flat Roof', icon: Home, type: 'toggle',
    triggerCase: { type: 'FLAT_ROOF_REVIEW', assignTo: 'Trevor', subject: 'Flat Roof Review Required' } },
  { id: 'lineDrop', label: 'Line Drop Required', icon: Zap, type: 'toggle',
    triggerCase: { type: 'LINE_DROP', assignTo: 'Kevin Flores', subject: 'Line Drop Required', sendSms: true } },
];

// Supplement and install ready fields
const SUPPLEMENT_FIELDS = [
  { id: 'supplementRequired', label: 'Supplement Required', icon: FileText, type: 'checkbox' },
  { id: 'supplementHoldsJob', label: 'Supplement Holds Job', icon: AlertTriangle, type: 'checkbox',
    conditionalOn: 'supplementRequired', conditionalValue: true,
    helpText: 'If checked, job will be set to Not Install Ready' },
];

// Install ready override
const INSTALL_READY_FIELDS = [
  { id: 'notInstallReady', label: 'Not Install Ready', icon: AlertCircle, type: 'checkbox' },
  { id: 'notInstallReadyNotes', label: 'Not Install Ready Notes', icon: FileText, type: 'textarea', conditionalOn: 'notInstallReady', conditionalValue: true },
  { id: 'vetoInstallNotReady', label: 'Veto Install Not Ready (Override)', icon: CheckCircle, type: 'checkbox',
    helpText: 'Override the Not Install Ready flag if you have addressed all concerns' },
];

// Project expeditor fields
const EXPEDITOR_FIELDS = [
  { id: 'projectExpeditorNotes', label: 'Project Expeditor Notes', icon: FileText, type: 'textarea' },
];

// Permit status options
const PERMIT_STATUS_OPTIONS = [
  { value: '', label: 'Select Status...', color: 'gray' },
  { value: 'pending', label: 'Pending', color: 'gray' },
  { value: 'submitted', label: 'Submitted', color: 'blue' },
  { value: 'under_review', label: 'Under Review', color: 'yellow' },
  { value: 'approved', label: 'Approved', color: 'green' },
  { value: 'paid', label: 'Paid', color: 'purple' },
  { value: 'received', label: 'Received', color: 'emerald' },
];

// Permit payment method options
const PERMIT_PAYMENT_OPTIONS = [
  { value: '', label: 'Select Payment Method...' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'company_paid', label: 'Company Paid' },
];

// Case creation modal component
function CreateCaseModal({ isOpen, onClose, onSubmit, caseType, opportunity, isLoading }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    priority: 'Medium',
    status: 'New',
    assignedToId: user?.id || '',
  });

  // Fetch users for assignment dropdown
  const { data: users } = useQuery({
    queryKey: ['users-active'],
    queryFn: () => usersApi.getUsers({ isActive: true }),
    enabled: isOpen,
  });

  const usersList = users?.data || users || [];

  // Set default subject based on case type
  useEffect(() => {
    if (caseType === 'HOA') {
      setFormData(prev => ({
        ...prev,
        subject: `HOA Approval Required - ${opportunity?.name || 'Job'}`,
        description: `HOA approval is required for this project.\n\nJob: ${opportunity?.name || ''}\nAddress: ${opportunity?.projectAddress || opportunity?.address || ''}\n\nPlease submit the HOA application and track approval status.`,
      }));
    } else if (caseType === 'PII') {
      setFormData(prev => ({
        ...prev,
        subject: `PII Follow-up Required - ${opportunity?.name || 'Job'}`,
        description: `PII (Personal/Property Insurance Information) follow-up is required for this project.\n\nJob: ${opportunity?.name || ''}\nAddress: ${opportunity?.projectAddress || opportunity?.address || ''}\n\nPlease schedule an appointment with the homeowner to complete the PII information.`,
      }));
    } else if (caseType === 'Permit') {
      setFormData(prev => ({
        ...prev,
        subject: `Permit Required - ${opportunity?.name || 'Job'}`,
        description: `A permit is required for this project.\n\nJob: ${opportunity?.name || ''}\nAddress: ${opportunity?.projectAddress || opportunity?.address || ''}\n\nPlease submit the permit application and track through approval.`,
      }));
    } else if (caseType === 'Ad Hoc') {
      setFormData(prev => ({
        ...prev,
        subject: '',
        description: `Job: ${opportunity?.name || ''}\nAddress: ${opportunity?.projectAddress || opportunity?.address || ''}\n\nIssue Details:\n`,
      }));
    }
  }, [caseType, opportunity]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      type: caseType,
      opportunityId: opportunity?.id,
      accountId: opportunity?.accountId,
      contactId: opportunity?.contactId,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Create {caseType} Case</h3>
              <p className="text-xs text-gray-500">Track and manage this requirement</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
            <input
              type="text"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              placeholder="Enter case subject"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary resize-none"
              placeholder="Enter case details..."
            />
          </div>

          {/* Priority & Status Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
              >
                <option value="New">New</option>
                <option value="In Progress">In Progress</option>
                <option value="On Hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
            <select
              value={formData.assignedToId}
              onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary focus:border-panda-primary"
            >
              <option value="">-- Select User --</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.subject}
            className="flex-1 px-4 py-2.5 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Case
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Case Card component (reusable for HOA, PII, Permit cases)
function CaseCard({ caseData, onViewCase }) {
  const statusColors = {
    'New': 'bg-blue-100 text-blue-700',
    'NEW': 'bg-blue-100 text-blue-700',
    'In Progress': 'bg-yellow-100 text-yellow-700',
    'WORKING': 'bg-yellow-100 text-yellow-700',
    'On Hold': 'bg-gray-100 text-gray-700',
    'Escalated': 'bg-red-100 text-red-700',
    'ESCALATED': 'bg-red-100 text-red-700',
    'Closed': 'bg-green-100 text-green-700',
    'CLOSED': 'bg-green-100 text-green-700',
  };

  return (
    <div
      onClick={() => onViewCase?.(caseData)}
      className="p-3 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-panda-primary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 text-sm truncate">{caseData.subject}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {caseData.caseNumber || `Case #${caseData.id?.slice(-6)}`}
          </p>
        </div>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${statusColors[caseData.status] || 'bg-gray-100 text-gray-600'}`}>
          {caseData.status}
        </span>
      </div>
      {caseData.assignedTo && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
          <User className="w-3 h-3" />
          <span>{caseData.assignedTo.firstName} {caseData.assignedTo.lastName}</span>
        </div>
      )}
    </div>
  );
}

// Permit Status Badge component
function PermitStatusBadge({ status }) {
  const statusConfig = PERMIT_STATUS_OPTIONS.find(s => s.value === status) || PERMIT_STATUS_OPTIONS[0];
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    green: 'bg-green-100 text-green-700',
    purple: 'bg-purple-100 text-purple-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };

  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${colorClasses[statusConfig.color] || colorClasses.gray}`}>
      {statusConfig.label}
    </span>
  );
}

// Permitting Section Component (comprehensive permit tracking)
function PermittingSection({ opportunity, getValue, handleChange, handlePermitFieldChange, isLoading, onCreatePermitCase, permitCases }) {
  const permitRequired = getValue('permitRequired');
  const permitStatus = getValue('permitStatus');

  // Calculate permit workflow progress
  const getPermitProgress = () => {
    const steps = [
      { key: 'required', label: 'Required', complete: permitRequired },
      { key: 'submitted', label: 'Submitted', complete: !!getValue('permitSubmittedDate') },
      { key: 'approved', label: 'Approved', complete: !!getValue('permitApprovedDate') },
      { key: 'paid', label: 'Paid', complete: !!getValue('permitPaidDate') },
      { key: 'received', label: 'Received', complete: !!getValue('permitReceivedDate') },
    ];
    return steps;
  };

  const progressSteps = getPermitProgress();
  const completedSteps = progressSteps.filter(s => s.complete).length;

  return (
    <div className="space-y-4">
      {/* Permit Required Toggle */}
      <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Permit Required</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleChange('permitRequired', false)}
            disabled={isLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
              !permitRequired ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            No
          </button>
          <button
            onClick={() => {
              handleChange('permitRequired', true);
              // When set to yes, create permit case
              if (!permitRequired) {
                onCreatePermitCase();
              }
            }}
            disabled={isLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
              permitRequired ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Yes
          </button>
        </div>
      </div>

      {/* Permit Details (shown when permit is required) */}
      {permitRequired && (
        <>
          {/* Progress Indicator */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-700">Permit Progress</span>
              <span className="text-xs text-blue-600">{completedSteps}/{progressSteps.length} Complete</span>
            </div>
            <div className="flex gap-1">
              {progressSteps.map((step, idx) => (
                <div key={step.key} className="flex-1">
                  <div className={`h-1.5 rounded-full ${step.complete ? 'bg-blue-500' : 'bg-blue-200'}`} />
                  <p className={`text-[10px] mt-1 text-center ${step.complete ? 'text-blue-700' : 'text-blue-400'}`}>
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Permit Status */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 flex-1">
              <ClipboardCheck className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">Permit Status</span>
            </div>
            <div className="flex items-center gap-2">
              <PermitStatusBadge status={permitStatus} />
              <select
                value={permitStatus || ''}
                onChange={(e) => handlePermitFieldChange('permitStatus', e.target.value || null)}
                disabled={isLoading}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              >
                {PERMIT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Permit Number */}
          <div className="p-3 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">Permit Number</span>
            </div>
            <input
              type="text"
              value={getValue('permitNumber') || ''}
              onChange={(e) => handlePermitFieldChange('permitNumber', e.target.value)}
              disabled={isLoading}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              placeholder="Enter permit number..."
            />
          </div>

          {/* Date Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Submitted Date */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Send className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Submitted Date</span>
              </div>
              <input
                type="date"
                value={getValue('permitSubmittedDate') ? new Date(getValue('permitSubmittedDate')).toISOString().split('T')[0] : ''}
                onChange={(e) => handlePermitFieldChange('permitSubmittedDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                disabled={isLoading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              />
            </div>

            {/* Approved Date */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Approved Date</span>
              </div>
              <input
                type="date"
                value={getValue('permitApprovedDate') ? new Date(getValue('permitApprovedDate')).toISOString().split('T')[0] : ''}
                onChange={(e) => handlePermitFieldChange('permitApprovedDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                disabled={isLoading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              />
            </div>
          </div>

          {/* Permit Cost & Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Permit Cost */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Permit Cost</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={getValue('permitCost') || ''}
                  onChange={(e) => handlePermitFieldChange('permitCost', e.target.value ? parseFloat(e.target.value) : null)}
                  disabled={isLoading}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-7 pr-3 py-2 focus:ring-2 focus:ring-panda-primary"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Payment Method */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Payment Method</span>
              </div>
              <select
                value={getValue('permitPaymentMethod') || ''}
                onChange={(e) => handlePermitFieldChange('permitPaymentMethod', e.target.value || null)}
                disabled={isLoading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              >
                {PERMIT_PAYMENT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Paid & Received Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Paid Date */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Receipt className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">Paid Date</span>
              </div>
              <input
                type="date"
                value={getValue('permitPaidDate') ? new Date(getValue('permitPaidDate')).toISOString().split('T')[0] : ''}
                onChange={(e) => handlePermitFieldChange('permitPaidDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                disabled={isLoading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              />
            </div>

            {/* Received Date */}
            <div className="p-3 bg-white rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <FileCheck className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-700">Received Date</span>
              </div>
              <input
                type="date"
                value={getValue('permitReceivedDate') ? new Date(getValue('permitReceivedDate')).toISOString().split('T')[0] : ''}
                onChange={(e) => handlePermitFieldChange('permitReceivedDate', e.target.value ? new Date(e.target.value).toISOString() : null)}
                disabled={isLoading}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary"
              />
            </div>
          </div>

          {/* Permit Notes */}
          <div className="p-3 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">Permit Notes</span>
            </div>
            <textarea
              value={getValue('permitNotes') || ''}
              onChange={(e) => handlePermitFieldChange('permitNotes', e.target.value)}
              disabled={isLoading}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary resize-none"
              placeholder="Enter permit notes..."
            />
          </div>

          {/* Permit Cases */}
          {permitCases && permitCases.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Permit Cases</span>
              </div>
              {permitCases.map((c) => (
                <CaseCard key={c.id} caseData={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ExpediterChecklist({ opportunity, onUpdate, users = [] }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedSections, setExpandedSections] = useState({
    expeditor: true,
    onboarding: true,
    permitting: false,
    complexity: false,
    supplement: false,
    installReady: false,
    notes: false,
    adhoc: false,
  });
  const [localValues, setLocalValues] = useState({});
  const [confirmTrigger, setConfirmTrigger] = useState(null);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [caseModalType, setCaseModalType] = useState('');
  const [pendingFieldChange, setPendingFieldChange] = useState(null);

  // Fetch HOA cases for this opportunity
  const { data: hoaCases, refetch: refetchHoaCases } = useQuery({
    queryKey: ['cases', opportunity?.id, 'HOA'],
    queryFn: async () => {
      const result = await casesApi.getCases({ opportunityId: opportunity?.id, type: 'HOA' });
      return result?.data || result || [];
    },
    enabled: !!opportunity?.id,
  });

  // Fetch PII cases for this opportunity
  const { data: piiCases, refetch: refetchPiiCases } = useQuery({
    queryKey: ['cases', opportunity?.id, 'PII'],
    queryFn: async () => {
      const result = await casesApi.getCases({ opportunityId: opportunity?.id, type: 'PII' });
      return result?.data || result || [];
    },
    enabled: !!opportunity?.id,
  });

  // Fetch Permit cases for this opportunity
  const { data: permitCases, refetch: refetchPermitCases } = useQuery({
    queryKey: ['cases', opportunity?.id, 'Permit'],
    queryFn: async () => {
      const result = await casesApi.getCases({ opportunityId: opportunity?.id, type: 'Permit' });
      return result?.data || result || [];
    },
    enabled: !!opportunity?.id,
  });

  // Fetch Ad Hoc cases for this opportunity (type = 'Ad Hoc' or 'General' or null)
  const { data: adhocCases, refetch: refetchAdhocCases } = useQuery({
    queryKey: ['cases', opportunity?.id, 'AdHoc'],
    queryFn: async () => {
      const result = await casesApi.getCases({ opportunityId: opportunity?.id, type: 'Ad Hoc' });
      return result?.data || result || [];
    },
    enabled: !!opportunity?.id,
  });

  const refetchCases = () => {
    refetchHoaCases();
    refetchPiiCases();
    refetchPermitCases();
    refetchAdhocCases();
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => opportunitiesApi.updateOpportunity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunities']);
      queryClient.invalidateQueries(['opportunity', opportunity?.id]);
      setLocalValues({});
      if (onUpdate) onUpdate();
    },
  });

  const createCaseMutation = useMutation({
    mutationFn: (caseData) => casesApi.createCase(caseData),
    onSuccess: () => {
      queryClient.invalidateQueries(['cases']);
      refetchCases();
      setShowCaseModal(false);
      // If we had a pending field change (HOA, PII, or Permit), now apply it
      if (pendingFieldChange) {
        updateMutation.mutate({
          id: opportunity.id,
          data: { [pendingFieldChange.fieldId]: pendingFieldChange.value },
        });
        setPendingFieldChange(null);
      }
    },
  });

  const getValue = (fieldId) => {
    if (localValues[fieldId] !== undefined) return localValues[fieldId];
    return opportunity?.[fieldId];
  };

  const handleChange = (fieldId, value, field = null) => {
    // Special handling for HOA Required field - create case when set to "yes"
    if (fieldId === 'hoaRequired' && value === 'yes' && getValue('hoaRequired') !== 'yes') {
      setPendingFieldChange({ fieldId, value });
      setCaseModalType('HOA');
      setShowCaseModal(true);
      return;
    }

    // Special handling for PII Complete field - create case when set to "no"
    if (fieldId === 'piiComplete' && value === 'no' && getValue('piiComplete') !== 'no') {
      setPendingFieldChange({ fieldId, value });
      setCaseModalType('PII');
      setShowCaseModal(true);
      return;
    }

    // If this triggers a case creation automation
    if (field?.triggerCase && value === true) {
      setConfirmTrigger({ fieldId, value, field });
      return;
    }

    setLocalValues(prev => ({ ...prev, [fieldId]: value }));

    // Auto-save for checkboxes, toggles, and selects
    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
  };

  // Handle permit field changes with auto-status updates
  const handlePermitFieldChange = (fieldId, value) => {
    const updates = { [fieldId]: value };

    // Auto-update permit status based on field changes
    if (fieldId === 'permitSubmittedDate' && value) {
      updates.permitStatus = 'under_review';
    } else if (fieldId === 'permitApprovedDate' && value) {
      updates.permitStatus = 'approved';
    } else if (fieldId === 'permitPaidDate' && value) {
      updates.permitStatus = 'paid';
    } else if (fieldId === 'permitReceivedDate' && value) {
      updates.permitStatus = 'received';
      updates.permitObtained = true; // Mark permit as obtained
    }

    setLocalValues(prev => ({ ...prev, ...updates }));
    updateMutation.mutate({ id: opportunity.id, data: updates });
  };

  const handleConfirmTrigger = () => {
    if (!confirmTrigger) return;
    const { fieldId, value, field } = confirmTrigger;

    setLocalValues(prev => ({ ...prev, [fieldId]: value }));

    // Create the case first, then update the field
    if (field?.triggerCase) {
      createCaseMutation.mutate({
        subject: field.triggerCase.subject,
        description: `Triggered from expediting checklist for ${opportunity?.name || 'Job'}`,
        type: field.triggerCase.type,
        priority: 'Medium',
        status: 'New',
        opportunityId: opportunity?.id,
        accountId: opportunity?.accountId,
      });
    }

    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
    setConfirmTrigger(null);
  };

  const handleTextSave = (fieldId) => {
    const value = localValues[fieldId];
    if (value === undefined) return;

    updateMutation.mutate({
      id: opportunity.id,
      data: { [fieldId]: value },
    });
  };

  const handleStartExpediting = () => {
    updateMutation.mutate({
      id: opportunity.id,
      data: {
        projectExpeditingStartDate: new Date().toISOString(),
        projectExpeditorId: user?.id,
      },
    });
  };

  const handleCreatePermitCase = () => {
    setCaseModalType('Permit');
    setShowCaseModal(true);
  };

  const shouldShowField = (field) => {
    if (!field.conditionalOn) return true;
    const dependsOnValue = getValue(field.conditionalOn);
    return dependsOnValue === field.conditionalValue;
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleCaseCreate = (caseData) => {
    createCaseMutation.mutate(caseData);
  };

  const renderField = (field) => {
    if (!shouldShowField(field)) return null;

    const Icon = field.icon;
    const value = getValue(field.id);
    const isLoading = updateMutation.isPending;

    switch (field.type) {
      case 'checkbox':
        return (
          <label
            key={field.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors active:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => handleChange(field.id, e.target.checked, field)}
              disabled={isLoading}
              className="w-5 h-5 rounded border-gray-300 text-panda-primary focus:ring-panda-primary"
            />
            <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 flex-1">{field.label}</span>
            {value && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {field.helpText && (
              <span className="text-xs text-gray-400" title={field.helpText}>?</span>
            )}
          </label>
        );

      case 'toggle':
        return (
          <div
            key={field.id}
            className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-100"
          >
            <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 flex-1">{field.label}</span>
            <div className="flex items-center">
              <button
                onClick={() => handleChange(field.id, false)}
                disabled={isLoading}
                className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
                  value === false || !value
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                No
              </button>
              <button
                onClick={() => handleChange(field.id, true, field)}
                disabled={isLoading}
                className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                  value === true
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Yes
              </button>
            </div>
            {value && field.triggerCase && (
              <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" title="Case created" />
            )}
          </div>
        );

      case 'select':
        return (
          <div
            key={field.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-white rounded-lg border border-gray-100"
          >
            <div className="flex items-center gap-2 flex-1">
              <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-700">{field.label}</span>
            </div>
            <select
              value={value || ''}
              onChange={(e) => handleChange(field.id, e.target.value || null, field)}
              disabled={isLoading}
              className="w-full sm:w-auto text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            >
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="p-3 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-700">{field.label}</span>
            </div>
            <textarea
              value={localValues[field.id] !== undefined ? localValues[field.id] : (value || '')}
              onChange={(e) => setLocalValues(prev => ({ ...prev, [field.id]: e.target.value }))}
              onBlur={() => handleTextSave(field.id)}
              disabled={isLoading}
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
              placeholder={`Enter ${field.label.toLowerCase()}...`}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const renderSection = (title, sectionKey, fields, icon, extraContent = null) => {
    const SectionIcon = icon;
    const isExpanded = expandedSections[sectionKey];
    const visibleFields = fields.filter(shouldShowField);

    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors active:bg-gray-200"
        >
          <div className="flex items-center gap-2">
            <SectionIcon className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700 text-sm">{title}</span>
            <span className="text-xs text-gray-400">({visibleFields.length})</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {isExpanded && (
          <div className="p-3 space-y-2 bg-gray-50/50">
            {fields.map(renderField)}
            {extraContent}
          </div>
        )}
      </div>
    );
  };

  // HOA Cases section content
  const hoaCasesContent = getValue('hoaRequired') === 'yes' && (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">HOA Cases</span>
        <button
          onClick={() => {
            setCaseModalType('HOA');
            setShowCaseModal(true);
          }}
          className="text-xs text-panda-primary hover:underline flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Case
        </button>
      </div>
      {hoaCases && hoaCases.length > 0 ? (
        <div className="space-y-2">
          {hoaCases.map((c) => (
            <CaseCard key={c.id} caseData={c} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic py-2">No HOA cases yet</p>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Expediting Header - Start Date & Expeditor */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-200 overflow-hidden">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-5 h-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">Project Expediting</p>
                <p className="text-sm text-gray-600">
                  {opportunity?.projectExpeditingStartDate
                    ? `Started ${new Date(opportunity.projectExpeditingStartDate).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}`
                    : 'Not started yet'
                  }
                </p>
              </div>
            </div>

            {opportunity?.projectExpeditingStartDate ? (
              <div className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-2">
                <User className="w-4 h-4 text-gray-400" />
                <div className="text-sm">
                  <p className="text-gray-500 text-xs">Expeditor</p>
                  <p className="font-medium text-gray-900">
                    {opportunity?.projectExpeditor?.firstName
                      ? `${opportunity.projectExpeditor.firstName} ${opportunity.projectExpeditor.lastName || ''}`
                      : user?.firstName || 'Not assigned'}
                  </p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleStartExpediting}
                disabled={updateMutation.isPending}
                className="w-full sm:w-auto px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
                Start Expediting
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Checklist Sections */}
      {renderSection('Onboarding Verification', 'onboarding', ONBOARDING_VERIFICATION, CheckCircle, hoaCasesContent)}

      {/* Permitting Section - Custom rendering */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('permitting')}
          className="w-full flex items-center justify-between p-3 bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Building className="w-4 h-4 text-blue-600" />
            <span className="font-medium text-blue-800 text-sm">Permitting</span>
            {getValue('permitRequired') && (
              <PermitStatusBadge status={getValue('permitStatus')} />
            )}
          </div>
          {expandedSections.permitting ? (
            <ChevronUp className="w-4 h-4 text-blue-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-blue-500" />
          )}
        </button>
        {expandedSections.permitting && (
          <div className="p-3 space-y-2 bg-gray-50/50">
            <PermittingSection
              opportunity={opportunity}
              getValue={getValue}
              handleChange={handleChange}
              handlePermitFieldChange={handlePermitFieldChange}
              isLoading={updateMutation.isPending}
              onCreatePermitCase={handleCreatePermitCase}
              permitCases={permitCases}
            />
          </div>
        )}
      </div>

      {renderSection('Job Complexity Review', 'complexity', JOB_COMPLEXITY, Camera)}
      {renderSection('Supplement Handling', 'supplement', SUPPLEMENT_FIELDS, FileText)}
      {renderSection('Install Ready Status', 'installReady', INSTALL_READY_FIELDS, AlertCircle)}
      {renderSection('Expeditor Notes', 'notes', EXPEDITOR_FIELDS, MessageSquare)}

      {/* Ad Hoc Cases Section - Create case for any issue */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('adhoc')}
          className="w-full flex items-center justify-between p-3 bg-purple-50 hover:bg-purple-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-purple-600" />
            <span className="font-medium text-purple-800 text-sm">Ad Hoc Cases</span>
            <span className="text-xs text-purple-500">(Other Issues)</span>
          </div>
          {expandedSections.adhoc ? (
            <ChevronUp className="w-4 h-4 text-purple-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-purple-500" />
          )}
        </button>
        {expandedSections.adhoc && (
          <div className="p-3 space-y-3 bg-gray-50/50">
            <p className="text-xs text-gray-500">
              Create a case for any issue that doesn't fit into the other categories above.
            </p>
            <button
              onClick={() => {
                setCaseModalType('Ad Hoc');
                setShowCaseModal(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Ad Hoc Case
            </button>

            {/* Display existing Ad Hoc cases */}
            {adhocCases && adhocCases.length > 0 && (
              <div className="mt-3 space-y-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Existing Ad Hoc Cases</span>
                <div className="space-y-2">
                  {adhocCases.map((c) => (
                    <CaseCard key={c.id} caseData={c} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading Indicator */}
      {updateMutation.isPending && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Saving...
        </div>
      )}

      {/* Confirmation Modal for Case Creation */}
      {confirmTrigger && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Action</h3>
            </div>
            <p className="text-gray-600 mb-2">
              Setting <strong>{confirmTrigger.field?.label}</strong> to Yes will create a case:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="font-medium text-gray-900">{confirmTrigger.field?.triggerCase?.subject}</p>
              {confirmTrigger.field?.triggerCase?.assignTo && (
                <p className="text-sm text-gray-500">Assigned to: {confirmTrigger.field.triggerCase.assignTo}</p>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-6">Are you sure you want to proceed?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmTrigger(null)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTrigger}
                disabled={updateMutation.isPending || createCaseMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors disabled:opacity-50"
              >
                {(updateMutation.isPending || createCaseMutation.isPending) ? 'Processing...' : 'Yes, Create Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Case Creation Modal */}
      <CreateCaseModal
        isOpen={showCaseModal}
        onClose={() => {
          setShowCaseModal(false);
          setPendingFieldChange(null);
        }}
        onSubmit={handleCaseCreate}
        caseType={caseModalType}
        opportunity={opportunity}
        isLoading={createCaseMutation.isPending}
      />
    </div>
  );
}
