import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { leadsApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import {
  UserPlus,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneMissed,
  Clock,
  TrendingUp,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  Calendar,
  Users,
  Target,
  BarChart3,
  Trophy,
  Flame,
  Medal,
} from 'lucide-react';

export default function LeadsDashboard() {
  const { user } = useAuth();
  const [timePeriod, setTimePeriod] = useState('today');

  // Check if user is call center (rep or manager)
  const isCallCenter = user?.roleType === ROLE_TYPES.CALL_CENTER || user?.roleType === ROLE_TYPES.CALL_CENTER_MANAGER || user?.department === 'Call Center';

  // Get date range based on time period
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timePeriod) {
      case 'week': {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return { startDate: weekStart.toISOString().split('T')[0], endDate: today.toISOString().split('T')[0] };
      }
      case 'month': {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: monthStart.toISOString().split('T')[0], endDate: today.toISOString().split('T')[0] };
      }
      default:
        return { startDate: today.toISOString().split('T')[0], endDate: today.toISOString().split('T')[0] };
    }
  };

  const dateRange = getDateRange();

  const { data: leadCounts } = useQuery({
    queryKey: ['leadCounts'],
    queryFn: () => leadsApi.getLeadCounts(),
  });

  const { data: recentLeads } = useQuery({
    queryKey: ['recentLeads'],
    queryFn: () => leadsApi.getLeads({ limit: 5, sort: 'createdAt', order: 'desc' }),
  });

  const { data: myLeads } = useQuery({
    queryKey: ['myLeads'],
    queryFn: () => leadsApi.getLeads({ ownerFilter: 'mine', limit: 5 }),
  });

  // Call center specific queries
  const { data: myStats } = useQuery({
    queryKey: ['myCallCenterStats', dateRange],
    queryFn: () => leadsApi.getMyCallCenterStats(dateRange),
    enabled: isCallCenter,
  });

  const { data: leaderboardData } = useQuery({
    queryKey: ['callCenterLeaderboard', dateRange],
    queryFn: () => leadsApi.getCallCenterLeaderboard(dateRange),
    enabled: isCallCenter,
  });

  const { data: teamTotals } = useQuery({
    queryKey: ['callCenterTeamTotals', dateRange],
    queryFn: () => leadsApi.getCallCenterTeamTotals(dateRange),
    enabled: isCallCenter,
  });

  // Find current user's rank
  const myRank = leaderboardData?.leaderboard?.findIndex(
    (entry) => entry.userId === user?.id
  ) + 1 || 0;

  // Stats cards - for call center users, show their personal stats that update with time period
  // For other users, show overall lead counts
  const stats = isCallCenter ? [
    {
      label: 'My Leads Created',
      value: myStats?.leadsCreated || 0,
      icon: UserPlus,
      color: 'from-green-500 to-green-600',
      link: '/leads/list?ownerFilter=mine',
      trend: myStats?.leadsTrend,
    },
    {
      label: 'Appointments Set',
      value: myStats?.appointmentsSet || 0,
      icon: Calendar,
      color: 'from-blue-500 to-blue-600',
      link: '/leads/list?status=QUALIFIED',
      trend: myStats?.appointmentsTrend,
    },
    {
      label: 'Conversion Rate',
      value: myStats?.conversionRate || 0,
      icon: Target,
      color: 'from-purple-500 to-purple-600',
      suffix: '%',
    },
    {
      label: 'Team Total',
      value: teamTotals?.totalLeads || 0,
      icon: Users,
      color: 'from-yellow-500 to-yellow-600',
      link: '/leads/list',
    },
  ] : [
    {
      label: 'Total Leads',
      value: leadCounts?.total || 0,
      icon: UserPlus,
      color: 'from-blue-500 to-blue-600',
      link: '/leads/list',
    },
    {
      label: 'New Leads',
      value: leadCounts?.NEW || 0,
      icon: AlertCircle,
      color: 'from-green-500 to-green-600',
      link: '/leads/list?status=NEW',
    },
    {
      label: 'Contacted',
      value: leadCounts?.CONTACTED || 0,
      icon: Phone,
      color: 'from-yellow-500 to-yellow-600',
      link: '/leads/list?status=CONTACTED',
    },
    {
      label: 'Qualified',
      value: leadCounts?.QUALIFIED || 0,
      icon: CheckCircle,
      color: 'from-purple-500 to-purple-600',
      link: '/leads/list?status=QUALIFIED',
    },
  ];

  // Lead status distribution for chart - use uppercase keys from API
  const statusDistribution = [
    { status: 'New', count: leadCounts?.NEW || 0, color: 'bg-blue-400' },
    { status: 'Contacted', count: leadCounts?.CONTACTED || 0, color: 'bg-yellow-400' },
    { status: 'Qualified', count: leadCounts?.QUALIFIED || 0, color: 'bg-green-400' },
    { status: 'Unqualified', count: leadCounts?.UNQUALIFIED || 0, color: 'bg-gray-400' },
    { status: 'Nurturing', count: leadCounts?.NURTURING || 0, color: 'bg-purple-400' },
  ];

  // Call metrics using real data for call center users
  const callMetrics = isCallCenter ? [
    { label: 'Leads Created', value: myStats?.leadsCreated || 0, icon: UserPlus, color: 'text-green-600', bg: 'bg-green-100', trend: myStats?.leadsTrend },
    { label: 'Appointments Set', value: myStats?.appointmentsSet || 0, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-100', trend: myStats?.appointmentsTrend },
    { label: 'Conversion Rate', value: `${myStats?.conversionRate || 0}%`, icon: Target, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Your Rank', value: myRank > 0 ? `#${myRank}` : '-', icon: Trophy, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  ] : [
    { label: 'Calls Made Today', value: 24, icon: PhoneCall, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Callbacks Scheduled', value: 8, icon: Phone, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'No Answer', value: 12, icon: PhoneMissed, color: 'text-yellow-600', bg: 'bg-yellow-100' },
    { label: 'Voicemails Left', value: 6, icon: PhoneOff, color: 'text-gray-600', bg: 'bg-gray-100' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isCallCenter ? 'My Performance' : 'Leads Dashboard'}
          </h1>
          <p className="text-gray-500">
            {isCallCenter ? 'Track your leads and appointments' : 'Track and manage your lead pipeline'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time Period Toggle for Call Center */}
          {isCallCenter && (
            <div className="flex bg-gray-100 rounded-lg p-1">
              {[
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
              ].map((period) => (
                <button
                  key={period.id}
                  onClick={() => setTimePeriod(period.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    timePeriod === period.id
                      ? 'bg-white text-panda-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          )}
          <Link
            to="/leads/list"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View All Leads
          </Link>
          <Link
            to="/leads/new"
            className="px-4 py-2 text-sm font-medium text-white bg-panda-primary rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            + New Lead
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const StatWrapper = stat.link ? Link : 'div';
          const wrapperProps = stat.link ? { to: stat.link } : {};
          return (
            <StatWrapper
              key={stat.label}
              {...wrapperProps}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatNumber(stat.value)}{stat.suffix || ''}
                  </p>
                  {stat.trend !== undefined && stat.trend !== 0 && (
                    <p className={`text-xs mt-1 ${stat.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {stat.trend > 0 ? '↑' : '↓'} {Math.abs(stat.trend)}% vs yesterday
                    </p>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </StatWrapper>
          );
        })}
      </div>

      {/* Call Center Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isCallCenter ? 'Your Stats' : 'Call Center Metrics'}
            </h2>
            <span className="text-sm text-gray-500">
              {timePeriod === 'today' ? 'Today' : timePeriod === 'week' ? 'This Week' : 'This Month'}
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {callMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="text-center p-4 rounded-lg bg-gray-50">
                  <div className={`w-10 h-10 mx-auto rounded-full ${metric.bg} flex items-center justify-center mb-2`}>
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {typeof metric.value === 'number' ? formatNumber(metric.value) : metric.value}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
                  {metric.trend !== undefined && metric.trend !== 0 && (
                    <p className={`text-xs mt-1 ${metric.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metric.trend > 0 ? '↑' : '↓'} {Math.abs(metric.trend)}% vs yesterday
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leaderboard for Call Center Users */}
      {isCallCenter && leaderboardData?.leaderboard && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Leaderboard
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Team Total:</span>
                <span className="font-bold text-panda-primary">{teamTotals?.totalLeads || 0} leads</span>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboardData.leaderboard.slice(0, 10).map((entry, index) => {
              const isMe = entry.userId === user?.id;
              const rank = index + 1;
              return (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between p-4 ${
                    isMe ? 'bg-panda-primary/5 border-l-4 border-panda-primary' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                      rank === 2 ? 'bg-gray-200 text-gray-700' :
                      rank === 3 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {rank <= 3 ? (
                        <Medal className={`w-4 h-4 ${
                          rank === 1 ? 'text-yellow-500' :
                          rank === 2 ? 'text-gray-500' : 'text-orange-500'
                        }`} />
                      ) : rank}
                    </div>
                    <div>
                      <p className={`font-medium ${isMe ? 'text-panda-primary' : 'text-gray-900'}`}>
                        {entry.firstName} {entry.lastName}
                        {isMe && <span className="ml-2 text-xs bg-panda-primary text-white px-2 py-0.5 rounded">You</span>}
                      </p>
                      <p className="text-sm text-gray-500">{entry.title}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{entry.leadsCreated} leads</p>
                    <p className="text-sm text-gray-500">{entry.appointmentsSet} appointments</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead Status Distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Lead Status Distribution</h2>
              <Link to="/leads/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {statusDistribution.map((item) => {
                const maxCount = Math.max(...statusDistribution.map(s => s.count), 1);
                return (
                  <div key={item.status} className="flex items-center">
                    <div className="w-24 text-sm text-gray-600">{item.status}</div>
                    <div className="flex-1 mx-4">
                      <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{
                            width: `${Math.min(100, (item.count / maxCount) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right font-semibold text-gray-900">{formatNumber(item.count)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions / My Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">My Leads</h2>
              <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                {leadCounts?.mine || 0}
              </span>
            </div>
          </div>
          <div className="p-2">
            {(myLeads?.data || []).slice(0, 5).map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  lead.status === 'NEW' ? 'bg-blue-500' :
                  lead.status === 'CONTACTED' ? 'bg-yellow-500' :
                  lead.status === 'QUALIFIED' ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{lead.status}</p>
                </div>
                {lead.daysOld > 0 && (
                  <span className="text-xs text-gray-400">{lead.daysOld}d</span>
                )}
              </Link>
            ))}
            {(!myLeads?.data || myLeads.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No leads assigned to you
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/leads/list?status=my"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All My Leads
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Leads & Conversion Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leads */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Leads</h2>
              <Link to="/leads/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {(recentLeads?.data || []).map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {lead.firstName} {lead.lastName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {lead.company || lead.email || 'No details'}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  lead.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                  lead.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-700' :
                  lead.status === 'QUALIFIED' ? 'bg-green-100 text-green-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {lead.status}
                </span>
              </Link>
            ))}
            {(!recentLeads?.data || recentLeads.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No recent leads
              </div>
            )}
          </div>
        </div>

        {/* Conversion Metrics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Conversion Metrics</h2>
              <span className="text-sm text-gray-500">This Month</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Lead to Contact Rate</p>
                  <p className="text-xs text-gray-500">Leads contacted within 24hrs</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">78%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Target className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Qualification Rate</p>
                  <p className="text-xs text-gray-500">Contacted to Qualified</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">45%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Conversion Rate</p>
                  <p className="text-xs text-gray-500">Qualified to Job</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">32%</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Avg. Response Time</p>
                  <p className="text-xs text-gray-500">Time to first contact</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">2.4h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
