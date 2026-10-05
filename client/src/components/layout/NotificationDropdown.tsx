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
import { Bell, Check, CheckCheck, Package, Gavel, Truck, Bot, DollarSign, ShoppingCart, Repeat, FileSignature, Landmark, ArrowLeftRight, Wallet, AlertTriangle } from 'lucide-react';
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
  NEW_REQUIREMENT: ShoppingCart,
  REQUIREMENT_OFFER: Gavel,
  REQUIREMENT_FILLED: Check,
  REQUIREMENT_OFFER_ACCEPTED: Check,
  REQUIREMENT_OFFER_REJECTED: Package,
  REQUIREMENT_CLOSED: Package,
  // Added with the buyer-side work (counters, repeats, contracts, credit).
  REQUIREMENT_OFFER_COUNTERED: ArrowLeftRight,
  REQUIREMENT_COUNTER_ACCEPTED: Check,
  REQUIREMENT_REPOSTED: Repeat,
  SUPPLY_CONTRACT_PROPOSED: FileSignature,
  SUPPLY_CONTRACT_ACCEPTED: FileSignature,
  SUPPLY_CONTRACT_DECLINED: FileSignature,
  SUPPLY_CONTRACT_CANCELLED: FileSignature,
  SUPPLY_CONTRACT_BATCH: Package,
  CREDIT_APPLICATION: Landmark,
  DEAL_NEEDS_TRANSPORT: Truck,
  PAYOUT_DETAILS_MISSING: Wallet,
  RETAIL_REFUND_DUE: AlertTriangle,
  RETAIL_OVERPAID: AlertTriangle,
};

// Needs the reader to act (an answer, a payment), so it is marked in ember;
// everything else is news.
const ACTION_TYPES = new Set([
  'NEW_BID', 'BID_COUNTERED', 'REQUIREMENT_OFFER', 'REQUIREMENT_OFFER_COUNTERED',
  'SUPPLY_CONTRACT_PROPOSED', 'SUPPLY_CONTRACT_BATCH', 'DEAL_NEEDS_TRANSPORT', 'PAYOUT_DETAILS_MISSING',
]);

type Filter = 'all' | 'unread';

export function NotificationDropdown() {
  const { user, switchMode } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
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
    if (notification.type === 'CREDIT_APPLICATION') {
      // Ops are told of a new application, the buyer of a decision. Credit is
      // applied for on the buying side, so a seller reading the decision while
      // selling is switched over first; /buyer/credit would bounce them.
      if (user?.role === 'ADMIN') navigate('/admin/credit');
      else {
        if (user?.role === 'FARMER' && user.buyerProfile) switchMode('BUY');
        navigate('/buyer/credit');
      }
    } else if (notification.type.startsWith('SUPPLY_CONTRACT')) {
      // A batch is a deal to pay; anything else is about the contract itself.
      navigate(data?.transactionId ? `/transactions/${data.transactionId}` : '/contracts');
    } else if (notification.type === 'DEAL_NEEDS_TRANSPORT') {
      // Ops ping, so it lands on the job rather than the record. It must also
      // come BEFORE the transactionId branch below: that one goes to
      // /transactions/:id, and getTransaction() authorises on farmerId/buyerId
      // only, so an admin following it gets a 403 on their own notification.
      navigate(`/admin/logistics/book/${data?.transactionId}`);
    } else if (data?.negotiationId) {
      navigate(`/negotiations/${data.negotiationId}`);
    } else if (data?.transactionId) {
      navigate(`/transactions/${data.transactionId}`);
    } else if (data?.listingId && data?.bidId) {
      navigate(`/listings/${data.listingId}`);
    } else if (data?.listingId) {
      navigate(`/listings/${data.listingId}`);
    } else if (notification.type === 'NEW_REQUIREMENT') {
      // Brand-new demand, so the farmer has no offer to look at yet — /offers
      // would land them on an empty page. Send them to the board, where the
      // Fill and Counter buttons are.
      navigate('/demand');
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
        {unreadCount > 0 && <span className="cb-notif-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="cb-card cb-notif-menu cb-nm">
          <div className="cb-nm-head">
            <span className="cb-nm-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="cb-nm-markall">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="cb-nm-tabs" role="tablist">
            {(['all', 'unread'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`cb-nm-tab ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : `Unread${unreadCount > 0 ? ` · ${unreadCount}` : ''}`}
              </button>
            ))}
          </div>

          <div className="cb-nm-list">
            {loading ? (
              <div className="cb-nm-empty">Loading…</div>
            ) : (() => {
              const shown = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
              if (shown.length === 0) {
                return (
                  <div className="cb-nm-empty">
                    <Bell size={22} />
                    <div>{filter === 'unread' ? "You're all caught up." : 'No notifications yet.'}</div>
                  </div>
                );
              }
              // Today first, then everything older, each under its own label.
              const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
              const groups: Array<[string, Notification[]]> = [
                ['Today', shown.filter((n) => new Date(n.createdAt) >= startOfDay)],
                ['Earlier', shown.filter((n) => new Date(n.createdAt) < startOfDay)],
              ];
              return groups.filter(([, list]) => list.length > 0).map(([label, list]) => (
                <div key={label}>
                  <div className="cb-nm-group">{label}</div>
                  {list.map((notif) => {
                    const Icon = TYPE_ICONS[notif.type] || Bell;
                    const act = ACTION_TYPES.has(notif.type);
                    return (
                      <button
                        key={notif.id}
                        type="button"
                        onClick={() => handleClickNotification(notif)}
                        className={`cb-nm-item ${notif.read ? '' : 'unread'} ${act ? 'act' : ''}`}
                      >
                        <span className="cb-nm-icon"><Icon size={15} /></span>
                        <span className="cb-nm-body">
                          <span className="cb-nm-item-title">{notif.title}</span>
                          <span className="cb-nm-msg">{notif.message}</span>
                          <span className="cb-nm-time">{timeAgo(notif.createdAt)}{act && !notif.read ? ' · needs you' : ''}</span>
                        </span>
                        {!notif.read && <span className="cb-nm-dot" aria-label="unread" />}
                      </button>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
