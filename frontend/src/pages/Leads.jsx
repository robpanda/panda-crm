import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { leadsApi } from '../services/api';
import { UserPlus, Search, Filter, Plus, ChevronRight, Phone, Mail, Clock } from 'lucide-react';

const statusColors = {
  NEW: 'badge-info',
  CONTACTED: 'badge-warning',
  QUALIFIED: 'badge-success',
  UNQUALIFIED: 'badge-gray',
  CONVERTED: 'badge-success',
};

export default function Leads() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', { search, status, page }],
    queryFn: () => leadsApi.getLeads({ search, status, page, limit: 25 }),
  });

  const { data: counts } = useQuery({
    queryKey: ['leadCounts'],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  const leads = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-gray-500">Track and convert your leads</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" />
          <span>New Lead</span>
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-2">
        {[
          { value: '', label: 'All', count: counts?.total || 0 },
          { value: 'NEW', label: 'New', count: counts?.new || 0 },
          { value: 'CONTACTED', label: 'Contacted', count: counts?.contacted || 0 },
          { value: 'QUALIFIED', label: 'Qualified', count: counts?.qualified || 0 },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg whitespace-nowrap ${
              status === tab.value
                ? 'bg-panda-primary text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              status === tab.value ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <UserPlus className="w-12 h-12 mb-2 text-gray-300" />
            <p>No leads found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    lead.status === 'NEW' ? 'bg-blue-100' :
                    lead.status === 'CONTACTED' ? 'bg-yellow-100' :
                    lead.status === 'QUALIFIED' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <UserPlus className={`w-5 h-5 ${
                      lead.status === 'NEW' ? 'text-blue-600' :
                      lead.status === 'CONTACTED' ? 'text-yellow-600' :
                      lead.status === 'QUALIFIED' ? 'text-green-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {lead.firstName} {lead.lastName}
                    </h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      {lead.company && <span>{lead.company}</span>}
                      {lead.phone && (
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1" />
                          {lead.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {lead.daysOld > 0 && (
                    <span className="flex items-center text-sm text-gray-500">
                      <Clock className="w-3 h-3 mr-1" />
                      {lead.daysOldLabel || `${lead.daysOld}d`}
                    </span>
                  )}
                  <span className={`badge ${statusColors[lead.status] || 'badge-gray'}`}>
                    {lead.status}
                  </span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
