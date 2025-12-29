import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { leadsApi, opportunitiesApi, usersApi, accountsApi } from '../services/api';
import { formatDistanceToNow, format, parseISO, startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth, isToday, isTomorrow, addDays } from 'date-fns';
import { formatNumber } from '../utils/formatters';
import {
  Phone,
  UserPlus,
  Clock,
  TrendingUp,
  Award,
  Target,
  ArrowRight,
  ChevronUp,
  ChevronDown,
  Minus,
  Trophy,
  Medal,
  Star,
  Flame,
  Zap,
  Calendar,
  Users,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle,
  Crown,
  AlertCircle,
  CalendarCheck,
  CalendarX,
  MessageSquare,
  ClipboardList,
  RefreshCw,
  MapPin,
  X,
  CalendarPlus,
  Check,
  XCircle,
  Edit3,
  Wrench,
  CheckCheck,
} from 'lucide-react';

// Time period options for the leaderboard
const TIME_PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

// Dashboard view tabs
const DASHBOARD_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Target },
  { id: 'unconfirmed', label: 'Unconfirmed Leads', icon: AlertCircle },
  { id: 'unscheduled', label: 'Unscheduled Appts', icon: CalendarX },
  { id: 'serviceRequests', label: 'Service Requests', icon: Wrench },
];

// Appointment date filter options
const APPT_DATE_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'thisWeek', label: 'This Week' },
  { id: 'all', label: 'All' },
];

