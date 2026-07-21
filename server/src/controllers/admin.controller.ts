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

const purgeDemoDataSchema = z.object({
  confirm: z.literal('PURGE_DEMO_DATA'),
  extraEmails: z.array(z.string().email()).max(50).optional(),
});

const enquiryIdParamSchema = z.object({
  id: z.string().uuid('Invalid enquiry id'),
});

const updateEnquirySchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'CLOSED']),
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

// DELETE /api/admin/users/:id — Hard-delete a user that never transacted
export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const result = await adminService.deleteUser(params.data.id, req.user!.userId);

    await auditFromRequest(req, {
      action: 'admin.user.delete',
      entityType: 'User',
      entityId: params.data.id,
      metadata: { email: result.email },
    });

    res.json({ message: 'User deleted', ...result });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/admin/listings/:id — Remove a listing (no transactions attached)
export async function deleteListing(req: Request, res: Response, next: NextFunction) {
  try {
    const params = userIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const result = await adminService.deleteListing(params.data.id);

    await auditFromRequest(req, {
      action: 'admin.listing.delete',
      entityType: 'Listing',
      entityId: params.data.id,
      metadata: { cropName: result.cropName },
    });

    res.json({ message: 'Listing deleted', ...result });
  } catch (error) {
    next(error);
  }
}

// POST /api/admin/purge-demo-data — One-shot wipe of demo/seeded data.
// Requires the exact confirm phrase in the body so it can never be triggered
// by a stray click or replayed request drafted for another endpoint.
export async function purgeDemoData(req: Request, res: Response, next: NextFunction) {
  try {
    const body = purgeDemoDataSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: 'Confirmation phrase missing — send { "confirm": "PURGE_DEMO_DATA" }' });
    }

    const result = await adminService.purgeDemoData(req.user!.userId, body.data.extraEmails ?? []);

    await auditFromRequest(req, {
      action: 'admin.purge_demo_data',
      entityType: 'Platform',
      entityId: 'demo-data',
      metadata: result.deleted,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/enquiries — Inbound equipment leads
export async function getEquipmentEnquiries(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, limit, offset } = req.query;
    const result = await adminService.getEquipmentEnquiries(
      status as string,
      parseInt(limit as string) || 20,
      parseInt(offset as string) || 0
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/enquiries/:id — Move a lead through the triage queue
export async function updateEnquiryStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const params = enquiryIdParamSchema.safeParse(req.params);
    if (!params.success) {
      return res.status(400).json({ message: params.error.issues[0]?.message || 'Invalid id' });
    }

    const body = updateEnquirySchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: 'Status must be NEW, CONTACTED, or CLOSED' });
    }

    const result = await adminService.updateEnquiryStatus(params.data.id, body.data.status);

    await auditFromRequest(req, {
      action: 'admin.enquiry.update_status',
      entityType: 'EquipmentEnquiry',
      entityId: params.data.id,
      metadata: { status: body.data.status },
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
}
