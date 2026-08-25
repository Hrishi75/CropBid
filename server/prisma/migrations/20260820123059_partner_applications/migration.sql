-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('FARMER', 'LOCAL_SHOP', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CompanyType" ADD VALUE 'WHOLESALER';
ALTER TYPE "CompanyType" ADD VALUE 'SMALL_BUSINESS';

-- AlterTable
ALTER TABLE "BuyerProfile" ADD COLUMN     "outletCount" INTEGER,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "PartnerStatus" NOT NULL DEFAULT 'SUBMITTED',
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN     "address" TEXT,
ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "fssaiLicense" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "minOrderValue" DOUBLE PRECISION,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "sellerType" "SellerType" NOT NULL DEFAULT 'FARMER',
ADD COLUMN     "shopType" TEXT,
ADD COLUMN     "status" "PartnerStatus" NOT NULL DEFAULT 'SUBMITTED',
ADD COLUMN     "statusNote" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "farmSizeAcres" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "BuyerProfile_status_submittedAt_idx" ON "BuyerProfile"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "FarmerProfile_status_submittedAt_idx" ON "FarmerProfile"("status", "submittedAt");

-- Backfill (hand-written): profiles that exist at migration time predate the
-- approval gate — they were already live, so locking them behind SUBMITTED
-- would be a regression. Only applications created after this deploy start
-- at SUBMITTED.
UPDATE "FarmerProfile" SET "status" = 'APPROVED';
UPDATE "BuyerProfile" SET "status" = 'APPROVED';
