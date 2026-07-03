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

// One password policy, shared by signup / reset / change so the rules can
// never drift apart.
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
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

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
});

// PATCH /api/auth/me — a user editing their own account + role profile.
// Every field is optional; the service writes only the keys that are present.
// The account fields are shared; the role-specific fields live in per-role
// schemas and the handler picks the right one from req.user.role.
const accountFields = {
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
};

const updateFarmerProfileSchema = z.object({
  ...accountFields,
  farmSizeAcres: z.number().positive('Farm size must be greater than zero').optional(),
  cropsGrown: z.array(z.string().min(1)).min(1, 'Pick at least one crop').optional(),
  state: z.string().min(1, 'Enter your state / region').max(60).optional(),
});

const updateBuyerProfileSchema = z.object({
  ...accountFields,
  companyName: z.string().min(2, 'Company name must be at least 2 characters').max(120).optional(),
  companyType: z.enum(['PROCESSOR', 'FMCG', 'RESTAURANT', 'EXPORTER', 'RETAILER']).optional(),
  taxId: z.string().max(40).nullable().optional(),
  annualProcurementVolume: z.string().max(60).nullable().optional(),
});

const updateAccountBasicsSchema = z.object(accountFields);

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

// Native apps (Expo) have no cookie jar. On the CREDENTIALED endpoints
// (signup/login) they send `X-Client: mobile` and we return the refresh token
// in the JSON body too; the app stores it in expo-secure-store. This header is
// safe to trust here because the caller already proved knowledge of the
// password — an XSS payload can't forge a login. The /refresh endpoint does NOT
// trust this header (it rides an existing session); see refreshHandler.
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
  const cookieToken = req.cookies?.refreshToken;
  const explicitToken =
    (req.headers['x-refresh-token'] as string | undefined) || req.body?.refreshToken;

  // Prefer the cookie when present. A token supplied EXPLICITLY (header/body)
  // with no cookie marks a native client that has no cookie jar — only then do
  // we echo the rotated token back in the body. We must NOT key this off the
  // client-controlled `X-Client` header: a web XSS payload could spoof it on a
  // cookie-bearing /refresh and exfiltrate the rotated token, defeating the
  // whole point of the httpOnly cookie.
  const refreshToken = cookieToken || explicitToken;
  const isNativeRefresh = !cookieToken && !!explicitToken;

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
    ...(isNativeRefresh ? { refreshToken: result.refreshToken } : {}),
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
// PATCH /api/auth/me
// ---------------------------------------------------------------------------
// Any signed-in user edits their account (+ role profile) after onboarding.
// Returns the same { user } shape as GET /me so the client can drop it
// straight into state. The role decides which schema + service run.
export async function updateProfileHandler(req: Request, res: Response) {
  const role = req.user!.role;
  const schema =
    role === 'FARMER' ? updateFarmerProfileSchema :
    role === 'BUYER' ? updateBuyerProfileSchema :
    updateAccountBasicsSchema;

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const userId = req.user!.userId;
  const user =
    role === 'FARMER' ? await authService.updateFarmerProfile(userId, parsed.data) :
    role === 'BUYER' ? await authService.updateBuyerProfile(userId, parsed.data) :
    await authService.updateAccountBasics(userId, parsed.data);

  res.json({ user });
}

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
// Always answers 200 with the same message whether or not the email has an
// account — see requestPasswordReset for why (email enumeration).
export async function forgotPasswordHandler(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  await authService.requestPasswordReset(parsed.data.email);

  res.json({
    message: 'If an account exists for that email, a reset link is on its way.',
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
export async function resetPasswordHandler(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  await authService.resetPassword(parsed.data.token, parsed.data.password);

  res.json({ message: 'Password updated. You can now sign in with your new password.' });
}

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
export async function changePasswordHandler(req: Request, res: Response) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  await authService.changePassword(
    req.user!.userId,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  res.json({ message: 'Password changed successfully.' });
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
