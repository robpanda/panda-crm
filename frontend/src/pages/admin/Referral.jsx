import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Gift,
  DollarSign,
  Settings,
  Search,
  Plus,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Clock,
  AlertCircle,
  CheckCircle,
  Eye,
  Edit2,
  Pause,
  Ban,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  ExternalLink,
  Copy,
  Wallet,
  TrendingUp,
  Award,
  UserPlus,
  Send,
  MoreVertical,
  Trash2,
  Link2,
} from 'lucide-react';
import { championsApi } from '../../services/api';
import AdminLayout from '../../components/AdminLayout';

// Status configurations
const CHAMPION_STATUS_CONFIG = {
  PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
  ACTIVE: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Active' },
  INACTIVE: { color: 'bg-gray-100 text-gray-600', icon: Pause, label: 'Inactive' },
  SUSPENDED: { color: 'bg-red-100 text-red-700', icon: Ban, label: 'Suspended' },
};

const REFERRAL_STATUS_CONFIG = {
  SUBMITTED: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Submitted' },
  CONTACTED: { color: 'bg-yellow-100 text-yellow-700', icon: Phone, label: 'Contacted' },
  QUALIFIED: { color: 'bg-purple-100 text-purple-700', icon: CheckCircle, label: 'Qualified' },
  APPOINTMENT_SET: { color: 'bg-indigo-100 text-indigo-700', icon: Clock, label: 'Appointment Set' },
  CLOSED_WON: { color: 'bg-green-100 text-green-700', icon: Award, label: 'Closed Won' },
  CLOSED_LOST: { color: 'bg-red-100 text-red-700', icon: X, label: 'Closed Lost' },
  INVALID: { color: 'bg-gray-100 text-gray-600', icon: Ban, label: 'Invalid' },
};

const PAYOUT_STATUS_CONFIG = {
  PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'Pending' },
  APPROVED: { color: 'bg-blue-100 text-blue-700', icon: CheckCircle, label: 'Approved' },
  PROCESSING: { color: 'bg-purple-100 text-purple-700', icon: RefreshCw, label: 'Processing' },
  COMPLETED: { color: 'bg-green-100 text-green-700', icon: DollarSign, label: 'Completed' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Failed' },
  CANCELLED: { color: 'bg-gray-100 text-gray-600', icon: Ban, label: 'Cancelled' },
};

