// =============================================================================
// JWT Token Utilities
// =============================================================================
// HOW JWT AUTH WORKS (the full picture):
//
// 1. User logs in → server creates TWO tokens:
//    - Access Token (15 min): Contains userId + role. Sent in response body.
//      Client stores it in memory (React state). Used for API calls.
//    - Refresh Token (7 days): Contains only userId. Sent as httpOnly cookie.
//      Client CANNOT read it (XSS-proof). Used only to get new access tokens.
//
// 2. Client makes API calls with: Authorization: Bearer <accessToken>
//
// 3. Access token expires after 15 min:
//    - Client gets 401 from API
//    - Axios interceptor automatically calls POST /api/auth/refresh
//    - Server reads refresh token from cookie, verifies it, issues new access token
//    - Axios retries the original request with the new token
//    - User never notices the token expired!
//
// 4. User closes browser → access token is lost (it was in memory)
//    - User returns → refresh token cookie is still there
//    - Client calls /api/auth/refresh on page load → gets new access token
//    - Session is restored seamlessly
//
// 5. User logs out → server clears refresh token from DB and cookie
//    - Even if someone stole the cookie, it's now invalid
//
// WHY NOT JUST ONE LONG-LIVED TOKEN?
// If a single token lasted 7 days and was stolen via XSS, the attacker has
// full access for a week. With the two-token pattern:
//   - Access token: short-lived, in memory (hard to steal)
//   - Refresh token: long-lived, httpOnly cookie (JavaScript can't access it)
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

// Generate both tokens at once (used on login and signup)
export function generateTokens(userId: string, role: string) {
  const accessToken = jwt.sign(
    { userId, role } as TokenPayload,
    config.jwtSecret,
    { expiresIn: '15m' } // Short-lived — forces regular refresh
  );

  const refreshToken = jwt.sign(
    { userId } as RefreshPayload,
    config.jwtRefreshSecret,
    { expiresIn: '7d' } // Long-lived — stored as httpOnly cookie
  );

  return { accessToken, refreshToken };
}

// Verify access token (used by auth middleware on every protected request)
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtSecret) as TokenPayload;
}

// Verify refresh token (used only by the /refresh endpoint)
export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as RefreshPayload;
}
