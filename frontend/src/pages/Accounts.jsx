import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { accountsApi, usersApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import {
  Building2,
  ChevronRight,
  MapPin,
  Phone,
  Users,
  Square,
  CheckSquare,
  UserPlus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import SubNav from '../components/SubNav';

const statusOptions = [
  { value: 'NEW', label: 'New' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'IN_PRODUCTION', label: 'In Production' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'INACTIVE', label: 'Inactive' },
];

export default function Accounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState('');
  const [selectedNewStatus, setSelectedNewStatus] = useState('');

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;

  // Build filter params based on role
  const filterParams = useMemo(() => {
    const params = {
      search,
      page,
      limit: 25,
    };

    // Apply status filter from tab
    if (activeTab === 'active') {
      params.status = 'ACTIVE';
    } else if (activeTab === 'prospect') {
      params.status = 'PROSPECT';
    } else if (activeTab === 'my') {
      params.ownerId = user?.id;
    }

    // Apply role-based filters (except for "my" tab which already filters by user)
    if (activeTab !== 'my' && !isGlobalView) {
      if (isTeamView && user?.teamMemberIds?.length > 0) {
        params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
      }
      if (user?.officeAssignment) {
        params.office = user.officeAssignment;
      }
    }

    return params;
  }, [search, activeTab, page, user, isGlobalView, isTeamView]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', filterParams],
    queryFn: () => accountsApi.getAccounts(filterParams),
  });

  const accounts = data?.data || [];
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
    mutationFn: ({ accountIds, newOwnerId }) => accountsApi.bulkReassign(accountIds, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowReassignModal(false);
      setSelectedAccounts([]);
      setSelectionMode(false);
      setSelectedNewOwner('');
    },
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: ({ accountIds, status }) => accountsApi.bulkUpdateStatus(accountIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowStatusModal(false);
      setSelectedAccounts([]);
      setSelectionMode(false);
      setSelectedNewStatus('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: ({ accountIds }) => accountsApi.bulkDelete(accountIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setShowDeleteModal(false);
      setSelectedAccounts([]);
      setSelectionMode(false);
    },
  });

  // Selection handlers
  const toggleSelection = (id) => {
    setSelectedAccounts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOnPage = () => {
    setSelectedAccounts(accounts.map(a => a.id));
  };

  const clearSelection = () => {
    setSelectedAccounts([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedAccounts([]);
  };

  // Get scope label for header
  const getScopeLabel = () => {
    if (isGlobalView) return null;
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Team';
    return user?.officeAssignment || null;
  };

  const scopeLabel = getScopeLabel();

  // Tabs for SubNav
  const tabs = [
    { id: 'all', label: 'All', count: pagination.total || 0 },
    { id: 'active', label: 'Active', count: null },
    { id: 'prospect', label: 'Prospect', count: null },
    { id: 'my', label: 'My Accounts', count: null },
  ];

  return (
    <div className="space-y-6">
      {/* Scope indicator for team/office managers */}
      {scopeLabel && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {isTeamView ? (
              <Users className="w-4 h-4 text-panda-primary" />
            ) : (
              <MapPin className="w-4 h-4 text-panda-primary" />
            )}
            <span className="text-sm font-medium text-gray-600">
              Viewing: <span className="text-panda-primary">{scopeLabel} Accounts</span>
            </span>
          </div>
          {pagination.total && (
            <span className="text-sm text-gray-500">
              {pagination.total} total accounts
            </span>
          )}
        </div>
      )}

      {/* Sub Navigation */}
      <SubNav
        entity="Account"
        basePath="/accounts"
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setPage(1);
        }}
        showNewButton={true}
        newButtonPath="/accounts/new"
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        showSearch={true}
      />

      {/* Accounts List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
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
                  Select All ({accounts.length})
                </button>
                {selectedAccounts.length > 0 && (
                  <>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Clear ({selectedAccounts.length})
                    </button>
                    <button
                      onClick={() => setShowReassignModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Reassign</span>
                    </button>
                    <button
                      onClick={() => setShowStatusModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Update Status</span>
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
          {selectedAccounts.length > 0 && (
            <span className="text-sm text-gray-600">{selectedAccounts.length} selected</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Building2 className="w-12 h-12 mb-2 text-gray-300" />
            <p>No accounts found</p>
            {scopeLabel && (
              <p className="text-sm mt-1">in {scopeLabel}</p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {accounts.map((account) => (
              <div
                key={account.id}
                className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${selectedAccounts.includes(account.id) ? 'bg-panda-primary/5' : ''}`}
              >
                {selectionMode && (
                  <button
                    onClick={() => toggleSelection(account.id)}
                    className="p-1 mr-3 rounded hover:bg-gray-100"
                  >
                    {selectedAccounts.includes(account.id) ? (
                      <CheckSquare className="w-5 h-5 text-panda-primary" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                )}
                <Link
                  to={`/accounts/${account.id}`}
                  className="flex-1 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{account.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        {account.billingCity && (
                          <span className="flex items-center">
                            <MapPin className="w-3 h-3 mr-1" />
                            {account.billingCity}, {account.billingState}
                          </span>
                        )}
                        {account.phone && (
                          <span className="flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {account.phone}
                          </span>
                        )}
                        {account.owner && !isTeamView && (
                          <span className="text-xs text-gray-400">
                            Owner: {account.owner.firstName} {account.owner.lastName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`badge ${
                      account.status === 'ACTIVE' ? 'badge-success' :
                      account.status === 'PROSPECT' ? 'badge-info' :
                      'badge-gray'
                    }`}>
                      {account.status}
                    </span>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
            <h3 className="text-lg font-semibold mb-4">Reassign {selectedAccounts.length} Account(s)</h3>
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
                onClick={() => bulkReassignMutation.mutate({ accountIds: selectedAccounts, newOwnerId: selectedNewOwner })}
                disabled={!selectedNewOwner || bulkReassignMutation.isPending}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50"
              >
                {bulkReassignMutation.isPending ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Update Status for {selectedAccounts.length} Account(s)</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">New Status</label>
              <select
                value={selectedNewStatus}
                onChange={(e) => setSelectedNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select a status...</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowStatusModal(false); setSelectedNewStatus(''); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdateStatusMutation.mutate({ accountIds: selectedAccounts, status: selectedNewStatus })}
                disabled={!selectedNewStatus || bulkUpdateStatusMutation.isPending}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {bulkUpdateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Delete {selectedAccounts.length} Account(s)?</h3>
            <p className="text-gray-600 mb-4">
              This will mark the selected accounts as Inactive. This action can be undone by changing the status back.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMutation.mutate({ accountIds: selectedAccounts })}
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
