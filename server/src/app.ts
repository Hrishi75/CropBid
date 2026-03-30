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
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter, authLimiter } from './middleware/rateLimiter';
import authRoutes from './routes/auth.routes';
import listingRoutes from './routes/listing.routes';
import browseRoutes from './routes/browse.routes';
import bidRoutes from './routes/bid.routes';
import agentRoutes from './routes/agent.routes';
import negotiationRoutes from './routes/negotiation.routes';
import auctionRoutes from './routes/auction.routes';
import transactionRoutes from './routes/transaction.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import analyticsRoutes from './routes/analytics.routes';
import waitlistRoutes from './routes/waitlist.routes';
import logisticsRoutes from './routes/logistics.routes';

const app = express();

// =============================================================================
// Middleware Stack (order matters!)
// =============================================================================

// Security headers — sets X-Frame-Options, X-Content-Type-Options, HSTS, etc.
app.use(helmet({
  contentSecurityPolicy: false,       // CSP handled separately or by frontend
  crossOriginEmbedderPolicy: false,   // allow image loading from uploads
}));

// CORS — Cross-Origin Resource Sharing
app.use(cors({
  origin: config.clientUrl,
  credentials: true,
}));

// Global API rate limiter — 100 req/min per IP
app.use('/api', apiLimiter);

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data (for HTML form submissions)
app.use(express.urlencoded({ extended: true }));

// Parse cookies (needed to read httpOnly refresh token cookie)
app.use(cookieParser());

// Serve uploaded files as static assets
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
// Routes
// =============================================================================
// Strict rate limit on auth — 10 req/15min per IP
app.use('/api/auth', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/browse', browseRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/negotiations', negotiationRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/logistics', logisticsRoutes);

// =============================================================================
// Global Error Handler — MUST be last middleware
// =============================================================================
// Express only routes errors to middleware with 4 parameters (err, req, res, next).
// This catches all errors thrown in routes/controllers/services above.
app.use(errorHandler);

export default app;
