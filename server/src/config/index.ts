// =============================================================================
// Centralized Configuration
// =============================================================================
// WHY THIS FILE EXISTS:
// Instead of scattering process.env.SOMETHING across 50 different files,
// we read ALL environment variables in ONE place. This gives us:
//   1. One file to audit for missing env vars
//   2. Type safety — config.port is a number, not string | undefined
//   3. Default values for development
//   4. Easy to spot if something is misconfigured
// =============================================================================

import dotenv from 'dotenv';

// Load .env file into process.env
// This must happen BEFORE we read any env vars
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

// In production, JWT secrets MUST be set via environment — never use defaults
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production';

if (nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be set in production');
  }
  if (jwtSecret.length < 32 || jwtRefreshSecret.length < 32) {
    throw new Error('FATAL: JWT secrets must be at least 32 characters in production');
  }
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://cropbid:cropbid_dev@localhost:5432/cropbid',

  // Authentication
  jwtSecret,
  jwtRefreshSecret,

  // Google Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Razorpay (capture-only payments). In dev use TEST keys (rzp_test_...).
  // Leave blank to run with payments disabled — the API returns 503 on pay attempts.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  // Client URL (for CORS)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Defaults
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
  defaultLocale: process.env.DEFAULT_LOCALE || 'en-IN',
};
