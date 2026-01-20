import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { opportunitiesApi, accountsApi } from '../services/api';
import {
  ArrowLeft,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Calendar,
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  DollarSign,
  User,
  Building2,
  Eye,
  Edit2,
  ExternalLink,
  Image,
  Plus,
  MoreVertical,
  FolderOpen,
  ClipboardCheck,
  AlertCircle,
  Wrench,
  Home,
  Zap,
  FileCheck,
  UserCheck,
} from 'lucide-react';

// Status badge styles
const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-800',
  inProgress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  issue: 'bg-red-100 text-red-800',
};

// Onboarding checklist items
const ONBOARDING_CHECKLIST = [
  { id: 'estimate_received', label: 'Estimate Received', icon: FileText },
  { id: 'contract_received', label: 'Contract Received', icon: FileText },
  { id: 'down_payment_received', label: 'Down Payment Received', icon: DollarSign },
  { id: 'deductible_received', label: 'Deductible Received', icon: DollarSign },
  { id: 'photos_collected', label: 'Photos Collected', icon: Camera },
  { id: 'pii_complete', label: 'PII Complete', icon: ClipboardCheck },
];

// Fields migrated to Onboarding section (from Project Expediting in Salesforce)
const ONBOARDING_EXTENDED_CHECKLIST = [
  { id: 'hoa_required', label: 'HOA Required', icon: Home, type: 'select', options: ['yes', 'no', 'unknown'] },
  { id: 'permit_required', label: 'Permit Required', icon: FileCheck, type: 'checkbox' },
  { id: 'change_order_signed', label: 'Change Order Signed', icon: FileText, type: 'checkbox' },
  { id: 'solar_dnr_required', label: 'Solar DNR Required', icon: Zap, type: 'checkbox' },
  { id: 'not_install_ready', label: 'Not Install Ready', icon: AlertTriangle, type: 'checkbox' },
];

// Project Expediting checklist items
const EXPEDITING_CHECKLIST = [
  { id: 'job_complexity_photos_reviewed', label: 'Job Complexity Photos Reviewed', icon: Camera, type: 'checkbox' },
  { id: 'flat_roof', label: 'Flat Roof', icon: Home, type: 'toggle', triggerWarning: 'This will create a case for Trevor (Flat Roof Review)' },
  { id: 'line_drop', label: 'Line Drop Required', icon: Zap, type: 'toggle', triggerWarning: 'This will create a case for Kevin Flores and send an SMS to the homeowner' },
  { id: 'supplement_required', label: 'Supplement Required', icon: FileText, type: 'checkbox' },
  { id: 'supplement_holds_job', label: 'Supplement Holds Job', icon: AlertTriangle, type: 'checkbox', conditionalOn: 'supplement_required' },
  { id: 'veto_install_not_ready', label: 'Veto Install Not Ready', icon: AlertCircle, type: 'checkbox' },
];

