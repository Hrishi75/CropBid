// =============================================================================
// Notification Dropdown — Bell icon with badge and dropdown list
// =============================================================================
// HOW IT WORKS:
// 1. On mount: fetches unread count from REST API (for badge number)
// 2. Socket.io listener: when server pushes 'notification:new', increment
//    badge count and prepend to the list
// 3. On click: fetches full notification list from REST API
// 4. Mark as read: PATCH to server, update local state
//
// WHY BOTH REST AND SOCKET?
// REST = reliable source of truth (initial load, mark-as-read)
// Socket = instant updates without polling (new notification arrives)
// =============================================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Package, Gavel, Truck, Bot, DollarSign } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSocket, disconnectSocket } from '../../lib/socket';
import api from '../../lib/axios';
import type { Notification } from '../../types';

const TYPE_ICONS: Record<string, typeof Bell> = {
  NEW_BID: Gavel,
  BID_ACCEPTED: Check,
  BID_REJECTED: Package,
  BID_COUNTERED: Gavel,
  NEGOTIATION_DONE: Bot,
  AUCTION_WON: Gavel,
  DELIVERY_UPDATE: Truck,
  PAYMENT_RELEASED: DollarSign,
};

export function NotificationDropdown() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount
  useEffect(() => {
    if (!user) return;

    async function fetchCount() {
      try {
        const res = await api.get('/notifications/unread-count');
        setUnreadCount(res.data.count);
      } catch {
        // Silently fail
      }
    }
    fetchCount();
  }, [user]);

  // Socket.io listener for real-time notifications
  useEffect(() => {
    if (!user) return;

    const socket = getSocket(user.name);

    socket.on('notification:new', (notification: Notification) => {
      setUnreadCount((prev) => prev + 1);
      setNotifications((prev) => [notification, ...prev]);
    });

    return () => {
      socket.off('notification:new');
    };
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fetch full list when dropdown opens
  async function handleOpen() {
    setIsOpen(!isOpen);
    if (!isOpen && notifications.length === 0) {
      setLoading(true);
      try {
        const res = await api.get('/notifications?limit=15');
        setNotifications(res.data.notifications);
        setUnreadCount(res.data.unreadCount);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleMarkAllRead() {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silently fail
    }
  }

  async function handleClickNotification(notification: Notification) {
    // Mark as read
    if (!notification.read) {
      api.patch(`/notifications/${notification.id}/read`).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    // Navigate based on notification type and data
    setIsOpen(false);
    const data = notification.data;
    if (data?.negotiationId) {
      navigate(`/negotiations/${data.negotiationId}`);
    } else if (data?.transactionId) {
      navigate(`/transactions/${data.transactionId}`);
    } else if (data?.listingId && data?.bidId) {
      navigate(`/listings/${data.listingId}`);
    } else if (data?.listingId) {
      navigate(`/listings/${data.listingId}`);
    }
  }

  function timeAgo(dateStr: string) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg hover:bg-primary-light transition-colors"
      >
        <Bell className="w-5 h-5 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-status-error text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-surface rounded-lg shadow-lg border border-border z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text-primary text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin w-6 h-6 border-3 border-primary border-t-transparent rounded-full" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-text-muted text-sm">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type] || Bell;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleClickNotification(notif)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors border-b border-border-light
                      ${!notif.read ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                        ${!notif.read ? 'bg-primary text-white' : 'bg-surface-alt text-text-muted'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.read ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                          {notif.title}
                        </p>
                        <p className="text-xs text-text-muted truncate mt-0.5">
                          {notif.message}
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                      {!notif.read && (
                        <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
