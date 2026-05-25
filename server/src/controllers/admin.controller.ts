// =============================================================================
// Admin Controller — HTTP Layer for Admin Operations
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as adminService from '../services/admin.service';
import { prisma } from '../lib/prisma';
import { auditFromRequest } from '../services/audit.service';

const updateUserSchema = z.object({
  trustScore: z.number().min(0).max(100).optional(),
});

const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user id'),
});

// GET /api/admin/stats — Platform-wide statistics
export async function getPlatformStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users — List users with search & filter
export async function getUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, role, limit, offset } = req.query;
    const result = await adminService.getUsers(
      search as string,
      role as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/listings — List all listings
export async function getAllListings(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const result = await adminService.getAllListings(
      status as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/transactions — List all transactions
export async function getAllTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { paymentStatus, limit, offset } = req.query;
    const result = await adminService.getAllTransactions(
      paymentStatus as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id — Update user (trust score, verification)
export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const body = updateUserSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: body.error.issues[0]?.message || 'Invalid input' });
    }

    // Capture the prior trustScore so the audit row carries a real diff.
    // Single column read, no extra round-trip cost beyond one query.
    const before = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { trustScore: true },
    });

    const user = await adminService.updateUser(params.data.id, body.data);

    await auditFromRequest(req, {
      action: 'admin.user.update',
      entityType: 'User',
      entityId: params.data.id,
      metadata: {
        before: { trustScore: before?.trustScore ?? null },
        after: { trustScore: user.trustScore },
        requested: body.data,
      },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
}
