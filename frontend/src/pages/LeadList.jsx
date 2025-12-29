import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { leadsApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import {
  UserPlus,
  ChevronRight,
  Phone,
  Clock,
  ArrowLeft,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  Mail,
  MapPin,
  Calendar,
  X,
  Plus,
} from 'lucide-react';

const statusColors = {
  NEW: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-yellow-100 text-yellow-700',
  QUALIFIED: 'bg-green-100 text-green-700',
  UNQUALIFIED: 'bg-gray-100 text-gray-700',
  NURTURING: 'bg-purple-100 text-purple-700',
  CONVERTED: 'bg-emerald-100 text-emerald-700',
};

const sourceOptions = [
  { value: '', label: 'All Sources' },
  { value: 'Web', label: 'Web' },
  { value: 'Phone Inquiry', label: 'Phone Inquiry' },
  { value: 'Partner Referral', label: 'Partner Referral' },
  { value: 'Door Knock', label: 'Door Knock' },
  { value: 'Self-Gen', label: 'Self-Gen' },
  { value: 'Marketing Campaign', label: 'Marketing Campaign' },
  { value: 'Customer Referral', label: 'Customer Referral' },
  { value: 'Social Media', label: 'Social Media' },
  { value: 'Other', label: 'Other' },
];

export default function LeadList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'createdAt');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  // Build query params
  const queryParams = useMemo(() => {
    const params = { page, limit: 25, sortBy, sortOrder };
    if (search) params.search = search;
    if (status && status !== 'all') {
      if (status === 'my') {
        params.ownerFilter = 'mine';
      } else {
        params.status = status;
      }
    }
    if (source) params.source = source;
    return params;
  }, [search, status, source, sortBy, sortOrder, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => leadsApi.getLeads(queryParams),
  });

  const { data: counts } = useQuery({
    queryKey: ['leadCounts'],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  const leads = data?.data || [];
  const pagination = data?.pagination || {};

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Sort indicator component
  const SortIndicator = ({ field }) => {
    if (sortBy !== field) return <ChevronDown className="w-4 h-4 text-gray-300" />;
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-4 h-4 text-panda-primary" />
    ) : (
      <ChevronDown className="w-4 h-4 text-panda-primary" />
    );
  };

  // Clear all filters
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setSource('');
    setSortBy('createdAt');
    setSortOrder('desc');
  };

  const hasActiveFilters = search || (status && status !== 'all') || source;

  // Tabs for status filter
  const tabs = [
    { id: 'all', label: 'All', count: counts?.total || 0 },
    { id: 'NEW', label: 'New', count: counts?.NEW || 0 },
    { id: 'CONTACTED', label: 'Contacted', count: counts?.CONTACTED || 0 },
    { id: 'QUALIFIED', label: 'Qualified', count: counts?.QUALIFIED || 0 },
    { id: 'my', label: 'My Leads', count: counts?.mine || 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/leads" className="inline-flex items-center text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <span className="text-sm text-gray-500">
            {formatNumber(pagination.total || 0)} total
          </span>
        </div>
        <Link
          to="/leads/new"
          className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Lead
        </Link>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone, or company..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Source Filter */}
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent bg-white min-w-[160px]"
            >
              {sourceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center px-4 py-2.5 border rounded-lg transition-colors ${
                showFilters || hasActiveFilters
                  ? 'border-panda-primary bg-panda-primary/5 text-panda-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <span className="ml-2 w-2 h-2 bg-panda-primary rounded-full"></span>
              )}
            </button>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-2.5 text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4 mr-1" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Status Tabs */}
        <div className="px-4 pb-4 border-b border-gray-100">
          <div className="flex items-center space-x-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatus(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  status === tab.id
                    ? 'bg-panda-primary text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                <span
                  className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    status === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {formatNumber(tab.count)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <UserPlus className="w-12 h-12 mb-2 text-gray-300" />
              <p>No leads found</p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-panda-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('lastName')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Name</span>
                      <SortIndicator field="lastName" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('company')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Company</span>
                      <SortIndicator field="company" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Status</span>
                      <SortIndicator field="status" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('source')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Source</span>
                      <SortIndicator field="source" />
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Created</span>
                      <SortIndicator field="createdAt" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/leads/${lead.id}`}
                        className="flex items-center space-x-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            lead.status === 'NEW'
                              ? 'bg-blue-100 text-blue-700'
                              : lead.status === 'CONTACTED'
                              ? 'bg-yellow-100 text-yellow-700'
                              : lead.status === 'QUALIFIED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {lead.firstName?.charAt(0)}
                          {lead.lastName?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 hover:text-panda-primary">
                            {lead.firstName} {lead.lastName}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.company || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        {lead.phone && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="w-3 h-3 mr-1.5 text-gray-400" />
                            {lead.phone}
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="w-3 h-3 mr-1.5 text-gray-400" />
                            <span className="truncate max-w-[180px]">{lead.email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {(lead.city || lead.state) && (
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="w-3 h-3 mr-1.5 text-gray-400" />
                          {[lead.city, lead.state].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusColors[lead.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.source || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="w-3 h-3 mr-1.5 text-gray-400" />
                        {lead.createdAt
                          ? new Date(lead.createdAt).toLocaleDateString()
                          : '—'}
                      </div>
                      {lead.daysOld > 0 && (
                        <div className="flex items-center text-xs text-gray-400 mt-0.5">
                          <Clock className="w-3 h-3 mr-1" />
                          {lead.daysOldLabel}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {lead.ownerName || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/leads/${lead.id}`}
                        className="text-gray-400 hover:text-panda-primary"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {formatNumber((page - 1) * 25 + 1)} to{' '}
              {formatNumber(Math.min(page * 25, pagination.total))} of {formatNumber(pagination.total)}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page === pagination.totalPages}
                className="px-3 py-1 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
