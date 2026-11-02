-- Credit for every partner, not only buyers: which side applied, and what the
-- money is for. Both columns carry defaults, so existing rows read as what
-- they were (a buyer's stock credit) and the old API keeps writing valid rows
-- while this runs.
CREATE TYPE "CreditSide" AS ENUM ('BUYER', 'SELLER');
CREATE TYPE "CreditUse" AS ENUM ('STOCK', 'CROP', 'INPUTS', 'EQUIPMENT', 'GROW_BUSINESS');

ALTER TABLE "CreditApplication"
  ADD COLUMN "side" "CreditSide" NOT NULL DEFAULT 'BUYER',
  ADD COLUMN "useFor" "CreditUse" NOT NULL DEFAULT 'STOCK';
