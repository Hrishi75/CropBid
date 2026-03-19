// =============================================================================
// Express Application Configuration
// =============================================================================
// WHY SEPARATE FROM index.ts?
// This file configures the Express app (middleware, routes, error handling).
// index.ts starts the HTTP server (app.listen).
//
// By separating them, you can:
//   - Import `app` in tests without starting a real server
//   - Attach Socket.io to the HTTP server in index.ts
//   - Keep concerns cleanly separated
// =============================================================================

import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';

const app = express();

// =============================================================================
// Middleware Stack (order matters!)
// =============================================================================

// CORS — Cross-Origin Resource Sharing
// WHY credentials: true?
// Later, we'll send JWT refresh tokens as httpOnly cookies.
// Browsers strip cookies from cross-origin requests unless both:
//   1. Server sets Access-Control-Allow-Credentials: true
//   2. Client sets withCredentials: true on requests
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Parse JSON request bodies
// WHY limit: '10mb'?
// Default is 100kb which is too small for image upload metadata.
// Actual images go through Multer (disk), not JSON body.
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data (for HTML form submissions)
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files as static assets
// Example: /uploads/listings/abc123.webp → server/uploads/listings/abc123.webp
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// =============================================================================
// Health Check Endpoint
// =============================================================================
// WHY HAVE THIS?
// A health check is the first thing you test when something goes wrong.
// It confirms: "Is the server running? Can it respond to requests?"
// Every production service has one. Load balancers use it to route traffic.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// =============================================================================
// Routes will be added here in later phases
// =============================================================================
// app.use('/api/auth', authRoutes);
// app.use('/api/listings', listingRoutes);
// etc.

export default app;
