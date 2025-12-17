import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { opportunitiesApi } from '../services/api';
import { Target, Search, Filter, Plus, ChevronRight, DollarSign, Calendar } from 'lucide-react';

const stageColors = {
  LEAD_UNASSIGNED: 'bg-gray-400',
  LEAD_ASSIGNED: 'bg-blue-400',
  SCHEDULED: 'bg-indigo-400',
  INSPECTED: 'bg-purple-400',
  CLAIM_FILED: 'bg-pink-400',
  APPROVED: 'bg-green-400',
  CONTRACT_SIGNED: 'bg-emerald-400',
  IN_PRODUCTION: 'bg-yellow-400',
  COMPLETED: 'bg-teal-400',
  CLOSED_WON: 'bg-green-600',
  CLOSED_LOST: 'bg-red-400',
};

export default function Opportunities() {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('mine');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', { search, stage, ownerFilter, page }],
    queryFn: () => opportunitiesApi.getOpportunities({ search, stage, ownerFilter, page, limit: 25 }),
  });

  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts', ownerFilter],
    queryFn: () => opportunitiesApi.getStageCounts(ownerFilter),
  });

  const opportunities = data?.data || [];

  const stages = [
    { value: '', label: 'All Stages' },
    { value: 'LEAD_UNASSIGNED', label: 'Lead Unassigned' },
    { value: 'LEAD_ASSIGNED', label: 'Lead Assigned' },
    { value: 'SCHEDULED', label: 'Scheduled' },
    { value: 'INSPECTED', label: 'Inspected' },
    { value: 'CLAIM_FILED', label: 'Claim Filed' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'CONTRACT_SIGNED', label: 'Contract Signed' },
    { value: 'IN_PRODUCTION', label: 'In Production' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunities</h1>
          <p className="text-gray-500">Track your sales pipeline</p>
        </div>
        <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg hover:opacity-90">
          <Plus className="w-4 h-4" />
          <span>New Opportunity</span>
        </button>
      </div>

      {/* Owner filter */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setOwnerFilter('mine')}
          className={`px-4 py-2 rounded-lg ${
            ownerFilter === 'mine'
              ? 'bg-panda-primary text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          My Opportunities
        </button>
        <button
          onClick={() => setOwnerFilter('all')}
          className={`px-4 py-2 rounded-lg ${
            ownerFilter === 'all'
              ? 'bg-panda-primary text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All Opportunities
        </button>
      </div>

      {/* Stage filter */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search opportunities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
          />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent outline-none"
        >
          {stages.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary"></div>
          </div>
        ) : opportunities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Target className="w-12 h-12 mb-2 text-gray-300" />
            <p>No opportunities found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {opportunities.map((opp) => (
              <Link
                key={opp.id}
                to={`/opportunities/${opp.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className={`w-10 h-10 rounded-lg ${stageColors[opp.stage] || 'bg-gray-400'} flex items-center justify-center`}>
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{opp.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      {opp.account && <span>{opp.account.name}</span>}
                      {opp.closeDate && (
                        <span className="flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {new Date(opp.closeDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {opp.amount > 0 && (
                    <span className="flex items-center text-green-600 font-medium">
                      <DollarSign className="w-4 h-4" />
                      {opp.amount.toLocaleString()}
                    </span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {opp.stage?.replace(/_/g, ' ')}
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
