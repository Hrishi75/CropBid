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
import { z } from 'zod';
import * as authService from '../services/auth.service';

// --- Zod Schemas for input validation ---
const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['FARMER', 'BUYER']),
  phone: z.string().max(20).optional(),
  country: z.string().max(60).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  language: z.enum(['EN', 'HI']).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Cookie options for the refresh token
// WHY THESE OPTIONS?
//   httpOnly: true   → JavaScript cannot access it (prevents XSS theft)
//   secure           → HTTPS only in production (required when sameSite='none')
//   sameSite         → In production the API (Render) and client (Vercel) live on
//                      different domains, so the refresh cookie is cross-site and
//                      MUST be 'none' to be sent on XHR. 'none' requires secure:true.
//                      In development both run on localhost, so 'lax' is fine.
//   maxAge: 7 days   → Matches the refresh token's JWT expiry
//   path: '/api/auth'→ Only sent to auth endpoints (not every API call)
const isProd = process.env.NODE_ENV === 'production';

// Native apps (Expo) have no cookie jar. They send `X-Client: mobile` and we
// return the refresh token in the JSON body instead; the app stores it in
// expo-secure-store and replays it on /refresh (body or X-Refresh-Token header).
// Web is unchanged — it keeps using the httpOnly cookie below.
function isMobileClient(req: Request): boolean {
  return req.headers['x-client'] === 'mobile';
}

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  path: '/api/auth',
};

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
export async function signupHandler(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const { name, email, password, role, phone, country, currency, language } = parsed.data;

  const result = await authService.signup({
    name, email, password, role, phone, country, currency, language,
  });

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  // Send access token in response body (client stores in memory)
  res.status(201).json({
    user: result.user,
    accessToken: result.accessToken,
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const { email, password } = parsed.data;

  const result = await authService.login({ email, password });

  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({
    user: result.user,
    accessToken: result.accessToken,
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
// Called automatically by the Axios interceptor when access token expires.
// Web reads the refresh token from the httpOnly cookie; mobile sends it in the
// request body or the X-Refresh-Token header (no cookie jar on native).
export async function refreshHandler(req: Request, res: Response) {
  const refreshToken =
    req.cookies?.refreshToken ||
    (req.headers['x-refresh-token'] as string | undefined) ||
    req.body?.refreshToken;

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
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
export async function logoutHandler(req: Request, res: Response) {
  // Clear the refresh token cookie — attributes must match the ones used to set
  // it (secure + sameSite) or the browser won't clear a cross-site cookie in prod.
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/auth',
  });

  // If user is authenticated, also clear from database
  try {
    if (req.user) {
      await authService.logout(req.user.userId);
    }
  } catch (err) {
    // Don't crash if token is already invalid — logout should always succeed
    console.error('Logout cleanup error (non-fatal):', err);
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
