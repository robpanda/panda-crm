import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { contactsApi, usersApi, accountsApi } from '../services/api';
import { useRingCentral } from '../context/RingCentralContext';
import { formatNumber } from '../utils/formatters';
import ColumnSelector, { useColumnVisibility } from '../components/ColumnSelector';
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
  Square,
  CheckSquare,
  UserPlus,
  RefreshCw,
  Trash2,
} from 'lucide-react';

// Column definitions for the contacts list
const COLUMN_DEFINITIONS = [
  { key: 'name', label: 'Name', sortable: true, sortKey: 'lastName', required: true },
  { key: 'account', label: 'Account', sortable: true },
  { key: 'email', label: 'Email', sortable: true },
  { key: 'phone', label: 'Phone', sortable: true },
  { key: 'title', label: 'Title', sortable: true },
  { key: 'createdAt', label: 'Created', sortable: true },
  { key: 'isPrimary', label: 'Primary', sortable: false },
  { key: 'mobilePhone', label: 'Mobile', sortable: false, defaultVisible: false },
  { key: 'department', label: 'Department', sortable: true, defaultVisible: false },
];

// Default visible columns
const DEFAULT_COLUMNS = ['name', 'account', 'email', 'phone', 'title', 'createdAt', 'isPrimary'];

export default function ContactList() {
  const [searchParams] = useSearchParams();
  const { clickToCall } = useRingCentral();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [isPrimary, setIsPrimary] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);

  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedNewAccount, setSelectedNewAccount] = useState('');

  // Column visibility management
  const {
    visibleColumns,
    setVisibleColumns,
    isColumnVisible,
    getVisibleColumns,
  } = useColumnVisibility(COLUMN_DEFINITIONS, 'contacts-list', DEFAULT_COLUMNS);

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

  // Query for accounts dropdown (for reassignment)
  const { data: accountsData } = useQuery({
    queryKey: ['accounts-dropdown'],
    queryFn: () => accountsApi.getAccounts({ limit: 100 }),
    enabled: showReassignModal,
  });
  const accounts = accountsData?.data || [];

  // Bulk mutations
  const bulkReassignMutation = useMutation({
    mutationFn: ({ contactIds, newAccountId }) => contactsApi.bulkReassignAccount(contactIds, newAccountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowReassignModal(false);
      setSelectedContacts([]);
      setSelectionMode(false);
      setSelectedNewAccount('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (contactIds) => contactsApi.bulkDelete(contactIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowDeleteModal(false);
      setSelectedContacts([]);
      setSelectionMode(false);
    },
  });

  // Selection handlers
  const toggleSelection = (id) => {
    setSelectedContacts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllOnPage = () => {
    setSelectedContacts(contacts.map(c => c.id));
  };

  const clearSelection = () => {
    setSelectedContacts([]);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedContacts([]);
  };

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
                  Select All ({contacts.length})
                </button>
                {selectedContacts.length > 0 && (
                  <>
                    <button
                      onClick={clearSelection}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Clear ({selectedContacts.length})
                    </button>
                    <button
                      onClick={() => setShowReassignModal(true)}
                      className="flex items-center space-x-2 px-4 py-1.5 text-sm bg-panda-primary text-white rounded-lg hover:bg-panda-dark transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Reassign Account</span>
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
          {selectedContacts.length > 0 && (
            <span className="text-sm text-gray-600">{selectedContacts.length} selected</span>
          )}
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
            <ColumnSelector
              columns={COLUMN_DEFINITIONS}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
              storageKey="contacts-list"
              defaultColumns={DEFAULT_COLUMNS}
            />
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
                  {selectionMode && (
                    <th className="px-4 py-3 w-12"></th>
                  )}
                  {getVisibleColumns().map((col) => (
                    <th
                      key={col.key}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                        col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                      }`}
                      onClick={() => col.sortable && handleSort(col.sortKey || col.key)}
                    >
                      {col.label} {col.sortable && <SortIcon field={col.sortKey || col.key} />}
                    </th>
                  ))}
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((contact) => (
                  <tr key={contact.id} className={`hover:bg-gray-50 ${selectedContacts.includes(contact.id) ? 'bg-panda-primary/5' : ''}`}>
                    {selectionMode && (
                      <td className="px-4 py-4">
                        <button
                          onClick={() => toggleSelection(contact.id)}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          {selectedContacts.includes(contact.id) ? (
                            <CheckSquare className="w-5 h-5 text-panda-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                    )}
                    {isColumnVisible('name') && (
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
                    )}
                    {isColumnVisible('account') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.account ? (
                          <Link to={`/accounts/${contact.account.id}`} className="flex items-center hover:text-panda-primary">
                            <Building2 className="w-3 h-3 mr-1 text-gray-400" />
                            {contact.account.name}
                          </Link>
                        ) : '-'}
                      </td>
                    )}
                    {isColumnVisible('email') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="flex items-center hover:text-panda-primary">
                            <Mail className="w-3 h-3 mr-1 text-gray-400" />
                            {contact.email}
                          </a>
                        ) : '-'}
                      </td>
                    )}
                    {isColumnVisible('phone') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.phone || contact.mobilePhone ? (
                          <button
                            onClick={() => clickToCall(contact.mobilePhone || contact.phone)}
                            className="flex items-center hover:text-panda-primary cursor-pointer"
                          >
                            <Phone className="w-3 h-3 mr-1 text-gray-400" />
                            {contact.mobilePhone || contact.phone}
                          </button>
                        ) : '-'}
                      </td>
                    )}
                    {isColumnVisible('title') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.title || '-'}
                      </td>
                    )}
                    {isColumnVisible('createdAt') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '-'}
                      </td>
                    )}
                    {isColumnVisible('isPrimary') && (
                      <td className="px-6 py-4">
                        {contact.isPrimary && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            Primary
                          </span>
                        )}
                      </td>
                    )}
                    {isColumnVisible('mobilePhone') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.mobilePhone ? (
                          <button
                            onClick={() => clickToCall(contact.mobilePhone)}
                            className="flex items-center hover:text-panda-primary cursor-pointer"
                          >
                            <Phone className="w-3 h-3 mr-1 text-gray-400" />
                            {contact.mobilePhone}
                          </button>
                        ) : '-'}
                      </td>
                    )}
                    {isColumnVisible('department') && (
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {contact.department || '-'}
                      </td>
                    )}
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

      {/* Reassign Account Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Reassign {selectedContacts.length} Contact{selectedContacts.length > 1 ? 's' : ''} to Account</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">New Account</label>
              <select
                value={selectedNewAccount}
                onChange={(e) => setSelectedNewAccount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
              >
                <option value="">Select account...</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowReassignModal(false); setSelectedNewAccount(''); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkReassignMutation.mutate({ contactIds: selectedContacts, newAccountId: selectedNewAccount })}
                disabled={!selectedNewAccount || bulkReassignMutation.isPending}
                className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-dark disabled:opacity-50"
              >
                {bulkReassignMutation.isPending ? 'Reassigning...' : 'Reassign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2 text-red-600">Delete {selectedContacts.length} Contact{selectedContacts.length > 1 ? 's' : ''}?</h3>
            <p className="text-gray-600 mb-4">
              This will soft-delete the selected contacts. They will be moved to the Deleted Records section and can be restored within 30 days.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMutation.mutate(selectedContacts)}
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
