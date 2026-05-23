import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Global API rate limiter — prevents abuse across all endpoints
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 100,                 // 100 requests per minute per IP
  standardHeaders: true,    // Return rate limit info in headers
  legacyHeaders: false,
  message: { error: true, message: 'Too many requests, please try again later' },
});

// Strict auth rate limiter — prevents brute force on login/signup/refresh.
// Keys by (ip + email) when an email is present so an attacker cannot
// rotate IPs to bypass per-account locking, and cannot enumerate accounts
// from a single IP either. Falls back to IP-only on routes without email.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                   // 15 attempts per 15 min per (ip, email)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = ipKeyGenerator(req.ip ?? '');
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    return email ? `${ip}:${email}` : ip;
  },
  message: { error: true, message: 'Too many authentication attempts, please try again later' },
});
