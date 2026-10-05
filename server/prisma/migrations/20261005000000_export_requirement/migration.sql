-- Export details on a buyer's requirement (CLAUDE.md §9). New nullable or
-- defaulted columns only, so the running API keeps working while this applies.
ALTER TABLE "BuyerRequirement"
  ADD COLUMN "forExport" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "exportPort" TEXT,
  ADD COLUMN "maxMoisturePct" DOUBLE PRECISION,
  ADD COLUMN "packing" TEXT,
  ADD COLUMN "requiredDocs" TEXT[] DEFAULT ARRAY[]::TEXT[];
