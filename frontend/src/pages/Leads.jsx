import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leadsApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { UserPlus, ChevronRight, Phone, Clock, MapPin, Users, X, Filter, Calendar } from 'lucide-react';
import SubNav from '../components/SubNav';

// Lead disposition options
const DISPOSITION_OPTIONS = [
  { value: '', label: 'All Dispositions' },
  { value: 'NO_ANSWER', label: 'No Answer' },
  { value: 'VOICEMAIL', label: 'Voicemail' },
  { value: 'CALLBACK', label: 'Callback' },
  { value: 'NOT_INTERESTED', label: 'Not Interested' },
  { value: 'APPOINTMENT_SET', label: 'Appointment Set' },
  { value: 'WRONG_NUMBER', label: 'Wrong Number' },
  { value: 'DO_NOT_CALL', label: 'Do Not Call' },
];

// Lead source options
const LEAD_SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'Website', label: 'Website' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Door Knock', label: 'Door Knock' },
  { value: 'Storm Chase', label: 'Storm Chase' },
  { value: 'Self-Gen', label: 'Self-Gen' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'GAF', label: 'GAF' },
  { value: 'Angi', label: 'Angi' },
];

// Work type options
const WORK_TYPE_OPTIONS = [
  { value: '', label: 'All Work Types' },
  { value: 'Roofing', label: 'Roofing' },
  { value: 'Siding', label: 'Siding' },
  { value: 'Windows', label: 'Windows' },
  { value: 'Gutters', label: 'Gutters' },
  { value: 'Solar', label: 'Solar' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Retail', label: 'Retail' },
];

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

  // Filter state
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [disposition, setDisposition] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [workType, setWorkType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Count active filters
  const activeFilterCount = [disposition, leadSource, workType, startDate, endDate].filter(Boolean).length;

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

    // Apply advanced filters
    if (disposition) params.disposition = disposition;
    if (leadSource) params.leadSource = leadSource;
    if (workType) params.workType = workType;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

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
  }, [search, status, page, user, isGlobalView, isTeamView, disposition, leadSource, workType, startDate, endDate]);

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

  // Clear all filters
  const clearFilters = () => {
    setDisposition('');
    setLeadSource('');
    setWorkType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Apply filters (close panel and reset page)
  const applyFilters = () => {
    setShowFilterPanel(false);
    setPage(1);
  };

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
        showFilter={true}
        onFilterClick={() => setShowFilterPanel(!showFilterPanel)}
      />

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-panda-primary" />
              <h3 className="font-medium text-gray-900">Filter Leads</h3>
              {activeFilterCount > 0 && (
                <span className="px-2 py-0.5 bg-panda-primary text-white text-xs rounded-full">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <button
              onClick={() => setShowFilterPanel(false)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {/* Disposition Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Disposition</label>
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              >
                {DISPOSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Lead Source Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead Source</label>
              <select
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              >
                {LEAD_SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Work Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              >
                {WORK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {/* Date Range - Start */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Created From</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Date Range - End */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Created To</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Filter Actions */}
          <div className="flex items-center justify-end space-x-3 mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={applyFilters}
              className="px-4 py-2 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Active Filters Summary */}
      {activeFilterCount > 0 && !showFilterPanel && (
        <div className="flex items-center flex-wrap gap-2 mb-4">
          <span className="text-sm text-gray-500">Active filters:</span>
          {disposition && (
            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
              {DISPOSITION_OPTIONS.find(o => o.value === disposition)?.label}
              <button onClick={() => setDisposition('')} className="ml-1 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {leadSource && (
            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
              {LEAD_SOURCE_OPTIONS.find(o => o.value === leadSource)?.label}
              <button onClick={() => setLeadSource('')} className="ml-1 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {workType && (
            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
              {WORK_TYPE_OPTIONS.find(o => o.value === workType)?.label}
              <button onClick={() => setWorkType('')} className="ml-1 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {(startDate || endDate) && (
            <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
              {startDate && endDate ? `${startDate} - ${endDate}` : startDate || `Until ${endDate}`}
              <button onClick={() => { setStartDate(''); setEndDate(''); }} className="ml-1 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button
            onClick={clearFilters}
            className="text-sm text-panda-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

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
