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

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://cropbid:cropbid_dev@localhost:5432/cropbid',

  // Authentication
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',

  // Google Gemini AI
  geminiApiKey: process.env.GEMINI_API_KEY || '',

  // Client URL (for CORS)
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Defaults
  defaultCurrency: process.env.DEFAULT_CURRENCY || 'INR',
  defaultLocale: process.env.DEFAULT_LOCALE || 'en-IN',
};