export default function ClaimsOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('pending-onboarding');
  const [expandedRow, setExpandedRow] = useState(null);
  const [editingOnboardingDate, setEditingOnboardingDate] = useState(null);
  const [onboardingDateValue, setOnboardingDateValue] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Project Expediting state
  const [editingExpeditingDate, setEditingExpeditingDate] = useState(null);
  const [expeditingDateValue, setExpeditingDateValue] = useState('');
  const [confirmTrigger, setConfirmTrigger] = useState(null); // { oppId, field, value, warning }

  // Fetch opportunities that need onboarding (sold but no onboarding start date)
  const { data: opportunitiesData, isLoading: oppsLoading, refetch: refetchOpps } = useQuery({
    queryKey: ['opportunities', 'claims-onboarding'],
    queryFn: () => opportunitiesApi.getOpportunities({
      limit: 500,
      stage: 'CLOSED_WON,CONTRACT_SIGNED,APPROVED',
      workType: 'Insurance',
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Update opportunity mutation
  const updateOpportunityMutation = useMutation({
    mutationFn: ({ id, data }) => opportunitiesApi.updateOpportunity(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['opportunities']);
      setEditingOnboardingDate(null);
      setOnboardingDateValue('');
    },
  });

  // Filter opportunities based on tab and search
  const filteredOpportunities = useMemo(() => {
    let opps = opportunitiesData?.data || [];

    // Filter by tab
    if (selectedTab === 'pending-onboarding') {
      // Jobs sold but no onboarding start date set
      opps = opps.filter(opp => !opp.onboardingStartDate);
    } else if (selectedTab === 'in-progress') {
      // Jobs with onboarding started but not complete
      opps = opps.filter(opp => opp.onboardingStartDate && !opp.onboardingCompleteDate);
    } else if (selectedTab === 'photo-review') {
      // Jobs where photos need to be reviewed
      opps = opps.filter(opp => opp.onboardingStartDate && opp.photosCollected === null);
    } else if (selectedTab === 'photos-insufficient') {
      // Jobs where photos were marked insufficient
      opps = opps.filter(opp => opp.photosCollected === false);
    } else if (selectedTab === 'completed') {
      // Fully onboarded jobs (but not yet expediting)
      opps = opps.filter(opp => opp.onboardingCompleteDate && !opp.projectExpeditingStartDate);
    } else if (selectedTab === 'project-expediting') {
      // Jobs ready for or in project expediting (onboarding complete)
      opps = opps.filter(opp => opp.onboardingCompleteDate);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      opps = opps.filter(opp =>
        opp.name?.toLowerCase().includes(query) ||
        opp.jobId?.toLowerCase().includes(query) ||
        opp.account?.name?.toLowerCase().includes(query) ||
        opp.owner?.name?.toLowerCase().includes(query)
      );
    }

    return opps;
  }, [opportunitiesData, selectedTab, searchQuery]);

  // Compute tab counts
  const tabCounts = useMemo(() => {
    const opps = opportunitiesData?.data || [];
    return {
      'pending-onboarding': opps.filter(o => !o.onboardingStartDate).length,
      'in-progress': opps.filter(o => o.onboardingStartDate && !o.onboardingCompleteDate).length,
      'photo-review': opps.filter(o => o.onboardingStartDate && o.photosCollected === null).length,
      'photos-insufficient': opps.filter(o => o.photosCollected === false).length,
      'completed': opps.filter(o => o.onboardingCompleteDate && !o.projectExpeditingStartDate).length,
      'project-expediting': opps.filter(o => o.onboardingCompleteDate).length,
    };
  }, [opportunitiesData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetchOpps();
    setIsRefreshing(false);
  };

  const handleSetOnboardingDate = (oppId) => {
    const today = new Date().toISOString().split('T')[0];
    setEditingOnboardingDate(oppId);
    setOnboardingDateValue(today);
  };

  const handleSaveOnboardingDate = async (oppId) => {
    if (!onboardingDateValue) return;
    await updateOpportunityMutation.mutateAsync({
      id: oppId,
      data: { onboardingStartDate: new Date(onboardingDateValue).toISOString() },
    });
  };

  const handlePhotosCollected = async (oppId, sufficient) => {
    await updateOpportunityMutation.mutateAsync({
      id: oppId,
      data: {
        photosCollected: sufficient,
        photosReviewedDate: new Date().toISOString(),
      },
    });
  };

  // Project Expediting handlers
  const handleSetExpeditingDate = (oppId) => {
    const today = new Date().toISOString().split('T')[0];
    setEditingExpeditingDate(oppId);
    setExpeditingDateValue(today);
  };

  const handleSaveExpeditingDate = async (oppId) => {
    if (!expeditingDateValue) return;
    await updateOpportunityMutation.mutateAsync({
      id: oppId,
      data: { projectExpeditingStartDate: new Date(expeditingDateValue).toISOString() },
    });
    setEditingExpeditingDate(null);
    setExpeditingDateValue('');
  };

  const handleExpeditingFieldChange = async (oppId, field, value, triggerWarning = null) => {
    // If this field has a trigger warning and we're setting to true, show confirmation
    if (triggerWarning && value === true) {
      setConfirmTrigger({ oppId, field, value, warning: triggerWarning });
      return;
    }

    // Convert field name from snake_case to camelCase for API
    const camelCaseField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    await updateOpportunityMutation.mutateAsync({
      id: oppId,
      data: { [camelCaseField]: value },
    });
  };

  const handleConfirmTrigger = async () => {
    if (!confirmTrigger) return;
    const { oppId, field, value } = confirmTrigger;
    const camelCaseField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    await updateOpportunityMutation.mutateAsync({
      id: oppId,
      data: { [camelCaseField]: value },
    });
    setConfirmTrigger(null);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysSinceSold = (soldDate) => {
    if (!soldDate) return null;
    const sold = new Date(soldDate);
    const now = new Date();
    const diffTime = Math.abs(now - sold);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const tabs = [
    { id: 'pending-onboarding', label: 'Pending Onboarding', icon: Clock },
    { id: 'in-progress', label: 'In Progress', icon: RefreshCw },
    { id: 'photo-review', label: 'Photo Review', icon: Camera },
    { id: 'photos-insufficient', label: 'Photos Insufficient', icon: AlertTriangle },
    { id: 'completed', label: 'Completed', icon: CheckCircle },
    { id: 'project-expediting', label: 'Project Expediting', icon: Wrench },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboards"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Claims Onboarding Dashboard</h1>
            <p className="text-gray-500">Manage PandaClaims onboarding and photo review workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-400 to-yellow-500 flex items-center justify-center">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['pending-onboarding']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Pending Onboarding</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['in-progress']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">In Progress</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['photo-review']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Photo Review</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-400 to-red-500 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['photos-insufficient']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Photos Insufficient</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['completed']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Completed</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-500 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">{tabCounts['project-expediting']}</span>
          </div>
          <p className="mt-2 text-sm text-gray-500">Project Expediting</p>
        </div>
      </div>

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap ${
                  selectedTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{tab.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  selectedTab === tab.id ? 'bg-panda-primary text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none text-sm w-64"
          />
        </div>
      </div>

      {/* Jobs List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {oppsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Loading jobs...</span>
            </div>
          </div>
        ) : filteredOpportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <FolderOpen className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium">No jobs found</p>
            <p className="text-sm">
              {selectedTab === 'pending-onboarding'
                ? 'All sold jobs have been onboarded'
                : `No jobs in ${tabs.find(t => t.id === selectedTab)?.label} status`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Job</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sold Date</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarding Started</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Photos</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOpportunities.map((opp) => {
                  const daysSinceSold = getDaysSinceSold(opp.closeDate || opp.soldDate);
                  const isExpanded = expandedRow === opp.id;

                  return (
                    <tr key={opp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setExpandedRow(isExpanded ? null : opp.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                          <div>
                            <Link
                              to={`/jobs/${opp.id}`}
                              className="font-medium text-gray-900 hover:text-panda-primary"
                            >
                              {opp.jobId || opp.name}
                            </Link>
                            <p className="text-sm text-gray-500">{opp.owner?.name || 'Unassigned'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-900">{opp.account?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">{formatCurrency(opp.amount)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <span className="text-sm text-gray-900">{formatDate(opp.closeDate || opp.soldDate)}</span>
                          {daysSinceSold && (
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                              daysSinceSold > 7 ? 'bg-red-100 text-red-700' :
                              daysSinceSold > 3 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {daysSinceSold}d ago
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {editingOnboardingDate === opp.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={onboardingDateValue}
                              onChange={(e) => setOnboardingDateValue(e.target.value)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
                            />
                            <button
                              onClick={() => handleSaveOnboardingDate(opp.id)}
                              disabled={updateOpportunityMutation.isPending}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingOnboardingDate(null);
                                setOnboardingDateValue('');
                              }}
                              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : opp.onboardingStartDate ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-900">{formatDate(opp.onboardingStartDate)}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSetOnboardingDate(opp.id)}
                            className="flex items-center gap-1 text-sm text-panda-primary hover:text-panda-secondary font-medium"
                          >
                            <Calendar className="w-4 h-4" />
                            Set Date
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {opp.photosCollected === true ? (
                          <span className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            Sufficient
                          </span>
                        ) : opp.photosCollected === false ? (
                          <span className="flex items-center gap-1 text-sm text-red-600">
                            <AlertTriangle className="w-4 h-4" />
                            Insufficient
                          </span>
                        ) : opp.onboardingStartDate ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePhotosCollected(opp.id, true)}
                              disabled={updateOpportunityMutation.isPending}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              <CheckCircle className="w-3 h-3" />
                              OK
                            </button>
                            <button
                              onClick={() => handlePhotosCollected(opp.id, false)}
                              disabled={updateOpportunityMutation.isPending}
                              className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              <XCircle className="w-3 h-3" />
                              Issue
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/jobs/${opp.id}`}
                            className="p-2 text-gray-400 hover:text-panda-primary hover:bg-gray-100 rounded-lg transition-colors"
                            title="View Job"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {opp.companyCamProjectId && (
                            <a
                              href={`https://app.companycam.com/projects/${opp.companyCamProjectId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                              title="View Photos in CompanyCam"
                            >
                              <Camera className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Workflow Guide</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-yellow-500 mt-0.5" />
            <div>
              <p className="font-medium">Pending Onboarding</p>
              <p className="text-xs">Jobs sold but not yet started onboarding</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Camera className="w-4 h-4 text-purple-500 mt-0.5" />
            <div>
              <p className="font-medium">Photo Review</p>
              <p className="text-xs">Review CompanyCam photos for sufficiency</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium">Photos Insufficient</p>
              <p className="text-xs">Create case for additional photos</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium">Completed</p>
              <p className="text-xs">Fully onboarded and ready for production</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Wrench className="w-4 h-4 text-orange-500 mt-0.5" />
            <div>
              <p className="font-medium">Project Expediting</p>
              <p className="text-xs">Review complexity, flat roof, line drop needs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trigger Confirmation Modal */}
      {confirmTrigger && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Confirm Action</h3>
            </div>
            <p className="text-gray-600 mb-6">{confirmTrigger.warning}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmTrigger(null)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTrigger}
                disabled={updateOpportunityMutation.isPending}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
              >
                {updateOpportunityMutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
