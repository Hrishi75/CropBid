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
import { IDLE_TIMEOUT_MS } from '../utils/jwt';

// --- Zod Schemas for input validation ---

// One password policy, shared by signup / reset / change so the rules can
// never drift apart.
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Phone is the primary contact (required); email is optional for farmers and
// consumers but REQUIRED for buyers (see the superRefine below). Forms may send
// email as an empty string — treat that as "not provided" before validating.
export const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('Invalid email address').optional()
  ),
  password: passwordSchema,
  role: z.enum(['FARMER', 'BUYER', 'CONSUMER']),
  // The digit count is checked on the SEPARATOR-STRIPPED value, not the raw
  // string: "+      " is seven allowed characters but normalizes to "+", which
  // login can never match — that account would be locked out of its own login.
  phone: z
    .string()
    .max(20)
    .regex(/^[+0-9][0-9\s\-()]*$/, 'Invalid phone number')
    .refine(
      (v) => v.replace(/[^0-9]/g, '').length >= 7,
      'Phone number must have at least 7 digits'
    ),
  country: z.string().max(60).optional(),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).optional(),
  language: z.enum(['EN', 'HI', 'MR']).optional(),
}).superRefine((data, ctx) => {
  // Buyers must sign up with an email. The check is cross-field, so it can't
  // live on the email property itself; the path points back at the field so a
  // client can highlight it.
  if (data.role === 'BUYER' && !data.email) {
    ctx.addIssue({
      code: 'custom',
      path: ['email'],
      message: 'Email is required for buyer accounts',
    });
  }
});

// Buyer signup step 2. The code is retyped from an inbox, so accept the shapes
// people actually paste — surrounding whitespace, or the "483 920" that some
// mail clients render — and only then insist on exactly six digits.
export const verifySignupSchema = z.object({
  pendingId: z.string().min(1, 'Start the signup again to get a new code'),
  code: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s/g, '') : v),
    z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code from your email'),
  ),
});

export const resendSignupOtpSchema = z.object({
  pendingId: z.string().min(1, 'Start the signup again to get a new code'),
});

// Login accepts phone OR email in one field. Older clients send it as
// `email`, newer ones as `identifier` — normalize before validating.
const loginSchema = z.object({
  identifier: z.string().min(1, 'Phone or email is required'),
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

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Your password is required to delete the account'),
});

// PATCH /api/auth/me — a user editing their own account + role profile.
// Every field is optional; the service writes only the keys that are present.
// The account fields are shared; the role-specific fields live in per-role
// schemas and the handler picks the right one from req.user.role.
const accountFields = {
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  // Set by the language switcher, not by a form field. Until this existed the
  // preference lived only in the browser's localStorage, so the server had no
  // way to know a user reads Hindi — which is what decides whether a Devanagari
  // description gets stored as Hindi or Marathi (services/translation.service).
  language: z.enum(['EN', 'HI', 'MR']).optional(),
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
//   maxAge           → The idle window PLUS a grace period, re-set on every
//                      refresh so the cookie slides forward with the token it
//                      carries. See COOKIE_GRACE_MS for why it isn't an exact
//                      match.
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

// The cookie deliberately OUTLIVES the token inside it by a few minutes.
// If the two expired together, the browser would discard the cookie at the
// same instant the token aged out, /refresh would see no cookie at all, and
// the user would get a bare "No refresh token" instead of being told they were
// signed out for being idle. Letting the dead token arrive lets the server
// name the reason (SESSION_IDLE). This grants no access: the token is the
// authority and it is already expired by then — the cookie is just an envelope.
const COOKIE_GRACE_MS = 5 * 60 * 1000;

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: IDLE_TIMEOUT_MS + COOKIE_GRACE_MS,
  path: '/api/auth',
};

