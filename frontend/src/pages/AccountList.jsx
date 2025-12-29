import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { accountsApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import {
  Building2,
  ChevronRight,
  Search,
  ChevronUp,
  ChevronDown,
  MapPin,
  Phone,
  X,
  Plus,
  ArrowLeft,
  Mail,
} from 'lucide-react';

const statusColors = {
  ACTIVE: 'bg-green-100 text-green-700',
  PROSPECT: 'bg-blue-100 text-blue-700',
  NEW: 'bg-indigo-100 text-indigo-700',
  ONBOARDING: 'bg-yellow-100 text-yellow-700',
  IN_PRODUCTION: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-teal-100 text-teal-700',
  CLOSED: 'bg-gray-100 text-gray-700',
  INACTIVE: 'bg-red-100 text-red-700',
};

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'PROSPECT', label: 'Prospect' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'IN_PRODUCTION', label: 'In Production' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'INACTIVE', label: 'Inactive' },
];

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'RESIDENTIAL', label: 'Residential' },
  { value: 'COMMERCIAL', label: 'Commercial' },
];

export default function AccountList() {
  const [searchParams] = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [status, setStatus] = useState(initialStatus === 'all' ? '' : initialStatus);
  const [type, setType] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => {
    const params = { page, limit: 25, sortBy, sortOrder };
    if (search) params.search = search;
    if (ownerFilter === 'mine') params.ownerFilter = 'mine';
    if (status) params.status = status;
    if (type) params.type = type;
    return params;
  }, [search, ownerFilter, status, type, sortBy, sortOrder, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', queryParams],
    queryFn: () => accountsApi.getAccounts(queryParams),
  });

  const { data: statusCounts } = useQuery({
    queryKey: ['accountStatusCounts'],
    queryFn: () => accountsApi.getStatusCounts?.() || Promise.resolve({}),
  });

  const accounts = data?.data || [];
  const pagination = data?.pagination || {};

  const tabs = [
    { id: 'all', label: 'All', count: pagination.total || 0 },
    { id: 'mine', label: 'My Accounts', count: statusCounts?.mine || 0 },
    { id: 'active', label: 'Active', count: statusCounts?.ACTIVE || 0 },
    { id: 'prospect', label: 'Prospect', count: statusCounts?.PROSPECT || 0 },
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

  const hasActiveFilters = search || status || type || ownerFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setType('');
    setOwnerFilter('all');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/accounts" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Account List</h1>
            <p className="text-gray-500">Manage your customer accounts</p>
          </div>
        </div>
        <Link
          to="/accounts/new"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>New Account</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center border-b border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'mine') {
                  setOwnerFilter('mine');
                  setStatus('');
                } else if (tab.id === 'active') {
                  setOwnerFilter('all');
                  setStatus('ACTIVE');
                } else if (tab.id === 'prospect') {
                  setOwnerFilter('all');
                  setStatus('PROSPECT');
                } else {
                  setOwnerFilter('all');
                  setStatus('');
                }
                setPage(1);
              }}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                (tab.id === 'mine' && ownerFilter === 'mine') ||
                (tab.id === 'active' && status === 'ACTIVE' && ownerFilter === 'all') ||
                (tab.id === 'prospect' && status === 'PROSPECT' && ownerFilter === 'all') ||
                (tab.id === 'all' && !status && ownerFilter === 'all')
                  ? 'border-panda-primary text-panda-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                (tab.id === 'mine' && ownerFilter === 'mine') ||
                (tab.id === 'active' && status === 'ACTIVE') ||
                (tab.id === 'prospect' && status === 'PROSPECT') ||
                (tab.id === 'all' && !status && ownerFilter === 'all')
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
                placeholder="Search accounts..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              />
            </div>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none bg-white"
            >
              {statusOptions.map((opt) => (
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
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Building2 className="w-12 h-12 mb-2 text-gray-300" />
            <p>No accounts found</p>
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
                    Account Name <SortIcon field="name" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('phone')}
                  >
                    Contact <SortIcon field="phone" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('billingCity')}
                  >
                    Location <SortIcon field="billingCity" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('status')}
                  >
                    Status <SortIcon field="status" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('type')}
                  >
                    Type <SortIcon field="type" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    Created <SortIcon field="createdAt" />
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
                {accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/accounts/${account.id}`} className="font-medium text-gray-900 hover:text-panda-primary">
                        {account.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="space-y-1">
                        {account.phone && (
                          <div className="flex items-center">
                            <Phone className="w-3 h-3 mr-1 text-gray-400" />
                            {account.phone}
                          </div>
                        )}
                        {account.email && (
                          <div className="flex items-center">
                            <Mail className="w-3 h-3 mr-1 text-gray-400" />
                            {account.email}
                          </div>
                        )}
                        {!account.phone && !account.email && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {account.billingCity || account.billingState ? (
                        <span className="flex items-center">
                          <MapPin className="w-3 h-3 mr-1 text-gray-400" />
                          {[account.billingCity, account.billingState].filter(Boolean).join(', ')}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[account.status] || 'bg-gray-100 text-gray-700'}`}>
                        {account.status?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {account.type || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {account.ownerName || account.owner?.name || 'Unassigned'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/accounts/${account.id}`} className="text-gray-400 hover:text-gray-600">
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
