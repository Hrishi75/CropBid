-- Business identifiers a partner application now asks for. All nullable:
-- applications filed before this have none, and the rule that they are
-- required lives in the service, at submission.
ALTER TABLE "FarmerProfile" ADD COLUMN "pan" TEXT;

ALTER TABLE "BuyerProfile" ADD COLUMN "pan" TEXT,
ADD COLUMN "fssaiLicense" TEXT,
ADD COLUMN "iecCode" TEXT;
