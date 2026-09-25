-- An admin can reset a locked-out user's password, and the user must change it
-- at their first sign-in afterwards.
--
-- Safe while the previous API is still serving (CLAUDE.md section 7): this adds
-- a column with a default rather than a constraint over existing rows, so the
-- old code, which never writes it, keeps working and every existing row takes
-- the default.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
