import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { accountsApi, contactsApi, leadsApi, opportunitiesApi } from '../services/api';
import {
  Search as SearchIcon,
  Building2,
  Users,
  UserPlus,
  Target,
  ArrowRight,
  Loader2,
} from 'lucide-react';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [activeTab, setActiveTab] = useState('all');

  // Search accounts
  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['searchAccounts', query],
    queryFn: () => accountsApi.getAccounts({ search: query, limit: 20 }),
    enabled: !!query,
  });

  // Search contacts
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['searchContacts', query],
    queryFn: () => contactsApi.getContacts({ search: query, limit: 20 }),
    enabled: !!query,
  });

  // Search leads
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['searchLeads', query],
    queryFn: () => leadsApi.getLeads({ search: query, limit: 20 }),
    enabled: !!query,
  });

  // Search opportunities
  const { data: opportunitiesData, isLoading: opportunitiesLoading } = useQuery({
    queryKey: ['searchOpportunities', query],
    queryFn: () => opportunitiesApi.getOpportunities({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const isLoading = accountsLoading || contactsLoading || leadsLoading || opportunitiesLoading;

  const accounts = accountsData?.accounts || [];
  const contacts = contactsData?.contacts || [];
  const leads = leadsData?.leads || [];
  const opportunities = opportunitiesData?.opportunities || [];

  const totalResults = accounts.length + contacts.length + leads.length + opportunities.length;

  const tabs = [
    { id: 'all', label: 'All', count: totalResults },
    { id: 'accounts', label: 'Accounts', count: accounts.length, icon: Building2 },
    { id: 'contacts', label: 'Contacts', count: contacts.length, icon: Users },
    { id: 'leads', label: 'Leads', count: leads.length, icon: UserPlus },
    { id: 'opportunities', label: 'Opportunities', count: opportunities.length, icon: Target },
  ];

  if (!query) {
    return (
      <div className="text-center py-12">
        <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Search Panda CRM</h2>
        <p className="text-gray-500">Enter a search term in the search bar above</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Search Results for "{query}"
        </h1>
        <p className="text-gray-500 mt-1">
          {isLoading ? 'Searching...' : `Found ${totalResults} results`}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id
                    ? 'bg-panda-primary/10 text-panda-primary'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
        </div>
      )}

      {/* Results */}
      {!isLoading && (
        <div className="space-y-6">
          {/* Accounts */}
          {(activeTab === 'all' || activeTab === 'accounts') && accounts.length > 0 && (
            <ResultSection
              title="Accounts"
              icon={Building2}
              items={accounts}
              renderItem={(account) => (
                <Link
                  key={account.id}
                  to={`/accounts/${account.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{account.name}</p>
                      <p className="text-sm text-gray-500">
                        {account.billingCity}, {account.billingState}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {/* Contacts */}
          {(activeTab === 'all' || activeTab === 'contacts') && contacts.length > 0 && (
            <ResultSection
              title="Contacts"
              icon={Users}
              items={contacts}
              renderItem={(contact) => (
                <Link
                  key={contact.id}
                  to={`/contacts/${contact.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <span className="text-orange-600 font-medium">
                        {contact.firstName?.[0]}{contact.lastName?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {contact.firstName} {contact.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{contact.email}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {/* Leads */}
          {(activeTab === 'all' || activeTab === 'leads') && leads.length > 0 && (
            <ResultSection
              title="Leads"
              icon={UserPlus}
              items={leads}
              renderItem={(lead) => (
                <Link
                  key={lead.id}
                  to={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <UserPlus className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {lead.firstName} {lead.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{lead.status}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {/* Opportunities */}
          {(activeTab === 'all' || activeTab === 'opportunities') && opportunities.length > 0 && (
            <ResultSection
              title="Opportunities"
              icon={Target}
              items={opportunities}
              renderItem={(opp) => (
                <Link
                  key={opp.id}
                  to={`/jobs/${opp.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Target className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{opp.name}</p>
                      <p className="text-sm text-gray-500">{opp.stageName}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {/* No Results */}
          {totalResults === 0 && (
            <div className="text-center py-12">
              <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500">
                Try adjusting your search terms or check the spelling
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, icon: Icon, items, renderItem }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center space-x-2">
        <Icon className="w-5 h-5 text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <span className="text-sm text-gray-500">({items.length})</span>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map(renderItem)}
      </div>
    </div>
  );
}
