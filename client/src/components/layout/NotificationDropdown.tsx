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
import { getSocket } from '../../lib/socket';
import api from '../../lib/axios';
import { timeAgo } from '../../utils/time';
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
  REQUIREMENT_OFFER: Gavel,
  REQUIREMENT_FILLED: Check,
  REQUIREMENT_OFFER_ACCEPTED: Check,
  REQUIREMENT_OFFER_REJECTED: Package,
  REQUIREMENT_CLOSED: Package,
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
    } else if (data?.requirementId) {
      // Requirement events without a transaction (a new offer, a rejection, a
      // closure). The two sides have different homes for it: the buyer owns the
      // requirement and its offers inbox; the farmer only ever sees their own
      // offers, so send them there.
      navigate(
        user?.role === 'FARMER'
          ? '/farmer/offers'
          : `/buyer/requirements/${data.requirementId}`,
      );
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="cb-nav-iconbtn"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="cb-notif-dot" />}
      </button>

      {isOpen && (
        <div
          className="cb-card"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            width: 340, padding: 0, overflow: 'hidden', zIndex: 50,
            boxShadow: '0 16px 40px -10px rgba(20,30,15,0.18)',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderBottom: '1px solid var(--cb-line)',
              background: 'var(--cb-paper-2)',
            }}
          >
            <span className="cb-eyebrow">Notifications {unreadCount > 0 ? `· ${unreadCount}` : ''}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="cb-btn cb-btn-link"
                style={{ fontSize: 12, gap: 4 }}
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'cb-spin 0.8s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" stroke="var(--cb-ink-3)" strokeWidth="3" opacity="0.25" />
                  <path d="M4 12a8 8 0 018-8" stroke="var(--cb-forest)" strokeWidth="3" strokeLinecap="round" />
                </svg>
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: 28, textAlign: 'center' }} className="cb-tiny">
                No notifications yet
              </div>
            ) : (
              notifications.map((notif) => {
                const Icon = TYPE_ICONS[notif.type] || Bell;
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => handleClickNotification(notif)}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '12px 16px', display: 'flex', gap: 12,
                      background: !notif.read ? 'rgba(31,45,24,0.04)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--cb-line)',
                      cursor: 'pointer', font: 'inherit', color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: 999, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: !notif.read ? 'var(--cb-forest)' : 'var(--cb-paper-2)',
                        color: !notif.read ? '#f4f1ea' : 'var(--cb-ink-3)',
                      }}
                    >
                      <Icon size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: !notif.read ? 500 : 400, color: 'var(--cb-ink)' }}>
                        {notif.title}
                      </div>
                      <div className="cb-small" style={{ marginTop: 2, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {notif.message}
                      </div>
                      <div className="cb-mono cb-tiny" style={{ marginTop: 4 }}>
                        {timeAgo(notif.createdAt)}
                      </div>
                    </div>
                    {!notif.read && (
                      <span className="cb-dot cb-dot-ember" style={{ marginTop: 6, flexShrink: 0 }} />
                    )}
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
