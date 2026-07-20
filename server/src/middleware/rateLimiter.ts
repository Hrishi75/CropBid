// =============================================================================
// Rate Limiters — express-rate-limit middleware
// =============================================================================
// Two limiters mounted in app.ts:
//   - apiLimiter:  broad per-IP cap on all endpoints (anti-abuse)
//   - authLimiter: strict cap on login/signup/refresh, keyed by (ip + account)
//                  so attackers can't dodge it by rotating IPs or enumerate
//                  accounts from one IP. See keyGenerator below for the fallback
//                  when req.ip is unavailable.
// =============================================================================

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { normalizePhone } from '../services/auth.service';

// The account portion of the auth limiter key, as ":<account>" (or "" when the
// body names none, leaving an IP-only bucket).
//
// This MUST agree with how auth.controller reads the body, or per-account
// locking silently degrades to per-IP: login sends { identifier }, signup sends
// { phone, email? }, and older mobile builds still send { email }. Reading only
// one of those is how this regressed when phone became the login identifier.
//
// Phones are keyed on their normalized form for the same reason login looks
// them up that way (see normalizePhone) — otherwise "+91 98765 43210" and
// "+919876543210" are two buckets for one account, and an attacker just varies
// the punctuation to multiply their attempts.
export function accountKey(body: unknown): string {
  const b = body as { identifier?: unknown; email?: unknown; phone?: unknown } | undefined;
  const raw = b?.identifier ?? b?.email ?? b?.phone;
  if (typeof raw !== 'string') return '';

  const trimmed = raw.trim();
  if (!trimmed) return '';

  // An "@" means it's an email — normalizePhone would reduce "a1@x.com" to its
  // stray digits and collide unrelated addresses into one bucket.
  if (trimmed.includes('@')) return `:${trimmed.toLowerCase()}`;

  return `:${normalizePhone(trimmed) || trimmed.toLowerCase()}`;
}

// Global API rate limiter — prevents abuse across all endpoints
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 100,                 // 100 requests per minute per IP
  standardHeaders: true,    // Return rate limit info in headers
  legacyHeaders: false,
  message: { error: true, message: 'Too many requests, please try again later' },
});

// Strict auth rate limiter — prevents brute force on login/signup/refresh.
// Keys by (ip + account) when the body names an account so an attacker cannot
// rotate IPs to bypass per-account locking, and cannot enumerate accounts
// from a single IP either. Falls back to IP-only on routes that name none.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,                   // 15 attempts per 15 min per (ip, account)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // req.ip can be undefined when Express has no trust-proxy set and the
    // request arrived without a recognisable forwarded header. Falling back
    // to '' would collapse every such request into one shared bucket, so
    // prefer the raw socket address before giving up.
    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const ip = ipKeyGenerator(rawIp);
    return `${ip}${accountKey(req.body)}`;
  },
  message: { error: true, message: 'Too many authentication attempts, please try again later' },
});
