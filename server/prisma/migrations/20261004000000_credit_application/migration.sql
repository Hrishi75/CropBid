-- A business buyer's application for credit to buy produce (CLAUDE.md §9).
-- A new table only, so nothing the running API writes can conflict with it.
CREATE TYPE "CreditApplicationStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'DECLINED');

CREATE TABLE "CreditApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "gstin" TEXT,
    "yearsInBusiness" INTEGER NOT NULL,
    "monthlyPurchase" DOUBLE PRECISION NOT NULL,
    "amountWanted" DOUBLE PRECISION NOT NULL,
    "repaymentDays" INTEGER NOT NULL,
    "purpose" TEXT,
    "contactPhone" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "status" "CreditApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "approvedLimit" DOUBLE PRECISION,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditApplication_userId_key" ON "CreditApplication"("userId");
CREATE INDEX "CreditApplication_status_createdAt_idx" ON "CreditApplication"("status", "createdAt");

ALTER TABLE "CreditApplication" ADD CONSTRAINT "CreditApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
