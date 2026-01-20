import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { opportunitiesApi, usersApi } from '../services/api';
import { formatNumber, formatCurrency } from '../utils/formatters';
import ColumnSelector, { useColumnVisibility } from '../components/ColumnSelector';
import { PriorityBadge } from '../components/JobPriority';
import {
  Target,
  ChevronRight,
  Search,
  ChevronUp,
  ChevronDown,
  Calendar,
  X,
  Plus,
  DollarSign,
  ArrowLeft,
  Flag,
  Flame,
  AlertTriangle,
  Clock,
  Square,
  CheckSquare,
  UserPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';

// Column definitions for the job/opportunity list
const COLUMN_DEFINITIONS = [
  { key: 'jobId', label: 'Job #', sortable: true },
  { key: 'priority', label: 'Priority', sortable: true },
  { key: 'name', label: 'Name', sortable: true, required: true },
  { key: 'account', label: 'Account', sortable: true },
  { key: 'amount', label: 'Amount', sortable: true },
  { key: 'stage', label: 'Stage', sortable: true },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'closeDate', label: 'Close Date', sortable: true },
  { key: 'owner', label: 'Owner', sortable: true, sortKey: 'ownerName' },
  { key: 'createdAt', label: 'Created', sortable: true, defaultVisible: false },
  { key: 'source', label: 'Source', sortable: true, defaultVisible: false },
  { key: 'office', label: 'Office', sortable: true, defaultVisible: false },
];

// Priority colors for list view
const priorityConfig = {
  CRITICAL: { icon: Flame, color: 'bg-red-100 text-red-800' },
  HIGH: { icon: AlertTriangle, color: 'bg-orange-100 text-orange-800' },
  NORMAL: { icon: Flag, color: 'bg-yellow-100 text-yellow-800' },
  LOW: { icon: Clock, color: 'bg-gray-100 text-gray-600' },
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

const stageOptions = [
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
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CLOSED_WON', label: 'Closed Won' },
  { value: 'CLOSED_LOST', label: 'Closed Lost' },
];

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'RETAIL', label: 'Retail' },
  { value: 'COMMERCIAL', label: 'Commercial' },
];

// Default visible columns
const DEFAULT_COLUMNS = ['jobId', 'priority', 'name', 'account', 'amount', 'stage', 'type', 'closeDate', 'owner'];

