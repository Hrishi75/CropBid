-- Phone becomes the primary contact/login identifier; email becomes optional.

-- 1. Email no longer required (unique index already allows NULLs in Postgres)
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- 2. Normalize stored phones to the same form auth.service.normalizePhone()
--    writes and looks up: separators stripped, a leading "+" preserved. Without
--    this, existing rows like '+91-9876543210' would never match a login typed
--    as '+919876543210'.
--    btrim mirrors the .trim() the TS helper does before inspecting the "+".
UPDATE "User"
SET "phone" =
  (CASE WHEN btrim("phone") LIKE '+%' THEN '+' ELSE '' END)
  || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phone" IS NOT NULL;

-- 3. Dedupe phones before adding the unique index (normalizing in step 2 can
--    itself collapse two spellings into one value): keep each phone on the
--    oldest account, null it out on newer duplicates so the index can build.
--    Those accounts keep working via email login and can re-add a phone later.
UPDATE "User" SET "phone" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "createdAt" ASC) AS rn
    FROM "User"
    WHERE "phone" IS NOT NULL
  ) dupes
  WHERE dupes.rn > 1
);

-- 4. One account per phone number
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
