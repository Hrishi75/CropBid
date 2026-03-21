// =============================================================================
// Authentication Middleware
// =============================================================================
// This middleware sits between the route and the controller.
// It intercepts every request to protected routes and:
//   1. Extracts the JWT from the Authorization header
//   2. Verifies the token is valid and not expired
//   3. Attaches the user info (userId, role) to the request object
//   4. Passes control to the next middleware or controller
//
// If the token is missing or invalid, the request is rejected with 401.
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
      };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  // Extract token from: "Authorization: Bearer eyJhbGciOi..."
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Access token required. Please log in.');
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify the token and extract the payload
    const payload = verifyAccessToken(token);

    // Attach user info to the request for use in controllers
    req.user = {
      userId: payload.userId,
      role: payload.role,
    };

    next();
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired access token');
  }
}
