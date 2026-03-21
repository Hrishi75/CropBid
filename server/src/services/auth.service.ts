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
import { ApiError } from '../utils/ApiError';

// ---------------------------------------------------------------------------
// Signup — Create a new user account
// ---------------------------------------------------------------------------
interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: 'FARMER' | 'BUYER';
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
  const { password: _, refreshToken: __, ...userWithoutSensitiveData } = user;

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
  // 1. Find user by email
  const user = await prisma.user.findUnique({
    where: { email: input.email },
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

  const { password: _, refreshToken: __, ...userWithoutSensitiveData } = user;

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

  const { password: _, refreshToken: __, ...userWithoutSensitiveData } = user;

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

  const { password: _, refreshToken: __, ...userWithoutSensitiveData } = user;
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
