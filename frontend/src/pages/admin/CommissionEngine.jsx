import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cog,
  DollarSign,
  Calculator,
  Settings2,
  BarChart3,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Power,
  RefreshCw,
  Percent,
  Banknote,
  Gift,
  Users,
  Search,
  ChevronRight,
  Save,
  Building,
  MapPin,
  User,
  CheckCircle,
  AlertCircle,
  Clock,
  CheckSquare,
  Square,
  XCircle,
  Pause,
  ChevronDown,
  Filter,
  ClipboardCheck,
} from 'lucide-react';
import { commissionsApi, usersApi } from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

const RULE_TYPE_CONFIG = {
  PERCENTAGE: { label: 'Percentage', icon: Percent, color: 'bg-blue-100 text-blue-700' },
  FLAT: { label: 'Flat Amount', icon: Banknote, color: 'bg-green-100 text-green-700' },
  BONUS: { label: 'Bonus', icon: Gift, color: 'bg-purple-100 text-purple-700' },
};

const COMMISSION_TYPES = [
  { value: '', label: 'Any Type' },
  { value: 'PRE_COMMISSION', label: 'Pre-Commission' },
  { value: 'BACK_END', label: 'Back-End' },
  { value: 'SELF_GEN', label: 'Self-Gen' },
  { value: 'COMPANY_LEAD', label: 'Company Lead' },
  { value: 'MANAGER_OVERRIDE', label: 'Manager Override' },
  { value: 'REGIONAL_MANAGER_OVERRIDE', label: 'Regional Manager Override' },
  { value: 'DIRECTOR_OVERRIDE', label: 'Director Override' },
  { value: 'EXECUTIVE_OVERRIDE', label: 'Executive Override' },
  { value: 'SALES_FLIP', label: 'Sales Flip' },
  { value: 'SUPPLEMENT_OVERRIDE', label: 'Supplement Override' },
  { value: 'PM_COMMISSION', label: 'PM Commission' },
  { value: 'SALES_OP_COMMISSION', label: 'Sales Op Commission' },
  { value: 'PAYROLL_ADJUSTMENT', label: 'Payroll Adjustment' },
];

// Tab configuration
const TABS = [
  { id: 'approvals', label: 'Pending Approvals', icon: ClipboardCheck },
  { id: 'rules', label: 'Commission Rules', icon: Settings2 },
  { id: 'profiles', label: 'Commission Profiles', icon: Users },
];

// Commission Status Configuration
const STATUS_CONFIG = {
  NEW: { label: 'New', bgClass: 'bg-gray-100', textClass: 'text-gray-700', icon: Clock },
  REQUESTED: { label: 'Requested', bgClass: 'bg-yellow-100', textClass: 'text-yellow-700', icon: AlertCircle },
  APPROVED: { label: 'Approved', bgClass: 'bg-blue-100', textClass: 'text-blue-700', icon: CheckCircle },
  HOLD: { label: 'On Hold', bgClass: 'bg-orange-100', textClass: 'text-orange-700', icon: Pause },
  PAID: { label: 'Paid', bgClass: 'bg-green-100', textClass: 'text-green-700', icon: CheckCircle },
  DENIED: { label: 'Denied', bgClass: 'bg-red-100', textClass: 'text-red-700', icon: XCircle },
};

