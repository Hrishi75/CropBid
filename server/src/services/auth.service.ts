// =============================================================================
// Auth Service — Business Logic Layer
// =============================================================================
// WHY SEPARATE SERVICE FROM CONTROLLER?
// The controller handles HTTP (parse body, send response, set cookies).
// The service handles LOGIC (hash password, check uniqueness, create user).
//
// Benefits:
//   1. The service can be reused by Socket.io handlers (no HTTP involved)
//   2. The service is easy to test (no req/res mocking needed)
//   3. Responsibilities are clear: controller = HTTP glue, service = brain
// =============================================================================

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { Prisma } from '../generated/prisma/client';
import type { PartnerStatus } from '../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { generateTokens, isTokenExpiredError, verifyRefreshToken } from '../utils/jwt';
import { generateResetToken, hashResetToken, resetTokenExpiry } from '../utils/resetToken';
import { ApiError } from '../utils/ApiError';
import { sendPasswordResetEmail, sendSignupOtpEmail } from './email.service';
import {
  SIGNUP_OTP_MAX_ATTEMPTS,
  SIGNUP_OTP_RESEND_COOLDOWN_MS,
  SIGNUP_OTP_TTL_MS,
  generateSignupOtp,
  signupOtpExpiry,
  signupOtpMatches,
} from '../utils/signupOtp';
import {
  PHONE_OTP_MAX_ATTEMPTS,
  PHONE_OTP_RESEND_COOLDOWN_MS,
  PHONE_OTP_TTL_MS,
  generatePhoneOtp,
  phoneOtpExpiry,
  phoneOtpMatches,
} from '../utils/phoneOtp';
import { OtpDeliveryError, deliverOtp } from './otpDelivery.service';
import { recordAudit } from './audit.service';
import { removeImage } from './imageStorage';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Phone normalization — the stored/lookup form of a phone number
// ---------------------------------------------------------------------------
// Phone is a unique login identifier, so "+91-98765 43210" and "+919876543210"
// must resolve to the SAME account: strip every separator, keep a leading "+".
// Applied on both write (signup) and read (login) so the two always agree, and
// backfilled over existing rows by the phone_primary_contact migration.
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

// ---------------------------------------------------------------------------
// Email normalization — the stored form of an email address
// ---------------------------------------------------------------------------
// Nobody thinks of "Asha@Farm.in" and "asha@farm.in" as two accounts, but
// Postgres does: the unique index and every findUnique compare byte for byte.
// Left alone, one buyer could hold both addresses and neither login nor the
// password-reset link would reliably find the one they meant.
//
// New rows are written lowercase so they are canonical. READS stay
// case-insensitive rather than assuming that: accounts predating this are
// still stored however they were typed, and lowercasing only the lookup would
// lock those people out of their own accounts.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Signup — Create a new user account
// ---------------------------------------------------------------------------
interface SignupInput {
  name: string;
  email?: string;
  password: string;
  role: 'FARMER' | 'BUYER' | 'CONSUMER';
  phone: string;
  country?: string;
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  language?: UserLanguage;
}

// The three languages the UI actually offers. Mirrors the Language enum in
// schema.prisma — widen both together, and remember the enum needs its own
// standalone migration (Postgres won't let ALTER TYPE ... ADD VALUE be used in
// the same transaction that adds it).
export type UserLanguage = 'EN' | 'HI' | 'MR';

// Phone is the primary identifier — one account per phone. Email is optional
// for non-buyers but must always be unique when provided. Shared by the direct
// signup path and the buyer OTP path, which checks twice: once before emailing
// a code (so we never send one to an address that already has an account) and
// again at verification, because ten minutes is long enough for someone else to
// have taken the number.
async function assertIdentifiersFree(phone: string, email?: string): Promise<void> {
  const existingPhone = await prisma.user.findUnique({ where: { phone } });
  if (existingPhone) {
    throw new ApiError(409, 'An account with this phone number already exists');
  }

  if (email) {
    // Case-insensitive so a lowercase signup still collides with an older
    // mixed-case row; the unique index catches the new-against-new race.
    const existingEmail = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (existingEmail) {
      throw new ApiError(409, 'An account with this email already exists');
    }
  }
}

