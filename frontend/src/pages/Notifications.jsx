import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Inbox, Send, CheckCheck, ExternalLink } from 'lucide-react';
import { notificationsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

function displayUser(user) {
  if (!user) return 'Unknown user';
  if (user.fullName) return user.fullName;
  const first = user.firstName || '';
  const last = user.lastName || '';
  const full = `${first} ${last}`.trim();
  return full || user.email || user.id || 'Unknown user';
}

function NotificationCard({ item, mode = 'inbox', onMarkRead }) {
  const recipientName = displayUser(item.user);
  const actorName = displayUser(item.actor);

  return (
    <div
      className={`rounded-lg border p-4 ${item.status === 'UNREAD' && mode === 'inbox' ? 'border-panda-primary bg-panda-light/20' : 'border-gray-200 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{item.title || item.type}</p>
          <p className="mt-1 text-sm text-gray-600 whitespace-pre-wrap">{item.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{new Date(item.createdAt).toLocaleString()}</span>
            <span>Type: {item.type}</span>
            {mode === 'outbox' && <span>To: {recipientName}</span>}
            {mode === 'inbox' && item.actorId && <span>From: {actorName}</span>}
            {mode === 'outbox' && <span>Email: {item.emailSent ? 'sent' : 'pending'}</span>}
            {mode === 'outbox' && <span>SMS: {item.smsSent ? 'sent' : 'pending'}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === 'inbox' && item.status === 'UNREAD' && (
            <button
              onClick={() => onMarkRead?.(item.id)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Mark read
            </button>
          )}
          {item.actionUrl && (
            <Link
              to={item.actionUrl}
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Open <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Notifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('inbox');

  const { data: inboxData, isLoading: loadingInbox } = useQuery({
    queryKey: ['notifications-inbox', user?.id],
    queryFn: () => notificationsApi.getNotifications({ userId: user?.id, limit: 100 }),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: outboxData, isLoading: loadingOutbox } = useQuery({
    queryKey: ['notifications-outbox', user?.id],
    queryFn: () => notificationsApi.getOutbox({ actorId: user?.id, limit: 100 }),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-inbox', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(user?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-inbox', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] });
    },
  });

  const inbox = useMemo(() => {
    const items = inboxData?.data || inboxData || [];
    return Array.isArray(items) ? items : [];
  }, [inboxData]);

  const outbox = useMemo(() => {
    const items = outboxData?.data || outboxData || [];
    return Array.isArray(items) ? items : [];
  }, [outboxData]);

  const unreadCount = inbox.filter((item) => item.status === 'UNREAD').length;
  const items = activeTab === 'inbox' ? inbox : outbox;
  const isLoading = activeTab === 'inbox' ? loadingInbox : loadingOutbox;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-1 text-sm text-gray-600">Inbox shows what you received. Outbox shows what you triggered.</p>
        </div>
        {activeTab === 'inbox' && unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-panda-primary px-3 py-2 text-sm text-white hover:bg-panda-dark disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('inbox')}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeTab === 'inbox' ? 'bg-panda-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Inbox className="h-4 w-4" />
              Inbox
              {unreadCount > 0 && <span className="rounded-full bg-white/20 px-2 text-xs">{unreadCount}</span>}
            </button>
            <button
              onClick={() => setActiveTab('outbox')}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${activeTab === 'outbox' ? 'bg-panda-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              <Send className="h-4 w-4" />
              Outbox
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading notifications...</p>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <Bell className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p className="text-sm">No {activeTab} notifications yet.</p>
            </div>
          ) : (
            items.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                mode={activeTab}
                onMarkRead={(id) => markReadMutation.mutate(id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
