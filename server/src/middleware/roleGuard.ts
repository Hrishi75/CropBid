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
