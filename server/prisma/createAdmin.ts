// =============================================================================
// Admin Account Creator — additive, safe against production
// =============================================================================
// WHY THIS EXISTS
// There is no other way to get an ADMIN account. Signup refuses the role
// (auth.service.ts accepts FARMER | BUYER | CONSUMER only), and prisma/seed.ts
// — the only file that creates one — opens by deleting every table, so it is
// guarded to local databases and can never run against production. That left
// the admin dashboard permanently unreachable on a live deploy. This script
// closes that gap: it writes exactly ONE user row and deletes nothing.
//
// IDEMPOTENT
// Keyed on phone (the primary login identifier). Re-running resets the
// password and re-asserts the ADMIN role on the same account rather than
// creating a second one — which makes this the password-reset path too.
//
// PROMOTING AN EXISTING ACCOUNT
// If the phone already belongs to a FARMER/BUYER/CONSUMER, this promotes it
// to ADMIN. That is deliberate — it is the documented way to turn an account
// you already signed up with into an admin — but it is loud about it, because
// a typo'd phone number would otherwise silently hand a real user's account
// admin rights and lock them out of their own dashboard.
//
// RUN:
//   ADMIN_PHONE=+919000000000 ADMIN_PASSWORD='...' ADMIN_NAME='Your Name' \
//     npx ts-node prisma/createAdmin.ts
//
// ADMIN_EMAIL is optional. Prefer passing the password via the environment
// over typing it inline, so it stays out of your shell history.
// =============================================================================

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter } as any);

/** Host only — a connection string carries the password. */
function targetHost(url: string | undefined): string {
  if (!url) return '(DATABASE_URL is not set)';
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

// Matches the signup rule: at least 8 characters. An admin account is the
// highest-value credential on the platform, so a weak one is refused here
// rather than quietly accepted because this path skips the API's validation.
const MIN_PASSWORD_LENGTH = 8;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set — nothing to connect to.');
    process.exit(1);
  }

  const phone = process.env.ADMIN_PHONE?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'CropBid Admin';
  const email = process.env.ADMIN_EMAIL?.trim() || undefined;

  if (!phone || !password) {
    console.error('❌ ADMIN_PHONE and ADMIN_PASSWORD are both required.');
    console.error(
      "   e.g. ADMIN_PHONE=+919000000000 ADMIN_PASSWORD='...' npx ts-node prisma/createAdmin.ts",
    );
    process.exit(1);
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌ ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }

  console.log('🔑 Creating / updating the admin account');
  console.log(`   target: ${targetHost(process.env.DATABASE_URL)}`);
  console.log('   this script writes one user row — it deletes nothing\n');

  const existing = await prisma.user.findUnique({ where: { phone } });

  if (existing && existing.role !== 'ADMIN') {
    console.log(`⚠️  ${phone} is an existing ${existing.role} account ("${existing.name}").`);
    console.log('   It will be PROMOTED to ADMIN and its password reset.');
    console.log('   If that phone number is a typo, stop now (Ctrl-C).\n');
  }

  const hashed = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { phone },
    // Role and password are re-asserted on update so this doubles as the
    // "I locked myself out" recovery path. Name and email are only set when
    // provided, so a re-run without them doesn't blank existing values.
    update: {
      role: 'ADMIN',
      password: hashed,
      name,
      ...(email ? { email } : {}),
    },
    create: {
      name,
      phone,
      email,
      password: hashed,
      role: 'ADMIN',
      country: 'India',
      trustScore: 100,
    },
    select: { id: true, name: true, phone: true, email: true, role: true },
  });

  console.log(existing ? '✅ Admin account updated' : '✅ Admin account created');
  console.log(`   name:  ${admin.name}`);
  console.log(`   phone: ${admin.phone}`);
  console.log(`   email: ${admin.email ?? '(none)'}`);
  console.log('\n   Sign in with that phone + the password you just set, then open /admin.');
}

main()
  .catch((e) => {
    // A duplicate email lands here: the phone was free but the email belongs
    // to someone else, so the upsert's create failed on the unique constraint.
    if (e?.code === 'P2002') {
      console.error(`❌ ${e.meta?.target ?? 'A unique field'} is already taken by another account.`);
      process.exit(1);
    }
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
