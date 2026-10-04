-- Restaurant requests: counter-offers, negotiate-only requests and repeat
-- orders (CLAUDE.md §9). Added columns are nullable or defaulted, and a new
-- enum value changes no existing row, so the running API is unaffected.
ALTER TYPE "RequirementOfferStatus" ADD VALUE 'COUNTERED' AFTER 'PENDING';

ALTER TABLE "RequirementOffer" ADD COLUMN "buyerCounterPrice" DOUBLE PRECISION;

ALTER TABLE "BuyerRequirement"
  ADD COLUMN "negotiateOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "repeatEveryDays" INTEGER,
  ADD COLUMN "nextRepeatAt" TIMESTAMP(3),
  ADD COLUMN "seriesId" TEXT;

CREATE INDEX "BuyerRequirement_nextRepeatAt_idx" ON "BuyerRequirement"("nextRepeatAt");
