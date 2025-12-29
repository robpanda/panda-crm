import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { contactsApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import {
  Users,
  ChevronRight,
  Search,
  ChevronUp,
  ChevronDown,
  Phone,
  Mail,
  Building2,
  X,
  Plus,
  ArrowLeft,
} from 'lucide-react';

export default function ContactList() {
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [isPrimary, setIsPrimary] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const queryParams = useMemo(() => {
    const params = { page, limit: 25, sortBy, sortOrder };
    if (search) params.search = search;
    if (ownerFilter === 'mine') params.ownerFilter = 'mine';
    if (isPrimary === 'true') params.isPrimary = true;
    return params;
  }, [search, ownerFilter, isPrimary, sortBy, sortOrder, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', queryParams],
    queryFn: () => contactsApi.getContacts(queryParams),
  });

  const contacts = data?.data || [];
  const pagination = data?.pagination || {};

  const tabs = [
    { id: 'all', label: 'All', count: pagination.total || 0 },
    { id: 'mine', label: 'My Contacts', count: 0 },
    { id: 'primary', label: 'Primary Contacts', count: 0 },
    { id: 'recent', label: 'Recent', count: 0 },
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

  const hasActiveFilters = search || ownerFilter !== 'all' || isPrimary;

  const clearFilters = () => {
    setSearch('');
    setOwnerFilter('all');
    setIsPrimary('');
    setPage(1);
  };

  const handleTabChange = (tabId) => {
    if (tabId === 'mine') {
      setOwnerFilter('mine');
      setIsPrimary('');
    } else if (tabId === 'primary') {
      setOwnerFilter('all');
      setIsPrimary('true');
    } else if (tabId === 'recent') {
      setOwnerFilter('all');
      setIsPrimary('');
      setSortBy('createdAt');
      setSortOrder('desc');
    } else {
      setOwnerFilter('all');
      setIsPrimary('');
    }
    setPage(1);
  };

  const activeTab = ownerFilter === 'mine' ? 'mine' : isPrimary === 'true' ? 'primary' : 'all';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/contacts" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contact List</h1>
            <p className="text-gray-500">Manage your customer contacts</p>
          </div>
        </div>
        <Link
          to="/contacts/new"
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span>New Contact</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center border-b border-gray-100">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-panda-primary text-panda-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id
                  ? 'bg-panda-primary/10 text-panda-primary'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {formatNumber(tab.count)}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search contacts by name, email, phone..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              />
            </div>
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
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-2 text-gray-300" />
            <p>No contacts found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('lastName')}
                  >
                    Name <SortIcon field="lastName" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('account')}
                  >
                    Account <SortIcon field="account" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('email')}
                  >
                    Email <SortIcon field="email" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('phone')}
                  >
                    Phone <SortIcon field="phone" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('title')}
                  >
                    Title <SortIcon field="title" />
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('createdAt')}
                  >
                    Created <SortIcon field="createdAt" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Primary
                  </th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-medium">
                            {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                          </span>
                        </div>
                        <Link to={`/contacts/${contact.id}`} className="font-medium text-gray-900 hover:text-panda-primary">
                          {contact.firstName} {contact.lastName}
                        </Link>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.account ? (
                        <Link to={`/accounts/${contact.account.id}`} className="flex items-center hover:text-panda-primary">
                          <Building2 className="w-3 h-3 mr-1 text-gray-400" />
                          {contact.account.name}
                        </Link>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="flex items-center hover:text-panda-primary">
                          <Mail className="w-3 h-3 mr-1 text-gray-400" />
                          {contact.email}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.phone || contact.mobilePhone ? (
                        <a href={`tel:${contact.mobilePhone || contact.phone}`} className="flex items-center hover:text-panda-primary">
                          <Phone className="w-3 h-3 mr-1 text-gray-400" />
                          {contact.mobilePhone || contact.phone}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.title || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {contact.isPrimary && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Primary
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/contacts/${contact.id}`} className="text-gray-400 hover:text-gray-600">
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