export default function OpportunityList() {
  const [searchParams] = useSearchParams();
  const initialStage = searchParams.get('stage') || 'all';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [stage, setStage] = useState(initialStage === 'all' ? '' : initialStage);
  const [type, setType] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showStageModal, setShowStageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState('');
  const [selectedNewStage, setSelectedNewStage] = useState('');

  // Column visibility management
  const {
    visibleColumns,
    setVisibleColumns,
    isColumnVisible,
    getVisibleColumns,
  } = useColumnVisibility(COLUMN_DEFINITIONS, 'opportunities-list', DEFAULT_COLUMNS);

  const queryParams = useMemo(() => {
    const params = { page, limit: 25, sortBy, sortOrder };
    if (search) params.search = search;
    if (ownerFilter === 'mine') params.ownerFilter = 'mine';
    if (stage) params.stage = stage;
    if (type) params.type = type;
    return params;
  }, [search, ownerFilter, stage, type, sortBy, sortOrder, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', queryParams],
    queryFn: () => opportunitiesApi.getOpportunities(queryParams),
  });

  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts'],
    queryFn: () => opportunitiesApi.getStageCounts(),
  });

  const opportunities = data?.data || [];
  const pagination = data?.pagination || {};

  // Query for users dropdown (for reassignment)
  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
    enabled: showReassignModal,
  });
  const users = usersData || [];

  // Bulk mutations
  const bulkReassignMutation = useMutation({
    mutationFn: ({ opportunityIds, newOwnerId }) => opportunitiesApi.bulkReassign(opportunityIds, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setShowReassignModal(false);
      setSelectedJobs([]);
      setSelectionMode(false);
      setSelectedNewOwner('');
    },
  });

  const bulkUpdateStageMutation = useMutation({
    mutationFn: ({ opportunityIds, stage }) => opportunitiesApi.bulkUpdateStage(opportunityIds, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setShowStageModal(false);
      setSelectedJobs([]);
      setSelectionMode(false);
      setSelectedNewStage('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ opportunityIds }) => opportunitiesApi.bulkDelete(opportunityIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      setShowDeleteModal(false);
      setSelectedJobs([]);
      setSelectionMode(false);
    },
  });

  // Selection handlers
  const toggleSelection = (id) => {
    setSelectedJobs(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOnPage = () => {
    setSelectedJobs(opportunities.map(o => o.id));
  };

  const clearSelection = () => {
    setSelectedJobs([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedJobs([]);
  };

  const tabs = [
    { id: 'all', label: 'All', count: stageCounts?.total || 0 },
    { id: 'mine', label: 'My Jobs', count: stageCounts?.mine || 0 },
    { id: 'open', label: 'Open', count: stageCounts?.open || 0 },
    { id: 'won', label: 'Won', count: stageCounts?.won || 0 },
  ];

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const SortIcon = ({ field }) => {
    if (sortBy !== field) return null;
    return sortOrder === 'asc' ?
      <ChevronUp className="w-4 h-4 inline ml-1" /> :
      <ChevronDown className="w-4 h-4 inline ml-1" />;
  };

  const hasActiveFilters = search || stage || type || ownerFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStage('');
    setType('');
    setOwnerFilter('all');
    setPage(1);
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/jobs" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Job List</h1>
            <p className="text-gray-500">Manage your jobs pipeline</p>
          </div>
        </div>
        <Link
          to="/jobs/new"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>New Job</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center border-b border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setOwnerFilter(tab.id === 'mine' ? 'mine' : 'all');
                if (tab.id === 'open') setStage('');
                if (tab.id === 'won') setStage('CLOSED_WON');
                if (tab.id === 'all') setStage('');
                setPage(1);
              }}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                ownerFilter === (tab.id === 'mine' ? 'mine' : 'all') &&
                (tab.id !== 'won' || stage === 'CLOSED_WON') &&
                (tab.id !== 'open' || !stage)
                  ? 'border-panda-primary text-panda-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                ownerFilter === (tab.id === 'mine' ? 'mine' : 'all')
                  ? 'bg-panda-primary/10 text-panda-primary'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {formatNumber(tab.count)}
              </span>
            </button>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search jobs..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              />
            </div>
            <select
              value={stage}
              onChange={(e) => { setStage(e.target.value); setPage(1); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none bg-white"
            >
              {stageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none bg-white"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center space-x-1 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-4 h-4" />
                <span>Clear</span>
              </button>
            )}
            <ColumnSelector
              columns={COLUMN_DEFINITIONS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
              storageKey="opportunities-list"
              defaultColumns={DEFAULT_COLUMNS}
            />
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center space-x-3">
            {!selectionMode ? (
              <button
                onClick={() => setSelectionMode(true)}
                className="flex items-center space-x-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white transition-colors"
              >
                <Square className="w-4 h-4" />
                <span>Select</span>
              </button>
            ) : (
              <>
                <button
                  onClick={exitSelectionMode}
                  className="flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
                <button
                  onClick={selectAllOnPage}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-white"
                >
                  Select All ({opportunities.length})
                </button>
                {selectedJobs.length > 0 && (
                  <>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Clear ({selectedJobs.length})
                    </button>
                    <button
                      onClick={() => setShowReassignModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Reassign</span>
                    </button>
                    <button
                      onClick={() => setShowStageModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Update Stage</span>
                    </button>
                    <button
                      onClick={() => setShowDeleteModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {selectedJobs.length > 0 && (
            <span className="text-sm text-gray-600">{selectedJobs.length} selected</span>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Target className="w-12 h-12 mb-2 text-gray-300" />
            <p>No jobs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {selectionMode && (
                    <th className="px-4 py-3 w-10">
                      <button
                        onClick={() => selectedJobs.length === opportunities.length ? clearSelection() : selectAllOnPage()}
                        className="p-1 rounded hover:bg-gray-200"
                      >
                        {selectedJobs.length === opportunities.length ? (
                          <CheckSquare className="w-5 h-5 text-panda-primary" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                    </th>
                  )}
                  {getVisibleColumns().map((col) => (
                    <th
                      key={col.key}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => col.sortable && handleSort(col.sortKey || col.key)}
                    >
                      {col.label} {col.sortable && <SortIcon field={col.sortKey || col.key} />}
                    </th>
                  ))}
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opportunities.map((opp) => (
                  <tr key={opp.id} className={`hover:bg-gray-50 ${selectedJobs.includes(opp.id) ? 'bg-panda-primary/5' : ''}`}>
                    {selectionMode && (
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleSelection(opp.id)}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          {selectedJobs.includes(opp.id) ? (
                            <CheckSquare className="w-5 h-5 text-panda-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                    )}
                    {isColumnVisible('jobId') && (
                      <td className="px-6 py-4 text-sm">
                        <Link to={`/jobs/${opp.id}`} className="font-medium text-panda-primary hover:text-panda-secondary">
                          {opp.jobId || '-'}
                        </Link>
                      </td>
                    )}
                    {isColumnVisible('priority') && (
                      <td className="px-6 py-4">
                        <PriorityBadge priority={opp.priority || 'NORMAL'} />
                      </td>
                    )}
                    {isColumnVisible('name') && (
                      <td className="px-6 py-4">
                        <Link to={`/jobs/${opp.id}`} className="font-medium text-gray-900 hover:text-panda-primary">
                          {opp.name}
                        </Link>
                      </td>
                    )}
                    {isColumnVisible('account') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.account?.name || '-'}
                      </td>
                    )}
                    {isColumnVisible('amount') && (
                      <td className="px-6 py-4 text-sm">
                        <span className="text-green-600 font-medium">
                          {formatCurrency(opp.amount)}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('stage') && (
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[opp.stage] || 'bg-gray-100 text-gray-700'}`}>
                          {opp.stage?.replace(/_/g, ' ')}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('type') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.type || '-'}
                      </td>
                    )}
                    {isColumnVisible('closeDate') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.closeDate ? (
                          <span className="flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {new Date(opp.closeDate).toLocaleDateString()}
                          </span>
                        ) : '-'}
                      </td>
                    )}
                    {isColumnVisible('owner') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.ownerName || opp.owner?.name || 'Unassigned'}
                      </td>
                    )}
                    {isColumnVisible('createdAt') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.createdAt ? new Date(opp.createdAt).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {isColumnVisible('source') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.source || '-'}
                      </td>
                    )}
                    {isColumnVisible('office') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {opp.office || '-'}
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      <Link to={`/jobs/${opp.id}`} className="text-gray-400 hover:text-gray-600">
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {formatNumber(((page - 1) * 25) + 1)} to {formatNumber(Math.min(page * 25, pagination.total))} of {formatNumber(pagination.total)}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-600">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reassign {selectedJobs.length} Job(s)</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">New Owner</label>
              <select
                value={selectedNewOwner}
                onChange={(e) => setSelectedNewOwner(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select an owner...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName || `${user.firstName} ${user.lastName}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowReassignModal(false); setSelectedNewOwner(''); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkReassignMutation.mutate({ opportunityIds: selectedJobs, newOwnerId: selectedNewOwner })}
                disabled={!selectedNewOwner || bulkReassignMutation.isPending}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50"
              >
                {bulkReassignMutation.isPending ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Stage Modal */}
      {showStageModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Update Stage for {selectedJobs.length} Job(s)</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">New Stage</label>
              <select
                value={selectedNewStage}
                onChange={(e) => setSelectedNewStage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select a stage...</option>
                {stageOptions.filter(s => s.value).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowStageModal(false); setSelectedNewStage(''); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdateStageMutation.mutate({ opportunityIds: selectedJobs, stage: selectedNewStage })}
                disabled={!selectedNewStage || bulkUpdateStageMutation.isPending}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {bulkUpdateStageMutation.isPending ? 'Updating...' : 'Update Stage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Delete {selectedJobs.length} Job(s)?</h3>
            <p className="text-gray-600 mb-4">
              This will mark the selected jobs as Closed Lost. This action can be undone by changing the stage back.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMutation.mutate({ opportunityIds: selectedJobs })}
                disabled={bulkDeleteMutation.isPending}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
