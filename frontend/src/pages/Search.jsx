import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { accountsApi, contactsApi, leadsApi, opportunitiesApi, invoicesApi, notificationsApi } from '../services/api';
import {
  Search as SearchIcon,
  Building2,
  Users,
  UserPlus,
  Target,
  ArrowRight,
  Loader2,
  Receipt,
  AtSign,
  ExternalLink,
} from 'lucide-react';

const SEARCH_TABS = ['all', 'accounts', 'contacts', 'leads', 'jobs', 'invoices', 'mentions'];

function normalizeCollection(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

export default function Search() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const moduleParam = (searchParams.get('module') || 'all').toLowerCase();
  const [activeTab, setActiveTab] = useState(SEARCH_TABS.includes(moduleParam) ? moduleParam : 'all');

  useEffect(() => {
    setActiveTab(SEARCH_TABS.includes(moduleParam) ? moduleParam : 'all');
  }, [moduleParam]);

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['searchAccounts', query],
    queryFn: () => accountsApi.getAccounts({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['searchContacts', query],
    queryFn: () => contactsApi.getContacts({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['searchLeads', query],
    queryFn: () => leadsApi.getLeads({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['searchJobs', query],
    queryFn: () => opportunitiesApi.getOpportunities({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['searchInvoices', query],
    queryFn: () => invoicesApi.getInvoices({ search: query, limit: 20 }),
    enabled: !!query,
  });

  const { data: mentionsData, isLoading: mentionsLoading } = useQuery({
    queryKey: ['searchMentions', user?.id, query],
    queryFn: () => notificationsApi.getNotifications({ userId: user.id, type: 'MENTION', limit: 200 }),
    enabled: !!query && !!user?.id,
  });

  const isLoading = accountsLoading || contactsLoading || leadsLoading || jobsLoading || invoicesLoading || mentionsLoading;

  const accounts = normalizeCollection(accountsData, ['accounts', 'data']);
  const contacts = normalizeCollection(contactsData, ['contacts', 'data']);
  const leads = normalizeCollection(leadsData, ['leads', 'data']);
  const jobs = normalizeCollection(jobsData, ['opportunities', 'data']);
  const invoices = normalizeCollection(invoicesData, ['invoices', 'data']);
  const mentions = useMemo(() => {
    const allMentions = normalizeCollection(mentionsData, ['data']).filter((item) => item.type === 'MENTION');
    const normalizedQuery = query.trim().toLowerCase();
    return allMentions.filter((item) => {
      const haystack = `${item.title || ''} ${item.message || ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [mentionsData, query]);

  const totalResults = accounts.length + contacts.length + leads.length + jobs.length + invoices.length + mentions.length;

  const tabs = [
    { id: 'all', label: 'All', count: totalResults },
    { id: 'accounts', label: 'Accounts', count: accounts.length, icon: Building2 },
    { id: 'contacts', label: 'Contacts', count: contacts.length, icon: Users },
    { id: 'leads', label: 'Leads', count: leads.length, icon: UserPlus },
    { id: 'jobs', label: 'Jobs', count: jobs.length, icon: Target },
    { id: 'invoices', label: 'Invoices', count: invoices.length, icon: Receipt },
    { id: 'mentions', label: 'Mentions', count: mentions.length, icon: AtSign },
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Search Results for "{query}"</h1>
        <p className="text-gray-500 mt-1">{isLoading ? 'Searching...' : `Found ${totalResults} results`}</p>
      </div>

      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="-mb-px flex min-w-max gap-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-panda-primary/10 text-panda-primary' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-panda-primary" />
        </div>
      )}

      {!isLoading && (
        <div className="space-y-6">
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
                        {[account.email, account.phone].filter(Boolean).join(' • ') || [account.billingCity, account.billingState].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

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
                      <p className="font-medium text-gray-900">{contact.firstName} {contact.lastName}</p>
                      <p className="text-sm text-gray-500">{[contact.email, contact.phone || contact.mobilePhone].filter(Boolean).join(' • ')}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

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
                      <p className="font-medium text-gray-900">{lead.firstName} {lead.lastName}</p>
                      <p className="text-sm text-gray-500">{[lead.email, lead.phone || lead.mobilePhone, lead.company].filter(Boolean).join(' • ')}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {(activeTab === 'all' || activeTab === 'jobs') && jobs.length > 0 && (
            <ResultSection
              title="Jobs"
              icon={Target}
              items={jobs}
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
                      <p className="text-sm text-gray-500">{[opp.jobNumber, opp.accountName, opp.stageName || opp.stage, opp.primaryContactEmail, opp.primaryContactPhone].filter(Boolean).join(' • ')}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {(activeTab === 'all' || activeTab === 'invoices') && invoices.length > 0 && (
            <ResultSection
              title="Invoices"
              icon={Receipt}
              items={invoices}
              renderItem={(invoice) => (
                <Link
                  key={invoice.id}
                  to={`/invoices/${invoice.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Receipt className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                      <p className="text-sm text-gray-500">{[invoice.account?.name, invoice.account?.email, invoice.account?.phone, invoice.status].filter(Boolean).join(' • ')}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </Link>
              )}
            />
          )}

          {(activeTab === 'all' || activeTab === 'mentions') && mentions.length > 0 && (
            <ResultSection
              title="Mentions"
              icon={AtSign}
              items={mentions}
              renderItem={(mention) => {
                const actionUrl = mention.actionUrl || '/notifications';
                const content = (
                  <>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                        <AtSign className="w-5 h-5 text-sky-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{mention.title || 'Mention'}</p>
                        <p className="text-sm text-gray-500">{mention.message}</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </>
                );

                return /^https?:\/\//i.test(actionUrl) ? (
                  <a
                    key={mention.id}
                    href={actionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {content}
                  </a>
                ) : (
                  <Link
                    key={mention.id}
                    to={actionUrl}
                    className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    {content}
                  </Link>
                );
              }}
            />
          )}

          {totalResults === 0 && (
            <div className="text-center py-12">
              <SearchIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
              <p className="text-gray-500">Try adjusting your search terms or check the spelling</p>
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
