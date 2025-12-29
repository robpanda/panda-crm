import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { opportunitiesApi } from '../services/api';
import { formatNumber, formatCurrency } from '../utils/formatters';
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
} from 'lucide-react';

const stageColors = {
  LEAD_UNASSIGNED: 'bg-gray-100 text-gray-700',
  LEAD_ASSIGNED: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-indigo-100 text-indigo-700',
  INSPECTED: 'bg-purple-100 text-purple-700',
  CLAIM_FILED: 'bg-pink-100 text-pink-700',
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

export default function OpportunityList() {
  const [searchParams] = useSearchParams();
  const initialStage = searchParams.get('stage') || 'all';

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [stage, setStage] = useState(initialStage === 'all' ? '' : initialStage);
  const [type, setType] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

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
          </div>
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
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    Name <SortIcon field="name" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('account')}
                  >
                    Account <SortIcon field="account" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('amount')}
                  >
                    Amount <SortIcon field="amount" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('stage')}
                  >
                    Stage <SortIcon field="stage" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('type')}
                  >
                    Type <SortIcon field="type" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('closeDate')}
                  >
                    Close Date <SortIcon field="closeDate" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('ownerName')}
                  >
                    Owner <SortIcon field="ownerName" />
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {opportunities.map((opp) => (
                  <tr key={opp.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/jobs/${opp.id}`} className="font-medium text-gray-900 hover:text-panda-primary">
                        {opp.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {opp.account?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="text-green-600 font-medium">
                        {formatCurrency(opp.amount)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageColors[opp.stage] || 'bg-gray-100 text-gray-700'}`}>
                        {opp.stage?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {opp.type || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {opp.closeDate ? (
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(opp.closeDate).toLocaleDateString()}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {opp.ownerName || opp.owner?.name || 'Unassigned'}
                    </td>
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
    </div>
  );
}
