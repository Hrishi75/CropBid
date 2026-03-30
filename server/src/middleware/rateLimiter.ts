import rateLimit from 'express-rate-limit';

// Global API rate limiter — prevents abuse across all endpoints
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 100,                 // 100 requests per minute per IP
  standardHeaders: true,    // Return rate limit info in headers
  legacyHeaders: false,
  message: { error: true, message: 'Too many requests, please try again later' },
});

// Strict auth rate limiter — prevents brute force on login/signup/refresh
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                   // 15 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: 'Too many authentication attempts, please try again later' },
});
