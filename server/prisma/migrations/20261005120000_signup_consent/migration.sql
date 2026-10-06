-- When a person ticked "I am 18 or older and agree to the Terms and Privacy
-- Policy" at sign-up, and which version of those pages it pointed at. Both
-- nullable: accounts made before this have no record, and saying otherwise
-- would be inventing one. Adding nullable columns takes no table rewrite and
-- no constraint over existing rows, so it is safe while the old API runs.
ALTER TABLE "User" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;
