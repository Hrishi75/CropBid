-- When support last reset a password. A session allowed to skip the
-- current-password check carries this value, so a token from an earlier reset
-- cannot be used as proof for a later one.
--
-- A nullable column with no default: nothing to backfill, and the old code,
-- which never writes it, keeps working while the migration runs (CLAUDE.md §7).
ALTER TABLE "User" ADD COLUMN "passwordResetAt" TIMESTAMP(3);
