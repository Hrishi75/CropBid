-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CONSUMER';

-- AlterTable
-- remainingQuantity starts nullable so existing rows can be backfilled below,
-- then gets locked to NOT NULL once every row has a value.
ALTER TABLE "Listing" ADD COLUMN     "remainingQuantity" DOUBLE PRECISION,
ADD COLUMN     "directSaleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retailPricePerUnit" DOUBLE PRECISION;

-- Backfill: existing listings start with their full quantity remaining
UPDATE "Listing" SET "remainingQuantity" = "quantity" WHERE "remainingQuantity" IS NULL;

ALTER TABLE "Listing" ALTER COLUMN "remainingQuantity" SET NOT NULL;

-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "isDirectPurchase" BOOLEAN NOT NULL DEFAULT false;
