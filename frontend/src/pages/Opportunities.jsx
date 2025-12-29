import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { Briefcase, ChevronRight, DollarSign, Calendar, MapPin, Users } from 'lucide-react';
import SubNav from '../components/SubNav';

const stageColors = {
  LEAD_UNASSIGNED: 'bg-gray-400',
  LEAD_ASSIGNED: 'bg-blue-400',
  SCHEDULED: 'bg-indigo-400',
  INSPECTED: 'bg-purple-400',
  CLAIM_FILED: 'bg-pink-400',
  APPROVED: 'bg-green-400',
  CONTRACT_SIGNED: 'bg-emerald-400',
  IN_PRODUCTION: 'bg-yellow-400',
  COMPLETED: 'bg-teal-400',
  CLOSED_WON: 'bg-green-600',
  CLOSED_LOST: 'bg-red-400',
};

export default function Opportunities() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [activeTab, setActiveTab] = useState('mine');
  const [page, setPage] = useState(1);

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

  const opportunities = data?.data || [];
  const pagination = data?.pagination;

  // Get scope label for header
  const getScopeLabel = () => {
    if (activeTab === 'mine') return null;
    if (isGlobalView) return null;
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Team';
    return user?.officeAssignment || null;
  };

  const scopeLabel = getScopeLabel();

  // Tabs for SubNav - customize based on role
  const tabs = [
    { id: 'mine', label: 'My Jobs', count: stageCounts?.mine || null },
    ...(isTeamView ? [{ id: 'team', label: 'Team Jobs', count: stageCounts?.team || null }] : []),
    { id: 'all', label: isGlobalView ? 'All' : 'Office', count: stageCounts?.total || null },
    { id: 'open', label: 'Open', count: stageCounts?.open || null },
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

      {/* Stage Filter Dropdown */}
      <div className="flex items-center justify-end">
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
              {opportunities.map((opp) => (
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
