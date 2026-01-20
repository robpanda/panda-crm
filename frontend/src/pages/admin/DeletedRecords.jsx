import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, Search, Building2, Users, Target, Briefcase, Clock, AlertCircle } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { accountsApi, contactsApi, leadsApi, opportunitiesApi } from '../../services/api';

// Tab definitions
const TABS = [
  { id: 'accounts', label: 'Accounts', icon: Building2 },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'leads', label: 'Leads', icon: Target },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
];

// Calculate days until permanent deletion (30 day retention)
const getDaysRemaining = (deletedAt) => {
  if (!deletedAt) return null;
  const deletedDate = new Date(deletedAt);
  const expirationDate = new Date(deletedDate);
  expirationDate.setDate(expirationDate.getDate() + 30);
  const now = new Date();
  const daysRemaining = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysRemaining);
};

// Format date for display
const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function DeletedRecords() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('accounts');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Fetch deleted records based on active tab
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['deleted-accounts', page, search],
    queryFn: () => accountsApi.getDeletedAccounts({ page, limit: 25, search }),
    enabled: activeTab === 'accounts',
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['deleted-contacts', page, search],
    queryFn: () => contactsApi.getDeletedContacts({ page, limit: 25, search }),
    enabled: activeTab === 'contacts',
  });

  const { data: leadsData, isLoading: loadingLeads } = useQuery({
    queryKey: ['deleted-leads', page, search],
    queryFn: () => leadsApi.getDeletedLeads({ page, limit: 25, search }),
    enabled: activeTab === 'leads',
  });

  const { data: jobsData, isLoading: loadingJobs } = useQuery({
    queryKey: ['deleted-opportunities', page, search],
    queryFn: () => opportunitiesApi.getDeletedOpportunities({ page, limit: 25, search }),
    enabled: activeTab === 'jobs',
  });

  // Restore mutations
  const restoreAccountMutation = useMutation({
    mutationFn: (id) => accountsApi.restoreAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deleted-accounts']);
      queryClient.invalidateQueries(['accounts']);
    },
  });

  const restoreContactMutation = useMutation({
    mutationFn: (id) => contactsApi.restoreContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deleted-contacts']);
      queryClient.invalidateQueries(['contacts']);
    },
  });

  const restoreLeadMutation = useMutation({
    mutationFn: (id) => leadsApi.restoreLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deleted-leads']);
      queryClient.invalidateQueries(['leads']);
    },
  });

  const restoreOpportunityMutation = useMutation({
    mutationFn: (id) => opportunitiesApi.restoreOpportunity(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['deleted-opportunities']);
      queryClient.invalidateQueries(['opportunities']);
    },
  });

  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'accounts':
        return { data: accountsData, loading: loadingAccounts, restore: restoreAccountMutation };
      case 'contacts':
        return { data: contactsData, loading: loadingContacts, restore: restoreContactMutation };
      case 'leads':
        return { data: leadsData, loading: loadingLeads, restore: restoreLeadMutation };
      case 'jobs':
        return { data: jobsData, loading: loadingJobs, restore: restoreOpportunityMutation };
      default:
        return { data: null, loading: false, restore: null };
    }
  };

  const { data: currentData, loading, restore } = getCurrentData();
  const records = currentData?.data || [];
  const pagination = currentData?.pagination || { page: 1, totalPages: 1, total: 0 };

  const handleRestore = async (id, name) => {
    if (window.confirm(`Are you sure you want to restore "${name}"?`)) {
      await restore.mutateAsync(id);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
    setSearch('');
  };

  // Render record row based on type
  const renderRecordRow = (record) => {
    const daysRemaining = getDaysRemaining(record.deletedAt);
    const isExpiringSoon = daysRemaining !== null && daysRemaining <= 7;

    switch (activeTab) {
      case 'accounts':
        return (
          <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-3 px-4">
              <div className="font-medium text-gray-900">{record.name}</div>
              {record.accountNumber && (
                <div className="text-sm text-gray-500">{record.accountNumber}</div>
              )}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {record.owner ? `${record.owner.firstName} ${record.owner.lastName}` : '-'}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {formatDate(record.deletedAt)}
            </td>
            <td className="py-3 px-4">
              <span className={`inline-flex items-center gap-1 text-sm ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                <Clock className="w-3 h-3" />
                {daysRemaining} days
              </span>
            </td>
            <td className="py-3 px-4">
              <button
                onClick={() => handleRestore(record.id, record.name)}
                disabled={restore.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
            </td>
          </tr>
        );

      case 'contacts':
        return (
          <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-3 px-4">
              <div className="font-medium text-gray-900">
                {record.firstName} {record.lastName}
              </div>
              {record.email && (
                <div className="text-sm text-gray-500">{record.email}</div>
              )}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {record.account?.name || '-'}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {formatDate(record.deletedAt)}
            </td>
            <td className="py-3 px-4">
              <span className={`inline-flex items-center gap-1 text-sm ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                <Clock className="w-3 h-3" />
                {daysRemaining} days
              </span>
            </td>
            <td className="py-3 px-4">
              <button
                onClick={() => handleRestore(record.id, `${record.firstName} ${record.lastName}`)}
                disabled={restore.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
            </td>
          </tr>
        );

      case 'leads':
        return (
          <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-3 px-4">
              <div className="font-medium text-gray-900">
                {record.firstName} {record.lastName}
              </div>
              {record.email && (
                <div className="text-sm text-gray-500">{record.email}</div>
              )}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {record.owner ? `${record.owner.firstName} ${record.owner.lastName}` : '-'}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {formatDate(record.deletedAt)}
            </td>
            <td className="py-3 px-4">
              <span className={`inline-flex items-center gap-1 text-sm ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                <Clock className="w-3 h-3" />
                {daysRemaining} days
              </span>
            </td>
            <td className="py-3 px-4">
              <button
                onClick={() => handleRestore(record.id, `${record.firstName} ${record.lastName}`)}
                disabled={restore.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
            </td>
          </tr>
        );

      case 'jobs':
        return (
          <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-3 px-4">
              <div className="font-medium text-gray-900">{record.name}</div>
              {record.jobId && (
                <div className="text-sm text-gray-500">Job #{record.jobId}</div>
              )}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {record.account?.name || '-'}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {record.owner ? `${record.owner.firstName} ${record.owner.lastName}` : '-'}
            </td>
            <td className="py-3 px-4 text-sm text-gray-600">
              {formatDate(record.deletedAt)}
            </td>
            <td className="py-3 px-4">
              <span className={`inline-flex items-center gap-1 text-sm ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                <Clock className="w-3 h-3" />
                {daysRemaining} days
              </span>
            </td>
            <td className="py-3 px-4">
              <button
                onClick={() => handleRestore(record.id, record.name)}
                disabled={restore.isPending}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
            </td>
          </tr>
        );

      default:
        return null;
    }
  };

  // Get column headers based on active tab
  const getColumns = () => {
    switch (activeTab) {
      case 'accounts':
        return ['Name', 'Owner', 'Deleted', 'Expires In', 'Actions'];
      case 'contacts':
        return ['Name', 'Account', 'Deleted', 'Expires In', 'Actions'];
      case 'leads':
        return ['Name', 'Owner', 'Deleted', 'Expires In', 'Actions'];
      case 'jobs':
        return ['Name', 'Account', 'Owner', 'Deleted', 'Expires In', 'Actions'];
      default:
        return [];
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Trash2 className="w-8 h-8 text-red-500" />
              <h1 className="text-2xl font-bold text-gray-900">Deleted Records</h1>
            </div>
          <p className="text-gray-600">
            Manage and restore deleted records. Records are permanently deleted after 30 days.
          </p>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 font-medium">30-Day Retention Policy</p>
            <p className="text-sm text-amber-700">
              Deleted records are kept for 30 days before permanent deletion.
              Restore records before they expire to recover them.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-panda-primary text-panda-primary'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search deleted records..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-gray-500">
                <div className="animate-spin w-8 h-8 border-2 border-panda-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                Loading deleted records...
              </div>
            ) : records.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                <Trash2 className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">No deleted records</p>
                <p className="text-sm">Deleted {activeTab} will appear here for 30 days.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    {getColumns().map((col) => (
                      <th
                        key={col}
                        className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{records.map(renderRecordRow)}</tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Showing {records.length} of {pagination.total} records
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </AdminLayout>
  );
}
