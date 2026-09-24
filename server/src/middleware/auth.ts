// =============================================================================
// Authentication Middleware
// =============================================================================
// This middleware sits between the route and the controller.
// It intercepts every request to protected routes and:
//   1. Extracts the JWT from the Authorization header
//   2. Verifies the token is valid and not expired
//   3. Attaches the user info (userId, role) to the request object
//   4. Refuses the request when the account owes a password change
//   5. Passes control to the next middleware or controller
//
// If the token is missing or invalid, the request is rejected with 401.
//
// THE PASSWORD-CHANGE GATE. An admin can reset the password of somebody who
// called in locked out, and reads a temporary one back to them. That password
// is good for exactly one thing: signing in and choosing a new one. This is
// where that is true rather than in the UI, because a temporary password
// handed out over the phone must not be a working account if the caller never
// reaches the change screen, or drives the API directly.
//
// The allow-list below is what a session in that state may still do: read who
// it is, change the password, and sign out. Everything else is 403 with a code
// the clients route on.
//
// USAGE IN ROUTES:
//   router.get('/profile', authenticate, getProfile);    // Must be logged in
//   router.get('/listings', getListings);                 // Public, no auth
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';

// Extend Express Request type to include our user data
// This lets TypeScript know that req.user exists on authenticated routes
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        mustChangePassword?: boolean;
      };
    }
  }
}

// What a session holding a temporary password may still reach. Matched on the
// full path rather than the router-relative one, because this middleware is
// mounted from several routers and `req.path` is relative to whichever one.
const TEMP_PASSWORD_ALLOWS: { method: string; path: string }[] = [
  { method: 'POST', path: '/api/auth/change-password' },
  { method: 'GET', path: '/api/auth/me' },
  { method: 'POST', path: '/api/auth/logout' },
];

function mayActWithTempPassword(req: Request): boolean {
  // Query strings and trailing slashes are not part of the decision.
  const path = req.originalUrl.split('?')[0].replace(/\/+$/, '') || '/';
  return TEMP_PASSWORD_ALLOWS.some((a) => a.method === req.method && a.path === path);
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // Extract token from: "Authorization: Bearer eyJhbGciOi..."
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Access token required. Please log in.');
  }

  const token = authHeader.split(' ')[1];

  // Only the verification is guarded. The gate below throws a 403 that the
  // clients route on, and inside this catch it would have come back out as
  // "Invalid or expired access token", sending a user who owes a password
  // change to the sign-in screen to type the temporary password again.
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Invalid or expired access token');
  }

  // Attach user info to the request for use in controllers
  req.user = {
    userId: payload.userId,
    role: payload.role,
    mustChangePassword: payload.mustChangePassword === true,
  };

  if (req.user.mustChangePassword && !mayActWithTempPassword(req)) {
    throw new ApiError(403, 'Choose a new password before you carry on', 'PASSWORD_CHANGE_REQUIRED');
  }

  next();
}