// ---------------------------------------------------------------------------
// POST /api/auth/signup
// ---------------------------------------------------------------------------
// Two outcomes by role:
//   FARMER / CONSUMER → 201 with the account and a session, as always.
//   BUYER             → 202 with a pendingId. No account exists yet; the code
//                       just emailed to them has to come back to /signup/verify
//                       before one does.
export async function signupHandler(req: Request, res: Response) {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const { name, email, password, role, phone, country, currency, language } = parsed.data;

  if (role === 'BUYER') {
    const pending = await authService.startBuyerSignup({
      name, email, password, role, phone, country, currency, language,
    });
    // 202 Accepted: understood, not yet acted on — exactly this situation.
    res.status(202).json({
      pendingSignup: {
        pendingId: pending.pendingId,
        email: pending.email,
        expiresAt: pending.expiresAt.toISOString(),
      },
    });
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
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/signup/verify — buyer signup, step 2
// ---------------------------------------------------------------------------
export async function verifySignupHandler(req: Request, res: Response) {
  const parsed = verifySignupSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const result = await authService.verifyBuyerSignup(parsed.data);

  // The account exists as of this call, so this is where the session starts —
  // same response shape as a farmer's 201 from /signup.
  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.status(201).json({
    user: result.user,
    accessToken: result.accessToken,
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/signup/resend — email a fresh code
// ---------------------------------------------------------------------------
export async function resendSignupOtpHandler(req: Request, res: Response) {
  const parsed = resendSignupOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const pending = await authService.resendBuyerSignupOtp(parsed.data);

  res.status(202).json({
    pendingSignup: {
      pendingId: pending.pendingId,
      email: pending.email,
      expiresAt: pending.expiresAt.toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export async function loginHandler(req: Request, res: Response) {
  const parsed = loginSchema.safeParse({
    ...req.body,
    identifier: req.body?.identifier ?? req.body?.email ?? req.body?.phone,
  });
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  const { identifier, password } = parsed.data;

  const result = await authService.login({ identifier, password });

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
// POST /api/auth/me/avatar
// ---------------------------------------------------------------------------
// Multer + Sharp (middleware/upload.ts) have already validated, squared, and
// stored the photo; here we just persist its path. Same { user } shape as /me.
export async function updateAvatarHandler(req: Request, res: Response) {
  const avatarPath = (req as any).processedAvatar as string | undefined;
  if (!avatarPath) {
    res.status(400).json({ error: true, message: 'Attach an image in the "avatar" field' });
    return;
  }

  const user = await authService.updateAvatar(req.user!.userId, avatarPath);
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

  try {
    await authService.requestPasswordReset(parsed.data.email);
  } catch (err) {
    // Still answer 200 — a bubbled 500 (e.g. SMTP down) only ever fires for
    // real accounts (unknown emails return silently), which would hand
    // attackers the enumeration signal this endpoint exists to hide.
    console.error('[forgot-password] delivery error (non-fatal):', err);
  }

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

  const tokens = await authService.changePassword(
    req.user!.userId,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );

  // The service rotated the refresh token to evict any stolen session; hand
  // the new one back the same way login does so THIS session stays alive.
  // Trusting X-Client here is fine: the caller just proved the password.
  res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);

  res.json({
    message: 'Password changed successfully.',
    ...(isMobileClient(req)
      ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
      : {}),
  });
}

// ---------------------------------------------------------------------------
// DELETE /api/auth/me
// ---------------------------------------------------------------------------
// Permanently deletes (or, when financial records pin the row, anonymizes)
// the caller's account. The body must carry the current password — see
// authService.deleteAccount. On success the session is gone server-side, so
// also drop the refresh cookie like logout does.
export async function deleteAccountHandler(req: Request, res: Response) {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }

  await authService.deleteAccount(req.user!.userId, parsed.data.password);

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
    path: '/api/auth',
  });

  res.json({ message: 'Your account has been deleted.' });
}

// ===========================================================================
// PHONE SIGN-IN — passwordless, one flow for signing up and signing in
// ===========================================================================

const startPhoneSignInSchema = z.object({
  phone: z
    .string()
    .max(20)
    .regex(/^[+0-9][0-9\s\-()]*$/, 'Enter a valid phone number')
    .refine((v) => v.replace(/[^0-9]/g, '').length >= 7, 'Enter a valid phone number'),
  // Set by the partner flow so the account it creates is a seller/buyer rather
  // than a shopper. The service whitelists this — ADMIN is never accepted.
  intendedRole: z.enum(['CONSUMER', 'FARMER', 'BUYER']).optional(),
});

// POST /api/auth/phone/start — send a code
export async function startPhoneSignInHandler(req: Request, res: Response) {
  const parsed = startPhoneSignInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: true, message: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }
  const result = await authService.startPhoneSignIn(parsed.data);
  res.status(202).json({
    challenge: {
      challengeId: result.challengeId,
      phone: result.phone,
      expiresAt: result.expiresAt.toISOString(),
      isNewAccount: result.isNewAccount,
    },
  });
}

const verifyPhoneSignInSchema = z.object({
  challengeId: z.string().min(1, 'Start again to get a new code'),
  // Accept what people actually paste — surrounding space, or the "483 920"
  // some SMS clients render — then insist on exactly six digits.
  code: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s/g, '') : v),
    z.string().regex(/^[0-9]{6}$/, 'Enter the 6-digit code we sent you'),
  ),
  // Only read when the code creates a new account.
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
});

// POST /api/auth/phone/verify — check the code, sign in or create the account
export async function verifyPhoneSignInHandler(req: Request, res: Response) {
  const parsed = verifyPhoneSignInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: true, message: parsed.error.issues[0]?.message || 'Invalid input' });
    return;
  }
  const result = await authService.verifyPhoneSignIn(parsed.data);

  res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
  res.status(result.created ? 201 : 200).json({
    user: result.user,
    accessToken: result.accessToken,
    created: result.created,
    // Native clients have no cookie jar — same contract as signup/login. Safe
    // here for the same reason: the caller just proved control of the number.
    ...(isMobileClient(req) ? { refreshToken: result.refreshToken } : {}),
  });
}