export default function CommissionEngine() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('approvals');
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [ruleFormData, setRuleFormData] = useState({
    name: '',
    description: '',
    ruleType: 'PERCENTAGE',
    rate: '',
    flatAmount: '',
    commissionType: '',
    isActive: true,
    priority: 0,
    appliesToRole: '',
    appliesToDepartment: '',
  });

  // Commission Profiles State
  const [profileSearch, setProfileSearch] = useState('');
  const [profileDepartmentFilter, setProfileDepartmentFilter] = useState('');
  const [profileOfficeFilter, setProfileOfficeFilter] = useState('');
  const [editingProfile, setEditingProfile] = useState(null);
  const [profileFormData, setProfileFormData] = useState({});

  // Pending Approvals State
  const [approvalStatusFilter, setApprovalStatusFilter] = useState('REQUESTED'); // REQUESTED, NEW, ALL
  const [approvalOwnerFilter, setApprovalOwnerFilter] = useState('');
  const [approvalTypeFilter, setApprovalTypeFilter] = useState('');
  const [selectedCommissions, setSelectedCommissions] = useState(new Set());
  const [groupBy, setGroupBy] = useState('owner'); // owner, opportunity, type
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAction, setBulkAction] = useState(null); // APPROVED, HOLD, DENIED
  const [bulkReason, setBulkReason] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Fetch commission rules
  const { data: rules = [], isLoading, refetch } = useQuery({
    queryKey: ['commission-rules', showInactive],
    queryFn: () => commissionsApi.getRules(showInactive),
  });

  // Fetch summary stats
  const { data: summary } = useQuery({
    queryKey: ['commissions-summary'],
    queryFn: () => commissionsApi.getSummary(),
  });

  // Fetch pending commissions for approval
  const approvalQueryParams = useMemo(() => {
    const params = { limit: 200, sortBy: 'createdAt', sortOrder: 'desc' };
    if (approvalStatusFilter && approvalStatusFilter !== 'ALL') {
      params.status = approvalStatusFilter;
    } else if (approvalStatusFilter === 'ALL') {
      // Fetch both NEW and REQUESTED
      params.status = 'NEW,REQUESTED';
    }
    if (approvalOwnerFilter) params.ownerId = approvalOwnerFilter;
    if (approvalTypeFilter) params.type = approvalTypeFilter;
    return params;
  }, [approvalStatusFilter, approvalOwnerFilter, approvalTypeFilter]);

  const { data: pendingCommissions, isLoading: approvalsLoading, refetch: refetchApprovals } = useQuery({
    queryKey: ['pending-commissions', approvalQueryParams],
    queryFn: () => commissionsApi.getCommissions(approvalQueryParams),
    enabled: activeTab === 'approvals',
  });

  const commissionsData = pendingCommissions?.data || [];

  // Group commissions by selected grouping
  const groupedCommissions = useMemo(() => {
    if (!commissionsData.length) return {};

    return commissionsData.reduce((groups, commission) => {
      let key;
      let label;

      if (groupBy === 'owner') {
        key = commission.ownerId || 'unassigned';
        label = commission.owner?.firstName && commission.owner?.lastName
          ? `${commission.owner.firstName} ${commission.owner.lastName}`
          : commission.owner?.name || 'Unassigned';
      } else if (groupBy === 'opportunity') {
        key = commission.opportunityId || 'no-opportunity';
        label = commission.opportunity?.name || commission.opportunity?.accountName || 'No Opportunity';
      } else if (groupBy === 'type') {
        key = commission.type || 'unknown';
        label = COMMISSION_TYPES.find(t => t.value === commission.type)?.label || commission.type?.replace(/_/g, ' ') || 'Unknown';
      }

      if (!groups[key]) {
        groups[key] = { key, label, items: [], totalAmount: 0 };
      }
      groups[key].items.push(commission);
      groups[key].totalAmount += parseFloat(commission.requestedAmount || commission.commissionAmount || 0);

      return groups;
    }, {});
  }, [commissionsData, groupBy]);

  // Get unique owners for filter dropdown
  const uniqueOwners = useMemo(() => {
    const owners = new Map();
    commissionsData.forEach(c => {
      if (c.ownerId && c.owner) {
        const name = c.owner.firstName && c.owner.lastName
          ? `${c.owner.firstName} ${c.owner.lastName}`
          : c.owner.name || 'Unknown';
        owners.set(c.ownerId, name);
      }
    });
    return Array.from(owners, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [commissionsData]);

  // Mutations
  const createRuleMutation = useMutation({
    mutationFn: (data) => commissionsApi.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      closeModal();
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, data }) => commissionsApi.updateRule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      closeModal();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => commissionsApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (id) => commissionsApi.toggleRuleStatus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    },
  });

  const seedRulesMutation = useMutation({
    mutationFn: () => commissionsApi.seedDefaultRules(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    },
  });

  // Bulk update commission status mutation
  const bulkStatusMutation = useMutation({
    mutationFn: ({ commissionIds, status, notes, reason }) =>
      commissionsApi.bulkUpdateStatus(commissionIds, status, notes, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
      setSelectedCommissions(new Set());
      setShowBulkModal(false);
      setBulkAction(null);
      setBulkReason('');
    },
  });

  // Single commission status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }) =>
      commissionsApi.updateStatus(id, status, null, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commissions-summary'] });
    },
  });

  // Fetch users with commission profiles
  const profileQueryParams = useMemo(() => {
    const params = { limit: 50, sortBy: 'lastName', sortOrder: 'asc' };
    if (profileSearch) params.search = profileSearch;
    if (profileDepartmentFilter) params.department = profileDepartmentFilter;
    if (profileOfficeFilter) params.officeAssignment = profileOfficeFilter;
    return params;
  }, [profileSearch, profileDepartmentFilter, profileOfficeFilter]);

  const { data: profilesData, isLoading: profilesLoading, refetch: refetchProfiles } = useQuery({
    queryKey: ['commission-profiles', profileQueryParams],
    queryFn: () => usersApi.getUsers(profileQueryParams),
    enabled: activeTab === 'profiles',
  });

  const { data: userStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => usersApi.getUserStats(),
    enabled: activeTab === 'profiles',
  });

  const profiles = profilesData?.data || [];
  const departments = Object.keys(userStats?.byDepartment || {}).sort();
  const offices = Object.keys(userStats?.byOffice || {}).sort();

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: ({ userId, data }) => usersApi.updateUser(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-profiles'] });
      setEditingProfile(null);
    },
  });

  // Commission Approval Helpers
  const toggleCommissionSelection = (commissionId) => {
    setSelectedCommissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commissionId)) {
        newSet.delete(commissionId);
      } else {
        newSet.add(commissionId);
      }
      return newSet;
    });
  };

  const toggleGroupSelection = (groupKey) => {
    const group = groupedCommissions[groupKey];
    if (!group) return;

    setSelectedCommissions(prev => {
      const newSet = new Set(prev);
      const groupIds = group.items.map(c => c.id);
      const allSelected = groupIds.every(id => newSet.has(id));

      if (allSelected) {
        groupIds.forEach(id => newSet.delete(id));
      } else {
        groupIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedCommissions(new Set(commissionsData.map(c => c.id)));
  };

  const clearSelection = () => {
    setSelectedCommissions(new Set());
  };

  const isGroupFullySelected = (groupKey) => {
    const group = groupedCommissions[groupKey];
    if (!group || group.items.length === 0) return false;
    return group.items.every(c => selectedCommissions.has(c.id));
  };

  const isGroupPartiallySelected = (groupKey) => {
    const group = groupedCommissions[groupKey];
    if (!group || group.items.length === 0) return false;
    const selectedCount = group.items.filter(c => selectedCommissions.has(c.id)).length;
    return selectedCount > 0 && selectedCount < group.items.length;
  };

  const toggleGroupExpansion = (groupKey) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const openBulkModal = (action) => {
    setBulkAction(action);
    setBulkReason('');
    setShowBulkModal(true);
  };

  const executeBulkAction = () => {
    if (!bulkAction || selectedCommissions.size === 0) return;

    bulkStatusMutation.mutate({
      commissionIds: Array.from(selectedCommissions),
      status: bulkAction,
      notes: bulkReason || null,
      reason: bulkAction === 'HOLD' || bulkAction === 'DENIED' ? bulkReason : null,
    });
  };

  const getSelectedTotal = () => {
    return commissionsData
      .filter(c => selectedCommissions.has(c.id))
      .reduce((sum, c) => sum + parseFloat(c.requestedAmount || c.commissionAmount || 0), 0);
  };

  const openProfileEdit = (user) => {
    setEditingProfile(user);
    setProfileFormData({
      companyLeadRate: user.companyLeadRate ?? '',
      selfGenRate: user.selfGenRate ?? '',
      preCommissionRate: user.preCommissionRate ?? '',
      commissionRate: user.commissionRate ?? '',
      overridePercent: user.overridePercent ?? '',
      supplementsCommissionable: user.supplementsCommissionable ?? false,
      x5050CommissionSplit: user.x5050CommissionSplit ?? false,
    });
  };

  const closeProfileEdit = () => {
    setEditingProfile(null);
    setProfileFormData({});
  };

  const saveProfile = () => {
    const cleanedData = {
      companyLeadRate: profileFormData.companyLeadRate === '' ? null : Number(profileFormData.companyLeadRate),
      selfGenRate: profileFormData.selfGenRate === '' ? null : Number(profileFormData.selfGenRate),
      preCommissionRate: profileFormData.preCommissionRate === '' ? null : Number(profileFormData.preCommissionRate),
      commissionRate: profileFormData.commissionRate === '' ? null : Number(profileFormData.commissionRate),
      overridePercent: profileFormData.overridePercent === '' ? null : Number(profileFormData.overridePercent),
      supplementsCommissionable: profileFormData.supplementsCommissionable,
      x5050CommissionSplit: profileFormData.x5050CommissionSplit,
    };
    updateProfileMutation.mutate({ userId: editingProfile.id, data: cleanedData });
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    return `${Number(value).toFixed(1)}%`;
  };

  const openAddModal = () => {
    setEditingRule(null);
    setRuleFormData({
      name: '',
      description: '',
      ruleType: 'PERCENTAGE',
      rate: '',
      flatAmount: '',
      commissionType: '',
      isActive: true,
      priority: 0,
      appliesToRole: '',
      appliesToDepartment: '',
    });
    setShowRuleModal(true);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setRuleFormData({
      name: rule.name,
      description: rule.description || '',
      ruleType: rule.ruleType,
      rate: rule.rate ? String(rule.rate) : '',
      flatAmount: rule.flatAmount ? String(rule.flatAmount) : '',
      commissionType: rule.commissionType || '',
      isActive: rule.isActive,
      priority: rule.priority || 0,
      appliesToRole: rule.appliesToRole || '',
      appliesToDepartment: rule.appliesToDepartment || '',
    });
    setShowRuleModal(true);
  };

  const closeModal = () => {
    setShowRuleModal(false);
    setEditingRule(null);
  };

  const handleSaveRule = () => {
    const data = {
      name: ruleFormData.name,
      description: ruleFormData.description || null,
      ruleType: ruleFormData.ruleType,
      rate: ruleFormData.rate ? parseFloat(ruleFormData.rate) : null,
      flatAmount: ruleFormData.flatAmount ? parseFloat(ruleFormData.flatAmount) : null,
      commissionType: ruleFormData.commissionType || null,
      isActive: ruleFormData.isActive,
      priority: parseInt(ruleFormData.priority) || 0,
      appliesToRole: ruleFormData.appliesToRole || null,
      appliesToDepartment: ruleFormData.appliesToDepartment || null,
    };

    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data });
    } else {
      createRuleMutation.mutate(data);
    }
  };

  const handleDeleteRule = (rule) => {
    if (window.confirm(`Are you sure you want to delete the rule "${rule.name}"?`)) {
      deleteRuleMutation.mutate(rule.id);
    }
  };

  const formatRateOrAmount = (rule) => {
    if (rule.ruleType === 'PERCENTAGE' || rule.ruleType === 'BONUS') {
      return `${rule.rate}%`;
    }
    return `$${parseFloat(rule.flatAmount || 0).toLocaleString()}`;
  };

  const activeRulesCount = rules.filter(r => r.isActive).length;
  const avgRate = rules.filter(r => r.isActive && r.rate).reduce((acc, r) => acc + parseFloat(r.rate), 0) / (rules.filter(r => r.isActive && r.rate).length || 1);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Engine</h1>
          <p className="text-gray-500 mt-1">Configure commission rules, rates, and user profiles</p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => activeTab === 'rules' ? refetch() : refetchProfiles()}
            className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {activeTab === 'rules' && rules.length === 0 && (
            <button
              onClick={() => seedRulesMutation.mutate()}
              disabled={seedRulesMutation.isPending}
              className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              {seedRulesMutation.isPending ? 'Creating...' : 'Seed Default Rules'}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const badge = tab.id === 'approvals' ? (summary?.byStatus?.REQUESTED?.count || 0) : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{tab.label}</span>
                {badge > 0 && (
                  <span className="ml-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Pending Approvals Tab */}
      {activeTab === 'approvals' && (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Approval</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {summary?.byStatus?.REQUESTED?.count || 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Amount Pending</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${(summary?.byStatus?.REQUESTED?.amount || 0).toLocaleString()}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Selected</p>
                  <p className="text-2xl font-bold text-panda-primary">
                    {selectedCommissions.size}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-purple-600" />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Selected Total</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${getSelectedTotal().toLocaleString()}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Filters and Actions Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-600">Filters:</span>
                </div>
                <select
                  value={approvalStatusFilter}
                  onChange={(e) => setApprovalStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="REQUESTED">Requested (Ready)</option>
                  <option value="NEW">New (Not Ready)</option>
                  <option value="ALL">All Pending</option>
                </select>
                <select
                  value={approvalOwnerFilter}
                  onChange={(e) => setApprovalOwnerFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="">All Owners</option>
                  {uniqueOwners.map(owner => (
                    <option key={owner.id} value={owner.id}>{owner.name}</option>
                  ))}
                </select>
                <select
                  value={approvalTypeFilter}
                  onChange={(e) => setApprovalTypeFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="">All Types</option>
                  {COMMISSION_TYPES.filter(t => t.value).map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
                <div className="flex items-center space-x-2 border-l border-gray-200 pl-3">
                  <span className="text-sm text-gray-500">Group by:</span>
                  <select
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                  >
                    <option value="owner">Owner</option>
                    <option value="opportunity">Opportunity</option>
                    <option value="type">Commission Type</option>
                  </select>
                </div>
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center gap-2">
                {selectedCommissions.size > 0 ? (
                  <>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Clear ({selectedCommissions.size})
                    </button>
                    <button
                      onClick={() => openBulkModal('APPROVED')}
                      className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve Selected
                    </button>
                    <button
                      onClick={() => openBulkModal('HOLD')}
                      className="inline-flex items-center px-3 py-2 border border-orange-300 text-orange-600 text-sm font-medium rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      <Pause className="w-4 h-4 mr-1" />
                      Hold
                    </button>
                    <button
                      onClick={() => openBulkModal('DENIED')}
                      className="inline-flex items-center px-3 py-2 border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Deny
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={selectAll}
                      disabled={commissionsData.length === 0}
                      className="px-3 py-2 text-sm text-panda-primary hover:bg-panda-primary/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => refetchApprovals()}
                      className="inline-flex items-center px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Commissions List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {approvalsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
              </div>
            ) : commissionsData.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No commissions pending approval</p>
                <p className="text-sm text-gray-400 mt-1">
                  {approvalStatusFilter === 'REQUESTED'
                    ? 'All commission requests have been processed'
                    : 'No commissions match the current filters'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {Object.values(groupedCommissions).map((group) => {
                  const isExpanded = expandedGroups.has(group.key);
                  const isFullySelected = isGroupFullySelected(group.key);
                  const isPartiallySelected = isGroupPartiallySelected(group.key);

                  return (
                    <div key={group.key} className="bg-white">
                      {/* Group Header */}
                      <div
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 ${
                          isFullySelected ? 'bg-green-50' : isPartiallySelected ? 'bg-yellow-50' : ''
                        }`}
                        onClick={() => toggleGroupExpansion(group.key)}
                      >
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroupSelection(group.key);
                            }}
                            className="p-1 hover:bg-gray-200 rounded"
                          >
                            {isFullySelected ? (
                              <CheckSquare className="w-5 h-5 text-green-600" />
                            ) : isPartiallySelected ? (
                              <CheckSquare className="w-5 h-5 text-yellow-500" />
                            ) : (
                              <Square className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <div className="flex items-center space-x-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">{group.label}</span>
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                              {group.items.length} commission{group.items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${group.totalAmount.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Group Items */}
                      {isExpanded && (
                        <div className="bg-gray-50 border-t border-gray-100">
                          {group.items.map((commission) => {
                            const typeConfig = COMMISSION_TYPES.find(t => t.value === commission.type);
                            const statusConfig = STATUS_CONFIG[commission.status];
                            const StatusIcon = statusConfig?.icon || Clock;
                            const amount = parseFloat(commission.requestedAmount || commission.commissionAmount || 0);
                            const rate = parseFloat(commission.commissionRate || 0);
                            const value = parseFloat(commission.commissionValue || 0);
                            const isSelected = selectedCommissions.has(commission.id);

                            return (
                              <div
                                key={commission.id}
                                className={`flex items-center justify-between px-6 py-3 border-b border-gray-100 last:border-b-0 ${
                                  isSelected ? 'bg-green-50' : 'hover:bg-white'
                                }`}
                              >
                                <div className="flex items-center space-x-4">
                                  <button
                                    onClick={() => toggleCommissionSelection(commission.id)}
                                    className="p-1 hover:bg-gray-200 rounded"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-5 h-5 text-green-600" />
                                    ) : (
                                      <Square className="w-5 h-5 text-gray-400" />
                                    )}
                                  </button>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className="font-medium text-gray-900 text-sm">
                                        {typeConfig?.label || commission.type?.replace(/_/g, ' ')}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center space-x-1 ${statusConfig?.bgClass} ${statusConfig?.textClass}`}>
                                        <StatusIcon className="w-3 h-3" />
                                        <span>{statusConfig?.label}</span>
                                      </span>
                                      {commission.isSelfGen && (
                                        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700">Self-Gen</span>
                                      )}
                                      {commission.isCompanyLead && (
                                        <span className="px-1.5 py-0.5 rounded text-xs bg-sky-100 text-sky-700">Company Lead</span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                                      {groupBy !== 'owner' && commission.owner && (
                                        <span className="flex items-center">
                                          <User className="w-3 h-3 mr-1" />
                                          {commission.owner.firstName} {commission.owner.lastName}
                                        </span>
                                      )}
                                      {groupBy !== 'opportunity' && commission.opportunity && (
                                        <span className="flex items-center">
                                          <Building className="w-3 h-3 mr-1" />
                                          {commission.opportunity.name || commission.opportunity.accountName}
                                        </span>
                                      )}
                                      <span>{rate}% of ${value.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <span className="font-bold text-green-600">${amount.toLocaleString()}</span>
                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={() => {
                                        updateStatusMutation.mutate({ id: commission.id, status: 'APPROVED' });
                                      }}
                                      disabled={updateStatusMutation.isPending}
                                      className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                                      title="Approve"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const reason = window.prompt('Hold reason (optional):');
                                        updateStatusMutation.mutate({ id: commission.id, status: 'HOLD', reason });
                                      }}
                                      disabled={updateStatusMutation.isPending}
                                      className="p-1.5 text-orange-500 hover:bg-orange-100 rounded transition-colors"
                                      title="Put on Hold"
                                    >
                                      <Pause className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        const reason = window.prompt('Denial reason:');
                                        if (reason) {
                                          updateStatusMutation.mutate({ id: commission.id, status: 'DENIED', reason });
                                        }
                                      }}
                                      disabled={updateStatusMutation.isPending}
                                      className="p-1.5 text-red-500 hover:bg-red-100 rounded transition-colors"
                                      title="Deny"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Helper Info */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Commission Approval Workflow</h4>
                <p className="text-sm text-blue-700 mt-1">
                  <strong>Requested:</strong> Commissions marked as ready for approval by the system or rep.<br />
                  <strong>New:</strong> Commissions just created, may need review before requesting approval.<br />
                  Use the checkboxes to select multiple commissions and approve, hold, or deny them in bulk.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {bulkAction === 'APPROVED' && 'Approve Commissions'}
                  {bulkAction === 'HOLD' && 'Hold Commissions'}
                  {bulkAction === 'DENIED' && 'Deny Commissions'}
                </h2>
                <button onClick={() => setShowBulkModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Selected Commissions</span>
                <span className="font-bold text-gray-900">{selectedCommissions.size}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="text-gray-600">Total Amount</span>
                <span className="font-bold text-green-600">${getSelectedTotal().toLocaleString()}</span>
              </div>

              {(bulkAction === 'HOLD' || bulkAction === 'DENIED') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {bulkAction === 'HOLD' ? 'Hold Reason (optional)' : 'Denial Reason (required)'}
                  </label>
                  <textarea
                    value={bulkReason}
                    onChange={(e) => setBulkReason(e.target.value)}
                    placeholder={bulkAction === 'HOLD' ? 'Enter reason for holding...' : 'Enter reason for denial...'}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none"
                  />
                </div>
              )}

              <div className={`p-4 rounded-lg ${
                bulkAction === 'APPROVED' ? 'bg-green-50 border border-green-100' :
                bulkAction === 'HOLD' ? 'bg-orange-50 border border-orange-100' :
                'bg-red-50 border border-red-100'
              }`}>
                <p className={`text-sm ${
                  bulkAction === 'APPROVED' ? 'text-green-700' :
                  bulkAction === 'HOLD' ? 'text-orange-700' :
                  'text-red-700'
                }`}>
                  {bulkAction === 'APPROVED' && 'These commissions will be approved and ready for payment processing.'}
                  {bulkAction === 'HOLD' && 'These commissions will be placed on hold until further review.'}
                  {bulkAction === 'DENIED' && 'These commissions will be denied. This action can be reversed.'}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end space-x-2">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkAction}
                disabled={bulkStatusMutation.isPending || (bulkAction === 'DENIED' && !bulkReason)}
                className={`px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 flex items-center ${
                  bulkAction === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' :
                  bulkAction === 'HOLD' ? 'bg-orange-500 hover:bg-orange-600' :
                  'bg-red-600 hover:bg-red-700'
                }`}
              >
                {bulkStatusMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {bulkAction === 'APPROVED' && <CheckCircle className="w-4 h-4 mr-2" />}
                    {bulkAction === 'HOLD' && <Pause className="w-4 h-4 mr-2" />}
                    {bulkAction === 'DENIED' && <XCircle className="w-4 h-4 mr-2" />}
                    {bulkAction === 'APPROVED' && `Approve ${selectedCommissions.size} Commission${selectedCommissions.size !== 1 ? 's' : ''}`}
                    {bulkAction === 'HOLD' && `Hold ${selectedCommissions.size} Commission${selectedCommissions.size !== 1 ? 's' : ''}`}
                    {bulkAction === 'DENIED' && `Deny ${selectedCommissions.size} Commission${selectedCommissions.size !== 1 ? 's' : ''}`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commission Rules Tab */}
      {activeTab === 'rules' && (
        <>
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Rules</p>
                  <p className="text-2xl font-bold text-gray-900">{activeRulesCount}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">This Month</p>
              <p className="text-2xl font-bold text-gray-900">
                ${((summary?.byStatus?.PAID?.amount || 0) + (summary?.byStatus?.APPROVED?.amount || 0)).toLocaleString()}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending Calcs</p>
              <p className="text-2xl font-bold text-gray-900">
                {(summary?.byStatus?.NEW?.count || 0) + (summary?.byStatus?.REQUESTED?.count || 0)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Rate</p>
              <p className="text-2xl font-bold text-gray-900">{avgRate.toFixed(1)}%</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Commission Rules */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h2 className="text-lg font-semibold text-gray-900">Commission Rules</h2>
              <label className="flex items-center text-sm text-gray-500">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-gray-300 text-panda-primary focus:ring-panda-primary mr-2"
                />
                Show inactive
              </label>
            </div>
            <button
              onClick={openAddModal}
              className="px-4 py-2 bg-panda-primary text-white text-sm font-medium rounded-lg hover:bg-panda-primary/90 transition-colors flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Rule
            </button>
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full" />
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8">
                <Cog className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">No commission rules configured yet.</p>
                <button
                  onClick={() => seedRulesMutation.mutate()}
                  disabled={seedRulesMutation.isPending}
                  className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
                >
                  {seedRulesMutation.isPending ? 'Creating...' : 'Create Default Rules'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => {
                  const typeConfig = RULE_TYPE_CONFIG[rule.ruleType] || RULE_TYPE_CONFIG.PERCENTAGE;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <div
                      key={rule.id}
                      className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                        rule.isActive ? 'bg-gray-50 hover:bg-gray-100' : 'bg-gray-50/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm ${typeConfig.color}`}>
                          <TypeIcon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{rule.name}</p>
                          <div className="flex items-center space-x-2 text-sm text-gray-500">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                            {rule.commissionType && (
                              <span className="text-gray-400">
                                • {COMMISSION_TYPES.find(t => t.value === rule.commissionType)?.label || rule.commissionType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-lg font-semibold text-gray-900">
                          {formatRateOrAmount(rule)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          rule.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rule.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => toggleRuleMutation.mutate(rule.id)}
                            className={`p-1.5 rounded hover:bg-white ${
                              rule.isActive ? 'text-green-500 hover:text-green-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                            title={rule.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(rule)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white rounded"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Configuration Panel */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Quick Reference</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Rule Types</h3>
              <div className="space-y-2">
                {Object.entries(RULE_TYPE_CONFIG).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <div key={key} className="flex items-center space-x-3 text-sm">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">{config.label}</p>
                        <p className="text-xs text-gray-500">
                          {key === 'PERCENTAGE' && 'Calculated as % of contract value'}
                          {key === 'FLAT' && 'Fixed dollar amount per contract'}
                          {key === 'BONUS' && 'Additional % on top of base commission'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Commission Flow</h3>
              <div className="text-xs text-gray-500 space-y-1">
                <p>1. Contract created → Pre-commission</p>
                <p>2. Onboarding complete → Commission activated</p>
                <p>3. Paid in full → Back-end commission</p>
                <p>4. Override commissions → Management hierarchy</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Status Legend</h3>
              <div className="space-y-1 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                  <span>NEW - Just created</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  <span>REQUESTED - Ready for approval</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span>APPROVED - Approved for payment</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>PAID - Payment processed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Commission Profiles Tab */}
      {activeTab === 'profiles' && (
        <div className="space-y-6">
          {/* Profile Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email..."
                  value={profileSearch}
                  onChange={(e) => setProfileSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                />
              </div>
              <select
                value={profileDepartmentFilter}
                onChange={(e) => setProfileDepartmentFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select
                value={profileOfficeFilter}
                onChange={(e) => setProfileOfficeFilter(e.target.value)}
                className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
              >
                <option value="">All Offices</option>
                {offices.map(office => (
                  <option key={office} value={office}>{office}</option>
                ))}
              </select>
              {(profileSearch || profileDepartmentFilter || profileOfficeFilter) && (
                <button
                  onClick={() => {
                    setProfileSearch('');
                    setProfileDepartmentFilter('');
                    setProfileOfficeFilter('');
                  }}
                  className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-4 h-4" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Commission Profile Fields</h4>
                <p className="text-sm text-blue-700 mt-1">
                  Each user's commission profile controls their individual rates. These rates are applied when commissions are calculated based on job type (Company Lead vs Self-Gen) and commission phase (Pre-Commission vs Back-End).
                </p>
              </div>
            </div>
          </div>

          {/* Profiles Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {profilesLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
              </div>
            ) : profiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Users className="w-12 h-12 mb-2 text-gray-300" />
                <p>No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department / Office</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Company Lead</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Self-Gen</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pre-Comm</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Commission</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Override</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Supplements</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">50/50 Split</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {profiles.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div className="flex items-center">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                              {user.firstName?.[0]}{user.lastName?.[0]}
                            </div>
                            <div className="ml-3">
                              <p className="font-medium text-gray-900 text-sm">{user.fullName || `${user.firstName} ${user.lastName}`}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm">
                            <p className="text-gray-700">{user.department || '-'}</p>
                            <p className="text-xs text-gray-400">{user.officeAssignment || '-'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            user.companyLeadRate ? 'bg-blue-50 text-blue-700' : 'text-gray-400'
                          }`}>
                            {formatPercent(user.companyLeadRate)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            user.selfGenRate ? 'bg-green-50 text-green-700' : 'text-gray-400'
                          }`}>
                            {formatPercent(user.selfGenRate)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            user.preCommissionRate ? 'bg-purple-50 text-purple-700' : 'text-gray-400'
                          }`}>
                            {formatPercent(user.preCommissionRate)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            user.commissionRate ? 'bg-indigo-50 text-indigo-700' : 'text-gray-400'
                          }`}>
                            {formatPercent(user.commissionRate)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-sm font-medium ${
                            user.overridePercent ? 'bg-orange-50 text-orange-700' : 'text-gray-400'
                          }`}>
                            {formatPercent(user.overridePercent)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {user.supplementsCommissionable ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {user.x5050CommissionSplit ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => openProfileEdit(user)}
                            className="p-2 text-gray-400 hover:text-panda-primary hover:bg-gray-100 rounded-lg"
                            title="Edit Commission Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Profile Reference */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Commission Profile Field Reference</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Company Lead Rate</p>
                <p className="text-xs text-gray-500 mt-1">The full % collected when the job is a Company Lead</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Self-Gen Rate</p>
                <p className="text-xs text-gray-500 mt-1">The full % collected when the job is a Self-Gen Lead</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Pre-Commission Rate</p>
                <p className="text-xs text-gray-500 mt-1">% of rate paid at onboarding completion</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Commission Rate</p>
                <p className="text-xs text-gray-500 mt-1">% of rate paid when job is paid in full</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Override %</p>
                <p className="text-xs text-gray-500 mt-1">Manager/team lead override percentage</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">Supplements Commissionable</p>
                <p className="text-xs text-gray-500 mt-1">Whether user earns commission on supplement amounts</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-700 text-sm">50/50 Commission Split</p>
                <p className="text-xs text-gray-500 mt-1">When enabled, user receives 50% of rate on both pre-commission and back-end</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                    {editingProfile.firstName?.[0]}{editingProfile.lastName?.[0]}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Edit Commission Profile</h2>
                    <p className="text-sm text-gray-500">{editingProfile.fullName || `${editingProfile.firstName} ${editingProfile.lastName}`}</p>
                  </div>
                </div>
                <button onClick={closeProfileEdit} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Rate Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Lead Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={profileFormData.companyLeadRate}
                    onChange={(e) => setProfileFormData({ ...profileFormData, companyLeadRate: e.target.value })}
                    placeholder="e.g., 8.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Self-Gen Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={profileFormData.selfGenRate}
                    onChange={(e) => setProfileFormData({ ...profileFormData, selfGenRate: e.target.value })}
                    placeholder="e.g., 10.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pre-Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={profileFormData.preCommissionRate}
                    onChange={(e) => setProfileFormData({ ...profileFormData, preCommissionRate: e.target.value })}
                    placeholder="e.g., 100"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">% of rate paid at onboarding</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={profileFormData.commissionRate}
                    onChange={(e) => setProfileFormData({ ...profileFormData, commissionRate: e.target.value })}
                    placeholder="e.g., 0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">% of rate paid at job completion</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Override % (for managers)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={profileFormData.overridePercent}
                    onChange={(e) => setProfileFormData({ ...profileFormData, overridePercent: e.target.value })}
                    placeholder="e.g., 1.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
              </div>

              {/* Toggle Options */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-700">Supplements Commissionable</p>
                    <p className="text-sm text-gray-500">Earn commission on supplement amounts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileFormData({ ...profileFormData, supplementsCommissionable: !profileFormData.supplementsCommissionable })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      profileFormData.supplementsCommissionable ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        profileFormData.supplementsCommissionable ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-700">50/50 Commission Split</p>
                    <p className="text-sm text-gray-500">Receive 50% of rate on both pre-commission and back-end</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileFormData({ ...profileFormData, x5050CommissionSplit: !profileFormData.x5050CommissionSplit })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      profileFormData.x5050CommissionSplit ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        profileFormData.x5050CommissionSplit ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 flex justify-end space-x-2">
              <button
                onClick={closeProfileEdit}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveProfile}
                disabled={updateProfileMutation.isPending}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Profile
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingRule ? 'Edit Rule' : 'Add Commission Rule'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name *</label>
                <input
                  type="text"
                  value={ruleFormData.name}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
                  placeholder="e.g., Standard Sales Commission"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={ruleFormData.description}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, description: e.target.value })}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>

              {/* Rule Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Type *</label>
                <select
                  value={ruleFormData.ruleType}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, ruleType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FLAT">Flat Amount</option>
                  <option value="BONUS">Bonus</option>
                </select>
              </div>

              {/* Rate / Amount */}
              {(ruleFormData.ruleType === 'PERCENTAGE' || ruleFormData.ruleType === 'BONUS') ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={ruleFormData.rate}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, rate: e.target.value })}
                    placeholder="e.g., 8.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Flat Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={ruleFormData.flatAmount}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, flatAmount: e.target.value })}
                    placeholder="e.g., 200.00"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
              )}

              {/* Commission Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applies to Commission Type</label>
                <select
                  value={ruleFormData.commissionType}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, commissionType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
                >
                  {COMMISSION_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority (0 = highest)</label>
                <input
                  type="number"
                  min="0"
                  value={ruleFormData.priority}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>

              {/* Applies To (Optional filters) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Applies to Role</label>
                  <input
                    type="text"
                    value={ruleFormData.appliesToRole}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, appliesToRole: e.target.value })}
                    placeholder="e.g., sales_rep"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Applies to Department</label>
                  <input
                    type="text"
                    value={ruleFormData.appliesToDepartment}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, appliesToDepartment: e.target.value })}
                    placeholder="e.g., Sales"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-700">Rule Status</p>
                  <p className="text-sm text-gray-500">Enable or disable this rule</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRuleFormData({ ...ruleFormData, isActive: !ruleFormData.isActive })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    ruleFormData.isActive ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      ruleFormData.isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-100 flex justify-end space-x-2">
              <button
                onClick={closeModal}
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRule}
                disabled={!ruleFormData.name || createRuleMutation.isPending || updateRuleMutation.isPending}
                className="px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center"
              >
                {(createRuleMutation.isPending || updateRuleMutation.isPending) ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
