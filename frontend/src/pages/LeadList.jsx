import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { leadsApi, usersApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import ColumnSelector, { useColumnVisibility } from '../components/ColumnSelector';
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
  Square,
  CheckSquare,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { LeadRankBadge } from '../components/LeadRankBadge';
import LoadingSpinner from '../components/LoadingSpinner';

// Column definitions for the leads list
const COLUMN_DEFINITIONS = [
  { key: 'name', label: 'Name', sortable: true, sortKey: 'lastName', required: true },
  { key: 'score', label: 'Score', sortable: true, sortKey: 'leadScore' },
  { key: 'company', label: 'Company', sortable: true },
  { key: 'contact', label: 'Contact', sortable: false },
  { key: 'location', label: 'Location', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'source', label: 'Source', sortable: true },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'owner', label: 'Owner', sortable: true, sortKey: 'ownerName' },
  { key: 'workType', label: 'Work Type', sortable: true, defaultVisible: false },
];

// Default visible columns
const DEFAULT_COLUMNS = ['name', 'score', 'company', 'contact', 'location', 'status', 'source', 'createdAt', 'owner'];

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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [source, setSource] = useState(searchParams.get('source') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'createdAt');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sortOrder') || 'desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [leadSource, setLeadSource] = useState('');
  const [workType, setWorkType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState('');
  const [selectedNewStatus, setSelectedNewStatus] = useState('');

  // Column visibility management
  const {
    visibleColumns,
    setVisibleColumns,
    isColumnVisible,
    getVisibleColumns,
  } = useColumnVisibility(COLUMN_DEFINITIONS, 'leads-list', DEFAULT_COLUMNS);

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
    if (leadSource) params.leadSource = leadSource;
    if (workType) params.workType = workType;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return params;
  }, [search, status, source, sortBy, sortOrder, page, leadSource, workType, startDate, endDate]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', queryParams],
    queryFn: () => leadsApi.getLeads(queryParams),
  });

  const { data: counts } = useQuery({
    queryKey: ['leadCounts'],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  // Query for users dropdown (for reassignment)
  const { data: usersData } = useQuery({
    queryKey: ['users-dropdown'],
    queryFn: () => usersApi.getUsersForDropdown(),
    enabled: showReassignModal,
  });
  const users = usersData || [];

  // Bulk mutations
  const bulkReassignMutation = useMutation({
    mutationFn: ({ leadIds, newOwnerId }) => leadsApi.bulkReassignLeads(leadIds, newOwnerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowReassignModal(false);
      setSelectedLeads([]);
      setSelectionMode(false);
      setSelectedNewOwner('');
    },
  });

  const bulkUpdateStatusMutation = useMutation({
    mutationFn: ({ leadIds, status }) => leadsApi.bulkUpdateStatus(leadIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowStatusModal(false);
      setSelectedLeads([]);
      setSelectionMode(false);
      setSelectedNewStatus('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (leadIds) => leadsApi.bulkDeleteLeads(leadIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowDeleteModal(false);
      setSelectedLeads([]);
      setSelectionMode(false);
    },
  });

  // Selection handlers
  const toggleSelection = (id) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOnPage = () => {
    setSelectedLeads(leads.map(l => l.id));
  };

  const clearSelection = () => {
    setSelectedLeads([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedLeads([]);
  };

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
    setLeadSource('');
    setWorkType('');
    setStartDate('');
    setEndDate('');
    setSortBy('createdAt');
    setSortOrder('desc');
  };

  const hasActiveFilters = search || (status && status !== 'all') || source || leadSource || workType || startDate || endDate;

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
            <ColumnSelector
              columns={COLUMN_DEFINITIONS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
              storageKey="leads-list"
              defaultColumns={DEFAULT_COLUMNS}
            />
          </div>
        </div>

        {/* Expanded Filter Panel */}
        {showFilters && (
          <div className="px-4 pb-4 border-b border-gray-100">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Lead Source Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lead Source
                  </label>
                  <select
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent bg-white"
                  >
                    <option value="">All Sources</option>
                    <option value="Customer Referral">Customer Referral</option>
                    <option value="Digital Marketing">Digital Marketing</option>
                    <option value="Employee Referral">Employee Referral</option>
                    <option value="Insurance Marketing">Insurance Marketing</option>
                    <option value="Internet Lead">Internet Lead</option>
                    <option value="Lead Aggregator">Lead Aggregator</option>
                    <option value="Other">Other</option>
                    <option value="Riley AI SMS">Riley AI SMS</option>
                    <option value="Riley Widget">Riley Widget</option>
                    <option value="Self-Gen">Self-Gen</option>
                    <option value="Solar Marketing">Solar Marketing</option>
                    <option value="Trade Show">Trade Show</option>
                    <option value="Website">Website</option>
                    <option value="Yard Sign">Yard Sign</option>
                  </select>
                </div>

                {/* Work Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Work Type
                  </label>
                  <select
                    value={workType}
                    onChange={(e) => setWorkType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent bg-white"
                  >
                    <option value="">All Work Types</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Insurance Program">Insurance Program</option>
                    <option value="Interior">Interior</option>
                    <option value="Retail">Retail</option>
                    <option value="Service/Repair">Service/Repair</option>
                    <option value="Subcontractor">Subcontractor</option>
                  </select>
                </div>

                {/* Date From */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created From
                  </label>
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

                {/* Date To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Created To
                  </label>
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
            </div>
          </div>
        )}

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
                  Select All ({leads.length})
                </button>
                {selectedLeads.length > 0 && (
                  <>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Clear ({selectedLeads.length})
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
          {selectedLeads.length > 0 && (
            <span className="text-sm text-gray-600">{selectedLeads.length} selected</span>
          )}
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
              <LoadingSpinner size="lg" message="Loading leads..." />
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
                  {selectionMode && (
                    <th className="px-4 py-3 w-12"></th>
                  )}
                  {getVisibleColumns().map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => col.sortable && handleSort(col.sortKey || col.key)}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{col.label}</span>
                        {col.sortable && <SortIndicator field={col.sortKey || col.key} />}
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-gray-50 transition-colors ${selectedLeads.includes(lead.id) ? 'bg-panda-primary/5' : ''}`}
                  >
                    {selectionMode && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelection(lead.id)}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          {selectedLeads.includes(lead.id) ? (
                            <CheckSquare className="w-5 h-5 text-panda-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                    )}
                    {isColumnVisible('name') && (
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
                    )}
                    {isColumnVisible('score') && (
                      <td className="px-4 py-3">
                        {lead.leadRank ? (
                          <LeadRankBadge rank={lead.leadRank} score={lead.leadScore} size="sm" />
                        ) : (
                          <span className="text-xs text-gray-400">Not scored</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible('company') && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.company || '—'}
                      </td>
                    )}
                    {isColumnVisible('contact') && (
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
                    )}
                    {isColumnVisible('location') && (
                      <td className="px-4 py-3">
                        {(lead.city || lead.state) ? (
                          <div className="flex items-center text-sm text-gray-600">
                            <MapPin className="w-3 h-3 mr-1.5 text-gray-400" />
                            {[lead.city, lead.state].filter(Boolean).join(', ')}
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    {isColumnVisible('status') && (
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            statusColors[lead.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {lead.status}
                        </span>
                      </td>
                    )}
                    {isColumnVisible('source') && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.source || '—'}
                      </td>
                    )}
                    {isColumnVisible('createdAt') && (
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
                    )}
                    {isColumnVisible('owner') && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.ownerName || 'Unassigned'}
                      </td>
                    )}
                    {isColumnVisible('workType') && (
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {lead.workType || '—'}
                      </td>
                    )}
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

      {/* Reassign Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reassign {selectedLeads.length} Lead{selectedLeads.length > 1 ? 's' : ''}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Owner</label>
              <select
                value={selectedNewOwner}
                onChange={(e) => setSelectedNewOwner(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select owner...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowReassignModal(false); setSelectedNewOwner(''); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkReassignMutation.mutate({ leadIds: selectedLeads, newOwnerId: selectedNewOwner })}
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
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Update Status for {selectedLeads.length} Lead{selectedLeads.length > 1 ? 's' : ''}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
              <select
                value={selectedNewStatus}
                onChange={(e) => setSelectedNewStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select status...</option>
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="UNQUALIFIED">Unqualified</option>
                <option value="NURTURING">Nurturing</option>
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowStatusModal(false); setSelectedNewStatus(''); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkUpdateStatusMutation.mutate({ leadIds: selectedLeads, status: selectedNewStatus })}
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
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2 text-red-600">Delete {selectedLeads.length} Lead{selectedLeads.length > 1 ? 's' : ''}?</h3>
            <p className="text-gray-600 mb-4">
              This will soft-delete the selected leads. They will be moved to the Deleted Records section and can be restored within 30 days.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMutation.mutate(selectedLeads)}
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
