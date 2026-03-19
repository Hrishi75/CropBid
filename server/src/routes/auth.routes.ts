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
import {
  signupHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  getMeHandler,
  farmerOnboardingHandler,
  buyerOnboardingHandler,
} from '../controllers/auth.controller';

const router = Router();

// Public routes (no auth required)
router.post('/signup', signupHandler);
router.post('/login', loginHandler);
router.post('/refresh', refreshHandler);

// Protected routes (must be logged in)
router.post('/logout', authenticate, logoutHandler);
router.get('/me', authenticate, getMeHandler);

// Onboarding (must be logged in + correct role)
router.post('/onboarding/farmer', authenticate, requireRole('FARMER'), farmerOnboardingHandler);
router.post('/onboarding/buyer', authenticate, requireRole('BUYER'), buyerOnboardingHandler);

export default router;
