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
import { prisma } from '../lib/prisma';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { generateResetToken, hashResetToken, resetTokenExpiry } from '../utils/resetToken';
import { ApiError } from '../utils/ApiError';
import { sendPasswordResetEmail } from './email.service';
import { recordAudit } from './audit.service';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Signup — Create a new user account
// ---------------------------------------------------------------------------
interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: 'FARMER' | 'BUYER' | 'CONSUMER';
  phone?: string;
  country?: string;
  currency?: 'INR' | 'USD' | 'EUR' | 'GBP';
  language?: 'EN' | 'HI';
}

export async function signup(input: SignupInput) {
  // 1. Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existingUser) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  // 2. Hash the password
  // Cost factor 12 ≈ 250ms — slow enough to resist brute-force,
  // fast enough not to annoy users
  const hashedPassword = await bcrypt.hash(input.password, 12);

  // 3. Create the user
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashedPassword,
      role: input.role,
      phone: input.phone || null,
      country: input.country || 'India',
      currency: input.currency || 'INR',
      language: input.language || 'EN',
    },
    include: {
      farmerProfile: true,
      buyerProfile: true,
    },
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
  email: string;
  password: string;
}

export async function login(input: LoginInput) {
  // 1. Find user by email (include profiles so client knows onboarding status)
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: {
      farmerProfile: true,
      buyerProfile: true,
    },
  });

  if (!user) {
    // SECURITY: Don't reveal whether the email exists or not
    // "Invalid email or password" for both cases
    throw new ApiError(401, 'Invalid email or password');
  }

  // 2. Compare provided password with stored hash
  const isPasswordValid = await bcrypt.compare(input.password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password');
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
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

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