// Create the row and issue the session. The password arrives already hashed:
// the buyer path hashes at the start of the flow so plaintext never reaches
// PendingSignup, and this stays the single place that writes a User.
async function createUserAndIssueTokens(data: {
  name: string;
  email: string | null;
  hashedPassword: string;
  role: SignupInput['role'];
  phone: string;
  country?: string;
  currency?: SignupInput['currency'];
  language?: SignupInput['language'];
}) {
  // Two concurrent signups can both pass the pre-check above; the unique index
  // decides the race, so map the loser's P2002 to the same 409 instead of
  // letting it surface as a 500.
  const user = await prisma.user
    .create({
      data: {
        name: data.name,
        email: data.email,
        password: data.hashedPassword,
        role: data.role,
        phone: data.phone,
        country: data.country || 'India',
        currency: data.currency || 'INR',
        language: data.language || 'EN',
      },
      include: {
        farmerProfile: true,
        buyerProfile: true,
      },
    })
    .catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // meta.target names the offending columns (or the index, depending on
        // the connector) — report whichever unique field lost the race.
        const target = err.meta?.target;
        const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '');
        if (targetStr.includes('phone')) {
          throw new ApiError(409, 'An account with this phone number already exists');
        }
        if (targetStr.includes('email')) {
          throw new ApiError(409, 'An account with this email already exists');
        }
      }
      throw err;
    });

  const tokens = generateTokens(user.id, user.role);

  // Save the refresh token so we can invalidate it on logout (set to null).
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  // Return user data WITHOUT password or any token material.
  const {
    password: _,
    refreshToken: __,
    passwordResetToken: ___,
    passwordResetExpires: ____,
    ...userWithoutSensitiveData
  } = user;

  return {
    user: userWithoutSensitiveData,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

export async function signup(input: SignupInput) {
  // 0. Buyers verify their email first and are created by verifyBuyerSignup,
  // not here. The controller routes them to the OTP flow before reaching this,
  // but the rule is repeated so it holds for every caller of the service — an
  // unverified buyer must never be reachable through a second door.
  if (input.role === 'BUYER') {
    throw new ApiError(400, 'Buyer accounts must verify their email address first');
  }

  const email = input.email ? normalizeEmail(input.email) || undefined : undefined;

  const phone = normalizePhone(input.phone);
  await assertIdentifiersFree(phone, email);

  // Cost factor 12 ≈ 250ms — slow enough to resist brute-force, fast enough
  // not to annoy users.
  const hashedPassword = await bcrypt.hash(input.password, 12);

  return createUserAndIssueTokens({
    name: input.name,
    email: email || null,
    hashedPassword,
    role: input.role,
    phone,
    country: input.country,
    currency: input.currency,
    language: input.language,
  });
}

// ---------------------------------------------------------------------------
// Buyer signup, step 1 — park the details and email a code
// ---------------------------------------------------------------------------
// Nothing is written to User here, so a pending signup reserves no email and no
// phone number. That is what stops someone typing a stranger's address and
// locking them out of ever registering it.
export async function startBuyerSignup(input: SignupInput) {
  if (input.role !== 'BUYER') {
    throw new ApiError(400, 'Only buyer accounts use email verification');
  }

  // Buyers cannot be phone-only: this is the address deals and password resets
  // reach them on. The controller's schema rejects it first; repeated here so
  // a blank-ish email can never slip through as an unreachable account.
  const email = input.email ? normalizeEmail(input.email) || undefined : undefined;
  if (!email) {
    throw new ApiError(400, 'Email is required for buyer accounts');
  }

  const phone = normalizePhone(input.phone);
  await assertIdentifiersFree(phone, email);

  // Opportunistic sweep — cheap (indexed range delete) and keeps the table from
  // growing without a scheduled job to run it.
  await pruneExpiredPendingSignups();

  const hashedPassword = await bcrypt.hash(input.password, 12);
  const { code, codeHash } = generateSignupOtp();
  const expiresAt = signupOtpExpiry();

  // Upsert on email: retyping the form or asking for another code REPLACES the
  // earlier attempt, so one address never has two live codes.
  const pending = await prisma.pendingSignup.upsert({
    where: { email },
    create: {
      email,
      phone,
      name: input.name,
      password: hashedPassword,
      role: 'BUYER',
      country: input.country || 'India',
      currency: input.currency || 'INR',
      language: input.language || 'EN',
      codeHash,
      expiresAt,
    },
    update: {
      phone,
      name: input.name,
      password: hashedPassword,
      country: input.country || 'India',
      currency: input.currency || 'INR',
      language: input.language || 'EN',
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
  });

  // Unlike the password reset, a failed send is NOT swallowed: the buyer would
  // be staring at a code entry box with nothing to type. Drop the row so the
  // retry starts clean rather than leaving an orphan holding a code nobody has.
  //
  // The cleanup is scoped to OUR codeHash, not just the id. The upsert above
  // keys on email, so two concurrent submissions for the same address share one
  // row — and an unscoped delete here would let a failed send in request A tear
  // out the row belonging to request B, whose buyer already has a working code
  // in their inbox and would be told it had expired. Matching codeHash means we
  // only ever delete a row that still holds the code WE generated.
  try {
    await sendSignupOtpEmail(email, input.name, code, SIGNUP_OTP_TTL_MS / 60_000);
  } catch (err) {
    await prisma.pendingSignup
      .deleteMany({ where: { id: pending.id, codeHash } })
      .catch(() => {});
    throw err;
  }

  return { pendingId: pending.id, email, expiresAt };
}

// ---------------------------------------------------------------------------
// Buyer signup, step 2 — check the code and create the account
// ---------------------------------------------------------------------------
export async function verifyBuyerSignup(input: { pendingId: string; code: string }) {
  const pending = await prisma.pendingSignup.findUnique({
    where: { id: input.pendingId },
  });

  // An unknown id and an expired one are the same thing to the user: the
  // request they were part-way through no longer exists.
  if (!pending || pending.expiresAt.getTime() <= Date.now()) {
    if (pending) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => {});
    }
    throw new ApiError(400, 'This code has expired. Please start again.');
  }

  if (pending.attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
    await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => {});
    throw new ApiError(400, 'Too many incorrect codes. Please start again.');
  }

  if (!signupOtpMatches(input.code, pending.codeHash)) {
    const { attempts } = await prisma.pendingSignup.update({
      where: { id: pending.id },
      data: { attempts: { increment: 1 } },
    });
    const left = SIGNUP_OTP_MAX_ATTEMPTS - attempts;
    // Burning the last attempt ends the flow — say so rather than inviting a
    // sixth try that will only be told to start again.
    if (left <= 0) {
      await prisma.pendingSignup.delete({ where: { id: pending.id } }).catch(() => {});
      throw new ApiError(400, 'Too many incorrect codes. Please start again.');
    }
    throw new ApiError(
      400,
      `That code is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.`,
    );
  }

  // ATOMICALLY CONSUME THE ROW BEFORE CREATING ANYTHING.
  //
  // Everything above this point was decided from a row we READ, and that read
  // is stale the instant it returns. Two things go wrong without a conditional
  // consume here:
  //
  //   1. A resend between the read and now rotated codeHash — so the code we
  //      just accepted has been revoked, and validating it against the value we
  //      read would let a dead code create a real, authenticated account.
  //   2. Several verifications racing on the same row would each pass the
  //      attempts check against the same stale count, then each create a user.
  //
  // deleteMany is a single statement, so exactly one caller can match. Matching
  // on codeHash AND attempts means the delete only succeeds if the row is still
  // in precisely the state we validated — if a resend rotated the code or
  // another request already consumed it, count is 0 and we bail out rather than
  // proceeding on a stale decision.
  const consumed = await prisma.pendingSignup.deleteMany({
    where: {
      id: pending.id,
      codeHash: pending.codeHash,
      attempts: { lt: SIGNUP_OTP_MAX_ATTEMPTS },
    },
  });
  if (consumed.count !== 1) {
    throw new ApiError(400, 'This code has expired. Please start again.');
  }

  // Re-check identifiers: the pending row reserved nothing, so someone may have
  // registered this email or phone during the ten minutes the code was live.
  await assertIdentifiersFree(pending.phone, pending.email);

  // The row is already gone (consumed above), so single-use is guaranteed by
  // construction rather than by remembering to clean up after a success. If this
  // throws — say the email was registered in the last ten minutes and
  // assertIdentifiersFree rejected — the pending signup is spent and the buyer
  // must start again. That is the correct outcome: their address genuinely
  // belongs to someone else now, and a fresh start will tell them so at step 1.
  return createUserAndIssueTokens({
    name: pending.name,
    email: pending.email,
    hashedPassword: pending.password, // already bcrypt — never re-hash
    role: 'BUYER',
    phone: pending.phone,
    country: pending.country,
    currency: pending.currency,
    language: pending.language,
  });
}

