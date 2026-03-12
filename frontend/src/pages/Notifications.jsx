import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  SendHorizontal,
} from 'lucide-react';
import { useAuth, ROLE_TYPES } from '../context/AuthContext';
import { googleCalendarApi, notificationsApi, workOrdersApi } from '../services/api';

function formatRelativeDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getCalendarRange(currentDate, calendarView) {
  const baseDate = currentDate instanceof Date ? currentDate : new Date(currentDate);
  switch (calendarView) {
    case 'day':
      return {
        start: startOfDay(baseDate),
        end: endOfDay(baseDate),
      };
    case 'month':
      return {
        start: startOfMonth(baseDate),
        end: endOfMonth(baseDate),
      };
    case 'week':
    default:
      return {
        start: startOfWeek(baseDate, { weekStartsOn: 0 }),
        end: endOfWeek(baseDate, { weekStartsOn: 0 }),
      };
  }
}

function normalizeNotificationsPayload(payload) {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('inbox');
  const [calendarView, setCalendarView] = useState('week');
  const [calendarDate, setCalendarDate] = useState(new Date());

  const calendarRange = useMemo(
    () => getCalendarRange(calendarDate, calendarView),
    [calendarDate, calendarView]
  );

  const isGlobalView = user?.roleType === ROLE_TYPES.ADMIN || user?.roleType === ROLE_TYPES.EXECUTIVE;
  const isTeamView = user?.roleType === ROLE_TYPES.OFFICE_MANAGER || user?.roleType === ROLE_TYPES.SALES_MANAGER || user?.isManager;
  const isPersonalView = !isGlobalView && !isTeamView;

  const buildOwnerScopedParams = (additional = {}) => {
    const params = { ...additional };
    if (!isGlobalView) {
      if (isTeamView && Array.isArray(user?.teamMemberIds) && user.teamMemberIds.length > 0) {
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

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => notificationsApi.getNotifications({ userId: user.id, limit: 200 }),
  });

  const { data: outboxData, isLoading: isOutboxLoading } = useQuery({
    queryKey: ['notifications-outbox-page', user?.id],
    enabled: Boolean(user?.id) && activeTab === 'outbox',
    queryFn: () => notificationsApi.getOutbox({ userId: user.id, limit: 200 }),
  });

  const { data: googleEventsData, isLoading: isCalendarLoading } = useQuery({
    queryKey: ['notifications-calendar-google', user?.id, calendarView, calendarRange.start.toISOString(), calendarRange.end.toISOString()],
    enabled: Boolean(user?.id) && activeTab === 'calendar',
    retry: false,
    staleTime: 5 * 60 * 1000,
    queryFn: () => googleCalendarApi.getUserEvents(
      user.id,
      calendarRange.start.toISOString(),
      calendarRange.end.toISOString()
    ),
  });

  const { data: crmScheduleData, isLoading: isCrmScheduleLoading } = useQuery({
    queryKey: ['notifications-calendar-crm', user?.id, calendarView, calendarRange.start.toISOString(), calendarRange.end.toISOString()],
    enabled: Boolean(user?.id) && activeTab === 'calendar',
    staleTime: 5 * 60 * 1000,
    queryFn: () => workOrdersApi.getWorkOrders(
      buildOwnerScopedParams({
        limit: 200,
        startDateFrom: format(calendarRange.start, 'yyyy-MM-dd'),
        startDateTo: format(calendarRange.end, 'yyyy-MM-dd'),
      })
    ),
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-page', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const notifications = useMemo(() => normalizeNotificationsPayload(data), [data]);
  const inboxItems = notifications;
  const unreadCount = inboxItems.filter((item) => item.status === 'UNREAD').length;
  const outboxItems = useMemo(() => normalizeNotificationsPayload(outboxData), [outboxData]);

  const agendaItems = useMemo(() => {
    const workOrders = Array.isArray(crmScheduleData?.data)
      ? crmScheduleData.data
      : (Array.isArray(crmScheduleData?.workOrders) ? crmScheduleData.workOrders : []);
    const googleEvents = Array.isArray(googleEventsData) ? googleEventsData : [];

    const crmItems = workOrders.map((workOrder) => {
      const start = workOrder?.serviceAppointments?.[0]?.scheduledStart || workOrder?.startDate || null;
      const parsedStart = start ? new Date(start) : null;
      const title = workOrder?.subject || workOrder?.workType?.name || workOrder?.workType || 'CRM Appointment';
      const location = workOrder?.account?.name || workOrder?.address || '';
      const jobLink = workOrder?.opportunityId ? `/jobs/${workOrder.opportunityId}` : `/workorders/${workOrder.id}`;
      return {
        id: `crm-${workOrder.id}`,
        source: 'crm',
        title,
        location,
        start: parsedStart,
        allDay: !start,
        actionUrl: jobLink,
      };
    });

    const googleItems = googleEvents.map((event) => {
      const startValue = event?.start?.dateTime || event?.start?.date || null;
      return {
        id: `google-${event.id}`,
        source: 'google',
        title: event.summary || 'Google Calendar event',
        location: event.location || '',
        start: startValue ? new Date(startValue) : null,
        allDay: !event?.start?.dateTime,
        actionUrl: event.htmlLink || null,
      };
    });

    return [...crmItems, ...googleItems]
      .filter((item) => item.start instanceof Date && !Number.isNaN(item.start.getTime()))
      .sort((a, b) => a.start - b.start);
  }, [crmScheduleData, googleEventsData]);

  const agendaGroups = useMemo(() => {
    if (!agendaItems.length) return [];

    const groups = [];
    agendaItems.forEach((item) => {
      const existing = groups.find((group) => isSameDay(group.date, item.start));
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({ date: startOfDay(item.start), items: [item] });
      }
    });
    return groups;
  }, [agendaItems]);

  const stepCalendar = (direction) => {
    if (calendarView === 'day') {
      setCalendarDate((prev) => addDays(prev, direction));
      return;
    }
    if (calendarView === 'week') {
      setCalendarDate((prev) => addDays(prev, direction * 7));
      return;
    }
    setCalendarDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + direction, prev.getDate()));
  };

  const renderNotificationLink = (item) => {
    if (!item?.actionUrl) return null;
    if (/^https?:\/\//i.test(item.actionUrl)) {
      return (
        <a
          href={item.actionUrl}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </a>
      );
    }
    return (
      <Link
        to={item.actionUrl}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
      >
        <ExternalLink className="w-3 h-3" />
        Open
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">Inbox, mention activity, and your synced schedule.</p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-medium w-fit">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {[
          { id: 'inbox', label: 'Inbox', icon: Inbox },
          { id: 'outbox', label: 'Outbox', icon: SendHorizontal },
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === id ? 'bg-panda-primary text-white' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <span className="inline-flex items-center gap-2">
              <Icon className="w-4 h-4" />
              {label}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'inbox' && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-500">Loading notifications...</div>
          ) : inboxItems.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No notifications yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {inboxItems.map((item) => (
                <div key={item.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {item.status === 'UNREAD' ? (
                        <Clock className="w-4 h-4 text-blue-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      <p className="text-sm font-medium text-gray-900">{item.title || 'Notification'}</p>
                    </div>
                    <p className="text-sm text-gray-600">{item.message}</p>
                    <p className="text-xs text-gray-400">{formatRelativeDate(item.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderNotificationLink(item)}
                    {item.status === 'UNREAD' && (
                      <button
                        type="button"
                        onClick={() => markReadMutation.mutate(item.id)}
                        className="text-xs px-2 py-1 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'outbox' && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
          {isOutboxLoading ? (
            <div className="p-10 text-center text-gray-500">Loading outbox...</div>
          ) : outboxItems.length === 0 ? (
            <div className="p-10 text-center text-gray-500">
              <SendHorizontal className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No outbox activity yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {outboxItems.map((item) => (
                <div key={item.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <SendHorizontal className="w-4 h-4 text-indigo-500" />
                      <p className="text-sm font-medium text-gray-900">{item.title || 'Outbox item'}</p>
                    </div>
                    <p className="text-sm text-gray-600">{item.message}</p>
                    <p className="text-xs text-gray-400">{formatRelativeDate(item.createdAt)}</p>
                  </div>
                  {renderNotificationLink(item)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">My Calendar</h2>
                <p className="text-sm text-gray-500">CRM appointments and Google Calendar events in one agenda.</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CalendarDays className="w-4 h-4" />
                  Open Full Calendar
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                {['day', 'week', 'month'].map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setCalendarView(view)}
                    className={`px-4 py-2 rounded-md text-sm capitalize ${
                      calendarView === view ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => stepCalendar(-1)}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date())}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => stepCalendar(1)}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {calendarView === 'day' && format(calendarDate, 'EEEE, MMMM d, yyyy')}
              {calendarView === 'week' && `${format(calendarRange.start, 'MMM d')} - ${format(calendarRange.end, 'MMM d, yyyy')}`}
              {calendarView === 'month' && format(calendarDate, 'MMMM yyyy')}
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
            {(isCalendarLoading || isCrmScheduleLoading) ? (
              <div className="p-10 text-center text-gray-500">Loading calendar...</div>
            ) : agendaGroups.length === 0 ? (
              <div className="p-10 text-center text-gray-500">
                <CalendarDays className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No scheduled items in this range.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {agendaGroups.map((group) => (
                  <div key={group.date.toISOString()} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{format(group.date, 'EEEE, MMM d')}</h3>
                      <span className="text-xs text-gray-400">{group.items.length} item{group.items.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="space-y-2">
                      {group.items.map((item) => (
                        <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-gray-100 p-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                item.source === 'google'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {item.source === 'google' ? 'Google' : 'CRM'}
                              </span>
                              <p className="text-sm font-medium text-gray-900">{item.title}</p>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {item.allDay ? 'All day' : format(item.start, 'h:mm a')}
                              {item.location ? ` • ${item.location}` : ''}
                            </p>
                          </div>
                          {item.actionUrl && (
                            /^https?:\/\//i.test(item.actionUrl) ? (
                              <a
                                href={item.actionUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open
                              </a>
                            ) : (
                              <Link
                                to={item.actionUrl}
                                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open
                              </Link>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
