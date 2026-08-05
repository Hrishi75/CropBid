-- Stored translations for user-written descriptions.
--
-- Written fire-and-forget after the row is saved; all nullable, because every
-- one of them may legitimately never arrive (Sarvam unconfigured, over quota,
-- down, or the text too long to translate without truncating it). Readers fall
-- back to the original `description`.
--
-- Separate from the migration that adds Language.MR: Postgres will not let a
-- newly added enum value be USED in the same transaction that adds it, and
-- these columns reference the type.
ALTER TABLE "Listing"
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "descriptionHi" TEXT,
  ADD COLUMN "descriptionMr" TEXT,
  ADD COLUMN "descriptionLang" "Language";

ALTER TABLE "BuyerRequirement"
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "descriptionHi" TEXT,
  ADD COLUMN "descriptionMr" TEXT,
  ADD COLUMN "descriptionLang" "Language";

-- The backfill script and the worker both look for rows that have text but no
-- recorded source language. Partial index so it stays small as rows complete.
CREATE INDEX "Listing_untranslated_idx"
  ON "Listing" ("createdAt")
  WHERE "descriptionLang" IS NULL AND "description" IS NOT NULL;

CREATE INDEX "BuyerRequirement_untranslated_idx"
  ON "BuyerRequirement" ("createdAt")
  WHERE "descriptionLang" IS NULL AND "description" IS NOT NULL;
