// =============================================================================
// Role-Based Access Control Middleware
// =============================================================================
// After authenticate() confirms WHO the user is, roleGuard confirms
// WHETHER they're ALLOWED to access this route.
//
// HOW IT WORKS:
// This is a "middleware factory" — a function that RETURNS a middleware.
// This pattern lets you pass configuration (which roles are allowed)
// when you attach it to a route.
//
// USAGE IN ROUTES:
//   // Only farmers can create listings
//   router.post('/listings', authenticate, requireRole('FARMER'), createListing);
//
//   // Only admins can verify profiles
//   router.put('/verify/:id', authenticate, requireRole('ADMIN'), verifyUser);
//
//   // Farmers OR buyers can view their agent config
//   router.get('/agent', authenticate, requireRole('FARMER', 'BUYER'), getConfig);
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../lib/prisma';

export function requireRole(...allowedRoles: string[]) {
  // This is the actual middleware that Express will call
  return (req: Request, _res: Response, next: NextFunction): void => {
    // authenticate() must run BEFORE roleGuard — it sets req.user
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(
        403,
        `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}`
      );
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// requireApprovedPartner — the partner approval gate
// ---------------------------------------------------------------------------
// Farmers/sellers and buyers submit an application at onboarding and see no
// dashboard until an admin approves it (FarmerProfile.status /
// BuyerProfile.status = APPROVED). The client hides gated pages too, but the
// client can be bypassed with curl — this middleware is the real fence.
//
// Attach AFTER authenticate() and requireRole(): it reads req.user.role to
// know which profile table to check. Roles without an application (ADMIN,
// CONSUMER) pass through untouched, so it is safe on mixed-role routers.
//
// The error carries code PARTNER_NOT_APPROVED so the client can route the
// user to /partner/status instead of showing a bare 403.

export async function requireApprovedPartner(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw new ApiError(401, 'Authentication required');

    const { role, userId } = req.user;
    if (role !== 'FARMER' && role !== 'BUYER') return next();

    const profile = role === 'FARMER'
      ? await prisma.farmerProfile.findUnique({ where: { userId }, select: { status: true } })
      : await prisma.buyerProfile.findUnique({ where: { userId }, select: { status: true } });

    if (!profile) {
      throw new ApiError(403, 'Complete your partner application first', 'PARTNER_NOT_APPROVED');
    }
    if (profile.status !== 'APPROVED') {
      throw new ApiError(403, 'Your partner application has not been approved yet', 'PARTNER_NOT_APPROVED');
    }
    next();
  } catch (err) {
    next(err);
  }
}
