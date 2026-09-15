// =============================================================================
// Auth Routes — The "Table of Contents" for Authentication
// =============================================================================
// Routes define URL paths and HTTP methods. They are deliberately thin:
// just wiring URLs to controller functions with appropriate middleware.
//
// Reading this file should tell you: "What auth endpoints exist?"
//
// ROUTE PATTERN:
//   router.METHOD('/path', ...middleware, controllerFunction);
//
// Express 5 automatically catches errors thrown in async handlers,
// so we don't need express-async-errors or manual try-catch wrappers.
// =============================================================================

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleGuard';
import { uploadAvatar, processAvatar } from '../middleware/upload';
import {
  signupHandler,
  verifySignupHandler,
  resendSignupOtpHandler,
  loginHandler,
  startPhoneSignInHandler,
  verifyPhoneSignInHandler,
  refreshHandler,
  logoutHandler,
  getMeHandler,
  updateProfileHandler,
  updateAvatarHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  changePasswordHandler,
  farmerOnboardingHandler,
  buyerOnboardingHandler,
  deleteAccountHandler,
} from '../controllers/auth.controller';

const router = Router();

// Public routes (no auth required)
// Signup. Farmers and consumers are created outright; buyers get a 202 and an
// emailed code, then finish at /signup/verify. All three ride the strict
// authLimiter mounted on /api/auth in app.ts, which keys on (ip, account) — so
// guessing a code and requesting codes are both capped per address, not just
// per IP.
router.post('/signup', signupHandler);
router.post('/signup/verify', verifySignupHandler);
router.post('/signup/resend', resendSignupOtpHandler);
router.post('/login', loginHandler);

// --- Phone sign-in (passwordless): one flow for signing up and signing in ---
// Covered by the strict authLimiter mounted on /api/auth in app.ts, which is
// what keeps a 6-digit code from being brute-forced.
router.post('/phone/start', startPhoneSignInHandler);
router.post('/phone/verify', verifyPhoneSignInHandler);
router.post('/refresh', refreshHandler);

// Password recovery (public — the emailed token IS the credential).
// Covered by the strict authLimiter mounted on /api/auth in app.ts.
router.post('/forgot-password', forgotPasswordHandler);
router.post('/reset-password', resetPasswordHandler);

// Protected routes (must be logged in)
router.post('/logout', authenticate, logoutHandler);
router.get('/me', authenticate, getMeHandler);
// PATCH /me is role-aware inside the controller (farmer / buyer / admin)
router.patch('/me', authenticate, updateProfileHandler);
// Profile photo — multipart field "avatar"; Multer saves, Sharp squares it
router.post('/me/avatar', authenticate, uploadAvatar.single('avatar'), processAvatar, updateAvatarHandler);
router.post('/change-password', authenticate, changePasswordHandler);
// Delete own account — body carries the current password as confirmation
router.delete('/me', authenticate, deleteAccountHandler);

// Onboarding — the partner APPLICATION. Must be logged in; the role is what
// you are applying to become, so it cannot also be the entry requirement.
//
// CONSUMER is here because that is who applies. Everyone arrives on CropBid as
// a shopper, and applying to sell or to buy at volume is a form they fill from
// inside a signed-in consumer account. Gating this on FARMER made the endpoint
// reachable only by someone who already was one, which is why a signed-in
// shopper could not apply at all.
//
// FARMER/BUYER stay allowed for resubmission after a reviewer sends an
// application back (NEEDS_INFO), and for anyone who signed up through the
// logged-out partner door. Approval is still the only thing that grants the
// role: see reviewPartnerApplication in admin.service.ts.
router.post('/onboarding/farmer', authenticate, requireRole('CONSUMER', 'FARMER'), farmerOnboardingHandler);
router.post('/onboarding/buyer', authenticate, requireRole('CONSUMER', 'BUYER'), buyerOnboardingHandler);

export default router;
