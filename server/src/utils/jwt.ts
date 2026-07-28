// =============================================================================
// JWT Token Utilities
// =============================================================================
// HOW JWT AUTH WORKS (the full picture):
//
// 1. User logs in → server creates TWO tokens:
//    - Access Token (5 min): Contains userId + role. Sent in response body.
//      Client stores it in memory (React state). Used for API calls.
//    - Refresh Token (15 min): Contains only userId. Sent as httpOnly cookie.
//      Client CANNOT read it (XSS-proof). Used only to get new access tokens.
//
// 2. Client makes API calls with: Authorization: Bearer <accessToken>
//
// 3. Access token expires after 5 min:
//    - Client gets 401 from API
//    - Axios interceptor automatically calls POST /api/auth/refresh
//    - Server reads refresh token from cookie, verifies it, issues new access token
//    - Axios retries the original request with the new token
//    - User never notices the token expired!
//
// 4. THE REFRESH TOKEN IS THE INACTIVITY TIMEOUT.
//    It is rotated on every refresh, so its 15-minute clock restarts each time
//    the user does something. Keep using the app and the session lives forever;
//    stop for 15 minutes and the next refresh fails → signed out. This is the
//    server-authoritative half of the idle timeout; the client also runs its own
//    watchdog (client/src/lib/idle.ts) so an idle TAB signs itself out on time
//    instead of looking logged-in until its next API call.
//
// 5. User logs out → server clears refresh token from DB and cookie
//    - Even if someone stole the cookie, it's now invalid
//
// WHY NOT JUST ONE LONG-LIVED TOKEN?
// If a single token lasted for days and was stolen via XSS, the attacker has
// access for that whole time. With the two-token pattern:
//   - Access token: short-lived, in memory (hard to steal)
//   - Refresh token: httpOnly cookie (JavaScript can't access it), and idle-bound
// =============================================================================

import jwt from 'jsonwebtoken';
import { config } from '../config';

interface TokenPayload {
  userId: string;
  role: string;
}

interface RefreshPayload {
  userId: string;
}

// How long a session survives with no requests at all, in milliseconds.
// Exported so the cookie's maxAge and the client-facing copy can't drift from
// the JWT's actual expiry.
export const IDLE_TIMEOUT_MS = config.auth.idleTimeoutMinutes * 60 * 1000;

// Generate both tokens at once (used on login, signup and every refresh)
export function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign(
    { userId, role } as TokenPayload,
    config.jwtSecret,
    { expiresIn: `${config.auth.accessTokenMinutes}m` } // Short-lived — forces regular refresh
  );

  const refreshToken = jwt.sign(
    { userId } as RefreshPayload,
    config.jwtRefreshSecret,
    // Rotated on every refresh, so this is a SLIDING inactivity window, not a
    // fixed session length — see the header comment.
    { expiresIn: `${config.auth.idleTimeoutMinutes}m` }
  );

  return { accessToken, refreshToken };
}

// True when a jsonwebtoken error means "this token was valid but has aged out",
// as opposed to a forged/garbage token. Lets the refresh endpoint tell the user
// "you were signed out for being idle" instead of a scary "invalid token".
export function isTokenExpiredError(err: unknown): boolean {
  return err instanceof jwt.TokenExpiredError;
}

// Verify access token (used by auth middleware on every protected request)
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

// Verify refresh token (used only by the /refresh endpoint)
export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as RefreshPayload;
}
