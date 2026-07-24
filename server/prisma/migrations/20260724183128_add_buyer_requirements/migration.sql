-- Buyer requirements: the reverse marketplace. A buyer posts demand and farmers
-- either take the posted price outright or counter with their own. Every match
-- materialises a one-shot Listing + pre-ACCEPTED Bid so it flows through the
-- existing escrow/delivery pipeline unchanged — the same trick direct consumer
-- purchases use (see 20260709120000). Listing."isRequirementFill" marks those
-- shadow rows so they never surface as farmer inventory or skew listing stats.
--
-- No backfill needed here, unlike Listing."remainingQuantity" in 20260709120000:
-- "isRequirementFill" has a NOT NULL DEFAULT, so existing rows get false for free.

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('OPEN', 'FULFILLED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequirementOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RequirementOfferKind" AS ENUM ('INSTANT', 'COUNTER');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "isRequirementFill" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BuyerRequirement" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "cropVariety" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "remainingQuantity" DOUBLE PRECISION NOT NULL,
    "unit" "Unit" NOT NULL DEFAULT 'QUINTAL',
    "qualityGrade" "QualityGrade" NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "deliveryLocation" TEXT NOT NULL,
    "deliveryState" TEXT NOT NULL,
    "deliveryCountry" TEXT NOT NULL DEFAULT 'India',
    "neededBy" TIMESTAMP(3),
    "description" TEXT,
    "organic" BOOLEAN NOT NULL DEFAULT false,
    "paymentTerms" TEXT,
    "deliveryTerms" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementOffer" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "kind" "RequirementOfferKind" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "message" TEXT,
    "status" "RequirementOfferStatus" NOT NULL DEFAULT 'PENDING',
    "listingId" TEXT,
    "bidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "RequirementOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuyerRequirement_status_createdAt_idx" ON "BuyerRequirement"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerRequirement_cropName_status_idx" ON "BuyerRequirement"("cropName", "status");

-- CreateIndex
CREATE INDEX "BuyerRequirement_deliveryState_status_idx" ON "BuyerRequirement"("deliveryState", "status");

-- CreateIndex
CREATE INDEX "BuyerRequirement_buyerId_createdAt_idx" ON "BuyerRequirement"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementOffer_listingId_key" ON "RequirementOffer"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementOffer_bidId_key" ON "RequirementOffer"("bidId");

-- CreateIndex
CREATE INDEX "RequirementOffer_requirementId_status_idx" ON "RequirementOffer"("requirementId", "status");

-- CreateIndex
CREATE INDEX "RequirementOffer_farmerId_createdAt_idx" ON "RequirementOffer"("farmerId", "createdAt");

-- AddForeignKey
ALTER TABLE "BuyerRequirement" ADD CONSTRAINT "BuyerRequirement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementOffer" ADD CONSTRAINT "RequirementOffer_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "BuyerRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementOffer" ADD CONSTRAINT "RequirementOffer_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementOffer" ADD CONSTRAINT "RequirementOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementOffer" ADD CONSTRAINT "RequirementOffer_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;