// Tab definitions
const TABS = [
  { id: 'champions', label: 'Champions', icon: Users },
  { id: 'referrals', label: 'Referrals', icon: Gift },
  { id: 'payouts', label: 'Payouts', icon: DollarSign },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Referral() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('champions');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showChampionModal, setShowChampionModal] = useState(false);
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [showTierModal, setShowTierModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState(null);
  const limit = 20;

  // Fetch program stats
  const { data: programStats } = useQuery({
    queryKey: ['program-stats'],
    queryFn: () => championsApi.getProgramStats(),
  });

  // Fetch champions
  const { data: championsData, isLoading: championsLoading } = useQuery({
    queryKey: ['champions', page, statusFilter, searchTerm],
    queryFn: () => championsApi.getChampions({
      page,
      limit,
      status: statusFilter || undefined,
      search: searchTerm || undefined,
    }),
    enabled: activeTab === 'champions',
  });

  // Fetch referrals
  const { data: referralsData, isLoading: referralsLoading } = useQuery({
    queryKey: ['referrals', page, statusFilter, searchTerm],
    queryFn: () => championsApi.getReferrals({
      page,
      limit,
      status: statusFilter || undefined,
      search: searchTerm || undefined,
    }),
    enabled: activeTab === 'referrals',
  });

  // Fetch payouts
  const { data: payoutsData, isLoading: payoutsLoading } = useQuery({
    queryKey: ['payouts', page, statusFilter],
    queryFn: () => championsApi.getPayouts({
      page,
      limit,
      status: statusFilter || undefined,
    }),
    enabled: activeTab === 'payouts',
  });

  // Fetch pending payouts summary
  const { data: pendingPayouts } = useQuery({
    queryKey: ['pending-payouts-summary'],
    queryFn: () => championsApi.getPendingPayoutsSummary(),
    enabled: activeTab === 'payouts',
  });

  // Fetch settings
  const { data: settings } = useQuery({
    queryKey: ['referral-settings'],
    queryFn: () => championsApi.getReferralSettings(),
    enabled: activeTab === 'settings',
  });

  // Fetch payout tiers
  const { data: payoutTiers } = useQuery({
    queryKey: ['payout-tiers'],
    queryFn: () => championsApi.getPayoutTiers(),
    enabled: activeTab === 'settings',
  });

  // Mutations
  const inviteChampionMutation = useMutation({
    mutationFn: (data) => championsApi.inviteChampion(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['champions'] });
      setShowInviteModal(false);
    },
  });

  const updateChampionStatusMutation = useMutation({
    mutationFn: ({ id, status }) => championsApi.updateChampionStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['champions'] });
    },
  });

  const updateReferralStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }) => championsApi.updateReferralStatus(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });

  const bulkApprovePayoutsMutation = useMutation({
    mutationFn: ({ payoutIds, notes }) => championsApi.bulkApprovePayouts(payoutIds, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['pending-payouts-summary'] });
      setSelectedItems([]);
    },
  });

  const processPayoutsMutation = useMutation({
    mutationFn: (payoutIds) => championsApi.processPayouts(payoutIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payouts'] });
      queryClient.invalidateQueries({ queryKey: ['pending-payouts-summary'] });
      setSelectedItems([]);
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (data) => championsApi.updateReferralSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-settings'] });
    },
  });

  const createTierMutation = useMutation({
    mutationFn: (data) => championsApi.createPayoutTier(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-tiers'] });
      setShowTierModal(false);
      setSelectedTier(null);
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: ({ id, data }) => championsApi.updatePayoutTier(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-tiers'] });
      setShowTierModal(false);
      setSelectedTier(null);
    },
  });

  const deleteTierMutation = useMutation({
    mutationFn: (id) => championsApi.deletePayoutTier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-tiers'] });
    },
  });

  // Helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Render stats cards
  const renderStatsCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Champions</p>
            <p className="text-2xl font-bold text-gray-900">{programStats?.totalChampions || 0}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-panda-primary/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-panda-primary" />
          </div>
        </div>
        <p className="text-xs text-green-600 mt-2">
          +{programStats?.newChampionsThisMonth || 0} this month
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Referrals</p>
            <p className="text-2xl font-bold text-gray-900">{programStats?.totalReferrals || 0}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
            <Gift className="w-6 h-6 text-purple-600" />
          </div>
        </div>
        <p className="text-xs text-green-600 mt-2">
          {programStats?.conversionRate || 0}% conversion rate
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Paid Out</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(programStats?.totalPaidOut)}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {formatCurrency(programStats?.pendingPayouts)} pending
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Closed Deals</p>
            <p className="text-2xl font-bold text-gray-900">{programStats?.closedDeals || 0}</p>
          </div>
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
            <Award className="w-6 h-6 text-yellow-600" />
          </div>
        </div>
        <p className="text-xs text-green-600 mt-2">
          {formatCurrency(programStats?.revenueFromReferrals)} revenue
        </p>
      </div>
    </div>
  );

  // Render Champions tab
  const renderChampionsTab = () => {
    const champions = championsData?.data || [];
    const total = championsData?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return (
      <div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search champions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
          >
            <option value="">All Statuses</option>
            {Object.entries(CHAMPION_STATUS_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>

          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
          >
            <UserPlus className="w-4 h-4" />
            Invite Champion
          </button>
        </div>

        {/* Champions table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Champion</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Referral Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Referrals</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Earnings</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {championsLoading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading champions...
                    </td>
                  </tr>
                ) : champions.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      No champions found
                    </td>
                  </tr>
                ) : (
                  champions.map((champion) => {
                    const statusConfig = CHAMPION_STATUS_CONFIG[champion.status] || CHAMPION_STATUS_CONFIG.PENDING;
                    const StatusIcon = statusConfig.icon;
                    return (
                      <tr key={champion.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white font-semibold">
                              {champion.firstName?.[0]}{champion.lastName?.[0]}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {champion.firstName} {champion.lastName}
                              </p>
                              <p className="text-sm text-gray-500">{champion.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
                              {champion.referralCode}
                            </code>
                            <button
                              onClick={() => copyToClipboard(champion.referralCode)}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="Copy code"
                            >
                              <Copy className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-900 font-medium">
                          {champion.totalReferrals || 0}
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-green-600">{formatCurrency(champion.totalEarnings)}</p>
                            {champion.pendingEarnings > 0 && (
                              <p className="text-xs text-gray-500">{formatCurrency(champion.pendingEarnings)} pending</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {formatDate(champion.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedChampion(champion);
                                setShowChampionModal(true);
                              }}
                              className="p-1 hover:bg-gray-100 rounded"
                              title="View details"
                            >
                              <Eye className="w-4 h-4 text-gray-500" />
                            </button>
                            {champion.status === 'ACTIVE' && (
                              <button
                                onClick={() => updateChampionStatusMutation.mutate({ id: champion.id, status: 'INACTIVE' })}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Deactivate"
                              >
                                <Pause className="w-4 h-4 text-orange-500" />
                              </button>
                            )}
                            {champion.status === 'INACTIVE' && (
                              <button
                                onClick={() => updateChampionStatusMutation.mutate({ id: champion.id, status: 'ACTIVE' })}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Activate"
                              >
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Referrals tab
  const renderReferralsTab = () => {
    const referrals = referralsData?.data || [];
    const total = referralsData?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return (
      <div>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search referrals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
          >
            <option value="">All Statuses</option>
            {Object.entries(REFERRAL_STATUS_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['referrals'] })}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Referrals table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Referral</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Champion</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Payout</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Lead</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {referralsLoading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading referrals...
                    </td>
                  </tr>
                ) : referrals.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      No referrals found
                    </td>
                  </tr>
                ) : (
                  referrals.map((referral) => {
                    const statusConfig = REFERRAL_STATUS_CONFIG[referral.status] || REFERRAL_STATUS_CONFIG.SUBMITTED;
                    const StatusIcon = statusConfig.icon;
                    return (
                      <tr key={referral.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">
                              {referral.firstName} {referral.lastName}
                            </p>
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              {referral.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {referral.email}
                                </span>
                              )}
                              {referral.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {referral.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {referral.champion ? (
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white text-xs font-semibold">
                                {referral.champion.firstName?.[0]}{referral.champion.lastName?.[0]}
                              </div>
                              <span className="text-sm text-gray-700">
                                {referral.champion.firstName} {referral.champion.lastName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {formatDate(referral.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          {referral.payoutAmount ? (
                            <span className="font-medium text-green-600">
                              {formatCurrency(referral.payoutAmount)}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {referral.leadId ? (
                            <a
                              href={`/leads/${referral.leadId}`}
                              className="flex items-center gap-1 text-panda-primary hover:underline text-sm"
                            >
                              <ExternalLink className="w-3 h-3" />
                              View Lead
                            </a>
                          ) : (
                            <span className="text-gray-400">Not synced</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <select
                            value={referral.status}
                            onChange={(e) => updateReferralStatusMutation.mutate({
                              id: referral.id,
                              status: e.target.value,
                            })}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          >
                            {Object.entries(REFERRAL_STATUS_CONFIG).map(([value, config]) => (
                              <option key={value} value={value}>{config.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Payouts tab
  const renderPayoutsTab = () => {
    const payouts = payoutsData?.data || [];
    const total = payoutsData?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return (
      <div>
        {/* Pending payouts summary */}
        {pendingPayouts && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium text-yellow-800">
                    {pendingPayouts.count || 0} payouts pending approval
                  </p>
                  <p className="text-sm text-yellow-700">
                    Total: {formatCurrency(pendingPayouts.totalAmount)}
                  </p>
                </div>
              </div>
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => bulkApprovePayoutsMutation.mutate({ payoutIds: selectedItems })}
                    disabled={bulkApprovePayoutsMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {bulkApprovePayoutsMutation.isPending ? 'Approving...' : `Approve ${selectedItems.length} Selected`}
                  </button>
                  <button
                    onClick={() => processPayoutsMutation.mutate(selectedItems)}
                    disabled={processPayoutsMutation.isPending}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {processPayoutsMutation.isPending ? 'Processing...' : 'Process via Stripe'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
          >
            <option value="">All Statuses</option>
            {Object.entries(PAYOUT_STATUS_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>

          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['payouts'] })}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Payouts table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItems(payouts.filter(p => p.status === 'PENDING' || p.status === 'APPROVED').map(p => p.id));
                        } else {
                          setSelectedItems([]);
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Champion</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Processed</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payoutsLoading ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      Loading payouts...
                    </td>
                  </tr>
                ) : payouts.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      No payouts found
                    </td>
                  </tr>
                ) : (
                  payouts.map((payout) => {
                    const statusConfig = PAYOUT_STATUS_CONFIG[payout.status] || PAYOUT_STATUS_CONFIG.PENDING;
                    const StatusIcon = statusConfig.icon;
                    const canSelect = payout.status === 'PENDING' || payout.status === 'APPROVED';
                    return (
                      <tr key={payout.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedItems.includes(payout.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedItems([...selectedItems, payout.id]);
                              } else {
                                setSelectedItems(selectedItems.filter(id => id !== payout.id));
                              }
                            }}
                            disabled={!canSelect}
                            className="rounded border-gray-300 disabled:opacity-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {payout.champion ? (
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white text-xs font-semibold">
                                {payout.champion.firstName?.[0]}{payout.champion.lastName?.[0]}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  {payout.champion.firstName} {payout.champion.lastName}
                                </p>
                                <p className="text-xs text-gray-500">{payout.champion.email}</p>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">Unknown</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-gray-900">{formatCurrency(payout.amount)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {formatDate(payout.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-sm">
                          {payout.processedAt ? formatDate(payout.processedAt) : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {payout.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => bulkApprovePayoutsMutation.mutate({ payoutIds: [payout.id] })}
                                  className="p-1 hover:bg-green-100 rounded text-green-600"
                                  title="Approve"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => championsApi.holdPayout(payout.id, 'Manual hold')}
                                  className="p-1 hover:bg-orange-100 rounded text-orange-600"
                                  title="Hold"
                                >
                                  <Pause className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {payout.status === 'APPROVED' && (
                              <button
                                onClick={() => processPayoutsMutation.mutate([payout.id])}
                                className="p-1 hover:bg-blue-100 rounded text-blue-600"
                                title="Process"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Settings tab
  const renderSettingsTab = () => {
    const [localSettings, setLocalSettings] = useState(settings || {});
    const tiers = payoutTiers || [];

    return (
      <div className="space-y-6">
        {/* Program Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Program Settings</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Program Status</p>
                <p className="text-sm text-gray-500">Enable or disable the referral program</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.programEnabled ?? settings?.programEnabled ?? true}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, programEnabled: e.target.checked });
                    updateSettingsMutation.mutate({ programEnabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Self Registration</p>
                <p className="text-sm text-gray-500">Allow champions to register themselves</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.selfRegistrationEnabled ?? settings?.selfRegistrationEnabled ?? true}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, selfRegistrationEnabled: e.target.checked });
                    updateSettingsMutation.mutate({ selfRegistrationEnabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Auto-Approve Payouts</p>
                <p className="text-sm text-gray-500">Automatically approve payouts under a certain amount</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.autoApprovePayouts ?? settings?.autoApprovePayouts ?? false}
                  onChange={(e) => {
                    setLocalSettings({ ...localSettings, autoApprovePayouts: e.target.checked });
                    updateSettingsMutation.mutate({ autoApprovePayouts: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:ring-4 peer-focus:ring-panda-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-panda-primary"></div>
              </label>
            </div>

            <div>
              <label className="block font-medium text-gray-900 mb-1">Referral URL Base</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={localSettings.referralUrlBase ?? settings?.referralUrlBase ?? 'https://pandaexteriors.com/referral'}
                  onChange={(e) => setLocalSettings({ ...localSettings, referralUrlBase: e.target.value })}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                />
                <button
                  onClick={() => updateSettingsMutation.mutate({ referralUrlBase: localSettings.referralUrlBase })}
                  disabled={updateSettingsMutation.isPending}
                  className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Payout Tiers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Payout Tiers</h3>
            <button
              onClick={() => {
                setSelectedTier(null);
                setShowTierModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90"
            >
              <Plus className="w-4 h-4" />
              Add Tier
            </button>
          </div>

          <div className="space-y-3">
            {tiers.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No payout tiers configured</p>
            ) : (
              tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      tier.triggerEvent === 'REFERRAL_SUBMITTED' ? 'bg-blue-100' :
                      tier.triggerEvent === 'LEAD_QUALIFIED' ? 'bg-purple-100' :
                      tier.triggerEvent === 'DEAL_CLOSED' ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {tier.triggerEvent === 'REFERRAL_SUBMITTED' ? <Gift className="w-5 h-5 text-blue-600" /> :
                       tier.triggerEvent === 'LEAD_QUALIFIED' ? <CheckCircle className="w-5 h-5 text-purple-600" /> :
                       tier.triggerEvent === 'DEAL_CLOSED' ? <Award className="w-5 h-5 text-green-600" /> :
                       <DollarSign className="w-5 h-5 text-gray-600" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{tier.name}</p>
                      <p className="text-sm text-gray-500">
                        {tier.triggerEvent === 'REFERRAL_SUBMITTED' ? 'On signup' :
                         tier.triggerEvent === 'LEAD_QUALIFIED' ? 'When lead qualifies' :
                         tier.triggerEvent === 'DEAL_CLOSED' ? 'When deal closes' : tier.triggerEvent}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-green-600">{formatCurrency(tier.amount)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setSelectedTier(tier);
                          setShowTierModal(true);
                        }}
                        className="p-2 hover:bg-gray-200 rounded"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this tier?')) {
                            deleteTierMutation.mutate(tier.id);
                          }
                        }}
                        className="p-2 hover:bg-red-100 rounded"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  // Invite Modal
  const InviteModal = () => {
    const [formData, setFormData] = useState({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowInviteModal(false)} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Champion</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowInviteModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => inviteChampionMutation.mutate(formData)}
              disabled={!formData.email || !formData.firstName || !formData.lastName || inviteChampionMutation.isPending}
              className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
            >
              {inviteChampionMutation.isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Tier Modal
  const TierModal = () => {
    const [formData, setFormData] = useState(selectedTier || {
      name: '',
      triggerEvent: 'REFERRAL_SUBMITTED',
      amount: '',
      description: '',
    });

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowTierModal(false)} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {selectedTier ? 'Edit Payout Tier' : 'Add Payout Tier'}
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Signup Bonus"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Event *</label>
              <select
                value={formData.triggerEvent}
                onChange={(e) => setFormData({ ...formData, triggerEvent: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
              >
                <option value="REFERRAL_SUBMITTED">Referral Submitted (Signup)</option>
                <option value="LEAD_QUALIFIED">Lead Qualified</option>
                <option value="DEAL_CLOSED">Deal Closed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="25.00"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows="2"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => {
                setShowTierModal(false);
                setSelectedTier(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (selectedTier) {
                  updateTierMutation.mutate({ id: selectedTier.id, data: formData });
                } else {
                  createTierMutation.mutate(formData);
                }
              }}
              disabled={!formData.name || !formData.amount || createTierMutation.isPending || updateTierMutation.isPending}
              className="px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 disabled:opacity-50"
            >
              {createTierMutation.isPending || updateTierMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Referral Program</h1>
        <p className="text-gray-500">Manage your Champion referral program</p>
      </div>

      {/* Stats Cards */}
      {renderStatsCards()}

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                  setSearchTerm('');
                  setStatusFilter('');
                  setSelectedItems([]);
                }}
                className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-panda-primary border-b-2 border-panda-primary'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'champions' && renderChampionsTab()}
      {activeTab === 'referrals' && renderReferralsTab()}
      {activeTab === 'payouts' && renderPayoutsTab()}
      {activeTab === 'settings' && renderSettingsTab()}

      {/* Modals */}
      {showInviteModal && <InviteModal />}
      {showTierModal && <TierModal />}
      </div>
    </AdminLayout>
  );
}
