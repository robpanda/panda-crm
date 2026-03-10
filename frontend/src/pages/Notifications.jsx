import { useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clock, ExternalLink, Inbox, SendHorizontal } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { notificationsApi } from '../services/api';

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

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('inbox');

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

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-page', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const notifications = useMemo(() => {
    const payload = data?.data ?? data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }, [data]);

  const inboxItems = notifications;
  const unreadCount = inboxItems.filter((item) => item.status === 'UNREAD').length;
  const outboxItems = useMemo(() => {
    const payload = outboxData?.data ?? outboxData;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }, [outboxData]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">Inbox and activity notifications.</p>
        </div>
        {unreadCount > 0 && (
          <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-medium">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'inbox' ? 'bg-panda-primary text-white' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <span className="inline-flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Inbox
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('outbox')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'outbox' ? 'bg-panda-primary text-white' : 'text-gray-600 hover:text-gray-900'}`}
        >
          <span className="inline-flex items-center gap-2">
            <SendHorizontal className="w-4 h-4" />
            Outbox
          </span>
        </button>
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
                    {item.actionUrl && (
                      /^https?:\/\//i.test(item.actionUrl) ? (
                        <a
                          href={item.actionUrl}
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
                  {item.actionUrl && (
                    /^https?:\/\//i.test(item.actionUrl) ? (
                      <a
                        href={item.actionUrl}
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
          )}
        </div>
      )}
    </div>
  );
}
