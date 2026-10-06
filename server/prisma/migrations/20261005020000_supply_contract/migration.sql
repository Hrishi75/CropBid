-- Supply contracts (CLAUDE.md §9). A new table and a nullable column only,
-- so the running API is unaffected while this applies.
-- CreateEnum
CREATE TYPE "SupplyContractStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'DECLINED', 'CANCELLED');
-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "supplyContractId" TEXT;
-- CreateTable
CREATE TABLE "SupplyContract" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "sourceListingId" TEXT,
    "cropName" TEXT NOT NULL,
    "cropVariety" TEXT,
    "unit" "Unit" NOT NULL,
    "qualityGrade" "QualityGrade" NOT NULL,
    "organic" BOOLEAN NOT NULL DEFAULT false,
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "totalQuantity" DOUBLE PRECISION NOT NULL,
    "batchQuantity" DOUBLE PRECISION NOT NULL,
    "everyDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "message" TEXT,
    "status" "SupplyContractStatus" NOT NULL DEFAULT 'PROPOSED',
    "scheduledQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nextBatchAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupplyContract_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "SupplyContract_buyerId_createdAt_idx" ON "SupplyContract"("buyerId", "createdAt");
-- CreateIndex
CREATE INDEX "SupplyContract_farmerId_createdAt_idx" ON "SupplyContract"("farmerId", "createdAt");
-- CreateIndex
CREATE INDEX "SupplyContract_status_nextBatchAt_idx" ON "SupplyContract"("status", "nextBatchAt");
-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_supplyContractId_fkey" FOREIGN KEY ("supplyContractId") REFERENCES "SupplyContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SupplyContract" ADD CONSTRAINT "SupplyContract_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "SupplyContract" ADD CONSTRAINT "SupplyContract_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