// ---------------------------------------------------------------------------
// Buyer signup — send the code again
// ---------------------------------------------------------------------------
// Issues a FRESH code rather than resending the old one, so a code sitting in
// an inbox from an abandoned attempt stops working the moment a new one is
// asked for.
export async function resendBuyerSignupOtp(input: { pendingId: string }) {
  const pending = await prisma.pendingSignup.findUnique({
    where: { id: input.pendingId },
  });
  if (!pending) {
    throw new ApiError(400, 'This code has expired. Please start again.');
  }

  const sinceLastSend = Date.now() - pending.lastSentAt.getTime();
  if (sinceLastSend < SIGNUP_OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((SIGNUP_OTP_RESEND_COOLDOWN_MS - sinceLastSend) / 1000);
    throw new ApiError(429, `Please wait ${wait}s before asking for another code.`);
  }

  const { code, codeHash } = generateSignupOtp();
  const expiresAt = signupOtpExpiry();

  // attempts deliberately NOT reset: resending must not hand an attacker a
  // fresh set of guesses against a code sent to someone else's inbox. Once the
  // cap is hit the flow restarts from scratch with a new pending row.
  await prisma.pendingSignup.update({
    where: { id: pending.id },
    data: { codeHash, expiresAt, lastSentAt: new Date() },
  });

  await sendSignupOtpEmail(
    pending.email,
    pending.name,
    code,
    SIGNUP_OTP_TTL_MS / 60_000,
  );

  return { pendingId: pending.id, email: pending.email, expiresAt };
}

// Expired rows are dead weight — no job runs to clear them, so the start of a
// new signup pays the (indexed, tiny) cost of sweeping them.
export async function pruneExpiredPendingSignups(): Promise<number> {
  const { count } = await prisma.pendingSignup.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Login — Verify credentials and issue tokens
// ---------------------------------------------------------------------------
interface LoginInput {
  identifier: string; // phone or email — one field, we match either column
  password: string;
}

export async function login(input: LoginInput) {
  // 1. Find user by phone OR email (include profiles so client knows
  // onboarding status). Both columns are unique, so at most one row matches.
  // The phone arm matches on the normalized form, so however the user typed
  // their number (spaces, dashes, brackets) it still finds their account. An
  // email identifier normalizes to "", which must never become a lookup arm.
  const identifier = input.identifier.trim();
  const asPhone = normalizePhone(identifier);
  const withProfiles = { farmerProfile: true, buyerProfile: true };

  // Exact match first. People capitalise their own address inconsistently and
  // none of them expect that to be a different account, so a miss falls back to
  // a case-insensitive match — but only as a fallback. Rows created before
  // emails were normalized can differ from each other by case alone, and going
  // case-insensitive first would let an arbitrary one of them answer for the
  // address that was actually typed.
  const user =
    (await prisma.user.findFirst({
      where: {
        OR: [
          ...(asPhone.replace('+', '') ? [{ phone: asPhone }] : []),
          { email: identifier },
        ],
      },
      include: withProfiles,
    })) ??
    (await prisma.user.findFirst({
      where: { email: { equals: identifier, mode: 'insensitive' } },
      // Oldest wins, so a repeat login always lands on the same account
      // instead of whichever row the planner happened to return.
      orderBy: { createdAt: 'asc' },
      include: withProfiles,
    }));

  if (!user) {
    // SECURITY: Don't reveal whether the account exists or not
    // "Invalid credentials" for both cases
    throw new ApiError(401, 'Invalid phone/email or password');
  }

  // 2. Compare provided password with stored hash.
  //
  // A null password means this account has only ever signed in with a phone
  // code — there is nothing to compare against, and bcrypt.compare would throw
  // on the null. Refuse the password path outright, with the same generic
  // message so an attacker learns nothing about which accounts are passwordless.
  if (!user.password) {
    throw new ApiError(401, 'Invalid phone/email or password');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid phone/email or password');
  }

  // Suspended accounts can't start a new session. Checked only after the
  // password is verified so this never leaks which accounts exist.
  if (user.suspended) {
    throw new ApiError(403, 'This account has been suspended. Please contact support.');
  }

  // 3. Generate new tokens
  const tokens = generateTokens(user.id, user.role);

  // 4. Save refresh token
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  const {
    password: _,
    refreshToken: __,
    passwordResetToken: ___,
    passwordResetExpires: ____,
    ...userWithoutSensitiveData
  } = user;

  return {
    user: userWithoutSensitiveData,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Refresh — Get new access token using refresh token
// ---------------------------------------------------------------------------
export async function refresh(refreshToken: string) {
  // 1. Verify the refresh token's signature and expiry
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    // An EXPIRED refresh token is the inactivity timeout firing — the token was
    // genuine, the user just stopped using the app for longer than the window.
    // Say so, so the login screen can explain why they were signed out.
    if (isTokenExpiredError(err)) {
      const mins = config.auth.idleTimeoutMinutes;
      throw new ApiError(
        401,
        `Signed out after ${mins} minute${mins === 1 ? '' : 's'} of inactivity. Please sign in again.`,
        'SESSION_IDLE',
      );
    }
    throw new ApiError(401, 'Invalid refresh token');
  }

  // 2. Find the user and check the stored refresh token matches
  // WHY CHECK THE DATABASE? Even if the token's signature is valid,
  // we need to ensure it hasn't been invalidated (by logout)
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      farmerProfile: true,
      buyerProfile: true,
    },
  });

  if (!user) {
    throw new ApiError(401, 'Refresh token has been revoked');
  }

  // Check suspension BEFORE the token match: suspending clears the stored
  // refreshToken, so a plain token-mismatch check would return 401 "revoked"
  // first and the suspended user would never see the 403 / its reason.
  if (user.suspended) {
    throw new ApiError(403, 'This account has been suspended. Please contact support.');
  }

  if (user.refreshToken !== refreshToken) {
    throw new ApiError(401, 'Refresh token has been revoked');
  }

  // 3. Generate new token pair (token rotation)
  // WHY ROTATE? If an old refresh token is stolen, it becomes useless
  // after the user's next refresh. This limits the window of attack.
  const tokens = generateTokens(user.id, user.role);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  const {
    password: _,
    refreshToken: __,
    passwordResetToken: ___,
    passwordResetExpires: ____,
    ...userWithoutSensitiveData
  } = user;

  return {
    user: userWithoutSensitiveData,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

// ---------------------------------------------------------------------------
// Logout — Invalidate refresh token
// ---------------------------------------------------------------------------
export async function logout(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
}

// ---------------------------------------------------------------------------
// Forgot Password — email a single-use reset link
// ---------------------------------------------------------------------------
// SECURITY: This function NEVER reveals whether the email has an account.
// Unknown email → return silently; the endpoint answers the same 200 either
// way, so an attacker can't use it to enumerate registered addresses.
export async function requestPasswordReset(email: string) {
  // Exact first, then case-insensitive — the same order login uses, so the
  // reset link goes to the account that would actually be logged into.
  const typed = email.trim();
  const user =
    (await prisma.user.findUnique({ where: { email: typed } })) ??
    (await prisma.user.findFirst({
      where: { email: { equals: typed, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
    }));
  // Email is optional since phone became the primary contact — an account
  // without one simply can't use the email reset flow.
  if (!user || !user.email) return;

  const { token, tokenHash } = generateResetToken();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: tokenHash,
      passwordResetExpires: resetTokenExpiry(),
    },
  });

  // The RAW token goes in the link; only its hash is in the database.
  const resetUrl = `${config.clientUrl}/reset-password?token=${token}`;

  // A failed send throws, but the controller swallows it and still answers
  // 200: only real accounts reach this point, so a bubbled 500 would let an
  // attacker distinguish registered emails during an SMTP outage.
  await sendPasswordResetEmail(user.email, user.name, resetUrl);

  await recordAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.password.reset_requested',
    entityType: 'User',
    entityId: user.id,
  });
}

