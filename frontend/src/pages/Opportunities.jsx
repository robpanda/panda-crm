import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi, scheduleApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { Briefcase, ChevronRight, DollarSign, Calendar, MapPin, Users, UserPlus, X, Check, Square, CheckSquare, AlertCircle, Truck, RefreshCw, Trash2 } from 'lucide-react';
import SubNav from '../components/SubNav';

const stageColors = {
  LEAD_UNASSIGNED: 'bg-gray-400',
  LEAD_ASSIGNED: 'bg-blue-400',
  SCHEDULED: 'bg-indigo-400',
  INSPECTED: 'bg-purple-400',
  CLAIM_FILED: 'bg-pink-400',
  ADJUSTER_MEETING_COMPLETE: 'bg-violet-400',
  APPROVED: 'bg-green-400',
  CONTRACT_SIGNED: 'bg-emerald-400',
  IN_PRODUCTION: 'bg-yellow-400',
  COMPLETED: 'bg-teal-400',
  CLOSED_WON: 'bg-green-600',
  CLOSED_LOST: 'bg-red-400',
};

export default function Opportunities() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [activeTab, setActiveTab] = useState('mine');
  const [page, setPage] = useState(1);

  // Bulk reassignment state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState('');

  // Bulk stage update state
  const [showStageModal, setShowStageModal] = useState(false);
  const [selectedNewStage, setSelectedNewStage] = useState('');

  // Bulk delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;

  // Build filter params based on role and active tab
  const filterParams = useMemo(() => {
    const params = {
      search,
      stage,
      page,
      limit: 25,
    };

    // Apply tab-based filters
    if (activeTab === 'mine') {
      params.ownerId = user?.id;
    } else if (activeTab === 'open') {
      params.excludeStages = 'CLOSED_WON,CLOSED_LOST';
    } else if (activeTab === 'won') {
      params.stage = 'CLOSED_WON';
    } else if (activeTab === 'invoiceReady') {
      // Invoice Ready filter for Finance team
      params.invoiceStatus = 'READY';
    } else if (activeTab === 'all' || activeTab === 'team') {
      // For "all" or "team" tabs, apply role-based filtering
      if (!isGlobalView) {
        if (isTeamView && user?.teamMemberIds?.length > 0) {
          params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
        }
        if (user?.officeAssignment) {
          params.office = user.officeAssignment;
        }
      }
    }

    return params;
  }, [search, stage, activeTab, page, user, isGlobalView, isTeamView]);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', filterParams],
    queryFn: () => opportunitiesApi.getOpportunities(filterParams),
  });

  // Get stage counts with role-based filtering
  const countsOwnerFilter = useMemo(() => {
    if (activeTab === 'mine') return 'mine';
    if (isGlobalView) return 'all';
    if (isTeamView) return 'team';
    return 'mine';
  }, [activeTab, isGlobalView, isTeamView]);

  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts', countsOwnerFilter, user?.id],
    queryFn: () => opportunitiesApi.getStageCounts(countsOwnerFilter),
  });

  // Get assignable users for bulk reassignment
  const { data: assignableUsers = [] } = useQuery({
    queryKey: ['assignableUsers'],
    queryFn: () => opportunitiesApi.getAssignableUsers(),
    enabled: selectionMode,
  });

  // Bulk reassignment mutation
  const reassignMutation = useMutation({
    mutationFn: ({ opportunityIds, newOwnerId }) =>
      opportunitiesApi.bulkReassignJobs(opportunityIds, newOwnerId),
    onSuccess: (result) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunityStageCounts'] });
      // Reset selection
      setSelectedJobs([]);
      setSelectionMode(false);
      setShowReassignModal(false);
      setSelectedNewOwner('');
      // Show success message (could be toast)
      alert(`Successfully reassigned ${result.reassigned} job(s)`);
    },
    onError: (error) => {
      alert(`Failed to reassign: ${error.message}`);
    },
  });

  // Bulk stage update mutation
  const updateStageMutation = useMutation({
    mutationFn: ({ opportunityIds, stage }) =>
      opportunitiesApi.bulkUpdateStage(opportunityIds, stage),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunityStageCounts'] });
      setSelectedJobs([]);
      setSelectionMode(false);
      setShowStageModal(false);
      setSelectedNewStage('');
      alert(`Successfully updated ${result.results?.success?.length || 0} job(s)`);
    },
    onError: (error) => {
      alert(`Failed to update stage: ${error.message}`);
    },
  });

  // Bulk delete mutation
  const deleteMutation = useMutation({
    mutationFn: (opportunityIds) =>
      opportunitiesApi.bulkDeleteOpportunities(opportunityIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunityStageCounts'] });
      setSelectedJobs([]);
      setSelectionMode(false);
      setShowDeleteModal(false);
      alert(`Successfully deleted ${result.results?.success?.length || 0} job(s)`);
    },
    onError: (error) => {
      alert(`Failed to delete: ${error.message}`);
    },
  });

  const opportunities = data?.data || [];
  const pagination = data?.pagination;

  // Selection handlers
  const toggleJobSelection = (jobId) => {
    setSelectedJobs((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

  const selectAllOnPage = () => {
    const allIds = opportunities.map((opp) => opp.id);
    setSelectedJobs(allIds);
  };

  const clearSelection = () => {
    setSelectedJobs([]);
  };

  const handleReassign = () => {
    if (!selectedNewOwner || selectedJobs.length === 0) return;
    reassignMutation.mutate({
      opportunityIds: selectedJobs,
      newOwnerId: selectedNewOwner,
    });
  };

  const handleStageUpdate = () => {
    if (!selectedNewStage || selectedJobs.length === 0) return;
    updateStageMutation.mutate({
      opportunityIds: selectedJobs,
      stage: selectedNewStage,
    });
  };

  const handleDelete = () => {
    if (selectedJobs.length === 0) return;
    deleteMutation.mutate(selectedJobs);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedJobs([]);
    setShowReassignModal(false);
    setShowStageModal(false);
    setShowDeleteModal(false);
  };

  // Get scope label for header
  const getScopeLabel = () => {
    if (activeTab === 'mine') return null;
    if (isGlobalView) return null;
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Team';
    return user?.officeAssignment || null;
  };

  const scopeLabel = getScopeLabel();

  // Query for confirmations pending count (appointments in SCHEDULED status ready to dispatch)
  const { data: confirmationsData } = useQuery({
    queryKey: ['confirmationsPending'],
    queryFn: () => scheduleApi.getConfirmationsQueue(),
    staleTime: 30000, // Cache for 30 seconds
  });

  const confirmationsPendingCount = confirmationsData?.length || 0;

  // Tabs for SubNav - customize based on role
  const tabs = [
    { id: 'mine', label: 'My Jobs', count: stageCounts?.mine || null },
    ...(isTeamView ? [{ id: 'team', label: 'Team Jobs', count: stageCounts?.team || null }] : []),
    { id: 'all', label: isGlobalView ? 'All' : 'Office', count: stageCounts?.total || null },
    { id: 'open', label: 'Open', count: stageCounts?.open || null },
    { id: 'confirmations', label: 'Confirmations', count: confirmationsPendingCount || null, highlight: confirmationsPendingCount > 0 },
    { id: 'invoiceReady', label: 'Invoice Ready', count: stageCounts?.invoiceReady || null, icon: DollarSign },
    { id: 'won', label: 'Won', count: stageCounts?.won || null },
  ];

  // Stage filter options
  const stages = [
    { value: '', label: 'All Stages' },
    { value: 'LEAD_UNASSIGNED', label: 'Lead Unassigned' },
    { value: 'LEAD_ASSIGNED', label: 'Lead Assigned' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'INSPECTED', label: 'Inspected' },
    { value: 'CLAIM_FILED', label: 'Claim Filed' },
    { value: 'ADJUSTER_MEETING_COMPLETE', label: 'Adjuster Meeting Complete' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'CONTRACT_SIGNED', label: 'Contract Signed' },
    { value: 'IN_PRODUCTION', label: 'In Production' },
  ];

  return (
    <div className="space-y-6">
      {/* Scope indicator for team/office managers */}
      {scopeLabel && activeTab !== 'mine' && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isTeamView ? (
              <Users className="w-4 h-4 text-panda-primary" />
            ) : (
              <MapPin className="w-4 h-4 text-panda-primary" />
            )}
            <span className="text-sm font-medium text-gray-600">
              Viewing: <span className="text-panda-primary">{scopeLabel} Jobs</span>
            </span>
          </div>
          {pagination?.total && (
            <span className="text-sm text-gray-500">
              {pagination.total} total jobs
            </span>
          )}
        </div>
      )}

      {/* Sub Navigation */}
      <SubNav
        entity="Job"
        basePath="/jobs"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setPage(1);
        }}
        showNewButton={true}
        newButtonPath="/jobs/new"
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        showSearch={true}
        showFilter={true}
      />

      {/* Stage Filter and Bulk Actions Toolbar */}
      <div className="flex items-center justify-between">
        {/* Left side: Selection mode controls */}
        <div className="flex items-center space-x-3">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Bulk Reassign</span>
            </button>
          ) : (
            <>
              <button
                onClick={exitSelectionMode}
                className="flex items-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                onClick={selectAllOnPage}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Select All ({opportunities.length})
              </button>
              {selectedJobs.length > 0 && (
                <>
                  <button
                    onClick={clearSelection}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Clear ({selectedJobs.length})
                  </button>
                  <button
                    onClick={() => setShowReassignModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Reassign</span>
                  </button>
                  <button
                    onClick={() => setShowStageModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Update Stage</span>
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Right side: Stage filter */}
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none bg-white"
        >
          {stages.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Confirmations Pending Tab - Special view for dispatching appointments */}
      {activeTab === 'confirmations' ? (
        <ConfirmationsPendingList
          confirmations={confirmationsData || []}
          onDispatch={async (appointmentId) => {
            await scheduleApi.updateServiceAppointment(appointmentId, { status: 'DISPATCHED' });
            queryClient.invalidateQueries({ queryKey: ['confirmationsPending'] });
          }}
        />
      ) : (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Briefcase className="w-12 h-12 mb-2 text-gray-300" />
            <p>No jobs found</p>
            {scopeLabel && activeTab !== 'mine' && (
              <p className="text-sm mt-1">in {scopeLabel}</p>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {opportunities.map((opp) => {
                const isSelected = selectedJobs.includes(opp.id);

                // In selection mode, use div with onClick instead of Link
                if (selectionMode) {
                  return (
                    <div
                      key={opp.id}
                      onClick={() => toggleJobSelection(opp.id)}
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-panda-light/30' : ''
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleJobSelection(opp.id);
                          }}
                          className="flex-shrink-0"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-panda-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        <div className={`w-10 h-10 rounded-lg ${stageColors[opp.stage] || 'bg-gray-400'} flex items-center justify-center`}>
                          <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900">{opp.name}</h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            {opp.account && <span>{opp.account.name}</span>}
                            {opp.closeDate && (
                              <span className="flex items-center">
                                <Calendar className="w-3 h-3 mr-1" />
                                {new Date(opp.closeDate).toLocaleDateString()}
                              </span>
                            )}
                            {opp.owner && (
                              <span className="text-xs text-gray-400">
                                Owner: {opp.owner.firstName} {opp.owner.lastName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        {opp.amount > 0 && (
                          <span className="flex items-center text-green-600 font-medium">
                            <DollarSign className="w-4 h-4" />
                            {opp.amount.toLocaleString()}
                          </span>
                        )}
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                          {opp.stage?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  );
                }

                // Normal mode - use Link
                return (
                  <Link
                    key={opp.id}
                    to={`/jobs/${opp.id}`}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div className={`w-10 h-10 rounded-lg ${stageColors[opp.stage] || 'bg-gray-400'} flex items-center justify-center`}>
                        <Briefcase className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{opp.name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          {opp.account && <span>{opp.account.name}</span>}
                          {opp.closeDate && (
                            <span className="flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              {new Date(opp.closeDate).toLocaleDateString()}
                            </span>
                          )}
                          {opp.owner && activeTab !== 'mine' && (
                            <span className="text-xs text-gray-400">
                              Owner: {opp.owner.firstName} {opp.owner.lastName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      {opp.amount > 0 && (
                        <span className="flex items-center text-green-600 font-medium">
                          <DollarSign className="w-4 h-4" />
                          {opp.amount.toLocaleString()}
                        </span>
                      )}
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                        {opp.stage?.replace(/_/g, ' ')}
                      </span>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <div className="text-sm text-gray-500">
                  Showing {((page - 1) * 25) + 1} - {Math.min(page * 25, pagination.total)} of {pagination.total}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="px-3 py-1 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      )}

      {/* Bulk Reassignment Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Reassign Jobs</h3>
              <button
                onClick={() => setShowReassignModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  You are about to reassign <strong>{selectedJobs.length}</strong> job(s) to a new owner.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select New Owner
                </label>
                <select
                  value={selectedNewOwner}
                  onChange={(e) => setSelectedNewOwner(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
                >
                  <option value="">Choose a user...</option>
                  {assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role?.replace(/_/g, ' ')}) - {user.activeJobCount} active jobs
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview of selected jobs */}
              {selectedJobs.length <= 5 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Jobs to reassign:</p>
                  <ul className="space-y-1">
                    {opportunities
                      .filter((opp) => selectedJobs.includes(opp.id))
                      .map((opp) => (
                        <li key={opp.id} className="text-sm text-gray-700">
                          • {opp.name}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowReassignModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={!selectedNewOwner || reassignMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reassignMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Reassigning...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirm Reassignment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Stage Update Modal */}
      {showStageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Update Stage</h3>
              <button
                onClick={() => setShowStageModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">
                  You are about to update the stage for <strong>{selectedJobs.length}</strong> job(s).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select New Stage
                </label>
                <select
                  value={selectedNewStage}
                  onChange={(e) => setSelectedNewStage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
                >
                  <option value="">Choose a stage...</option>
                  {stages.filter(s => s.value).map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                  <option value="CLOSED_WON">Closed Won</option>
                  <option value="CLOSED_LOST">Closed Lost</option>
                </select>
              </div>

              {/* Preview of selected jobs */}
              {selectedJobs.length <= 5 && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">Jobs to update:</p>
                  <ul className="space-y-1">
                    {opportunities
                      .filter((opp) => selectedJobs.includes(opp.id))
                      .map((opp) => (
                        <li key={opp.id} className="text-sm text-gray-700">
                          • {opp.name} <span className="text-xs text-gray-400">({opp.stage?.replace(/_/g, ' ')})</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowStageModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleStageUpdate}
                disabled={!selectedNewStage || updateStageMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updateStageMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Update Stage</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-red-100 bg-red-50">
              <h3 className="text-lg font-semibold text-red-800">Confirm Delete</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-1 hover:bg-red-100 rounded-lg"
              >
                <X className="w-5 h-5 text-red-600" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-700">
                    You are about to delete <strong>{selectedJobs.length}</strong> job(s).
                    This will mark them as <strong>Closed Lost</strong> and remove them from active views.
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    This action cannot be easily undone.
                  </p>
                </div>
              </div>

              {/* Preview of selected jobs */}
              {selectedJobs.length <= 5 && (
                <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                  <p className="text-xs font-medium text-red-700 mb-2">Jobs to delete:</p>
                  <ul className="space-y-1">
                    {opportunities
                      .filter((opp) => selectedJobs.includes(opp.id))
                      .map((opp) => (
                        <li key={opp.id} className="text-sm text-red-800">
                          • {opp.name}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center space-x-2 px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Jobs</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ConfirmationsPendingList - Shows appointments in SCHEDULED status ready to dispatch
 * This is the Call Center "Confirmations Pending" view from the FSL workflow
 */
function ConfirmationsPendingList({ confirmations, onDispatch }) {
  const [dispatchingId, setDispatchingId] = useState(null);

  const handleDispatch = async (appointmentId) => {
    setDispatchingId(appointmentId);
    try {
      await onDispatch(appointmentId);
    } catch (error) {
      console.error('Failed to dispatch:', error);
      alert('Failed to dispatch appointment. Please try again.');
    } finally {
      setDispatchingId(null);
    }
  };

  if (!confirmations || confirmations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <AlertCircle className="w-12 h-12 mb-2 text-gray-300" />
          <p className="font-medium">No Confirmations Pending</p>
          <p className="text-sm mt-1">All scheduled appointments have been dispatched</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-4 py-3 border-b border-gray-100 bg-yellow-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">
              {confirmations.length} Appointment{confirmations.length !== 1 ? 's' : ''} Pending Dispatch
            </span>
          </div>
          <span className="text-sm text-yellow-600">
            Click Dispatch to send to assigned inspector
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {confirmations.map((apt) => {
          const opportunity = apt.workOrder?.opportunity;
          const account = opportunity?.account;
          const contact = opportunity?.contact;
          const resource = apt.assignedResources?.[0]?.serviceResource;
          const isDispatching = dispatchingId === apt.id;

          return (
            <div
              key={apt.id}
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 border-2 border-yellow-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    {contact?.fullName || account?.name || 'Customer'}
                  </h3>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {apt.scheduledStart
                        ? new Date(apt.scheduledStart).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Not scheduled'}
                      {apt.scheduledStart && (
                        <span className="ml-1">
                          at{' '}
                          {new Date(apt.scheduledStart).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </span>
                    {apt.workOrder?.workType?.name && (
                      <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                        {apt.workOrder.workType.name}
                      </span>
                    )}
                    {resource && (
                      <span className="text-xs text-gray-400">
                        → {resource.name}
                      </span>
                    )}
                  </div>
                  {account?.billingCity && account?.billingState && (
                    <div className="flex items-center text-xs text-gray-400 mt-1">
                      <MapPin className="w-3 h-3 mr-1" />
                      {account.billingCity}, {account.billingState}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {opportunity && (
                  <Link
                    to={`/jobs/${opportunity.id}`}
                    className="text-sm text-panda-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Job
                  </Link>
                )}
                <button
                  onClick={() => handleDispatch(apt.id)}
                  disabled={isDispatching || !resource}
                  className={`flex items-center space-x-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                    !resource
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                  title={!resource ? 'No resource assigned' : 'Dispatch to inspector'}
                >
                  {isDispatching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Dispatching...</span>
                    </>
                  ) : (
                    <>
                      <Truck className="w-4 h-4" />
                      <span>Dispatch</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
