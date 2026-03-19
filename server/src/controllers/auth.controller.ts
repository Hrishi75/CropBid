// =============================================================================
// Auth Controller — HTTP Request/Response Layer
// =============================================================================
// Controllers are the "translator" between HTTP and business logic.
// They parse request bodies, call services, set cookies, and send responses.
//
// PATTERN: Every controller function is an async Express request handler.
// Errors thrown in services bubble up to the global errorHandler middleware.
// =============================================================================

import { Request, Response } from 'express';
import * as authService from '../services/auth.service';

// Cookie options for the refresh token
// WHY THESE OPTIONS?
//   httpOnly: true  → JavaScript cannot access it (prevents XSS theft)
//   secure: false   → Allow HTTP in development (set true in production with HTTPS)
//   sameSite: 'lax' → Cookie sent on same-site requests + top-level navigations
//   maxAge: 7 days  → Matches the refresh token's JWT expiry
//   path: '/api/auth'→ Only sent to auth endpoints (not every API call)
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/api/auth',
};

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
export async function signupHandler(req: Request, res: Response) {
  const { name, email, password, role, phone, country, currency, language } = req.body;

  // Basic validation (we'll add Zod validation middleware later)
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: true, message: 'Name, email, password, and role are required' });
    return;
  }

  if (!['FARMER', 'BUYER'].includes(role)) {
    res.status(400).json({ error: true, message: 'Role must be FARMER or BUYER' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: true, message: 'Password must be at least 6 characters' });
    return;
  }

  const result = await authService.signup({
    name, email, password, role, phone, country, currency, language,
  });

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  // Send access token in response body (client stores in memory)
  res.status(201).json({
    user: result.user,
    accessToken: result.accessToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export async function loginHandler(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: true, message: 'Email and password are required' });
    return;
  }

  const result = await authService.login({ email, password });

  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({
    user: result.user,
    accessToken: result.accessToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
// Called automatically by the Axios interceptor when access token expires.
// Reads the refresh token from the httpOnly cookie.
export async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    res.status(401).json({ error: true, message: 'No refresh token' });
    return;
  }

  const result = await authService.refresh(refreshToken);

  // Set the NEW refresh token (token rotation)
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({
    user: result.user,
    accessToken: result.accessToken,
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
export async function logoutHandler(req: Request, res: Response) {
  // Clear the refresh token cookie
  res.clearCookie('refreshToken', { path: '/api/auth' });

  // If user is authenticated, also clear from database
  if (req.user) {
    await authService.logout(req.user.userId);
  }

  res.json({ message: 'Logged out successfully' });
}

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
// Returns the current user's profile (requires authentication)
export async function getMeHandler(req: Request, res: Response) {
  const user = await authService.getCurrentUser(req.user!.userId);
  res.json({ user });
}

// ---------------------------------------------------------------------------
// POST /api/auth/onboarding/farmer
// ---------------------------------------------------------------------------
export async function farmerOnboardingHandler(req: Request, res: Response) {
  const profile = await authService.completeFarmerOnboarding(
    req.user!.userId,
    req.body,
  );
  res.status(201).json({ profile });
}

// ---------------------------------------------------------------------------
// POST /api/auth/onboarding/buyer
// ---------------------------------------------------------------------------
export async function buyerOnboardingHandler(req: Request, res: Response) {
  const profile = await authService.completeBuyerOnboarding(
    req.user!.userId,
    req.body,
  );
  res.status(201).json({ profile });
}
