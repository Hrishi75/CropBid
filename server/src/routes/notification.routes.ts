// =============================================================================
// Notification Routes
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as notifController from '../controllers/notification.controller';

const router = Router();

router.use(authenticate);

// GET /api/notifications — List my notifications
router.get('/', notifController.getNotifications);

// GET /api/notifications/unread-count — Badge count
router.get('/unread-count', notifController.getUnreadCount);

// PATCH /api/notifications/read-all — Mark all as read
router.patch('/read-all', notifController.markAllAsRead);

// PATCH /api/notifications/:id/read — Mark single as read
router.patch('/:id/read', notifController.markAsRead);

export default router;
