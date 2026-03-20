// =============================================================================
// Notification Controller — HTTP Layer for Notifications
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notification.service';

// GET /api/notifications — List my notifications (paginated)
export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await notificationService.getNotifications(
      req.user!.userId,
      limit,
      offset
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/notifications/unread-count — Badge count
export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await notificationService.getUnreadCount(req.user!.userId);
    res.json({ count });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/notifications/:id/read — Mark single as read
export async function markAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const notification = await notificationService.markAsRead(
      req.params.id as string,
      req.user!.userId
    );
    res.json(notification);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/notifications/read-all — Mark all as read
export async function markAllAsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationService.markAllAsRead(req.user!.userId);
    res.json({ updated: result.count });
  } catch (error) {
    next(error);
  }
}
