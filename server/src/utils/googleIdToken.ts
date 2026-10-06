// =============================================================================
// Google ID tokens: what the "Sign in with Google" button hands back
// =============================================================================
// The browser gets a signed JWT from Google and posts it to /auth/google. It is
// only worth anything once its signature, issuer, expiry and audience have been
// checked, and google-auth-library does all four against Google's published
// keys (fetched and cached by the library). The audience check is the one that
// matters most: without it, a token Google issued to ANY other site that uses
// Google sign-in would sign its holder in here.
//
// Its own module so the service's tests can stand in for Google.
// =============================================================================

import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { ApiError } from './ApiError';

export interface GoogleIdentity {
  /** Google's stable id for the person. Never changes, unlike the email. */
  sub: string;
  email: string;
  name: string | null;
}

const client = new OAuth2Client();

export async function verifyGoogleIdToken(credential: string): Promise<GoogleIdentity> {
  if (!config.googleClientId) {
    throw new ApiError(503, 'Google sign-in is not available right now');
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch {
    // Expired, forged, or issued to somebody else's site: one answer for all.
    throw new ApiError(401, 'Google could not confirm that sign-in. Try again.');
  }
  if (!payload?.sub) {
    throw new ApiError(401, 'Google could not confirm that sign-in. Try again.');
  }

  // The email is what an existing account is found by, so it has to be one
  // Google has checked. An unverified one is just text somebody typed.
  if (!payload.email || payload.email_verified !== true) {
    throw new ApiError(400, 'Your Google account has no verified email address. Sign up with a password instead.');
  }

  return { sub: payload.sub, email: payload.email, name: payload.name?.trim() || null };
}