export default function CallCenterDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [timePeriod, setTimePeriod] = useState('today');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apptDateFilter, setApptDateFilter] = useState('today');

  // Modal states for lead confirmation and appointment booking
  const [confirmLeadModal, setConfirmLeadModal] = useState({ open: false, lead: null });
  const [bookApptModal, setBookApptModal] = useState({ open: false, opportunity: null });
  const [addNoteModal, setAddNoteModal] = useState({ open: false, record: null, type: null }); // type: 'lead' or 'opportunity'
  const [serviceRequestModal, setServiceRequestModal] = useState({ open: false, account: null }); // For creating new service requests

  // Form states for modals
  const [confirmFormData, setConfirmFormData] = useState({
    appointmentDate: '',
    appointmentTime: '',
    notes: '',
    workType: 'Inspection',
  });
  const [bookApptFormData, setBookApptFormData] = useState({
    scheduledStart: '',
    scheduledEnd: '',
    notes: '',
  });
  const [noteText, setNoteText] = useState('');
  const [serviceRequestFormData, setServiceRequestFormData] = useState({
    notes: '',
  });

  // Check if user is a call center manager
  const isManager = user?.roleType === ROLE_TYPES.CALL_CENTER_MANAGER || user?.role?.includes('manager');

  // Calculate date range based on selected period
  const getDateRange = () => {
    const now = new Date();
    switch (timePeriod) {
      case 'today':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      default:
        return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const dateRange = getDateRange();

  // Fetch call center leaderboard data
  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['callCenterLeaderboard', timePeriod],
    queryFn: () => leadsApi.getCallCenterLeaderboard({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
    refetchInterval: 60000, // Refresh every minute for live updates
  });

  // Fetch my personal stats
  const { data: myStats } = useQuery({
    queryKey: ['myCallCenterStats', timePeriod, user?.id],
    queryFn: () => leadsApi.getMyCallCenterStats({
      userId: user?.id,
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
    enabled: !!user?.id,
  });

  // Fetch my recent leads
  const { data: myRecentLeads } = useQuery({
    queryKey: ['myRecentLeads', user?.id],
    queryFn: () => leadsApi.getLeads({
      ownerId: user?.id,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    }),
    enabled: !!user?.id,
  });

  // Fetch team totals
  const { data: teamTotals } = useQuery({
    queryKey: ['callCenterTeamTotals', timePeriod],
    queryFn: () => leadsApi.getCallCenterTeamTotals({
      startDate: format(dateRange.start, 'yyyy-MM-dd'),
      endDate: format(dateRange.end, 'yyyy-MM-dd'),
    }),
  });

  // Calculate appointment date range based on filter
  const getApptDateRange = () => {
    const now = new Date();
    switch (apptDateFilter) {
      case 'today':
        return { start: format(startOfDay(now), 'yyyy-MM-dd'), end: format(endOfDay(now), 'yyyy-MM-dd') };
      case 'tomorrow':
        const tomorrow = addDays(now, 1);
        return { start: format(startOfDay(tomorrow), 'yyyy-MM-dd'), end: format(endOfDay(tomorrow), 'yyyy-MM-dd') };
      case 'thisWeek':
        return { start: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), end: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
      default:
        return { start: null, end: null };
    }
  };

  const apptDateRange = getApptDateRange();

  // Fetch unconfirmed leads (leads with tentative appointment that need confirmation)
  const { data: unconfirmedLeadsData, isLoading: unconfirmedLoading, refetch: refetchUnconfirmed } = useQuery({
    queryKey: ['unconfirmedLeads', apptDateFilter],
    queryFn: () => leadsApi.getUnconfirmedLeads({
      startDate: apptDateRange.start,
      endDate: apptDateRange.end,
      sortBy: 'tentativeAppointmentDate',
      sortOrder: 'asc',
    }),
    enabled: activeTab === 'unconfirmed',
  });

  // Fetch unscheduled appointments (opportunities that need service appointment booked)
  const { data: unscheduledData, isLoading: unscheduledLoading, refetch: refetchUnscheduled } = useQuery({
    queryKey: ['unscheduledAppointments', apptDateFilter],
    queryFn: () => opportunitiesApi.getUnscheduledAppointments({
      startDate: apptDateRange.start,
      endDate: apptDateRange.end,
      sortBy: 'tentativeAppointmentDate',
      sortOrder: 'asc',
    }),
    enabled: activeTab === 'unscheduled',
  });

  const unconfirmedLeads = unconfirmedLeadsData?.data || [];
  const unscheduledAppointments = unscheduledData?.data || unscheduledData?.opportunities || [];

  // Fetch service requests (accounts with serviceRequired=true, serviceComplete=false)
  const { data: serviceRequestsData, isLoading: serviceRequestsLoading, refetch: refetchServiceRequests } = useQuery({
    queryKey: ['serviceRequests'],
    queryFn: () => accountsApi.getServiceRequests({
      includeCompleted: false,
    }),
    enabled: activeTab === 'serviceRequests',
  });

  const serviceRequests = serviceRequestsData?.data || [];

  // Mutation: Convert lead and book appointment
  const convertLeadMutation = useMutation({
    mutationFn: async ({ leadId, data }) => {
      return leadsApi.convertLead(leadId, {
        ...data,
        createOpportunity: true,
        createServiceAppointment: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['unconfirmedLeads']);
      queryClient.invalidateQueries(['unscheduledAppointments']);
      queryClient.invalidateQueries(['callCenterLeaderboard']);
      setConfirmLeadModal({ open: false, lead: null });
      setConfirmFormData({ appointmentDate: '', appointmentTime: '', notes: '', workType: 'Inspection' });
    },
  });

  // Mutation: Book appointment for opportunity
  const bookAppointmentMutation = useMutation({
    mutationFn: async ({ opportunityId, data }) => {
      return opportunitiesApi.bookAppointment(opportunityId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['unscheduledAppointments']);
      setBookApptModal({ open: false, opportunity: null });
      setBookApptFormData({ scheduledStart: '', scheduledEnd: '', notes: '' });
    },
  });

  // Mutation: Add note to lead
  const addLeadNoteMutation = useMutation({
    mutationFn: async ({ leadId, note }) => {
      return leadsApi.addLeadNote(leadId, note);
    },
    onSuccess: () => {
      setAddNoteModal({ open: false, record: null, type: null });
      setNoteText('');
    },
  });

  // Mutation: Add job message to opportunity
  const addJobMessageMutation = useMutation({
    mutationFn: async ({ opportunityId, message }) => {
      return opportunitiesApi.addJobMessage(opportunityId, message);
    },
    onSuccess: () => {
      setAddNoteModal({ open: false, record: null, type: null });
      setNoteText('');
    },
  });

  // Mutation: Complete service request
  const completeServiceRequestMutation = useMutation({
    mutationFn: async (accountId) => {
      return accountsApi.completeServiceRequest(accountId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['serviceRequests']);
    },
  });

  // Handle confirm lead form submission
  const handleConfirmLead = (e) => {
    e.preventDefault();
    if (!confirmLeadModal.lead) return;

    const appointmentDateTime = new Date(`${confirmFormData.appointmentDate}T${confirmFormData.appointmentTime}`);

    convertLeadMutation.mutate({
      leadId: confirmLeadModal.lead.id,
      data: {
        tentativeAppointmentDate: appointmentDateTime.toISOString(),
        workType: confirmFormData.workType,
        notes: confirmFormData.notes,
      },
    });
  };

  // Handle book appointment form submission
  const handleBookAppointment = (e) => {
    e.preventDefault();
    if (!bookApptModal.opportunity) return;

    bookAppointmentMutation.mutate({
      opportunityId: bookApptModal.opportunity.id,
      data: {
        scheduledStart: bookApptFormData.scheduledStart,
        scheduledEnd: bookApptFormData.scheduledEnd,
        notes: bookApptFormData.notes,
      },
    });
  };

  // Handle add note form submission
  const handleAddNote = (e) => {
    e.preventDefault();
    if (!addNoteModal.record || !noteText.trim()) return;

    if (addNoteModal.type === 'lead') {
      addLeadNoteMutation.mutate({
        leadId: addNoteModal.record.id,
        note: noteText,
      });
    } else {
      addJobMessageMutation.mutate({
        opportunityId: addNoteModal.record.id,
        message: noteText,
      });
    }
  };

  // Open confirm modal with lead data
  const openConfirmModal = (lead) => {
    setConfirmFormData({
      appointmentDate: lead.tentativeAppointmentDate ? format(parseISO(lead.tentativeAppointmentDate), 'yyyy-MM-dd') : '',
      appointmentTime: lead.tentativeAppointmentTime || '09:00',
      notes: '',
      workType: lead.workType || 'Inspection',
    });
    setConfirmLeadModal({ open: true, lead });
  };

  // Open book appointment modal with opportunity data
  const openBookApptModal = (opportunity) => {
    const startDate = opportunity.tentativeAppointmentDate || opportunity.expectedAppointmentDate;
    const startDateTime = startDate ? format(parseISO(startDate), "yyyy-MM-dd'T'HH:mm") : '';
    const endDateTime = startDate ? format(addDays(parseISO(startDate), 0), "yyyy-MM-dd'T'" ) + '11:00' : '';

    setBookApptFormData({
      scheduledStart: startDateTime || format(new Date(), "yyyy-MM-dd'T'09:00"),
      scheduledEnd: endDateTime || format(new Date(), "yyyy-MM-dd'T'11:00"),
      notes: '',
    });
    setBookApptModal({ open: true, opportunity });
  };

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  // Find user's position in leaderboard
  const myPosition = leaderboardData?.leaderboard?.findIndex(rep => rep.userId === user?.id) ?? -1;
  const myRank = myPosition >= 0 ? myPosition + 1 : null;

  // Leaderboard with mock data fallback for now
  const leaderboard = leaderboardData?.leaderboard || [];

  // Personal stats with defaults
  const personalStats = myStats || {
    leadsCreated: 0,
    leadsConverted: 0,
    callsMade: 0,
    appointmentsSet: 0,
    conversionRate: 0,
    avgCallDuration: 0,
  };

  // Team totals with defaults
  const totals = teamTotals || {
    totalLeads: 0,
    totalConverted: 0,
    totalAppointments: 0,
    totalCalls: 0,
    teamConversionRate: 0,
  };

  // Get rank icon
  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-gray-500">#{rank}</span>;
  };

  // Get rank badge color
  const getRankBadgeColor = (rank) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white';
    if (rank === 2) return 'bg-gradient-to-r from-gray-300 to-gray-400 text-gray-700';
    if (rank === 3) return 'bg-gradient-to-r from-amber-400 to-amber-500 text-white';
    return 'bg-gray-100 text-gray-600';
  };

  // Personal performance cards
  const performanceCards = [
    {
      label: 'Leads Created',
      value: personalStats.leadsCreated,
      icon: UserPlus,
      color: 'from-green-500 to-green-600',
      trend: personalStats.leadsTrend,
    },
    {
      label: 'Appointments Set',
      value: personalStats.appointmentsSet,
      icon: Calendar,
      color: 'from-blue-500 to-blue-600',
      trend: personalStats.appointmentsTrend,
    },
    {
      label: 'Calls Made',
      value: personalStats.callsMade,
      icon: PhoneOutgoing,
      color: 'from-purple-500 to-purple-600',
      trend: personalStats.callsTrend,
    },
    {
      label: 'Conversion Rate',
      value: `${personalStats.conversionRate}%`,
      icon: TrendingUp,
      color: 'from-orange-500 to-orange-600',
      trend: personalStats.conversionTrend,
    },
  ];

  // Format appointment date/time nicely
  const formatApptDateTime = (dateStr, timeStr) => {
    if (!dateStr) return '-';
    const date = parseISO(dateStr);
    const dateLabel = isToday(date) ? 'Today' : isTomorrow(date) ? 'Tomorrow' : format(date, 'EEE, MMM d');
    return timeStr ? `${dateLabel} at ${timeStr}` : dateLabel;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            {getGreeting()}, {user?.firstName || user?.name?.split(' ')[0] || 'Champ'}!
            {isManager ? <Crown className="w-6 h-6 text-yellow-500" /> : <span>🎯</span>}
          </h1>
          <p className="text-gray-500">
            {isManager ? (
              <>Team Manager - Monitoring {leaderboard.length} team members</>
            ) : myRank ? (
              <>You're currently ranked <span className="font-bold text-panda-primary">#{myRank}</span> on the leaderboard!</>
            ) : (
              "Let's make some calls and climb that leaderboard!"
            )}
          </p>
        </div>

        {/* Time Period Toggle (only show on dashboard tab) */}
        {activeTab === 'dashboard' && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {TIME_PERIODS.map((period) => (
              <button
                key={period.id}
                onClick={() => setTimePeriod(period.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
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

        {/* Appointment Date Filter (show on unconfirmed/unscheduled tabs) */}
        {(activeTab === 'unconfirmed' || activeTab === 'unscheduled') && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            {APPT_DATE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setApptDateFilter(filter.id)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  apptDateFilter === filter.id
                    ? 'bg-white text-panda-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {DASHBOARD_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = tab.id === 'unconfirmed' ? unconfirmedLeads.length :
                         tab.id === 'unscheduled' ? unscheduledAppointments.length :
                         tab.id === 'serviceRequests' ? serviceRequests.length : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-panda-primary text-panda-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {count !== null && count > 0 && (
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id ? 'bg-panda-primary text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Dashboard Tab Content */}
      {activeTab === 'dashboard' && (
        <>
          {/* My Performance Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {performanceCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
                  </p>
                  {stat.trend !== undefined && (
                    <div className={`flex items-center text-xs mt-1 ${
                      stat.trend > 0 ? 'text-green-600' : stat.trend < 0 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {stat.trend > 0 ? <ChevronUp className="w-3 h-3" /> :
                       stat.trend < 0 ? <ChevronDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      <span>{Math.abs(stat.trend)}% vs yesterday</span>
                    </div>
                  )}
                </div>
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h2 className="text-lg font-semibold text-gray-900">
                  {timePeriod === 'today' ? "Today's" : timePeriod === 'week' ? 'This Week\'s' : 'This Month\'s'} Leaderboard
                </h2>
              </div>
              <div className="text-sm text-gray-500">
                <Flame className="w-4 h-4 inline text-orange-500 mr-1" />
                Live updates
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboardLoading ? (
              <div className="p-8 text-center text-gray-500">Loading leaderboard...</div>
            ) : leaderboard.length > 0 ? (
              leaderboard.map((rep, index) => {
                const rank = index + 1;
                const isMe = rep.userId === user?.id;
                return (
                  <div
                    key={rep.userId}
                    className={`flex items-center p-4 ${isMe ? 'bg-panda-light' : 'hover:bg-gray-50'} transition-colors`}
                  >
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getRankBadgeColor(rank)}`}>
                      {rank <= 3 ? getRankIcon(rank) : <span className="font-bold">{rank}</span>}
                    </div>

                    {/* Avatar & Name */}
                    <div className="flex items-center flex-1 ml-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                        {rep.firstName?.[0]}{rep.lastName?.[0]}
                      </div>
                      <div className="ml-3">
                        <p className={`font-medium ${isMe ? 'text-panda-primary' : 'text-gray-900'}`}>
                          {rep.firstName} {rep.lastName}
                          {isMe && <span className="ml-2 text-xs bg-panda-primary text-white px-2 py-0.5 rounded-full">You</span>}
                        </p>
                        <p className="text-xs text-gray-500">{rep.title || 'Call Center Rep'}</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{rep.leadsCreated}</p>
                        <p className="text-xs text-gray-500">Leads</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{rep.appointmentsSet}</p>
                        <p className="text-xs text-gray-500">Appts</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-blue-600">{rep.conversionRate}%</p>
                        <p className="text-xs text-gray-500">Conv.</p>
                      </div>
                    </div>

                    {/* Streak/Fire indicator */}
                    {rep.streak >= 3 && (
                      <div className="ml-4 flex items-center text-orange-500">
                        <Flame className="w-4 h-4" />
                        <span className="text-xs font-bold ml-1">{rep.streak}</span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p>No data yet for this period</p>
                <p className="text-sm">Start making calls to appear on the leaderboard!</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Team Totals */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-panda-primary" />
              Team Totals ({timePeriod === 'today' ? 'Today' : timePeriod === 'week' ? 'This Week' : 'This Month'})
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Leads</span>
                <span className="font-bold text-gray-900">{formatNumber(totals.totalLeads)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Appointments Set</span>
                <span className="font-bold text-gray-900">{formatNumber(totals.totalAppointments)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Converted</span>
                <span className="font-bold text-green-600">{formatNumber(totals.totalConverted)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Team Conversion</span>
                <span className="font-bold text-blue-600">{totals.teamConversionRate}%</span>
              </div>
              <div className="pt-3 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Calls</span>
                  <span className="font-bold text-purple-600">{formatNumber(totals.totalCalls)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* My Rank Card */}
          {myRank && (
            <div className={`rounded-xl p-5 ${
              myRank === 1 ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-white' :
              myRank <= 3 ? 'bg-gradient-to-br from-panda-primary to-panda-secondary text-white' :
              'bg-white border border-gray-100 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${myRank <= 3 ? 'text-white/80' : 'text-gray-500'}`}>Your Rank</p>
                  <p className="text-4xl font-bold mt-1">#{myRank}</p>
                </div>
                <div className="text-right">
                  {myRank === 1 ? (
                    <Trophy className="w-12 h-12 text-white" />
                  ) : myRank <= 3 ? (
                    <Medal className="w-12 h-12 text-white" />
                  ) : (
                    <Star className="w-12 h-12 text-panda-primary" />
                  )}
                </div>
              </div>
              {myRank > 1 && (
                <p className={`mt-3 text-sm ${myRank <= 3 ? 'text-white/80' : 'text-gray-500'}`}>
                  {leaderboard[myRank - 2]?.leadsCreated - personalStats.leadsCreated || 1} more lead
                  {((leaderboard[myRank - 2]?.leadsCreated - personalStats.leadsCreated) || 1) !== 1 ? 's' : ''} to move up!
                </p>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                to="/leads/new"
                className="flex items-center justify-between p-3 rounded-lg bg-panda-light hover:bg-panda-primary hover:text-white transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-panda-primary group-hover:text-white" />
                  <span className="font-medium text-panda-primary group-hover:text-white">Create New Lead</span>
                </div>
                <ArrowRight className="w-4 h-4 text-panda-primary group-hover:text-white" />
              </Link>
              <Link
                to="/leads"
                className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-700">View My Leads</span>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* My Recent Leads */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">My Recent Leads</h2>
            <Link to="/leads?owner=mine" className="text-panda-primary text-sm hover:underline flex items-center">
              View All <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {(myRecentLeads?.data || []).slice(0, 5).map((lead) => (
            <Link
              key={lead.id}
              to={`/leads/${lead.id}`}
              className="flex items-center p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {lead.firstName} {lead.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  {lead.company || lead.city || 'No company'}
                  {lead.phone && ` • ${lead.phone}`}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  lead.status === 'NEW' ? 'bg-green-100 text-green-700' :
                  lead.status === 'CONTACTED' ? 'bg-blue-100 text-blue-700' :
                  lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-700' :
                  lead.status === 'CONVERTED' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {lead.status}
                </span>
                <p className="text-xs text-gray-400 mt-1">
                  {lead.createdAt && formatDistanceToNow(parseISO(lead.createdAt), { addSuffix: true })}
                </p>
              </div>
            </Link>
          ))}
          {(!myRecentLeads?.data || myRecentLeads.data.length === 0) && (
            <div className="p-8 text-center text-gray-500">
              <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No leads yet</p>
              <Link to="/leads/new" className="text-panda-primary hover:underline text-sm">
                Create your first lead →
              </Link>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Unconfirmed Leads Tab Content */}
      {activeTab === 'unconfirmed' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  Unconfirmed Leads
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Leads with tentative appointment dates that need confirmation calls
                </p>
              </div>
              <button
                onClick={() => refetchUnconfirmed()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {unconfirmedLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading leads...
            </div>
          ) : unconfirmedLeads.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {unconfirmedLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {lead.firstName} {lead.lastName}
                      </Link>
                      {lead.rating && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          lead.rating === 'Hot' ? 'bg-red-100 text-red-700' :
                          lead.rating === 'Warm' ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {lead.rating}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </span>
                      )}
                      {lead.city && lead.state && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {lead.city}, {lead.state}
                        </span>
                      )}
                      {lead.workType && (
                        <span>{lead.workType}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Appointment Date/Time */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatApptDateTime(lead.tentativeAppointmentDate, lead.tentativeAppointmentTime)}
                      </p>
                      <p className="text-xs text-gray-500">Tentative</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${lead.phone}`}
                        className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                        title="Call"
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => setAddNoteModal({ open: true, record: lead, type: 'lead' })}
                        className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                        title="Add Note"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openConfirmModal(lead)}
                        className="px-3 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Confirm & Convert"
                      >
                        <Check className="w-4 h-4" />
                        Confirm
                      </button>
                      <Link
                        to={`/leads/${lead.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Lead"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">All caught up!</p>
              <p className="text-sm">No unconfirmed leads for {apptDateFilter === 'all' ? 'any date' : apptDateFilter}</p>
            </div>
          )}
        </div>
      )}

      {/* Unscheduled Appointments Tab Content */}
      {activeTab === 'unscheduled' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CalendarX className="w-5 h-5 text-red-500" />
                  Unscheduled Appointments
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Converted opportunities that need their service appointment booked
                </p>
              </div>
              <button
                onClick={() => refetchUnscheduled()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {unscheduledLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading appointments...
            </div>
          ) : unscheduledAppointments.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {unscheduledAppointments.map((opp) => (
                <div
                  key={opp.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {opp.name}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        opp.stageName === 'LEAD_UNASSIGNED' ? 'bg-gray-100 text-gray-700' :
                        opp.stageName === 'LEAD_ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {opp.stageName?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {opp.account?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {opp.account.phone}
                        </span>
                      )}
                      {opp.account?.billingCity && opp.account?.billingState && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {opp.account.billingCity}, {opp.account.billingState}
                        </span>
                      )}
                      {opp.workType && (
                        <span>{opp.workType}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Earliest Start Date */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatApptDateTime(opp.tentativeAppointmentDate, opp.tentativeAppointmentTime)}
                      </p>
                      <p className="text-xs text-gray-500">Earliest Start</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {(opp.account?.phone || opp.contact?.phone) && (
                        <a
                          href={`tel:${opp.contact?.phone || opp.account?.phone}`}
                          className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                          title="Call"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => setAddNoteModal({ open: true, record: opp, type: 'opportunity' })}
                        className="p-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors"
                        title="Add Job Message"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openBookApptModal(opp)}
                        className="px-3 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors flex items-center gap-1 text-sm font-medium"
                        title="Book Appointment"
                      >
                        <CalendarPlus className="w-4 h-4" />
                        Book
                      </button>
                      <Link
                        to={`/opportunities/${opp.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Job"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CalendarCheck className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">All appointments scheduled!</p>
              <p className="text-sm">No unscheduled appointments for {apptDateFilter === 'all' ? 'any date' : apptDateFilter}</p>
            </div>
          )}
        </div>
      )}

      {/* Service Requests Tab Content */}
      {activeTab === 'serviceRequests' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-orange-500" />
                  Service Requests
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Accounts with pending service work - mark complete when resolved
                </p>
              </div>
              <button
                onClick={() => refetchServiceRequests()}
                className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {serviceRequestsLoading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-panda-primary mx-auto mb-3"></div>
              Loading service requests...
            </div>
          ) : serviceRequests.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {serviceRequests.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/accounts/${account.id}`}
                        className="font-medium text-gray-900 hover:text-panda-primary truncate"
                      >
                        {account.name}
                      </Link>
                      {account.opportunities?.[0] && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          {account.opportunities[0].stage?.replace(/_/g, ' ') || 'Active Job'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      {account.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {account.phone}
                        </span>
                      )}
                      {account.billingCity && account.billingState && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {account.billingCity}, {account.billingState}
                        </span>
                      )}
                      {account.projectManager && (
                        <span className="text-purple-600">
                          PM: {account.projectManager.firstName} {account.projectManager.lastName}
                        </span>
                      )}
                    </div>
                    {account.serviceNotes && (
                      <p className="mt-2 text-sm text-gray-600 bg-yellow-50 p-2 rounded border-l-2 border-yellow-400">
                        {account.serviceNotes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 ml-4">
                    {/* Request Date */}
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {account.serviceRequestDate
                          ? formatDistanceToNow(parseISO(account.serviceRequestDate), { addSuffix: true })
                          : '-'}
                      </p>
                      <p className="text-xs text-gray-500">Requested</p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      {account.phone && (
                        <a
                          href={`tel:${account.phone}`}
                          className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                          title="Call"
                        >
                          <Phone className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        onClick={() => completeServiceRequestMutation.mutate(account.id)}
                        disabled={completeServiceRequestMutation.isPending}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1 text-sm font-medium disabled:opacity-50"
                        title="Mark Complete"
                      >
                        <CheckCheck className="w-4 h-4" />
                        Complete
                      </button>
                      <Link
                        to={`/accounts/${account.id}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                        title="View Account"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700">No pending service requests!</p>
              <p className="text-sm">All service requests have been completed</p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================================ */}
      {/* MODALS */}
      {/* ============================================================================ */}

      {/* Confirm Lead Modal */}
      {confirmLeadModal.open && confirmLeadModal.lead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-panda-primary" />
                Confirm & Convert Lead
              </h3>
              <button
                onClick={() => setConfirmLeadModal({ open: false, lead: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleConfirmLead} className="p-5 space-y-4">
              {/* Lead Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">
                  {confirmLeadModal.lead.firstName} {confirmLeadModal.lead.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  {confirmLeadModal.lead.phone}
                  {confirmLeadModal.lead.city && ` • ${confirmLeadModal.lead.city}, ${confirmLeadModal.lead.state}`}
                </p>
              </div>

              {/* Work Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type</label>
                <select
                  value={confirmFormData.workType}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, workType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                >
                  <option value="Inspection">Inspection</option>
                  <option value="Retail Demo">Retail Demo</option>
                  <option value="Insurance">Insurance</option>
                </select>
              </div>

              {/* Appointment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Date</label>
                <input
                  type="date"
                  value={confirmFormData.appointmentDate}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, appointmentDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Appointment Time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Time</label>
                <input
                  type="time"
                  value={confirmFormData.appointmentTime}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, appointmentTime: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={confirmFormData.notes}
                  onChange={(e) => setConfirmFormData({ ...confirmFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder="Any notes about the appointment..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmLeadModal({ open: false, lead: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={convertLeadMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {convertLeadMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Converting...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm & Convert
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Book Appointment Modal */}
      {bookApptModal.open && bookApptModal.opportunity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-panda-primary" />
                Book Service Appointment
              </h3>
              <button
                onClick={() => setBookApptModal({ open: false, opportunity: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleBookAppointment} className="p-5 space-y-4">
              {/* Opportunity Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">{bookApptModal.opportunity.name}</p>
                <p className="text-sm text-gray-500">
                  {bookApptModal.opportunity.contact?.name || bookApptModal.opportunity.account?.name}
                  {bookApptModal.opportunity.account?.address && ` • ${bookApptModal.opportunity.account.address}`}
                </p>
              </div>

              {/* Scheduled Start */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date & Time</label>
                <input
                  type="datetime-local"
                  value={bookApptFormData.scheduledStart}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, scheduledStart: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Scheduled End */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date & Time</label>
                <input
                  type="datetime-local"
                  value={bookApptFormData.scheduledEnd}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, scheduledEnd: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent"
                  required
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={bookApptFormData.notes}
                  onChange={(e) => setBookApptFormData({ ...bookApptFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder="Special instructions for the inspector..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBookApptModal({ open: false, opportunity: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookAppointmentMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bookAppointmentMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Booking...
                    </>
                  ) : (
                    <>
                      <CalendarCheck className="w-4 h-4" />
                      Book Appointment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {addNoteModal.open && addNoteModal.record && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-panda-primary" />
                {addNoteModal.type === 'lead' ? 'Add Lead Note' : 'Add Job Message'}
              </h3>
              <button
                onClick={() => setAddNoteModal({ open: false, record: null, type: null })}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddNote} className="p-5 space-y-4">
              {/* Record Info */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-medium text-gray-900">
                  {addNoteModal.type === 'lead'
                    ? `${addNoteModal.record.firstName} ${addNoteModal.record.lastName}`
                    : addNoteModal.record.name}
                </p>
              </div>

              {/* Note Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {addNoteModal.type === 'lead' ? 'Note' : 'Message'}
                </label>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-panda-primary focus:border-transparent resize-none"
                  placeholder={addNoteModal.type === 'lead' ? 'Document your call notes...' : 'Add a job message...'}
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddNoteModal({ open: false, record: null, type: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLeadNoteMutation.isPending || addJobMessageMutation.isPending}
                  className="flex-1 px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-secondary transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(addLeadNoteMutation.isPending || addJobMessageMutation.isPending) ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save Note
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
