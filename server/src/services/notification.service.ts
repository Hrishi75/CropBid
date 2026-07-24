// =============================================================================
// Notification Service — Create, Read, Push Notifications
// =============================================================================
// DUAL-CHANNEL DELIVERY:
// 1. Database — All notifications are stored for history/offline access
// 2. Socket.io — If the user is connected, push it in real-time
//
// WHY BOTH?
// If the user is online, they see the notification instantly (Socket.io).
// If they're offline, the notification waits in the DB and shows up
// when they next open the app (GET /notifications).
//
// NOTIFICATION TYPES:
//   NEW_BID           — A buyer placed a bid on your listing
//   BID_ACCEPTED      — Your bid was accepted
//   BID_REJECTED      — Your bid was rejected
//   BID_COUNTERED     — Farmer countered your bid
//   NEGOTIATION_DONE  — AI negotiation completed (deal or no deal)
//   AUCTION_WON       — You won a live auction
//   DELIVERY_UPDATE   — Delivery status changed
//   PAYMENT_RELEASED  — Payment released from escrow
//   REQUIREMENT_OFFER          — A farmer offered on your buyer requirement
//   REQUIREMENT_FILLED         — A farmer filled part of it at your posted price
//   REQUIREMENT_OFFER_ACCEPTED — The buyer accepted your offer
//   REQUIREMENT_OFFER_REJECTED — The buyer rejected your offer
//   REQUIREMENT_CLOSED         — The requirement closed, expiring your offer
// =============================================================================

import { prisma } from '../lib/prisma';
import { getIO } from '../socket';

interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}

// =============================================================================
// CREATE & PUSH — Store in DB + push via Socket.io if user is online
// =============================================================================
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: input.data || null,
    },
  });

  // Try to push via Socket.io. Push is best-effort: the DB row is the
  // source of truth and the client will pick it up on next fetch.
  try {
    const io = getIO();
    if (io) {
      // Emit to the user's personal room (they join on connect)
      io.to(`user:${input.userId}`).emit('notification:new', notification);
    }
  } catch (err) {
    console.error('[notification] socket push failed', {
      notificationId: notification.id,
      userId: input.userId,
      type: input.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return notification;
}

// =============================================================================
// BATCH CREATE — Send notification to multiple users
// =============================================================================
export async function createBulkNotifications(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  data?: any
) {
  const notifications = await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type,
      title,
      message,
      data: data || null,
    })),
  });

  // Push to all online users. Best-effort like createNotification — DB has the rows.
  try {
    const io = getIO();
    if (io) {
      userIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('notification:new', {
          type,
          title,
          message,
          data,
          read: false,
          createdAt: new Date().toISOString(),
        });
      });
    }
  } catch (err) {
    console.error('[notification] bulk socket push failed', {
      userCount: userIds.length,
      type,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return notifications;
}

// =============================================================================
// GET NOTIFICATIONS — Paginated list for a user
// =============================================================================
export async function getNotifications(userId: string, limit = 20, offset = 0) {
  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return { notifications, total, unreadCount };
}

// =============================================================================
// MARK AS READ — Single or all notifications
// =============================================================================
export async function markAsRead(notificationId: string, userId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification || notification.userId !== userId) return null;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function markAllAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

// =============================================================================
// GET UNREAD COUNT — For the navbar badge
// =============================================================================
export async function getUnreadCount(userId: string) {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}
