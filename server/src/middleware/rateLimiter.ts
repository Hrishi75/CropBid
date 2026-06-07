// =============================================================================
// Rate Limiters — express-rate-limit middleware
// =============================================================================
// Two limiters mounted in app.ts:
//   - apiLimiter:  broad per-IP cap on all endpoints (anti-abuse)
//   - authLimiter: strict cap on login/signup/refresh, keyed by (ip + email)
//                  so attackers can't dodge it by rotating IPs or enumerate
//                  accounts from one IP. See keyGenerator below for the fallback
//                  when req.ip is unavailable.
// =============================================================================

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
    // req.ip can be undefined when Express has no trust-proxy set and the
    // request arrived without a recognisable forwarded header. Falling back
    // to '' would collapse every such request into one shared bucket, so
    // prefer the raw socket address before giving up.
    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const ip = ipKeyGenerator(rawIp);
    const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    return email ? `${ip}:${email}` : ip;
  },
  message: { error: true, message: 'Too many authentication attempts, please try again later' },
});
