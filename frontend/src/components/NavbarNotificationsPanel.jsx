import { Link } from 'react-router-dom';
import { AtSign, Bell, Check, ExternalLink, MessageCircle } from 'lucide-react';

export default function NavbarNotificationsPanel({
  unreadCount,
  notifications,
  notificationsLoading,
  onMarkAllAsRead,
  isMarkingAllAsRead,
  onNotificationClick,
  onClose,
}) {
  return (
    <div className="absolute right-0 mt-1 w-80 sm:w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            disabled={isMarkingAllAsRead}
            className="text-xs text-panda-primary hover:text-panda-secondary font-medium flex items-center gap-1"
          >
            <Check className="w-3 h-3" />
            Mark all read
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notificationsLoading ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            <div className="animate-spin w-5 h-5 border-2 border-panda-primary border-t-transparent rounded-full mx-auto mb-2"></div>
            Loading notifications...
          </div>
        ) : !Array.isArray(notifications) || notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No notifications yet</p>
            <p className="text-xs text-gray-400 mt-1">You'll see @mentions and updates here</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => onNotificationClick(notification)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                notification.status === 'UNREAD' ? 'bg-blue-50/50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    notification.type === 'MENTION'
                      ? 'bg-blue-100 text-blue-600'
                      : notification.type === 'MESSAGE'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {notification.type === 'MENTION' ? (
                    <AtSign className="w-4 h-4" />
                  ) : notification.type === 'MESSAGE' ? (
                    <MessageCircle className="w-4 h-4" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${notification.status === 'UNREAD' ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                    {notification.title || 'Notification'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {notification.createdAt
                      ? new Date(notification.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : ''}
                  </p>
                </div>

                {notification.status === 'UNREAD' && (
                  <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                )}

                {notification.actionUrl && <ExternalLink className="flex-shrink-0 w-3 h-3 text-gray-400 mt-1" />}
              </div>
            </button>
          ))
        )}
      </div>

      {Array.isArray(notifications) && notifications.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
          <Link to="/notifications" onClick={onClose} className="text-xs text-panda-primary hover:text-panda-secondary font-medium">
            View all notifications →
          </Link>
        </div>
      )}
    </div>
  );
}
