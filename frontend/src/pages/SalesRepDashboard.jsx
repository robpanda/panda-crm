import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { opportunitiesApi, leadsApi, commissionsApi, workOrdersApi, usersApi, googleCalendarApi } from '../services/api';
import { formatDistanceToNow, format, parseISO, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import { formatNumber, formatCurrency } from '../utils/formatters';
import {
  TrendingUp,
  DollarSign,
  Target,
  Users,
  Users2,
  Calendar,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  MapPin,
  Briefcase,
  Gift,
  Award,
  PieChart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
} from 'lucide-react';

// Donut Chart Component
const DonutChart = ({ value, total, color = 'panda-primary', size = 80 }) => {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-gray-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`text-${color} transition-all duration-500`}
          style={{ color: color.startsWith('#') ? color : undefined }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-gray-900">{value}</span>
      </div>
    </div>
  );
};

// KPI Card Component
const KPICard = ({ label, value, subValue, icon: Icon, trend, trendValue, color = 'from-panda-primary to-panda-secondary' }) => (
  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
        {trend !== undefined && (
          <div className={`flex items-center mt-2 text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
            <span>{Math.abs(trend)}% {trendValue || 'vs last month'}</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-xl bg-gradient-to-br ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

// Metric Card with Donut
const MetricDonutCard = ({ label, value, displayValue, total, color, link }) => {
  const Card = link ? Link : 'div';
  const cardProps = link ? { to: link } : {};

  // Use displayValue for text display if provided, otherwise value
  // Use numeric value for donut chart, if value is a string (currency), don't show in donut
  const isNumericValue = typeof value === 'number';
  const chartValue = isNumericValue ? value : 0;
  const textValue = displayValue || value;

  return (
    <Card
      {...cardProps}
      className={`bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center text-center ${link ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
    >
      {isNumericValue ? (
        <DonutChart value={chartValue} total={total || chartValue || 1} color={color} size={56} />
      ) : (
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${color}15`, border: `3px solid ${color}` }}
        >
          <span className="text-xs font-bold" style={{ color }}>{value.toString().slice(0, 6)}</span>
        </div>
      )}
      <div className="mt-2 w-full">
        <p className="text-sm font-semibold text-gray-900 truncate">{textValue}</p>
        <p className="text-xs text-gray-500 truncate">{label}</p>
      </div>
    </Card>
  );
};

export default function SalesRepDashboard() {
  const { user } = useAuth();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const lastMonthStart = startOfMonth(subMonths(today, 1));
  const lastMonthEnd = endOfMonth(subMonths(today, 1));

  // Check if user is a manager with direct reports
  const isManager = user?.roleType === ROLE_TYPES.SALES_MANAGER ||
                    (user?.isManager && user?.teamMembers?.length > 0);

  // View toggle state - managers can switch between team and personal views
  const [viewMode, setViewMode] = useState(isManager ? 'team' : 'personal');

  // Get team member IDs for team view queries
  const teamMemberIds = user?.teamMemberIds || [];
  const teamMembersWithSelf = [user?.id, ...teamMemberIds].filter(Boolean);

  // Determine which owner IDs to query based on view mode
  const ownerIdsForQuery = viewMode === 'team' && isManager ? teamMembersWithSelf : [user?.id];
  const ownerIdParam = viewMode === 'team' && isManager ? 'team' : user?.id;

  // Fetch user's/team's opportunities (pipeline) - limited for recent activity list
  const { data: opportunitiesData } = useQuery({
    queryKey: ['sales-opportunities', ownerIdParam, user?.id],
    queryFn: () => opportunitiesApi.getOpportunities({
      ...(viewMode === 'team' && isManager ? { ownerIds: teamMembersWithSelf.join(',') } : { ownerId: user?.id }),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  // Fetch ACCURATE opportunity stage counts from backend (not limited by pagination)
  const { data: opportunityCountsData } = useQuery({
    queryKey: ['sales-opportunity-counts', ownerIdParam, user?.id],
    queryFn: () => opportunitiesApi.getStageCounts(
      null,
      viewMode === 'team' && isManager ? teamMembersWithSelf : null,
      viewMode === 'team' && isManager ? null : user?.id
    ),
    enabled: !!user?.id,
  });

  // Fetch user's/team's leads - limited for recent activity list
  const { data: leadsData } = useQuery({
    queryKey: ['sales-leads', ownerIdParam, user?.id],
    queryFn: () => leadsApi.getLeads({
      ...(viewMode === 'team' && isManager ? { ownerIds: teamMembersWithSelf.join(',') } : { ownerId: user?.id }),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  // Fetch ACCURATE lead counts from backend (not limited by pagination)
  const { data: leadCountsData } = useQuery({
    queryKey: ['sales-lead-counts', ownerIdParam, user?.id],
    queryFn: () => leadsApi.getLeadCounts(
      viewMode === 'team' && isManager ? null : user?.id,
      viewMode === 'team' && isManager ? teamMembersWithSelf : null
    ),
    enabled: !!user?.id,
  });

  // Fetch user's/team's commissions summary
  const { data: commissionSummary } = useQuery({
    queryKey: ['sales-commission-summary', ownerIdParam, user?.id],
    queryFn: () => commissionsApi.getSummary({
      ...(viewMode === 'team' && isManager ? { userIds: teamMembersWithSelf.join(',') } : { userId: user?.id })
    }),
    enabled: !!user?.id,
  });

  // Fetch user's/team's commissions list
  const { data: commissionsData } = useQuery({
    queryKey: ['sales-commissions', ownerIdParam, user?.id],
    queryFn: () => commissionsApi.getCommissions({
      ...(viewMode === 'team' && isManager ? { ownerIds: teamMembersWithSelf.join(',') } : { ownerId: user?.id }),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  // Fetch user's work orders (always personal - manager sees their own schedule)
  const { data: workOrdersData } = useQuery({
    queryKey: ['my-workorders', user?.id],
    queryFn: () => workOrdersApi.getWorkOrders({
      ownerId: user?.id,
      scheduledDateFrom: format(today, 'yyyy-MM-dd'),
      scheduledDateTo: format(today, 'yyyy-MM-dd'),
      limit: 10,
    }),
    enabled: !!user?.id,
  });

  // Fetch user's Google Calendar events for today
  const { data: calendarEventsData } = useQuery({
    queryKey: ['my-calendar-events', user?.id, format(today, 'yyyy-MM-dd')],
    queryFn: () => googleCalendarApi.getUserEvents(
      user?.id,
      startOfDay(today).toISOString(),
      endOfDay(today).toISOString()
    ),
    enabled: !!user?.id,
    retry: false, // Don't retry if calendar not connected
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch this month's closed won deals
  const { data: monthlyClosedData } = useQuery({
    queryKey: ['sales-monthly-closed', ownerIdParam, user?.id, monthStart],
    queryFn: () => opportunitiesApi.getOpportunities({
      ...(viewMode === 'team' && isManager ? { ownerIds: teamMembersWithSelf.join(',') } : { ownerId: user?.id }),
      stage: 'CLOSED_WON',
      closeDateFrom: format(monthStart, 'yyyy-MM-dd'),
      closeDateTo: format(monthEnd, 'yyyy-MM-dd'),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  // Fetch last month's closed won deals for comparison
  const { data: lastMonthClosedData } = useQuery({
    queryKey: ['sales-last-month-closed', ownerIdParam, user?.id, lastMonthStart],
    queryFn: () => opportunitiesApi.getOpportunities({
      ...(viewMode === 'team' && isManager ? { ownerIds: teamMembersWithSelf.join(',') } : { ownerId: user?.id }),
      stage: 'CLOSED_WON',
      closeDateFrom: format(lastMonthStart, 'yyyy-MM-dd'),
      closeDateTo: format(lastMonthEnd, 'yyyy-MM-dd'),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  // Fetch team member details for team performance breakdown
  const { data: teamMembers } = useQuery({
    queryKey: ['team-members', user?.id],
    queryFn: () => usersApi.getUsers({ ids: teamMemberIds.join(',') }),
    enabled: isManager && teamMemberIds.length > 0,
  });

  // Calculate KPIs
  const opportunities = opportunitiesData?.data || [];
  const leads = leadsData?.data || [];
  const commissions = commissionsData?.data || [];
  const monthlyClosedDeals = monthlyClosedData?.data || [];
  const lastMonthClosedDeals = lastMonthClosedData?.data || [];

  // Sales metrics
  const salesCount = monthlyClosedDeals.length;
  const lastMonthSalesCount = lastMonthClosedDeals.length;
  const salesTrend = lastMonthSalesCount > 0 ? Math.round(((salesCount - lastMonthSalesCount) / lastMonthSalesCount) * 100) : 0;

  const totalVolume = monthlyClosedDeals.reduce((sum, opp) => sum + (parseFloat(opp.amount) || 0), 0);
  const lastMonthVolume = lastMonthClosedDeals.reduce((sum, opp) => sum + (parseFloat(opp.amount) || 0), 0);
  const volumeTrend = lastMonthVolume > 0 ? Math.round(((totalVolume - lastMonthVolume) / lastMonthVolume) * 100) : 0;

  const avgDealSize = salesCount > 0 ? totalVolume / salesCount : 0;
  const lastAvgDealSize = lastMonthSalesCount > 0 ? lastMonthVolume / lastMonthSalesCount : 0;
  const avgTrend = lastAvgDealSize > 0 ? Math.round(((avgDealSize - lastAvgDealSize) / lastAvgDealSize) * 100) : 0;

  // Pipeline metrics - Use backend counts for accurate numbers (not limited by pagination)
  const opportunityCounts = opportunityCountsData || {};
  const leadCounts = leadCountsData || {};

  // Helper to safely get count from stage data (backend returns {count: N, amount: M} objects)
  const getStageCount = (stage) => {
    const data = opportunityCounts[stage];
    if (typeof data === 'object' && data !== null) return data.count || 0;
    if (typeof data === 'number') return data;
    return 0;
  };
  const getStageAmount = (stage) => {
    const data = opportunityCounts[stage];
    if (typeof data === 'object' && data !== null) return data.amount || 0;
    return 0;
  };

  // Calculate counts from stage data
  const closedWonCount = getStageCount('CLOSED_WON');
  const closedLostCount = getStageCount('CLOSED_LOST');
  const totalOpportunities = opportunityCounts.total || 0;
  const openOpportunitiesCount = totalOpportunities - closedWonCount - closedLostCount;

  // Use backend counts for accurate metrics
  const newLeadsCount = leadCounts.new || leadCounts.NEW || 0;
  const scheduledProspectsCount = getStageCount('SCHEDULED');
  const unscheduledProspectsCount = getStageCount('LEAD_ASSIGNED') + getStageCount('LEAD_UNASSIGNED');

  // For stale prospects, we still need to calculate from opportunities array (requires daysInStage logic)
  // This is a fallback - ideally backend would provide this count too
  const staleProspectsCount = opportunities.filter(o => {
    const daysInStage = o.daysInStage || 0;
    return daysInStage > 7 && !['CLOSED_WON', 'CLOSED_LOST', 'IN_PRODUCTION', 'COMPLETED'].includes(o.stage);
  }).length;

  // Calculate open pipeline value from the backend aggregate or fallback to local data
  const openOpportunities = opportunities.filter(o => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage));
  // Sum amounts for open stages (all stages except CLOSED_WON and CLOSED_LOST)
  const openPipelineValue = (() => {
    const closedAmount = getStageAmount('CLOSED_WON') + getStageAmount('CLOSED_LOST');
    const totalAmount = opportunityCounts.totalAmount || 0;
    if (totalAmount > 0) return totalAmount - closedAmount;
    // Fallback to local calculation
    return openOpportunities.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
  })();

  // Commission metrics
  const unpaidCommissions = commissions.filter(c => ['NEW', 'REQUESTED', 'APPROVED'].includes(c.status));
  const paidCommissions = commissions.filter(c => c.status === 'PAID');
  const unpaidAmount = unpaidCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
  const paidAmount = paidCommissions.reduce((sum, c) => sum + (parseFloat(c.paidAmount || c.commissionAmount) || 0), 0);

  // Today's schedule - combine work orders with Google Calendar events
  const workOrderSchedule = (workOrdersData?.data || []).map(wo => {
    // Handle workType being either a string or an object {id, name}
    const workTypeName = typeof wo.workType === 'object' && wo.workType?.name
      ? wo.workType.name
      : (wo.workType || 'Service');
    // Handle address being either a string or an object
    const addressStr = typeof wo.address === 'object' && wo.address?.street
      ? `${wo.address.street || ''}, ${wo.address.city || ''}`
      : (wo.address || '');
    return {
      id: wo.id,
      time: wo.scheduledStart ? format(parseISO(wo.scheduledStart), 'h:mm a') : 'TBD',
      sortTime: wo.scheduledStart ? new Date(wo.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER,
      title: wo.subject || workTypeName || 'Appointment',
      type: workTypeName,
      address: addressStr,
      link: `/workorders/${wo.id}`,
      source: 'workorder',
    };
  });

  // Convert Google Calendar events to schedule items
  const calendarSchedule = (calendarEventsData || []).map(event => {
    // Google Calendar events have start.dateTime or start.date (for all-day events)
    const startTime = event.start?.dateTime || event.start?.date;
    const isAllDay = !event.start?.dateTime;
    return {
      id: event.id,
      time: isAllDay ? 'All Day' : (startTime ? format(parseISO(startTime), 'h:mm a') : 'TBD'),
      sortTime: startTime ? new Date(startTime).getTime() : Number.MAX_SAFE_INTEGER,
      title: event.summary || 'Calendar Event',
      type: 'Calendar',
      address: event.location || '',
      link: event.htmlLink || null,
      source: 'calendar',
    };
  });

  // Combine and sort by time
  const todaysSchedule = [...workOrderSchedule, ...calendarSchedule]
    .sort((a, b) => a.sortTime - b.sortTime);

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {user?.name?.split(' ')[0] || user?.firstName || 'Sales Rep'}!
          </h1>
          <p className="text-gray-500">
            {viewMode === 'team' && isManager
              ? `Team sales performance for ${format(today, 'MMMM yyyy')}`
              : `Your sales performance for ${format(today, 'MMMM yyyy')}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle for Managers */}
          {isManager && (
            <div className="relative">
              <button
                onClick={() => setViewMode(viewMode === 'team' ? 'personal' : 'team')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                {viewMode === 'team' ? (
                  <>
                    <Users2 className="w-4 h-4 mr-2" />
                    Team View
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    My View
                  </>
                )}
                <ChevronDown className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}
          <Link
            to="/my-commissions"
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-panda-primary to-panda-secondary text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            My Commissions
          </Link>
        </div>
      </div>

      {/* KPI Cards - Sales Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Sales This Month"
          value={salesCount}
          subValue={`${format(monthStart, 'MMM d')} - ${format(monthEnd, 'MMM d')}`}
          icon={Target}
          trend={salesTrend}
          color="from-blue-500 to-blue-600"
        />
        <KPICard
          label="Volume"
          value={formatCurrency(totalVolume)}
          subValue="Contract value"
          icon={TrendingUp}
          trend={volumeTrend}
          color="from-green-500 to-green-600"
        />
        <KPICard
          label="Avg Deal Size"
          value={formatCurrency(avgDealSize)}
          subValue="Per sale"
          icon={BarChart3}
          trend={avgTrend}
          color="from-purple-500 to-purple-600"
        />
        <KPICard
          label="Unpaid Commissions"
          value={formatCurrency(unpaidAmount)}
          subValue={`${unpaidCommissions.length} pending`}
          icon={DollarSign}
          color="from-orange-500 to-orange-600"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Metrics - Donut Cards */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {viewMode === 'team' && isManager ? 'Team Pipeline' : 'My Pipeline'}
              </h2>
              <Link to="/jobs" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <MetricDonutCard
                label="New Leads"
                value={newLeadsCount}
                total={leadCounts.total || newLeadsCount || 1}
                color="#10b981"
                link="/leads/list?status=NEW"
              />
              <MetricDonutCard
                label={viewMode === 'team' && isManager ? "Team Prospects" : "My Prospects"}
                value={openOpportunitiesCount}
                total={totalOpportunities || 1}
                color="#6366f1"
                link="/jobs/list?status=open"
              />
              <MetricDonutCard
                label="Unscheduled"
                value={unscheduledProspectsCount}
                total={openOpportunitiesCount || 1}
                color="#f59e0b"
                link="/jobs/list?stage=LEAD_ASSIGNED"
              />
              <MetricDonutCard
                label="Scheduled"
                value={scheduledProspectsCount}
                total={openOpportunitiesCount || 1}
                color="#3b82f6"
                link="/jobs/list?stage=SCHEDULED"
              />
              <MetricDonutCard
                label="Untouched 7+ Days"
                value={staleProspectsCount}
                total={openOpportunitiesCount || 1}
                color="#ef4444"
                link="/attention"
              />
              <MetricDonutCard
                label="Open Pipeline"
                value={formatCurrency(openPipelineValue)}
                total={1}
                color="#8b5cf6"
                link="/jobs/list"
              />
              <MetricDonutCard
                label="Installs Next 7 Days"
                value={0}
                total={1}
                color="#06b6d4"
                link="/schedule"
              />
              <MetricDonutCard
                label="Commissions Paid (90d)"
                value={formatCurrency(paidAmount)}
                total={1}
                color="#22c55e"
                link="/my-commissions?status=PAID"
              />
            </div>
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Today's Schedule</h2>
              <Link to="/schedule" className="text-panda-primary text-sm hover:underline">
                Calendar
              </Link>
            </div>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {todaysSchedule.length > 0 ? todaysSchedule.map((event, index) => {
              // Calendar events with external links open in new tab
              const isExternal = event.source === 'calendar' && event.link?.startsWith('http');
              const EventWrapper = event.link ? (isExternal ? 'a' : Link) : 'div';
              const wrapperProps = event.link
                ? isExternal
                  ? { href: event.link, target: '_blank', rel: 'noopener noreferrer' }
                  : { to: event.link }
                : {};

              return (
                <EventWrapper
                  key={event.id || index}
                  {...wrapperProps}
                  className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
                >
                  <div className="w-14 text-sm font-medium text-panda-primary">{event.time}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{event.title}</p>
                      {event.source === 'calendar' && (
                        <span className="px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700">Cal</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{event.type}</p>
                    {event.address && (
                      <p className="text-xs text-gray-400 flex items-center mt-1">
                        <MapPin className="w-3 h-3 mr-1" />
                        {event.address}
                      </p>
                    )}
                  </div>
                  <Clock className="w-4 h-4 text-gray-400" />
                </EventWrapper>
              );
            }) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                No appointments scheduled for today
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Commission Summary Quick View */}
      <div className="bg-gradient-to-r from-panda-primary to-panda-secondary rounded-xl p-6 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center">
              <Award className="w-5 h-5 mr-2" />
              Commission Summary
            </h3>
            <p className="text-white/80 text-sm mt-1">Your earnings overview</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{unpaidCommissions.filter(c => c.status === 'NEW').length}</p>
              <p className="text-xs text-white/70">Unrequested</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{unpaidCommissions.filter(c => c.status === 'REQUESTED').length}</p>
              <p className="text-xs text-white/70">Requested</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{unpaidCommissions.filter(c => c.status === 'APPROVED').length}</p>
              <p className="text-xs text-white/70">Approved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{formatCurrency(paidAmount)}</p>
              <p className="text-xs text-white/70">Paid (All Time)</p>
            </div>
          </div>
          <Link
            to="/my-commissions"
            className="inline-flex items-center px-4 py-2 bg-white text-panda-primary rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            View All
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>

      {/* Team Performance Breakdown - Only for Managers in Team View */}
      {isManager && viewMode === 'team' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Team Performance - {format(today, 'MMMM yyyy')}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 text-xs uppercase border-b border-gray-200">
                  <th className="pb-3 pr-4">Sales Rep</th>
                  <th className="pb-3 pr-4 text-right">Sales</th>
                  <th className="pb-3 pr-4 text-right">Volume</th>
                  <th className="pb-3 pr-4 text-right">Leads</th>
                  <th className="pb-3 pr-4 text-right">Prospects</th>
                  <th className="pb-3 text-right">Commissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Manager's own row first */}
                <tr className="hover:bg-gray-50 bg-panda-light/30">
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {user?.name || user?.firstName || 'You'} <span className="text-xs text-gray-400">(You)</span>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {monthlyClosedDeals.filter(d => d.ownerId === user?.id).length}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {formatCurrency(monthlyClosedDeals.filter(d => d.ownerId === user?.id).reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0))}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {leads.filter(l => l.ownerId === user?.id).length}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {opportunities.filter(o => o.ownerId === user?.id && !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage)).length}
                  </td>
                  <td className="py-3 text-right text-green-600">
                    {formatCurrency(commissions.filter(c => (c.ownerId === user?.id || c.userId === user?.id) && ['NEW', 'REQUESTED', 'APPROVED'].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0))}
                  </td>
                </tr>
                {/* Team members */}
                {(teamMembers?.data || user?.teamMembers || []).map((member) => {
                  const memberSales = monthlyClosedDeals.filter(d => d.ownerId === member.id).length;
                  const memberVolume = monthlyClosedDeals.filter(d => d.ownerId === member.id).reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
                  const memberLeads = leads.filter(l => l.ownerId === member.id).length;
                  const memberProspects = opportunities.filter(o => o.ownerId === member.id && !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage)).length;
                  const memberCommissions = commissions.filter(c => (c.ownerId === member.id || c.userId === member.id) && ['NEW', 'REQUESTED', 'APPROVED'].includes(c.status)).reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown'}
                      </td>
                      <td className="py-3 pr-4 text-right">{memberSales}</td>
                      <td className="py-3 pr-4 text-right">{formatCurrency(memberVolume)}</td>
                      <td className="py-3 pr-4 text-right">{memberLeads}</td>
                      <td className="py-3 pr-4 text-right">{memberProspects}</td>
                      <td className="py-3 text-right text-green-600">{formatCurrency(memberCommissions)}</td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                  <td className="py-3 pr-4 text-gray-900">Team Total</td>
                  <td className="py-3 pr-4 text-right">{salesCount}</td>
                  <td className="py-3 pr-4 text-right">{formatCurrency(totalVolume)}</td>
                  <td className="py-3 pr-4 text-right">{leads.length}</td>
                  <td className="py-3 pr-4 text-right">{openOpportunities.length}</td>
                  <td className="py-3 text-right text-green-600">{formatCurrency(unpaidAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            to="/leads/new"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Users className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">New Lead</span>
          </Link>
          <Link
            to="/jobs/new"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Briefcase className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">New Job</span>
          </Link>
          <Link
            to="/schedule"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Calendar className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">Schedule</span>
          </Link>
          <Link
            to="/my-commissions"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-green-500 hover:bg-green-50 transition-colors group"
          >
            <DollarSign className="w-6 h-6 text-gray-400 group-hover:text-green-500 mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-green-500">Commissions</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
