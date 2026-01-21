import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { opportunitiesApi, leadsApi, accountsApi, contactsApi, workOrdersApi, usersApi, attentionApi, googleCalendarApi } from '../services/api';
import { formatDistanceToNow, format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { formatNumber } from '../utils/formatters';
import {
  Target,
  UserPlus,
  Users,
  Building2,
  Calendar,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  MapPin,
  Briefcase,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import CallCenterDashboard from './CallCenterDashboard';
import SalesRepDashboard from './SalesRepDashboard';

export default function Dashboard() {
  const { user } = useAuth();

  // Route call center users (reps and managers) to specialized dashboard
  if (user?.roleType === ROLE_TYPES.CALL_CENTER || user?.roleType === ROLE_TYPES.CALL_CENTER_MANAGER || user?.department === 'Call Center') {
    return <CallCenterDashboard />;
  }

  // Route sales reps and sales managers to their personalized sales dashboard
  if (user?.roleType === ROLE_TYPES.SALES_REP || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.department === 'Sales') {
    return <SalesRepDashboard />;
  }

  // Determine user's view scope based on role
  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;
  const isPersonalView = !isGlobalView && !isTeamView;

  // Get owner filter for API calls
  const getOwnerFilter = () => {
    if (isGlobalView) return 'all';
    if (isTeamView) return 'team'; // Backend should filter by user's team
    return 'mine'; // Personal view
  };

  const ownerFilter = getOwnerFilter();

  // Build filter params for data fetching
  const buildFilterParams = (additionalParams = {}) => {
    const params = { ...additionalParams };
    if (!isGlobalView) {
      if (isTeamView && user?.teamMemberIds?.length > 0) {
        params.ownerIds = [user.id, ...user.teamMemberIds].join(',');
      } else if (isPersonalView && user?.id) {
        params.ownerId = user.id;
      }
      if (user?.officeAssignment) {
        params.office = user.officeAssignment;
      }
    }
    return params;
  };

  // Build the list of owner IDs for team view
  const teamOwnerIds = isTeamView && user?.teamMemberIds?.length > 0
    ? [user.id, ...user.teamMemberIds]
    : (isPersonalView && user?.id ? [user.id] : []);

  // Fetch pipeline stage counts with appropriate filter
  const { data: stageCounts } = useQuery({
    queryKey: ['opportunityStageCounts', ownerFilter, user?.id, teamOwnerIds],
    queryFn: () => opportunitiesApi.getStageCounts(ownerFilter, teamOwnerIds),
    enabled: !!user?.id,
  });

  // Fetch lead counts
  const { data: leadCounts } = useQuery({
    queryKey: ['leadCounts', ownerFilter, user?.id],
    queryFn: () => leadsApi.getLeadCounts(buildFilterParams()),
    enabled: !!user?.id,
  });

  // Fetch counts for stats cards with appropriate filtering
  const { data: accountsData } = useQuery({
    queryKey: ['accountsCount', ownerFilter, user?.id],
    queryFn: () => accountsApi.getAccounts(buildFilterParams({ limit: 1 })),
    enabled: !!user?.id,
  });

  const { data: contactsData } = useQuery({
    queryKey: ['contactsCount', ownerFilter, user?.id],
    queryFn: () => contactsApi.getContacts(buildFilterParams({ limit: 1 })),
    enabled: !!user?.id,
  });

  const { data: opportunitiesData } = useQuery({
    queryKey: ['opportunitiesCount', ownerFilter, user?.id],
    queryFn: () => opportunitiesApi.getOpportunities(buildFilterParams({ limit: 1 })),
    enabled: !!user?.id,
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leadsCount', ownerFilter, user?.id],
    queryFn: () => leadsApi.getLeads(buildFilterParams({ limit: 1 })),
    enabled: !!user?.id,
  });

  // Fetch recent jobs for activity feed
  const { data: recentOpportunities } = useQuery({
    queryKey: ['recentOpportunities', ownerFilter, user?.id],
    queryFn: () => opportunitiesApi.getOpportunities(buildFilterParams({
      limit: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    })),
    enabled: !!user?.id,
  });

  // Fetch work orders for today's schedule
  const { data: workOrders } = useQuery({
    queryKey: ['todaysWorkOrders', ownerFilter, user?.id],
    queryFn: () => workOrdersApi.getWorkOrders(buildFilterParams({
      limit: 10,
      startDateFrom: format(new Date(), 'yyyy-MM-dd'),
      startDateTo: format(new Date(), 'yyyy-MM-dd'),
    })),
    enabled: !!user?.id,
  });

  // Fetch real attention items from attention queue API
  const { data: attentionItemsData } = useQuery({
    queryKey: ['attentionItems', user?.id],
    queryFn: () => attentionApi.getItems({
      userId: user?.id,
      status: 'PENDING',
      limit: 5,
      sortBy: 'urgency',
      sortOrder: 'desc',
    }),
    enabled: !!user?.id,
  });

  // Fetch user's Google Calendar events for today
  const today = new Date();
  const { data: calendarEventsData, isError: calendarError } = useQuery({
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

  // Get display labels based on view scope
  const getScopeLabel = () => {
    if (isGlobalView) return 'Company';
    if (isTeamView) return user?.officeAssignment ? `${user.officeAssignment} Office` : 'Your Team';
    return 'Your';
  };

  const scopeLabel = getScopeLabel();

  // Stats cards - show different totals based on role
  const stats = [
    {
      label: `${isPersonalView ? 'Your ' : ''}Leads`,
      value: leadsData?.pagination?.total || 0,
      icon: UserPlus,
      color: 'from-green-500 to-green-600',
      link: '/leads',
    },
    {
      label: `${isPersonalView ? 'Your ' : ''}Open Jobs`,
      value: opportunitiesData?.pagination?.total || stageCounts?.total || 0,
      icon: Briefcase,
      color: 'from-blue-500 to-blue-600',
      link: '/jobs',
    },
    {
      label: `${isPersonalView ? 'Your ' : ''}Accounts`,
      value: accountsData?.pagination?.total || 0,
      icon: Building2,
      color: 'from-purple-500 to-purple-600',
      link: '/accounts',
    },
    {
      label: `${isPersonalView ? 'Your ' : ''}Contacts`,
      value: contactsData?.pagination?.total || 0,
      icon: Users,
      color: 'from-orange-500 to-orange-600',
      link: '/contacts',
    },
  ];

  // Pipeline stages
  const pipelineStages = [
    { stage: 'Lead Unassigned', count: stageCounts?.LEAD_UNASSIGNED?.count || 0, color: 'bg-gray-400' },
    { stage: 'Lead Assigned', count: stageCounts?.LEAD_ASSIGNED?.count || 0, color: 'bg-blue-400' },
    { stage: 'Scheduled', count: stageCounts?.SCHEDULED?.count || 0, color: 'bg-indigo-400' },
    { stage: 'Inspected', count: stageCounts?.INSPECTED?.count || 0, color: 'bg-purple-400' },
    { stage: 'Claim Filed', count: stageCounts?.CLAIM_FILED?.count || 0, color: 'bg-pink-400' },
    { stage: 'Adjuster Meeting', count: stageCounts?.ADJUSTER_MEETING_COMPLETE?.count || 0, color: 'bg-violet-400' },
    { stage: 'Approved', count: stageCounts?.APPROVED?.count || 0, color: 'bg-green-400' },
    { stage: 'Contract Signed', count: stageCounts?.CONTRACT_SIGNED?.count || 0, color: 'bg-emerald-400' },
    { stage: 'In Production', count: stageCounts?.IN_PRODUCTION?.count || 0, color: 'bg-yellow-400' },
  ];

  // Attention queue - use real attention items from API
  const attentionQueue = (attentionItemsData?.data || []).map(item => ({
    id: item.id,
    title: item.title || 'Action Required',
    type: item.type?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || 'Task',
    urgency: item.urgency === 'CRITICAL' || item.urgency === 'HIGH' ? 'high' :
             item.urgency === 'MEDIUM' ? 'medium' : 'low',
    link: item.actionUrl || (item.opportunityId ? `/jobs/${item.opportunityId}` : '/attention'),
    category: item.category,
  }));

  // Recent activity
  const recentActivity = (recentOpportunities?.data || []).slice(0, 5).map(opp => {
    const action = opp.stage === 'CLOSED_WON' ? 'Closed won' :
                   opp.stage === 'CLOSED_LOST' ? 'Closed lost' :
                   opp.createdAt === opp.updatedAt ? 'Created job' :
                   `Updated to ${opp.stageName || opp.stage}`;
    return {
      action,
      subject: opp.name || 'Unknown',
      time: opp.updatedAt ? formatDistanceToNow(parseISO(opp.updatedAt), { addSuffix: true }) : 'Recently',
      icon: opp.stage === 'CLOSED_WON' ? CheckCircle :
            opp.stage === 'CLOSED_LOST' ? AlertCircle : Target,
      link: `/jobs/${opp.id}`,
    };
  });

  // Today's schedule - combine work orders with Google Calendar events
  const workOrderSchedule = (workOrders?.data || []).map(wo => {
    // Get scheduled time from first service appointment or work order start date
    const appointmentTime = wo.serviceAppointments?.[0]?.scheduledStart;
    const workOrderTime = wo.startDate;
    const scheduledTime = appointmentTime || workOrderTime;

    return {
      id: wo.id,
      time: scheduledTime ? format(parseISO(scheduledTime), 'h:mm a') : 'All Day',
      sortTime: scheduledTime ? new Date(scheduledTime).getTime() : Number.MAX_SAFE_INTEGER,
      title: wo.subject || wo.workType?.name || wo.workType || 'Work Order',
      type: wo.workType?.name || wo.workType || 'Service',
      address: wo.account?.name || wo.address || '',
      link: `/workorders/${wo.id}`,
      source: 'workorder',
    };
  });

  // Convert Google Calendar events to schedule items
  const calendarSchedule = (calendarEventsData || []).map(event => {
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

  // Check if calendar is connected (no error and we got data or empty array)
  const isCalendarConnected = !calendarError;

  const attentionCount = attentionQueue.length;

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {user?.name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-gray-500">
          {isGlobalView ? (
            "Here's an overview of company-wide activity."
          ) : isTeamView ? (
            <>Here's what's happening with <span className="font-medium text-panda-primary">{scopeLabel}</span> today.</>
          ) : (
            "Here's what's happening with your sales today."
          )}
        </p>
        {!isGlobalView && user?.officeAssignment && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-panda-light text-panda-primary mt-2">
            <MapPin className="w-3 h-3 mr-1" />
            {user.officeAssignment}
          </span>
        )}
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pipeline Overview */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {isTeamView && !isGlobalView ? `${scopeLabel} Pipeline` : 'Pipeline Overview'}
              </h2>
              <Link to="/jobs" className="text-panda-primary text-sm hover:underline flex items-center">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-4">
              {pipelineStages.map((item) => {
                const maxCount = Math.max(...pipelineStages.map(s => s.count), 1);
                return (
                  <div key={item.stage} className="flex items-center">
                    <div className="w-32 text-sm text-gray-600 truncate">{item.stage}</div>
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
                    <div className="w-10 text-right font-semibold text-gray-900">{formatNumber(item.count)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Attention Queue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Attention Queue</h2>
              {attentionCount > 0 && (
                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">
                  {attentionCount} item{attentionCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="p-2">
            {attentionQueue.length > 0 ? attentionQueue.map((item, index) => (
              <Link
                key={item.id || index}
                to={item.link}
                className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer"
              >
                <div className={`w-2 h-2 mt-2 rounded-full ${
                  item.urgency === 'high' ? 'bg-red-500' :
                  item.urgency === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.type}</p>
                </div>
                <AlertCircle className={`w-4 h-4 ${
                  item.urgency === 'high' ? 'text-red-500' :
                  item.urgency === 'medium' ? 'text-yellow-500' : 'text-green-500'
                }`} />
              </Link>
            )) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                All caught up! No items need attention.
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100">
            <Link
              to="/attention"
              className="block text-center text-sm text-panda-primary hover:underline"
            >
              View All Items
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity & Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              {isTeamView && !isGlobalView ? `${scopeLabel} Activity` : 'Recent Activity'}
            </h2>
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {recentActivity.length > 0 ? recentActivity.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <Link
                  key={index}
                  to={activity.link}
                  className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.action}</span>{' '}
                      <span className="text-gray-600">{activity.subject}</span>
                    </p>
                    <p className="text-xs text-gray-500">{activity.time}</p>
                  </div>
                </Link>
              );
            }) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                No recent activity to show
              </div>
            )}
          </div>
        </div>

        {/* Today's Schedule */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {isTeamView && !isGlobalView ? `${scopeLabel} Schedule` : "Today's Schedule"}
              </h2>
              <Link to="/schedule" className="text-panda-primary text-sm hover:underline flex items-center">
                Full Calendar <ArrowRight className="w-4 h-4 ml-1" />
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
                {!isCalendarConnected ? (
                  <>
                    <p className="mb-3">Connect your Google Calendar to see your schedule</p>
                    <Link
                      to="/settings/integrations"
                      className="inline-flex items-center px-4 py-2 bg-panda-primary text-white rounded-lg hover:bg-panda-primary/90 transition-colors text-sm font-medium"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Connect Calendar
                    </Link>
                  </>
                ) : (
                  'No appointments scheduled for today'
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Link
            to="/leads/new"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <UserPlus className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">New Lead</span>
          </Link>
          <Link
            to="/accounts/new"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Building2 className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">New Account</span>
          </Link>
          <Link
            to="/jobs/new"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Briefcase className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">New Job</span>
          </Link>
          <Link
            to="/call-center?tab=serviceRequests"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-orange-500 hover:bg-orange-50 transition-colors group"
          >
            <Wrench className="w-6 h-6 text-gray-400 group-hover:text-orange-500 mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-orange-500">Service Request</span>
          </Link>
          <Link
            to="/schedule"
            className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-dashed border-gray-200 hover:border-panda-primary hover:bg-panda-light transition-colors group"
          >
            <Calendar className="w-6 h-6 text-gray-400 group-hover:text-panda-primary mb-2" />
            <span className="text-sm text-gray-600 group-hover:text-panda-primary">Schedule</span>
          </Link>
        </div>
      </div>

      {/* Team Overview - Only show for managers */}
      {isTeamView && user?.teamMembers?.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              <Users className="w-5 h-5 inline mr-2" />
              Team Members ({user.teamMembers.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {user.teamMembers.slice(0, 6).map((member) => (
              <div key={member.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-panda-primary to-panda-secondary flex items-center justify-center text-white font-medium">
                  {member.firstName?.[0]}{member.lastName?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{member.title || 'Sales Rep'}</p>
                </div>
              </div>
            ))}
          </div>
          {user.teamMembers.length > 6 && (
            <div className="mt-3 text-center">
              <Link to="/admin/users" className="text-sm text-panda-primary hover:underline">
                View all {user.teamMembers.length} team members
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