// ---------------------------------------------------------------------------
// Reset Password — consume the emailed token, set a new password
// ---------------------------------------------------------------------------
export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = hashResetToken(token);

  // Expiry is checked in the query itself — an expired token simply won't match.
  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: tokenHash,
      passwordResetExpires: { gt: new Date() },
    },
  });

  if (!user) {
    throw new ApiError(400, 'This reset link is invalid or has expired. Please request a new one.');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      // Single-use: clear the token so the link can't be replayed…
      passwordResetToken: null,
      passwordResetExpires: null,
      // …and log out every existing session. If the password was reset because
      // the account was compromised, this evicts the attacker too.
      refreshToken: null,
    },
  });

  await recordAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.password.reset_completed',
    entityType: 'User',
    entityId: user.id,
  });
}

// ---------------------------------------------------------------------------
// Change Password — logged-in user rotates their own password
// ---------------------------------------------------------------------------
// Requires the CURRENT password even though the user is authenticated: a
// stolen access token alone must not be enough to lock the real owner out.
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // A phone-only account has no password to prove — this call SETS the first
  // one rather than rotating an existing one. The caller is already
  // authenticated, and the real owner keeps their way in either way, since
  // phone sign-in never stops working.
  if (user.password) {
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  // Rotate the session: storing a fresh refresh token invalidates every
  // previously issued one — if the password is being changed because a token
  // was stolen, the thief is evicted, while THIS session stays alive because
  // the controller hands the new pair back to the caller.
  const tokens = generateTokens(user.id, user.role);

  // Also clear any pending reset token — the user just proved they know the
  // password, so an older "forgot password" link shouldn't stay live.
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashedPassword,
      refreshToken: tokens.refreshToken,
      passwordResetToken: null,
      passwordResetExpires: null,
    },
  });

  await recordAudit({
    actorId: user.id,
    actorRole: user.role,
    action: 'auth.password.changed',
    entityType: 'User',
    entityId: user.id,
  });

  return tokens;
}

// ---------------------------------------------------------------------------
// Delete Account — the user erases themselves
// ---------------------------------------------------------------------------
// Requires the CURRENT password even though the caller is authenticated — a
// stolen access token alone must not be enough to destroy an account (same
// reasoning as changePassword).
//
// Deletion is refused while any deal still has money in flight (awaiting
// payment / escrow): the counterparty's deal must settle or refund first.
//
// Transactions are immutable financial records whose listing/bid/farmer/buyer
// FKs deliberately do NOT cascade, so there are two shapes:
//   - never transacted → hard-delete the user row; profiles, agent config,
//     bids, and notifications cascade with it.
//   - has settled deals → the rows a Transaction points at survive, but every
//     personal field and credential is scrubbed: the user becomes an
//     anonymous shell ("Deleted account", unusable email, scrambled password,
//     all sessions revoked), transacted listings leave the market (EXPIRED),
//     and the buyer profile, notifications, and bank details are removed.
// Either way, untransacted listings and bids go first — they cascade the
// bids/negotiations hanging off them, which also frees the agent config's
// negotiation references so it can cascade (or be safely switched off).
export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { farmerProfile: true },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // The platform must never orphan itself of its admins.
  if (user.role === 'ADMIN') {
    throw new ApiError(403, 'Admin accounts cannot be deleted from the app');
  }

  // Deleting an account is irreversible, so it needs proof beyond a live
  // session. A phone-only account has no password to check, and accepting the
  // access token alone would let a stolen one destroy the account — so ask
  // them to set a password first (change-password does that in one step).
  if (!user.password) {
    throw new ApiError(
      400,
      'Set a password before deleting your account — it is how we confirm the request is really you.',
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Password is incorrect');
  }

  const openDeals = await prisma.transaction.count({
    where: {
      OR: [{ farmerId: userId }, { buyerId: userId }],
      paymentStatus: { in: ['AWAITING_PAYMENT', 'ESCROW'] },
    },
  });
  if (openDeals > 0) {
    throw new ApiError(
      409,
      'You have deals with money still in escrow. Settle or refund them first, then delete your account.',
    );
  }

  const settledDeals = await prisma.transaction.count({
    where: { OR: [{ farmerId: userId }, { buyerId: userId }] },
  });

  // Upload paths of the listings about to be hard-deleted — cleaned from
  // storage after the commit. Transacted listings keep their images (the
  // transaction detail page still renders them).
  const removableListingImages = user.farmerProfile
    ? (
        await prisma.listing.findMany({
          where: { farmerId: user.farmerProfile.id, transactions: { none: {} } },
          select: { images: true },
        })
      ).flatMap((l) => l.images)
    : [];

  const scrambledPassword = await bcrypt.hash(randomUUID(), 12);

  await prisma.$transaction(async (tx) => {
    if (user.farmerProfile) {
      // Never-transacted lots can go; sold lots are pinned by Transaction FKs,
      // so they stay but leave the market.
      await tx.listing.deleteMany({
        where: { farmerId: user.farmerProfile.id, transactions: { none: {} } },
      });
      await tx.listing.updateMany({
        where: { farmerId: user.farmerProfile.id },
        data: { status: 'EXPIRED' },
      });
    }
    await tx.bid.deleteMany({ where: { buyerId: userId, transaction: null } });

    if (settledDeals === 0) {
      await tx.user.delete({ where: { id: userId } });
    } else {
      // The farmer profile must survive when transacted listings cascade from
      // it — scrub its sensitive fields instead of deleting the row.
      if (user.farmerProfile) {
        await tx.farmerProfile.update({
          where: { userId },
          data: { bankDetails: Prisma.DbNull, fpoName: null, apmcLicense: null },
        });
      }
      await tx.buyerProfile.deleteMany({ where: { userId } });
      // Negotiations on settled deals may still reference the agent config —
      // switch it off instead of deleting.
      await tx.agentConfig.updateMany({
        where: { userId },
        data: { active: false, autoNegotiate: false },
      });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted account',
          email: `deleted-${userId}@cropbid.invalid`,
          password: scrambledPassword,
          phone: null,
          location: null,
          avatar: null,
          refreshToken: null,
          passwordResetToken: null,
          passwordResetExpires: null,
        },
      });
    }
  });

  // Best-effort upload cleanup — removeImage never throws.
  if (user.avatar) void removeImage(user.avatar);
  for (const img of removableListingImages) void removeImage(img);

  await recordAudit({
    actorId: userId,
    actorRole: user.role,
    action: 'auth.account.deleted',
    entityType: 'User',
    entityId: userId,
    metadata: { anonymized: settledDeals > 0 },
  });
}

