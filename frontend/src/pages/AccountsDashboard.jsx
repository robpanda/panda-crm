import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { accountsApi } from '../services/api';
import { formatNumber, formatCompact } from '../utils/formatters';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertCircle,
  MapPin,
  Phone,
  Calendar,
  Briefcase,
  Target,
  BarChart3,
} from 'lucide-react';

export default function AccountsDashboard() {
  const { user } = useAuth();

  // Fetch account statistics
  const { data: accountStats } = useQuery({
    queryKey: ['accountStats'],
    queryFn: async () => {
      // Get all accounts with status counts
      const response = await accountsApi.getAccounts({ limit: 1000 });
      const accounts = response.data || [];

      const stats = {
        total: accounts.length,
        ACTIVE: 0,
        PROSPECT: 0,
        CUSTOMER: 0,
        INACTIVE: 0,
        ONBOARDING: 0,
        IN_PRODUCTION: 0,
        mine: 0,
        totalRevenue: 0,
        avgDealSize: 0,
      };

      accounts.forEach(acc => {
        if (acc.status && stats[acc.status] !== undefined) {
          stats[acc.status]++;
        }
        if (acc.ownerId === user?.id) {
          stats.mine++;
        }
        if (acc.totalSalesVolume) {
          stats.totalRevenue += acc.totalSalesVolume;
        }
      });

      if (stats.CUSTOMER > 0) {
        stats.avgDealSize = stats.totalRevenue / stats.CUSTOMER;
      }

      return stats;
    },
  });

  // Fetch recent accounts
  const { data: recentAccounts } = useQuery({
    queryKey: ['recentAccounts'],
    queryFn: () => accountsApi.getAccounts({ limit: 5, sort: 'createdAt', order: 'desc' }),
  });

  // Fetch my accounts
  const { data: myAccounts } = useQuery({
    queryKey: ['myAccounts'],
    queryFn: () => accountsApi.getAccounts({ owner: 'me', limit: 5 }),
  });

  // Stats cards
  const stats = [
    {
      label: 'Total Accounts',
      value: accountStats?.total || 0,
      icon: Building2,
      color: 'from-blue-500 to-blue-600',
      link: '/accounts/list',
    },
    {
      label: 'Active',
      value: accountStats?.ACTIVE || 0,
      icon: CheckCircle,
      color: 'from-green-500 to-green-600',
      link: '/accounts/list?status=ACTIVE',
    },
    {
      label: 'Prospects',
      value: accountStats?.PROSPECT || 0,
      icon: Target,
      color: 'from-yellow-500 to-yellow-600',
      link: '/accounts/list?status=PROSPECT',
    },
    {
      label: 'In Production',
      value: accountStats?.IN_PRODUCTION || 0,
      icon: Briefcase,
      color: 'from-purple-500 to-purple-600',
      link: '/accounts/list?status=IN_PRODUCTION',
    },
  ];

  // Account status distribution
  const statusDistribution = [
    { status: 'Active', count: accountStats?.ACTIVE || 0, color: 'bg-green-400' },
    { status: 'Prospect', count: accountStats?.PROSPECT || 0, color: 'bg-yellow-400' },
    { status: 'Onboarding', count: accountStats?.ONBOARDING || 0, color: 'bg-blue-400' },
    { status: 'In Production', count: accountStats?.IN_PRODUCTION || 0, color: 'bg-purple-400' },
    { status: 'Customer', count: accountStats?.CUSTOMER || 0, color: 'bg-teal-400' },
    { status: 'Inactive', count: accountStats?.INACTIVE || 0, color: 'bg-gray-400' },
  ];

  // Revenue metrics
  const revenueMetrics = [
    { label: 'Total Revenue', value: formatCompact(accountStats?.totalRevenue || 0, true), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100' },
    { label: 'Avg Deal Size', value: formatCompact(accountStats?.avgDealSize || 0, true), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Active Customers', value: formatNumber(accountStats?.CUSTOMER || 0), icon: Users, color: 'text-purple-600', bg: 'bg-purple-100' },
    { label: 'Onboarding', value: formatNumber(accountStats?.ONBOARDING || 0), icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-100' },
  ];

  const getStatusColor = (status) => {
    const colors = {
      'ACTIVE': 'bg-green-100 text-green-700',
      'PROSPECT': 'bg-yellow-100 text-yellow-700',
      'CUSTOMER': 'bg-teal-100 text-teal-700',
      'ONBOARDING': 'bg-blue-100 text-blue-700',
      'IN_PRODUCTION': 'bg-purple-100 text-purple-700',
      'INACTIVE': 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts Dashboard</h1>
          <p className="text-gray-500">Overview of your customer accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/accounts/list"
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            View All Accounts
          </Link>
          <Link
            to="/accounts/new"
            className="px-4 py-2 text-sm font-medium text-white bg-panda-primary rounded-lg hover:bg-panda-primary/90 transition-colors"
          >
            + New Account
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.label}
              to={stat.link}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 card-hover"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatNumber(stat.value)}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Revenue Metrics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Revenue Metrics</h2>
            <span className="text-sm text-gray-500">All Time</span>
          </div>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {revenueMetrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="text-center p-4 rounded-lg bg-gray-50">
                  <div className={`w-10 h-10 mx-auto rounded-full ${metric.bg} flex items-center justify-center mb-2`}>
                    <Icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{metric.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Account Status Distribution */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Account Status Distribution</h2>
              <Link to="/accounts/list" className="text-panda-primary text-sm hover:underline flex items-center">
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
                    <div className="w-28 text-sm text-gray-600">{item.status}</div>
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

        {/* My Accounts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">My Accounts</h2>
              <span className="bg-blue-100 text-blue-600 text-xs font-bold px-2 py-1 rounded-full">
                {accountStats?.mine || 0}
              </span>
            </div>
          </div>
          <div className="p-2">
            {(myAccounts?.data || []).slice(0, 5).map((account) => (
              <Link
                key={account.id}
                to={`/accounts/${account.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  account.status === 'ACTIVE' ? 'bg-green-500' :
                  account.status === 'PROSPECT' ? 'bg-yellow-500' :
                  account.status === 'IN_PRODUCTION' ? 'bg-purple-500' : 'bg-gray-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {account.name}
                  </p>
                  <p className="text-xs text-gray-500">{account.status}</p>
                </div>
              </Link>
            ))}
            {(!myAccounts?.data || myAccounts.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No accounts assigned to you
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/accounts/list?owner=me"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All My Accounts
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Accounts & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Accounts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Accounts</h2>
              <Link to="/accounts/list" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {(recentAccounts?.data || []).map((account) => (
              <Link
                key={account.id}
                to={`/accounts/${account.id}`}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {account.name}
                  </p>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    {account.billingCity && (
                      <span className="flex items-center">
                        <MapPin className="w-3 h-3 mr-1" />
                        {account.billingCity}, {account.billingState}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(account.status)}`}>
                  {account.status}
                </span>
              </Link>
            ))}
            {(!recentAccounts?.data || recentAccounts.data.length === 0) && (
              <div className="p-4 text-center text-sm text-gray-500">
                No recent accounts
              </div>
            )}
          </div>
        </div>

        {/* Account Health Metrics */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Account Health</h2>
              <span className="text-sm text-gray-500">Overview</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Active Accounts</p>
                  <p className="text-xs text-gray-500">Currently active customers</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(accountStats?.ACTIVE || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Onboarding</p>
                  <p className="text-xs text-gray-500">Accounts being set up</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(accountStats?.ONBOARDING || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">In Production</p>
                  <p className="text-xs text-gray-500">Active projects</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">{formatNumber(accountStats?.IN_PRODUCTION || 0)}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Conversion Rate</p>
                  <p className="text-xs text-gray-500">Prospect to Customer</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-gray-900">
                {accountStats?.total > 0
                  ? Math.round((accountStats?.CUSTOMER / accountStats?.total) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
