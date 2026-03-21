// =============================================================================
// Admin Controller — HTTP Layer for Admin Operations
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import * as adminService from '../services/admin.service';

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
    const user = await adminService.updateUser(
      req.params.id as string,
      req.body
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
}