// ---------------------------------------------------------------------------
// Update Avatar — persist the path of a photo uploaded via POST /me/avatar
// ---------------------------------------------------------------------------
// The upload middleware has already validated, squared, and stored the image;
// this just points the user at it. Returns the same shape as getCurrentUser.

// Replaced avatars stay publicly accessible (and accumulate) forever unless
// deleted — removeImage handles both backends (local uploads/ and Cloudinary).

export async function updateAvatar(userId: string, avatarPath: string) {
  const previous = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatar: avatarPath },
    include: {
      farmerProfile: true,
      buyerProfile: true,
    },
  });

  // DB write succeeded — the old image is orphaned now; clean it up.
  // Fire-and-forget: removeImage never throws.
  if (previous?.avatar && previous.avatar !== avatarPath) {
    void removeImage(previous.avatar);
  }

  const {
    password: _,
    refreshToken: __,
    passwordResetToken: ___,
    passwordResetExpires: ____,
    ...userWithoutSensitiveData
  } = user;
  return userWithoutSensitiveData;
}

// ---------------------------------------------------------------------------
// Get Current User — Return full profile data
// ---------------------------------------------------------------------------
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      farmerProfile: true,
      buyerProfile: true,
    },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const {
    password: _,
    refreshToken: __,
    passwordResetToken: ___,
    passwordResetExpires: ____,
    ...userWithoutSensitiveData
  } = user;
  return userWithoutSensitiveData;
}

// ---------------------------------------------------------------------------
// Complete Onboarding — submit a PARTNER APPLICATION (seller or buyer)
// ---------------------------------------------------------------------------
// Since the approval gate landed, "onboarding" no longer activates an account:
// it files an application. The profile row is created with status SUBMITTED
// and the user sees /partner/status — never a dashboard — until an admin
// approves it (admin.service.ts reviewPartnerApplication).
//
// Resubmission uses the same call: when a reviewer sends an application back
// (NEEDS_INFO) or rejects it, the applicant may edit and submit again. Any
// other existing status still 409s, so an approved partner can't overwrite
// their reviewed application through this endpoint.
interface FarmerOnboardingInput {
  sellerType?: 'FARMER' | 'LOCAL_SHOP' | 'WHOLESALER';
  farmSizeAcres?: number;
  cropsGrown?: string[];
  state: string;
  country?: string;
  fpoName?: string;
  apmcLicense?: string;
  organicCertified?: boolean;
  certificationBody?: string;
  businessName?: string;
  shopType?: string;
  address?: string;
  fssaiLicense?: string;
  gstin?: string;
  minOrderValue?: number;
  leadTimeDays?: number;
}

interface BuyerOnboardingInput {
  companyName: string;
  companyType: 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER' | 'WHOLESALER' | 'SMALL_BUSINESS';
  country?: string;
  taxId?: string;
  annualProcurementVolume?: string;
  outletCount?: number;
}

// Statuses an applicant is allowed to overwrite with a fresh submission.
// Typed as the enum rather than string[] so it can go straight into a Prisma
// `status: { in: ... }` filter — which is where the check now lives.
const RESUBMITTABLE: PartnerStatus[] = ['NEEDS_INFO', 'REJECTED'];

// What each seller type must provide. Field-level shape is enforced by zod in
// the controller; THIS is the cross-field business rule (which fields matter
// for which type), so it lives with the rest of the domain logic.
function validateSellerApplication(input: FarmerOnboardingInput): void {
  const type = input.sellerType || 'FARMER';
  if (type === 'FARMER') {
    if (!input.farmSizeAcres || input.farmSizeAcres <= 0) {
      throw new ApiError(400, 'Farm size is required for a farmer application');
    }
    if (!input.cropsGrown || input.cropsGrown.length === 0) {
      throw new ApiError(400, 'Select at least one crop you grow');
    }
  } else {
    if (!input.businessName?.trim()) {
      throw new ApiError(400, type === 'LOCAL_SHOP' ? 'Shop name is required' : 'Firm name is required');
    }
    if (type === 'LOCAL_SHOP') {
      if (!input.shopType?.trim()) throw new ApiError(400, 'Pick what kind of shop you run');
      if (!input.address?.trim()) throw new ApiError(400, 'Shop address is required');
      // Food on a consumer shelf needs a licence behind it — non-negotiable.
      if (!input.fssaiLicense?.trim()) throw new ApiError(400, 'FSSAI licence number is required for a food shop');
    }
    if (type === 'WHOLESALER' && !input.gstin?.trim()) {
      throw new ApiError(400, 'GSTIN is required for a wholesale application');
    }
  }
}

