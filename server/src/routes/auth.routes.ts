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

// Onboarding (must be logged in + correct role)
router.post('/onboarding/farmer', authenticate, requireRole('FARMER'), farmerOnboardingHandler);
router.post('/onboarding/buyer', authenticate, requireRole('BUYER'), buyerOnboardingHandler);

export default router;
