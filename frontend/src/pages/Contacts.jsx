import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { contactsApi } from '../services/api';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { Users, Search, Filter, Plus, ChevronRight, Phone, Mail, Building2, MapPin } from 'lucide-react';

export default function Contacts() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState('all');

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;

  // Build filter params based on role
  const filterParams = useMemo(() => {
    const params = {
      search,
      page,
      limit: 25,
    };

    // Apply tab-based filters
    if (activeTab === 'my') {
      params.ownerId = user?.id;
    } else if (activeTab === 'past') {
      params.isPastCustomer = true;
    } else if (!isGlobalView) {
      // For non-admins, apply role-based filtering
      if (isTeamView && user?.teamMemberIds?.length > 0) {
        params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
      }
      if (user?.officeAssignment) {
        params.office = user.officeAssignment;
      }
    }

    return params;
  }, [search, activeTab, page, user, isGlobalView, isTeamView]);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', filterParams],
    queryFn: () => contactsApi.getContacts(filterParams),
  });

  const contacts = data?.data || [];
  const pagination = data?.pagination || {};

  // Get scope label for header
  const getScopeLabel = () => {
    if (activeTab === 'my') return null;
    if (isGlobalView) return null;
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Team';
    return user?.officeAssignment || null;
  };

  const scopeLabel = getScopeLabel();

  // Tabs for filtering
  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'my', label: 'My Contacts' },
    { id: 'past', label: 'Past Customers' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500">
            {scopeLabel && activeTab !== 'my' ? (
              <>Viewing <span className="text-panda-primary font-medium">{scopeLabel}</span> contacts</>
            ) : (
              'Manage your customer contacts'
            )}
          </p>
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
      <div className="flex items-center space-x-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-panda-primary text-panda-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          />
        </div>
        {pagination.total && (
          <span className="text-sm text-gray-500">
            {pagination.total} contacts
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-2 text-gray-300" />
            <p>No contacts found</p>
            {scopeLabel && activeTab !== 'my' && (
              <p className="text-sm mt-1">in {scopeLabel}</p>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {contacts.map((contact) => (
                <Link
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                      <span className="text-white font-medium">
                        {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {contact.firstName} {contact.lastName}
                      </h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        {contact.account && (
                          <span className="flex items-center">
                            <Building2 className="w-3 h-3 mr-1" />
                            {contact.account.name}
                          </span>
                        )}
                        {contact.email && (
                          <span className="flex items-center">
                            <Mail className="w-3 h-3 mr-1" />
                            {contact.email}
                          </span>
                        )}
                        {contact.phone && (
                          <span className="flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {contact.isPastCustomer && (
                      <span className="badge badge-success">Past Customer</span>
                    )}
                    {contact.isPrimary && (
                      <span className="badge badge-info">Primary</span>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, pagination.total)} of {pagination.total}
                </p>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === pagination.totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
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