export async function completeFarmerOnboarding(userId: string, input: FarmerOnboardingInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'FARMER') {
    throw new ApiError(403, 'Only seller accounts can submit a seller application');
  }

  validateSellerApplication(input);

  const data = {
    sellerType: input.sellerType || ('FARMER' as const),
    farmSizeAcres: input.farmSizeAcres ?? null,
    cropsGrown: input.cropsGrown ?? [],
    state: input.state,
    country: input.country || user.country || 'India',
    fpoName: input.fpoName || null,
    apmcLicense: input.apmcLicense || null,
    organicCertified: input.organicCertified || false,
    certificationBody: input.certificationBody || null,
    businessName: input.businessName?.trim() || null,
    shopType: input.shopType || null,
    address: input.address?.trim() || null,
    fssaiLicense: input.fssaiLicense?.trim() || null,
    gstin: input.gstin?.trim() || null,
    minOrderValue: input.minOrderValue ?? null,
    leadTimeDays: input.leadTimeDays ?? null,
  };

  const existing = await prisma.farmerProfile.findUnique({ where: { userId } });

  if (existing) {
    if (!RESUBMITTABLE.includes(existing.status)) {
      throw new ApiError(409, 'Seller application already exists');
    }
    // Conditioned on the status, not just checked against it. An admin
    // reviewing this application at the same moment commits a decision that a
    // plain update-by-userId would silently overwrite, leaving SUBMITTED
    // sitting on top of the reviewer, the audit row and the notification that
    // say otherwise. Losing the race means the decision landed first, and the
    // applicant is told so.
    const claimed = await prisma.farmerProfile.updateMany({
      where: { userId, status: { in: RESUBMITTABLE } },
      data: { ...data, status: 'SUBMITTED', submittedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'Seller application already exists');
    }
    const profile = await prisma.farmerProfile.findUniqueOrThrow({ where: { userId } });
    await recordAudit({
      actorId: userId, actorRole: 'FARMER',
      action: 'partner.application.resubmit',
      entityType: 'FarmerProfile', entityId: profile.id,
      metadata: { sellerType: data.sellerType, previousStatus: existing.status },
    });
    return profile;
  }

  const profile = await prisma.farmerProfile.create({
    data: { userId, ...data },
  });
  await recordAudit({
    actorId: userId, actorRole: 'FARMER',
    action: 'partner.application.submit',
    entityType: 'FarmerProfile', entityId: profile.id,
    metadata: { sellerType: data.sellerType },
  });
  return profile;
}

// ---------------------------------------------------------------------------
// Update Farmer Profile — edit account + farm details after onboarding
// ---------------------------------------------------------------------------
// Unlike onboarding (which CREATES the profile once), this patches the fields a
// farmer can change later: their contact info on the User row and the farm
// details on the FarmerProfile row. Every field is optional — only the keys the
// client sends are written, so a partial form never clears untouched columns.
interface UpdateFarmerProfileInput {
  name?: string;
  phone?: string | null;
  location?: string | null;
  language?: UserLanguage;
  farmSizeAcres?: number;
  cropsGrown?: string[];
  state?: string;
}

export async function updateFarmerProfile(userId: string, input: UpdateFarmerProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { farmerProfile: true },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (user.role !== 'FARMER') {
    throw new ApiError(403, 'Only farmers can update a farmer profile');
  }
  if (!user.farmerProfile) {
    throw new ApiError(400, 'Complete your farmer profile before editing it');
  }

  // Split the payload across the two tables, keeping only the keys present.
  const userData: {
    name?: string;
    phone?: string | null;
    location?: string | null;
    language?: UserLanguage;
  } = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;
  if (input.language !== undefined) userData.language = input.language;

  const profileData: { farmSizeAcres?: number; cropsGrown?: string[]; state?: string } = {};
  if (input.farmSizeAcres !== undefined) profileData.farmSizeAcres = input.farmSizeAcres;
  if (input.cropsGrown !== undefined) profileData.cropsGrown = input.cropsGrown;
  if (input.state !== undefined) profileData.state = input.state;

  // One transaction so the two rows never drift if the second write fails.
  await prisma.$transaction([
    ...(Object.keys(userData).length
      ? [prisma.user.update({ where: { id: userId }, data: userData })]
      : []),
    ...(Object.keys(profileData).length
      ? [prisma.farmerProfile.update({ where: { userId }, data: profileData })]
      : []),
  ]);

  // Return the same shape as GET /me so the client can swap its user in place.
  return getCurrentUser(userId);
}

// ---------------------------------------------------------------------------
// Update Buyer Profile — edit account + company details after onboarding
// ---------------------------------------------------------------------------
// Buyer twin of updateFarmerProfile: patches contact info on the User row and
// company details on the BuyerProfile row. Only keys present in the payload
// are written, so a partial form never clears untouched columns.
interface UpdateBuyerProfileInput {
  name?: string;
  phone?: string | null;
  location?: string | null;
  language?: UserLanguage;
  companyName?: string;
  companyType?: 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
  taxId?: string | null;
  annualProcurementVolume?: string | null;
}

export async function updateBuyerProfile(userId: string, input: UpdateBuyerProfileInput) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { buyerProfile: true },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (user.role !== 'BUYER') {
    throw new ApiError(403, 'Only buyers can update a buyer profile');
  }
  if (!user.buyerProfile) {
    throw new ApiError(400, 'Complete your buyer profile before editing it');
  }

  const userData: {
    name?: string;
    phone?: string | null;
    location?: string | null;
    language?: UserLanguage;
  } = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;
  if (input.language !== undefined) userData.language = input.language;

  const profileData: {
    companyName?: string;
    companyType?: 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
    taxId?: string | null;
    annualProcurementVolume?: string | null;
  } = {};
  if (input.companyName !== undefined) profileData.companyName = input.companyName;
  if (input.companyType !== undefined) profileData.companyType = input.companyType;
  if (input.taxId !== undefined) profileData.taxId = input.taxId;
  if (input.annualProcurementVolume !== undefined) {
    profileData.annualProcurementVolume = input.annualProcurementVolume;
  }

  // One transaction so the two rows never drift if the second write fails.
  await prisma.$transaction([
    ...(Object.keys(userData).length
      ? [prisma.user.update({ where: { id: userId }, data: userData })]
      : []),
    ...(Object.keys(profileData).length
      ? [prisma.buyerProfile.update({ where: { userId }, data: profileData })]
      : []),
  ]);

  return getCurrentUser(userId);
}

