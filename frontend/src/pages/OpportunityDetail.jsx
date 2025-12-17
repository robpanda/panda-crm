import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { opportunitiesApi } from '../services/api';
import {
  Target,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Edit,
  Wrench,
  FileText,
  Users,
  Clock,
} from 'lucide-react';

export default function OpportunityDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState('workOrders');

  const { data: opportunity, isLoading } = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => opportunitiesApi.getOpportunity(id),
    enabled: !!id,
  });

  const { data: workOrders } = useQuery({
    queryKey: ['opportunityWorkOrders', id],
    queryFn: () => opportunitiesApi.getWorkOrders(id),
    enabled: !!id && activeTab === 'workOrders',
  });

  const { data: quotes } = useQuery({
    queryKey: ['opportunityQuotes', id],
    queryFn: () => opportunitiesApi.getQuotes(id),
    enabled: !!id && activeTab === 'quotes',
  });

  const { data: contacts } = useQuery({
    queryKey: ['opportunityContacts', id],
    queryFn: () => opportunitiesApi.getContacts(id),
    enabled: !!id && activeTab === 'contacts',
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="text-center py-12">
        <Target className="w-12 h-12 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500">Opportunity not found</p>
        <Link to="/opportunities" className="text-panda-primary hover:underline mt-2 inline-block">
          Back to Opportunities
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'workOrders', label: 'Work Orders', icon: Wrench, data: workOrders },
    { id: 'quotes', label: 'Quotes', icon: FileText, data: quotes },
    { id: 'contacts', label: 'Contacts', icon: Users, data: contacts },
  ];

  return (
    <div className="space-y-6">
      <Link to="/opportunities" className="inline-flex items-center text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Opportunities
      </Link>

      {/* Header Card - The HUB */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center">
              <Target className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{opportunity.name}</h1>
              {opportunity.account && (
                <Link
                  to={`/accounts/${opportunity.account.id}`}
                  className="text-gray-500 hover:text-panda-primary flex items-center mt-1"
                >
                  <Building2 className="w-4 h-4 mr-1" />
                  {opportunity.account.name}
                </Link>
              )}
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  Close Date: {opportunity.closeDate ? new Date(opportunity.closeDate).toLocaleDateString() : 'Not set'}
                </span>
                {opportunity.type && (
                  <span className="badge badge-info">{opportunity.type}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-purple-100 text-purple-700 font-medium">
              {opportunity.stage?.replace(/_/g, ' ')}
            </span>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
              <Edit className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
          <div>
            <p className="text-sm text-gray-500">Amount</p>
            <p className="text-xl font-semibold text-green-600 flex items-center">
              <DollarSign className="w-5 h-5" />
              {(opportunity.amount || 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Probability</p>
            <p className="text-xl font-semibold text-gray-900">{opportunity.probability || 0}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Work Orders</p>
            <p className="text-xl font-semibold text-gray-900">{opportunity._count?.workOrders || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Days Open</p>
            <p className="text-xl font-semibold text-gray-900 flex items-center">
              <Clock className="w-5 h-5 mr-1 text-gray-400" />
              {Math.floor((Date.now() - new Date(opportunity.createdAt).getTime()) / (1000 * 60 * 60 * 24))}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="border-b border-gray-100">
          <div className="flex space-x-4 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-4 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-panda-primary text-panda-primary font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'workOrders' && (
            <div>
              {!workOrders || workOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wrench className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No work orders found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {workOrders.map((wo) => (
                    <div key={wo.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{wo.workOrderNumber || wo.subject}</h4>
                          <p className="text-sm text-gray-500">{wo.workType?.name}</p>
                        </div>
                        <span className={`badge ${
                          wo.status === 'COMPLETED' ? 'badge-success' :
                          wo.status === 'IN_PROGRESS' ? 'badge-warning' :
                          'badge-gray'
                        }`}>
                          {wo.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'quotes' && (
            <div>
              {!quotes || quotes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No quotes found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <div key={quote.id} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{quote.quoteNumber || quote.name}</h4>
                          <p className="text-sm text-gray-500">
                            ${(quote.grandTotal || 0).toLocaleString()}
                          </p>
                        </div>
                        <span className={`badge ${
                          quote.status === 'ACCEPTED' ? 'badge-success' :
                          quote.status === 'SENT' ? 'badge-warning' :
                          'badge-gray'
                        }`}>
                          {quote.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'contacts' && (
            <div>
              {!contacts || contacts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p>No contacts found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contacts.map((contact) => (
                    <Link
                      key={contact.id}
                      to={`/contacts/${contact.id}`}
                      className="block p-4 border border-gray-200 rounded-lg hover:border-panda-primary transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {contact.firstName?.charAt(0)}{contact.lastName?.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-medium">{contact.firstName} {contact.lastName}</h4>
                          <p className="text-sm text-gray-500">{contact.email}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
