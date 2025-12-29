import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { accountsApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import {
  Building2,
  ChevronRight,
  MapPin,
  Phone,
  Users,
} from 'lucide-react';
import SubNav from '../components/SubNav';

export default function Accounts() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);

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
              <Link
                key={account.id}
                to={`/accounts/${account.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
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
    </div>
  );
}