// ---------------------------------------------------------------------------
// Update Account Basics — name/phone/location only (used for ADMIN accounts,
// which have no farmer/buyer profile to patch)
// ---------------------------------------------------------------------------
interface UpdateAccountBasicsInput {
  name?: string;
  phone?: string | null;
  location?: string | null;
  language?: UserLanguage;
}

export async function updateAccountBasics(userId: string, input: UpdateAccountBasicsInput) {
  const userData: UpdateAccountBasicsInput = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;
  if (input.language !== undefined) userData.language = input.language;

  if (Object.keys(userData).length) {
    await prisma.user.update({ where: { id: userId }, data: userData });
  }

  return getCurrentUser(userId);
}

export async function completeBuyerOnboarding(userId: string, input: BuyerOnboardingInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'BUYER') {
    throw new ApiError(403, 'Only buyer accounts can submit a buyer application');
  }

  const data = {
    companyName: input.companyName,
    companyType: input.companyType,
    country: input.country || user.country || 'India',
    taxId: input.taxId || null,
    annualProcurementVolume: input.annualProcurementVolume || null,
    outletCount: input.outletCount ?? null,
  };

  const existing = await prisma.buyerProfile.findUnique({ where: { userId } });

  if (existing) {
    if (!RESUBMITTABLE.includes(existing.status)) {
      throw new ApiError(409, 'Buyer application already exists');
    }
    // Conditioned on the status, not just checked against it. An admin
    // reviewing this application at the same moment commits a decision that a
    // plain update-by-userId would silently overwrite, leaving SUBMITTED
    // sitting on top of the reviewer, the audit row and the notification that
    // say otherwise. Losing the race means the decision landed first, and the
    // applicant is told so.
    const claimed = await prisma.buyerProfile.updateMany({
      where: { userId, status: { in: RESUBMITTABLE } },
      data: { ...data, status: 'SUBMITTED', submittedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'Buyer application already exists');
    }
    const profile = await prisma.buyerProfile.findUniqueOrThrow({ where: { userId } });
    await recordAudit({
      actorId: userId, actorRole: 'BUYER',
      action: 'partner.application.resubmit',
      entityType: 'BuyerProfile', entityId: profile.id,
      metadata: { companyType: data.companyType, previousStatus: existing.status },
    });
    return profile;
  }

  const profile = await prisma.buyerProfile.create({
    data: { userId, ...data },
  });
  await recordAudit({
    actorId: userId, actorRole: 'BUYER',
    action: 'partner.application.submit',
    entityType: 'BuyerProfile', entityId: profile.id,
    metadata: { companyType: data.companyType },
  });
  return profile;
}

// ===========================================================================
// PHONE SIGN-IN — the passwordless front door
// ===========================================================================
// One flow covers signing up and signing in, because to the person typing
// their number there is no difference: the code proves the number, and the
// account is either found or created. This is the ONLY auth path the consumer
// UI offers, and the partner flow uses it too (with an intendedRole) so a
// password is never asked for anywhere.
//
// Passwords are not gone from the codebase: accounts that already have one
// (admins created by prisma/createAdmin.ts, anyone who signed up before this)
// can still use /auth/login. New accounts made here simply have none.

// Roles someone may claim for themselves. ADMIN is absent on purpose and must
// stay that way — it is granted by running createAdmin.ts against the database,
// never by anything reachable from the internet. FARMER and BUYER are safe to
// self-assign because both land behind the partner approval gate.
const SELF_ASSIGNABLE_ROLES = ['CONSUMER', 'FARMER', 'BUYER'] as const;
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

