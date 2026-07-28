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
import { prisma } from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { generateResetToken, hashResetToken, resetTokenExpiry } from '../utils/resetToken';
import { ApiError } from '../utils/ApiError';
import { sendPasswordResetEmail } from './email.service';
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
  language?: 'EN' | 'HI';
}

export async function signup(input: SignupInput) {
  // 0. Buyers must have an email on file; farmers and consumers may sign up
  // with a phone alone. The controller's schema rejects this first — repeated
  // here so the rule holds for every caller of the service, not just HTTP.
  const email = input.email ? normalizeEmail(input.email) || undefined : undefined;
  if (input.role === 'BUYER' && !email) {
    throw new ApiError(400, 'Email is required for buyer accounts');
  }

  // 1. Phone is the primary identifier — one account per phone. Email is
  // optional for non-buyers but must always be unique when provided.
  const phone = normalizePhone(input.phone);
  const existingPhone = await prisma.user.findUnique({
    where: { phone },
  });
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

  // 2. Hash the password
  // Cost factor 12 ≈ 250ms — slow enough to resist brute-force,
  // fast enough not to annoy users
  const hashedPassword = await bcrypt.hash(input.password, 12);

  // 3. Create the user. Two concurrent signups can both pass the pre-check
  // above; the unique index on email decides the race, so map the loser's
  // P2002 to the same 409 instead of letting it surface as a 500.
  const user = await prisma.user
    .create({
      data: {
        name: input.name,
        email: email || null,
        password: hashedPassword,
        role: input.role,
        phone,
        country: input.country || 'India',
        currency: input.currency || 'INR',
        language: input.language || 'EN',
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

  // 4. Generate JWT tokens
  const tokens = generateTokens(user.id, user.role);

  // 5. Save the refresh token in the database
  // WHY? So we can invalidate it on logout (set to null)
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: tokens.refreshToken },
  });

  // 6. Return user data (WITHOUT password) and tokens
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

  // 2. Compare provided password with stored hash
  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid phone/email or password');
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
  } catch {
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

  if (!user || user.refreshToken !== refreshToken) {
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

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Current password is incorrect');
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
// Complete Onboarding — Create farmer or buyer profile
// ---------------------------------------------------------------------------
interface FarmerOnboardingInput {
  farmSizeAcres: number;
  cropsGrown: string[];
  state: string;
  country?: string;
  fpoName?: string;
  apmcLicense?: string;
  organicCertified?: boolean;
  certificationBody?: string;
}

interface BuyerOnboardingInput {
  companyName: string;
  companyType: 'PROCESSOR' | 'FMCG' | 'RESTAURANT' | 'EXPORTER' | 'RETAILER';
  country?: string;
  taxId?: string;
  annualProcurementVolume?: string;
}

export async function completeFarmerOnboarding(userId: string, input: FarmerOnboardingInput) {
  // Check if profile already exists
  const existing = await prisma.farmerProfile.findUnique({
    where: { userId },
  });

  if (existing) {
    throw new ApiError(409, 'Farmer profile already exists');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'FARMER') {
    throw new ApiError(403, 'Only farmers can create a farmer profile');
  }

  const profile = await prisma.farmerProfile.create({
    data: {
      userId,
      farmSizeAcres: input.farmSizeAcres,
      cropsGrown: input.cropsGrown,
      state: input.state,
      country: input.country || user.country || 'India',
      fpoName: input.fpoName || null,
      apmcLicense: input.apmcLicense || null,
      organicCertified: input.organicCertified || false,
      certificationBody: input.certificationBody || null,
    },
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
  const userData: { name?: string; phone?: string | null; location?: string | null } = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;

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

  const userData: { name?: string; phone?: string | null; location?: string | null } = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;

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
}

export async function updateAccountBasics(userId: string, input: UpdateAccountBasicsInput) {
  const userData: UpdateAccountBasicsInput = {};
  if (input.name !== undefined) userData.name = input.name;
  if (input.phone !== undefined) userData.phone = input.phone;
  if (input.location !== undefined) userData.location = input.location;

  if (Object.keys(userData).length) {
    await prisma.user.update({ where: { id: userId }, data: userData });
  }

  return getCurrentUser(userId);
}

export async function completeBuyerOnboarding(userId: string, input: BuyerOnboardingInput) {
  const existing = await prisma.buyerProfile.findUnique({
    where: { userId },
  });

  if (existing) {
    throw new ApiError(409, 'Buyer profile already exists');
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'BUYER') {
    throw new ApiError(403, 'Only buyers can create a buyer profile');
  }

  const profile = await prisma.buyerProfile.create({
    data: {
      userId,
      companyName: input.companyName,
      companyType: input.companyType,
      country: input.country || user.country || 'India',
      taxId: input.taxId || null,
      annualProcurementVolume: input.annualProcurementVolume || null,
    },
  });

  return profile;
}
