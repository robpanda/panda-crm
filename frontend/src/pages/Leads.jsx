import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leadsApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { UserPlus, ChevronRight, Phone, Clock, MapPin, Users } from 'lucide-react';
import SubNav from '../components/SubNav';

const statusColors = {
  NEW: 'badge-info',
  CONTACTED: 'badge-warning',
  QUALIFIED: 'badge-success',
  UNQUALIFIED: 'badge-gray',
  CONVERTED: 'badge-success',
};

export default function Leads() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;

  // Build filter params based on role
  const filterParams = useMemo(() => {
    const params = {
      search,
      status: status === 'all' ? '' : status === 'my' ? '' : status,
      page,
      limit: 25,
    };

    // Apply role-based filters
    if (status === 'my') {
      // "My Leads" tab - always show only current user's leads
      params.ownerId = user?.id;
    } else if (!isGlobalView) {
      // For non-admins, filter by team or individual
      if (isTeamView && user?.teamMemberIds?.length > 0) {
        params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
      }
      // For personal view (sales reps), show all leads they can work (no ownerId filter by default)
      // They can use "My Leads" tab to see only their assigned leads

      // Filter by office if assigned
      if (user?.officeAssignment) {
        params.office = user.officeAssignment;
      }
    }

    return params;
  }, [search, status, page, user, isGlobalView, isTeamView]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', filterParams],
    queryFn: () => leadsApi.getLeads(filterParams),
  });

  // Get counts with same role-based filtering
  const countsParams = useMemo(() => {
    const params = {};
    if (!isGlobalView) {
      if (isTeamView && user?.teamMemberIds?.length > 0) {
        params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
      }
      if (user?.officeAssignment) {
        params.office = user.officeAssignment;
      }
    }
    return params;
  }, [user, isGlobalView, isTeamView]);

  const { data: counts } = useQuery({
    queryKey: ['leadCounts', countsParams],
    queryFn: () => leadsApi.getLeadCounts(countsParams),
  });

  const leads = data?.data || [];
  const pagination = data?.pagination;

  // Get scope label for header
  const getScopeLabel = () => {
    if (isGlobalView) return null;
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Team';
    return user?.officeAssignment || null;
  };

  const scopeLabel = getScopeLabel();

  // Tabs for SubNav
  const tabs = [
    { id: 'all', label: 'All', count: counts?.total || 0 },
    { id: 'NEW', label: 'New', count: counts?.new || 0 },
    { id: 'CONTACTED', label: 'Contacted', count: counts?.contacted || 0 },
    { id: 'QUALIFIED', label: 'Qualified', count: counts?.qualified || 0 },
    { id: 'my', label: 'My Leads', count: counts?.myLeads || 0 },
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
              Viewing: <span className="text-panda-primary">{scopeLabel} Leads</span>
            </span>
          </div>
          {pagination && (
            <span className="text-sm text-gray-500">
              {pagination.total} total leads
            </span>
          )}
        </div>
      )}

      {/* Sub Navigation */}
      <SubNav
        entity="Lead"
        basePath="/leads"
        tabs={tabs}
        activeTab={status}
        onTabChange={(newStatus) => {
          setStatus(newStatus);
          setPage(1); // Reset page on tab change
        }}
        showNewButton={true}
        newButtonPath="/leads/new"
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1); // Reset page on search
        }}
        showSearch={true}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <UserPlus className="w-12 h-12 mb-2 text-gray-300" />
            <p>No leads found</p>
            {scopeLabel && (
              <p className="text-sm mt-1">in {scopeLabel}</p>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {leads.map((lead) => (
                <Link
                  key={lead.id}
                  to={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      lead.status === 'NEW' ? 'bg-blue-100' :
                      lead.status === 'CONTACTED' ? 'bg-yellow-100' :
                      lead.status === 'QUALIFIED' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <UserPlus className={`w-5 h-5 ${
                        lead.status === 'NEW' ? 'text-blue-600' :
                        lead.status === 'CONTACTED' ? 'text-yellow-600' :
                        lead.status === 'QUALIFIED' ? 'text-green-600' : 'text-gray-600'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {lead.firstName} {lead.lastName}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        {lead.company && <span>{lead.company}</span>}
                        {lead.phone && (
                          <span className="flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {lead.phone}
                          </span>
                        )}
                        {lead.owner && !isTeamView && (
                          <span className="text-xs text-gray-400">
                            Owner: {lead.owner.firstName} {lead.owner.lastName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {lead.daysOld > 0 && (
                      <span className={`flex items-center text-sm ${
                        lead.daysOld > 7 ? 'text-red-500' :
                        lead.daysOld > 3 ? 'text-yellow-500' : 'text-gray-500'
                      }`}>
                        <Clock className="w-3 h-3 mr-1" />
                        {lead.daysOldLabel || `${lead.daysOld}d`}
                      </span>
                    )}
                    <span className={`badge ${statusColors[lead.status] || 'badge-gray'}`}>
                      {lead.status}
                    </span>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              ))}
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
    </div>
  );
}