export async function pruneExpiredPhoneChallenges(): Promise<number> {
  const { count } = await prisma.phoneChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Step 1 — send a code to the handset
// ---------------------------------------------------------------------------
export async function startPhoneSignIn(input: {
  phone: string;
  intendedRole?: SelfAssignableRole;
  /** Where to send the code if WhatsApp cannot reach the number. */
  email?: string;
}) {
  const phone = normalizePhone(input.phone);
  if (phone.replace(/[^0-9]/g, '').length < 7) {
    throw new ApiError(400, 'Enter a valid phone number');
  }

  const intendedRole = SELF_ASSIGNABLE_ROLES.includes(input.intendedRole as SelfAssignableRole)
    ? (input.intendedRole as SelfAssignableRole)
    : 'CONSUMER';

  // A suspended account must not be able to pull a fresh code — the number is
  // checked here rather than at verification so the block is immediate.
  const existing = await prisma.user.findUnique({
    where: { phone },
    select: { suspended: true, email: true, name: true },
  });
  if (existing?.suspended) {
    throw new ApiError(403, 'This account has been suspended. Please contact support.');
  }

  // The email fallback prefers an address the person just typed, and otherwise
  // uses the one already on the account. A returning shopper therefore never
  // has to retype it, and a new number can still rescue itself by supplying one.
  const fallbackEmail = input.email ? normalizeEmail(input.email) || null : existing?.email ?? null;

  // Opportunistic sweep, same reasoning as pruneExpiredPendingSignups: cheap
  // indexed range delete, no scheduler in this codebase to run it otherwise.
  await pruneExpiredPhoneChallenges();

  // Cooldown before minting anything, so hammering "resend" cannot flood a
  // stranger's phone with our SMS.
  const live = await prisma.phoneChallenge.findUnique({ where: { phone } });
  if (live) {
    const sinceLastSend = Date.now() - live.lastSentAt.getTime();
    if (sinceLastSend < PHONE_OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((PHONE_OTP_RESEND_COOLDOWN_MS - sinceLastSend) / 1000);
      throw new ApiError(429, `Please wait ${wait}s before asking for another code`);
    }
  }

  const { code, codeHash } = generatePhoneOtp();
  const expiresAt = phoneOtpExpiry();

  // Upsert on phone: a resend REPLACES the live code, so one number never has
  // two valid codes at once.
  const challenge = await prisma.phoneChallenge.upsert({
    where: { phone },
    create: { phone, codeHash, intendedRole, expiresAt, email: fallbackEmail },
    update: {
      codeHash, intendedRole, expiresAt, email: fallbackEmail,
      attempts: 0, lastSentAt: new Date(),
    },
  });

  // A failed send is not swallowed — the person would be staring at a code box
  // with nothing to type. Scoped to OUR codeHash so a failure here can never
  // delete a row that holds a code someone else's request already delivered.
  let delivery;
  try {
    delivery = await deliverOtp({
      phone,
      code,
      ttlMinutes: PHONE_OTP_TTL_MS / 60_000,
      email: fallbackEmail,
      name: existing?.name ?? null,
    });
  } catch (err) {
    await prisma.phoneChallenge.deleteMany({ where: { id: challenge.id, codeHash } }).catch(() => {});
    // 422 rather than 500: "we could not reach that number, give us an email"
    // is something the person can act on, not a server fault.
    if (err instanceof OtpDeliveryError) {
      throw new ApiError(422, err.message, err.needsEmail ? 'NEEDS_EMAIL' : undefined);
    }
    throw err;
  }

  // Record which channel won, so a resend and the code screen agree with each
  // other about where the person should be looking.
  await prisma.phoneChallenge
    .update({ where: { id: challenge.id }, data: { channel: delivery.channel } })
    .catch(() => {});

  return {
    challengeId: challenge.id,
    phone,
    expiresAt,
    channel: delivery.channel,
    sentTo: delivery.sentTo,
    // Tells the client whether to ask for a name after the code — a returning
    // shopper should never be asked again. Not sensitive: anyone can discover
    // the same thing by attempting a signup with the number.
    isNewAccount: !existing,
  };
}

// ---------------------------------------------------------------------------
// Step 2 — check the code, then sign in or create the account
// ---------------------------------------------------------------------------
export async function verifyPhoneSignIn(input: { challengeId: string; code: string; name?: string }) {
  const challenge = await prisma.phoneChallenge.findUnique({ where: { id: input.challengeId } });

  // An unknown id and an expired one are the same thing to the user: whatever
  // they were holding is no longer usable, so start again.
  if (!challenge || challenge.expiresAt < new Date()) {
    if (challenge) await prisma.phoneChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    throw new ApiError(400, 'That code has expired — start again to get a new one');
  }

  // Claim an attempt BEFORE checking the code, in one statement that carries
  // the ceiling in its own WHERE. Reading `attempts` and then incrementing it
  // is not the same thing: a burst of parallel guesses all read the same zero,
  // all pass the check, and three tries at a six-digit code quietly becomes as
  // many as the attacker can open sockets for. The rate limiter does not cover
  // this either — its account key has no `challengeId` in it, so guesses from
  // different IPs never share a bucket.
  //
  // As an UPDATE with the condition inline, Postgres re-evaluates `attempts <
  // MAX` after taking the row lock, so the loser of a race sees the winner's
  // committed value and matches zero rows.
  const claimed = await prisma.phoneChallenge.updateMany({
    where: { id: challenge.id, attempts: { lt: PHONE_OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await prisma.phoneChallenge.delete({ where: { id: challenge.id } }).catch(() => {});
    throw new ApiError(429, 'Too many wrong codes — start again to get a new one');
  }

  if (!phoneOtpMatches(input.code, challenge.codeHash)) {
    const after = await prisma.phoneChallenge.findUnique({
      where: { id: challenge.id },
      select: { attempts: true },
    });
    const left = PHONE_OTP_MAX_ATTEMPTS - (after?.attempts ?? PHONE_OTP_MAX_ATTEMPTS);
    throw new ApiError(
      400,
      left > 0 ? `That code is not right — ${left} ${left === 1 ? 'try' : 'tries'} left` : 'Too many wrong codes — start again to get a new one',
    );
  }

  // The code was right, so hand the claimed attempt back: `attempts` counts
  // wrong guesses, and the claim above exists only to make the ceiling atomic.
  // This matters for the name check below, which deliberately leaves the
  // challenge alive — three correct-but-nameless submissions must not burn a
  // code that is still perfectly valid.
  await prisma.phoneChallenge
    .update({ where: { id: challenge.id }, data: { attempts: { decrement: 1 } } })
    .catch(() => {});

  const existing = await prisma.user.findUnique({
    where: { phone: challenge.phone },
    include: { farmerProfile: true, buyerProfile: true },
  });

  // A new account needs a name, and the client may not have asked for one yet.
  // Check BEFORE spending the challenge: consuming a correct code and then
  // refusing it would force someone to request a whole new SMS just because a
  // field was blank. The code stays valid until its own TTL runs out.
  const name = input.name?.trim();
  if (!existing && (!name || name.length < 2)) {
    throw new ApiError(400, 'Tell us your name to finish creating your account');
  }

  // Correct code, and everything needed is present: the challenge is spent.
  //
  // The delete is the thing that makes the code single-use, so it decides who
  // continues rather than being tidy-up after the fact. Two requests carrying
  // the same correct code both get past the check above, and a swallowed delete
  // let both go on to mint tokens — and, on the signup path, to race over
  // creating the same account. Whoever's DELETE removes the row won.
  const spent = await prisma.phoneChallenge.deleteMany({ where: { id: challenge.id } });
  if (spent.count === 0) {
    throw new ApiError(400, 'That code has already been used — start again to get a new one');
  }

  // --- Returning account: just issue a session ---
  if (existing) {
    if (existing.suspended) {
      throw new ApiError(403, 'This account has been suspended. Please contact support.');
    }

    const tokens = generateTokens(existing.id, existing.role);
    await prisma.user.update({ where: { id: existing.id }, data: { refreshToken: tokens.refreshToken } });

    const {
      password: _, refreshToken: __, passwordResetToken: ___, passwordResetExpires: ____,
      ...user
    } = existing;

    return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, created: false };
  }

  // --- New account (name was validated above, before the challenge was spent) ---
  // No password column is written at all — this account signs in by code only
  // until someone sets a password from settings.
  const created = await prisma.user
    .create({
      data: {
        // Non-null: the guard above rejects a new account without one.
        name: name!,
        phone: challenge.phone,
        role: challenge.intendedRole,
        country: 'India',
      },
      include: { farmerProfile: true, buyerProfile: true },
    })
    .catch((err) => {
      // Two codes verified for the same number at once — the unique index picks
      // a winner and the loser gets the same message as any other stale attempt.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError(409, 'That number was just registered — try signing in again');
      }
      throw err;
    });

  const tokens = generateTokens(created.id, created.role);
  await prisma.user.update({ where: { id: created.id }, data: { refreshToken: tokens.refreshToken } });

  await recordAudit({
    actorId: created.id,
    actorRole: created.role,
    action: 'auth.phone.signup',
    entityType: 'User',
    entityId: created.id,
    metadata: { role: created.role },
  });

  const {
    password: _, refreshToken: __, passwordResetToken: ___, passwordResetExpires: ____,
    ...user
  } = created;

  return { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, created: true };
}
