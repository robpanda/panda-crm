import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi, casesApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Search,
  ChevronRight,
  DollarSign,
  User,
  Building2,
  Filter,
  RefreshCw,
  FileText,
  MessageSquare,
  ChevronDown,
  X,
  Send,
  Briefcase,
} from 'lucide-react';

const stageLabels = {
  LEAD_UNASSIGNED: 'Lead (Unassigned)',
  LEAD_ASSIGNED: 'Lead (Assigned)',
  SCHEDULED: 'Scheduled',
  INSPECTED: 'Inspected',
  CLAIM_FILED: 'Claim Filed',
  ADJUSTER_MEETING_COMPLETE: 'Adjuster Complete',
  APPROVED: 'Approved',
  CONTRACT_SIGNED: 'Contract Signed',
  IN_PRODUCTION: 'In Production',
  COMPLETED: 'Completed',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

const stageColors = {
  LEAD_UNASSIGNED: 'bg-gray-100 text-gray-700',
  LEAD_ASSIGNED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-indigo-100 text-indigo-700',
  INSPECTED: 'bg-purple-100 text-purple-700',
  CLAIM_FILED: 'bg-pink-100 text-pink-700',
  ADJUSTER_MEETING_COMPLETE: 'bg-violet-100 text-violet-700',
  APPROVED: 'bg-green-100 text-green-700',
  CONTRACT_SIGNED: 'bg-emerald-100 text-emerald-700',
  IN_PRODUCTION: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CLOSED_WON: 'bg-green-100 text-green-700',
  CLOSED_LOST: 'bg-red-100 text-red-700',
};

const priorityColors = {
  LOW: 'bg-gray-100 text-gray-700',
  NORMAL: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

export default function UnapprovedJobs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedJob, setExpandedJob] = useState(null);

  // Approval action modal state
  const [actionModal, setActionModal] = useState({ show: false, type: null, job: null });
  const [actionReason, setActionReason] = useState('');
  const [actionPriority, setActionPriority] = useState('NORMAL');

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;

  // Build filter params
  const filterParams = useMemo(() => ({
    search,
    stage: stageFilter,
    ownerFilter: ownerFilter,
    page,
    limit: 25,
  }), [search, stageFilter, ownerFilter, page]);

  // Fetch unapproved jobs
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['unapprovedJobs', filterParams],
    queryFn: () => opportunitiesApi.getUnapprovedJobs(filterParams),
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['unapprovedJobsStats', ownerFilter],
    queryFn: () => opportunitiesApi.getUnapprovedJobsStats(ownerFilter),
  });

  // Fetch related cases when a job is expanded
  const { data: relatedCases } = useQuery({
    queryKey: ['relatedCases', expandedJob],
    queryFn: () => opportunitiesApi.getRelatedCases(expandedJob),
    enabled: !!expandedJob,
  });

  // Fetch approval history when a job is expanded
  const { data: approvalHistory } = useQuery({
    queryKey: ['approvalHistory', expandedJob],
    queryFn: () => opportunitiesApi.getJobApprovalHistory(expandedJob),
    enabled: !!expandedJob,
  });

  // Request approval mutation
  const requestApprovalMutation = useMutation({
    mutationFn: ({ opportunityId, data }) => opportunitiesApi.requestJobApproval(opportunityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobs'] });
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobsStats'] });
      queryClient.invalidateQueries({ queryKey: ['approvalHistory'] });
      setActionModal({ show: false, type: null, job: null });
      setActionReason('');
      setActionPriority('NORMAL');
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ opportunityId, reason }) => opportunitiesApi.approveJob(opportunityId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobs'] });
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobsStats'] });
      queryClient.invalidateQueries({ queryKey: ['approvalHistory'] });
      setActionModal({ show: false, type: null, job: null });
      setActionReason('');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ opportunityId, reason }) => opportunitiesApi.rejectJobApproval(opportunityId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobs'] });
      queryClient.invalidateQueries({ queryKey: ['unapprovedJobsStats'] });
      queryClient.invalidateQueries({ queryKey: ['approvalHistory'] });
      setActionModal({ show: false, type: null, job: null });
      setActionReason('');
    },
  });

  const jobs = data?.data || [];
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleActionSubmit = () => {
    if (actionModal.type === 'request') {
      requestApprovalMutation.mutate({
        opportunityId: actionModal.job.id,
        data: { reason: actionReason, priority: actionPriority },
      });
    } else if (actionModal.type === 'approve') {
      approveMutation.mutate({
        opportunityId: actionModal.job.id,
        reason: actionReason,
      });
    } else if (actionModal.type === 'reject') {
      if (!actionReason.trim()) {
        alert('Rejection reason is required');
        return;
      }
      rejectMutation.mutate({
        opportunityId: actionModal.job.id,
        reason: actionReason,
      });
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <AlertTriangle className="w-7 h-7 mr-3 text-amber-500" />
                Unapproved Jobs
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage jobs requiring approval before work can proceed
              </p>
            </div>
            <button
              onClick={() => refetch()}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Unapproved</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalUnapproved || 0}</p>
              </div>
              <div className="p-3 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Pending Approval</p>
                <p className="text-2xl font-bold text-blue-600">{stats?.pendingApproval || 0}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Awaiting Submission</p>
                <p className="text-2xl font-bold text-gray-600">{stats?.awaitingSubmission || 0}</p>
              </div>
              <div className="p-3 bg-gray-100 rounded-lg">
                <FileText className="w-6 h-6 text-gray-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">By Stage</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(stats?.byStage || []).slice(0, 3).map((s) => (
                    <span key={s.stage} className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                      {stageLabels[s.stage]?.split(' ')[0] || s.stage}: {s.count}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by job name, ID, or account..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                />
              </div>
            </div>

            {/* Stage Filter */}
            <div className="relative">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none bg-white"
              >
                <option value="">All Stages</option>
                {Object.entries(stageLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>

            {/* Owner Filter */}
            {(isGlobalView || isTeamView) && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOwnerFilter('mine')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    ownerFilter === 'mine'
                      ? 'bg-panda-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  My Jobs
                </button>
                <button
                  onClick={() => setOwnerFilter('all')}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    ownerFilter === 'all'
                      ? 'bg-panda-primary text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  All Jobs
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Jobs List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-500">Loading unapproved jobs...</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">All caught up!</h3>
              <p className="text-gray-500">No unapproved jobs matching your filters.</p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="col-span-4">Job</div>
                <div className="col-span-2">Owner</div>
                <div className="col-span-2">Stage</div>
                <div className="col-span-1">Amount</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1">Actions</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-200">
                {jobs.map((job) => (
                  <div key={job.id}>
                    {/* Job Row */}
                    <div
                      className={`px-6 py-4 grid grid-cols-12 gap-4 items-center hover:bg-gray-50 cursor-pointer ${
                        expandedJob === job.id ? 'bg-gray-50' : ''
                      }`}
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      {/* Job Info */}
                      <div className="col-span-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mr-3">
                            <Briefcase className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/jobs/${job.id}`}
                              className="text-sm font-medium text-gray-900 hover:text-panda-primary truncate block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {job.name}
                            </Link>
                            <div className="flex items-center text-xs text-gray-500 mt-0.5">
                              {job.jobId && <span className="mr-2">{job.jobId}</span>}
                              {job.account && (
                                <span className="flex items-center">
                                  <Building2 className="w-3 h-3 mr-1" />
                                  {job.account.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Owner */}
                      <div className="col-span-2">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="text-sm text-gray-700 truncate">
                            {job.owner?.name || 'Unassigned'}
                          </span>
                        </div>
                      </div>

                      {/* Stage */}
                      <div className="col-span-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${stageColors[job.stage] || 'bg-gray-100 text-gray-700'}`}>
                          {stageLabels[job.stage] || job.stage}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="col-span-1">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(job.contractTotal || job.amount)}
                        </span>
                      </div>

                      {/* Approval Status */}
                      <div className="col-span-2">
                        {job.pendingApprovalRequest ? (
                          <div className="flex items-center">
                            <Clock className="w-4 h-4 text-blue-500 mr-1" />
                            <span className="text-xs font-medium text-blue-700">Pending Approval</span>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mr-1" />
                            <span className="text-xs font-medium text-amber-700">Needs Submission</span>
                          </div>
                        )}
                        {job.openCasesCount > 0 && (
                          <div className="flex items-center mt-1 text-xs text-gray-500">
                            <MessageSquare className="w-3 h-3 mr-1" />
                            {job.openCasesCount} open case{job.openCasesCount !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center justify-end space-x-2">
                        {!job.pendingApprovalRequest ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionModal({ show: true, type: 'request', job });
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Request Approval"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModal({ show: true, type: 'approve', job });
                              }}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActionModal({ show: true, type: 'reject', job });
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expandedJob === job.id ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {expandedJob === job.id && (
                      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Approval History */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-3">Approval History</h4>
                            {approvalHistory && approvalHistory.length > 0 ? (
                              <div className="space-y-2">
                                {approvalHistory.map((req) => (
                                  <div key={req.id} className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                        req.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                        req.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                        req.status === 'PENDING' ? 'bg-blue-100 text-blue-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {req.status}
                                      </span>
                                      <span className="text-xs text-gray-500">{formatDate(req.createdAt)}</span>
                                    </div>
                                    <p className="text-sm text-gray-700">{req.subject}</p>
                                    {req.requester && (
                                      <p className="text-xs text-gray-500 mt-1">
                                        Requested by {req.requester.name}
                                      </p>
                                    )}
                                    {req.decidedBy && req.decisionReason && (
                                      <p className="text-xs text-gray-600 mt-1 italic">
                                        "{req.decisionReason}" - {req.decidedBy.name}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No approval history</p>
                            )}
                          </div>

                          {/* Related Cases */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-900 mb-3">Related Cases</h4>
                            {relatedCases && relatedCases.length > 0 ? (
                              <div className="space-y-2">
                                {relatedCases.slice(0, 5).map((c) => (
                                  <div key={c.id} className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-medium text-gray-500">
                                        {c.caseNumber}
                                      </span>
                                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                        c.status === 'CLOSED' ? 'bg-gray-100 text-gray-700' :
                                        c.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                                        c.priority === 'URGENT' ? 'bg-red-100 text-red-700' :
                                        c.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                        'bg-blue-100 text-blue-700'
                                      }`}>
                                        {c.status}
                                      </span>
                                    </div>
                                    <p className="text-sm text-gray-700 truncate">{c.subject}</p>
                                    <p className="text-xs text-gray-500 mt-1">{formatDate(c.createdAt)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No related cases</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing {((pagination.page - 1) * 25) + 1} to {Math.min(pagination.page * 25, pagination.total)} of {pagination.total} jobs
                  </p>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= pagination.totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* By Owner Stats */}
        {stats?.byOwner && stats.byOwner.length > 0 && (
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Unapproved Jobs by Sales Rep</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {stats.byOwner.map((owner) => (
                <div
                  key={owner.ownerId || 'unassigned'}
                  className="bg-gray-50 rounded-lg p-3 cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    if (owner.ownerId) {
                      setOwnerFilter(owner.ownerId);
                    }
                  }}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{owner.ownerName}</p>
                  <p className="text-2xl font-bold text-amber-600">{owner.count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {actionModal.type === 'request' && 'Request Job Approval'}
                {actionModal.type === 'approve' && 'Approve Job'}
                {actionModal.type === 'reject' && 'Reject Job Approval'}
              </h3>
              <button
                onClick={() => setActionModal({ show: false, type: null, job: null })}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  Job: <span className="font-medium text-gray-900">{actionModal.job?.name}</span>
                </p>
                {actionModal.job?.account && (
                  <p className="text-sm text-gray-600">
                    Account: <span className="font-medium text-gray-900">{actionModal.job.account.name}</span>
                  </p>
                )}
              </div>

              {actionModal.type === 'request' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={actionPriority}
                    onChange={(e) => setActionPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              )}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {actionModal.type === 'reject' ? 'Rejection Reason (Required)' : 'Notes (Optional)'}
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary/20 focus:border-panda-primary outline-none resize-none"
                  placeholder={
                    actionModal.type === 'request'
                      ? 'Provide context for why this job needs approval...'
                      : actionModal.type === 'approve'
                      ? 'Optional approval notes...'
                      : 'Explain why this job is being rejected...'
                  }
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setActionModal({ show: false, type: null, job: null })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleActionSubmit}
                  disabled={
                    requestApprovalMutation.isPending ||
                    approveMutation.isPending ||
                    rejectMutation.isPending
                  }
                  className={`px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 ${
                    actionModal.type === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : actionModal.type === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-panda-primary hover:bg-panda-primary/90'
                  }`}
                >
                  {requestApprovalMutation.isPending || approveMutation.isPending || rejectMutation.isPending
                    ? 'Processing...'
                    : actionModal.type === 'request'
                    ? 'Submit for Approval'
                    : actionModal.type === 'approve'
                    ? 'Approve Job'
                    : 'Reject Approval'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