// ---------------------------------------------------------------------------
// POST /api/auth/onboarding/farmer — submit (or resubmit) a SELLER application
// ---------------------------------------------------------------------------
// Field shapes are checked here; WHICH fields a given sellerType must provide
// is a business rule and lives in auth.service.validateSellerApplication.
const sellerApplicationSchema = z.object({
  sellerType: z.enum(['FARMER', 'LOCAL_SHOP', 'WHOLESALER']).optional(),
  farmSizeAcres: z.number().positive().max(1_000_000).optional(),
  cropsGrown: z.array(z.string().min(1).max(80)).max(60).optional(),
  state: z.string().min(1, 'State is required').max(80),
  country: z.string().max(60).optional(),
  fpoName: z.string().max(160).optional(),
  apmcLicense: z.string().max(80).optional(),
  organicCertified: z.boolean().optional(),
  certificationBody: z.string().max(80).optional(),
  businessName: z.string().max(120).optional(),
  shopType: z.enum(['KIRANA', 'VEGETABLE', 'DAIRY', 'BAKERY', 'GENERAL', 'OTHER']).optional(),
  address: z.string().max(240).optional(),
  fssaiLicense: z.string().max(40).optional(),
  gstin: z.string().max(20).optional(),
  minOrderValue: z.number().positive().optional(),
  leadTimeDays: z.number().int().min(0).max(60).optional(),
});

export async function farmerOnboardingHandler(req: Request, res: Response) {
  const parsed = sellerApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }
  const profile = await authService.completeFarmerOnboarding(
    req.user!.userId,
    parsed.data,
  );
  res.status(201).json({ profile });
}

// ---------------------------------------------------------------------------
// POST /api/auth/onboarding/buyer — submit (or resubmit) a BUYER application
// ---------------------------------------------------------------------------
const buyerApplicationSchema = z.object({
  companyName: z.string().min(2, 'Company name is required').max(160),
  companyType: z.enum(['PROCESSOR', 'FMCG', 'RESTAURANT', 'EXPORTER', 'RETAILER', 'WHOLESALER', 'SMALL_BUSINESS']),
  country: z.string().max(60).optional(),
  taxId: z.string().max(40).optional(),
  annualProcurementVolume: z.string().max(80).optional(),
  outletCount: z.number().int().min(1).max(10_000).optional(),
});

export async function buyerOnboardingHandler(req: Request, res: Response) {
  const parsed = buyerApplicationSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Invalid input';
    res.status(400).json({ error: true, message: firstError });
    return;
  }
  const profile = await authService.completeBuyerOnboarding(
    req.user!.userId,
    parsed.data,
  );
  res.status(201).json({ profile });
}
