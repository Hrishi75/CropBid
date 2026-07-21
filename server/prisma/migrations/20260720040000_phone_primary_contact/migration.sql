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

-- 3. Drop phones that carry no digits. Signup previously validated phone as a
--    bare optional string with no format check, so rows like '-' or 'n/a' can
--    exist; step 2 normalizes those to '' (or '+'), a value login can never
--    match and which would still occupy a slot in the unique index below.
--    Audited like every other clear, so the original text stays recoverable.
INSERT INTO "AuditLog" ("id", "actorRole", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  (md5(random()::text || clock_timestamp()::text))::uuid::text,
  'SYSTEM',
  'user.phone.cleared_no_digits',
  'User',
  "id",
  jsonb_build_object(
    'phone', "phone",
    'reason', 'stored phone contained no digits when phone became the unique login identifier'
  ),
  NOW()
FROM "User"
WHERE "phone" IS NOT NULL AND "phone" !~ '[0-9]';

UPDATE "User" SET "phone" = NULL
WHERE "phone" IS NOT NULL AND "phone" !~ '[0-9]';

-- 4. Dedupe phones before adding the unique index (normalizing in step 2 can
--    itself collapse two spellings into one value): keep each phone on the
--    oldest account, null it out on newer duplicates so the index can build.
--    Those accounts keep working via email login and can re-add a phone later.
--
--    Clearing a phone is the only destructive thing this migration does, so
--    record each one in AuditLog FIRST. Nothing is lost silently: the original
--    number stays recoverable from metadata->>'phone' without a DB restore.
--    Query them with:
--      SELECT "entityId", "metadata"->>'phone' FROM "AuditLog"
--      WHERE "action" = 'user.phone.cleared_duplicate';
WITH ranked AS (
  SELECT "id", "phone", ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE "phone" IS NOT NULL
),
dupes AS (
  SELECT "id", "phone" FROM ranked WHERE rn > 1
)
INSERT INTO "AuditLog" ("id", "actorRole", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  -- md5(...)::uuid rather than gen_random_uuid(): same shape, but no dependency
  -- on the server's Postgres version or on pgcrypto being installed.
  (md5(random()::text || clock_timestamp()::text))::uuid::text,
  'SYSTEM',
  'user.phone.cleared_duplicate',
  'User',
  "id",
  jsonb_build_object(
    'phone', "phone",
    'reason', 'duplicate phone number when phone became the unique login identifier'
  ),
  NOW()
FROM dupes;

UPDATE "User" SET "phone" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "phone" ORDER BY "createdAt" ASC) AS rn
    FROM "User"
    WHERE "phone" IS NOT NULL
  ) dupes
  WHERE dupes.rn > 1
);

-- 5. One account per phone number
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
