-- Buyer email verification. A buyer signup no longer writes a User row up
-- front: the details park in "PendingSignup" until the emailed 6-digit code is
-- returned, and only then is the account created.
--
-- Nothing here is unique against "User" — that is the point. A pending row
-- reserves no email and no phone, so typing a stranger's address cannot lock
-- that person out of registering it later. The unique index on "email" is
-- within this table only, so a resend or a retyped signup replaces the earlier
-- attempt instead of leaving several live codes for one address.
--
-- No backfill: signups in flight when this deploys have already created their
-- User row through the old path and are unaffected.

-- CreateTable
CREATE TABLE "PendingSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "language" "Language" NOT NULL DEFAULT 'EN',
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingSignup_email_key" ON "PendingSignup"("email");

-- CreateIndex
CREATE INDEX "PendingSignup_expiresAt_idx" ON "PendingSignup"("expiresAt");
