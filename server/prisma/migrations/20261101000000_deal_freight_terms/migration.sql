-- Who pays for delivery is now a term of a trade deal (utils/freight.ts).
-- Every existing row keeps the old rule: the seller pays.
ALTER TABLE "Listing" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER';
ALTER TABLE "Bid" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER';
ALTER TABLE "Transaction" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER',
  ADD COLUMN "freightQuote" DOUBLE PRECISION,
  ADD COLUMN "freightQuotedAt" TIMESTAMP(3);

-- Names only between the two sides (CLAUDE.md §2d): a supply-contract batch's
-- generated description used to quote the buyer's delivery address, which the
-- seller reads on the deal. Rewrite the ones already saved to drop it. Only
-- the generated text is matched, so a description a person wrote is untouched.
UPDATE "Listing"
SET "description" = regexp_replace("description", ', batch for .*\.$', ', scheduled batch.')
WHERE "isRequirementFill" = true
  AND "description" LIKE 'Supply contract #%: %, batch for %';
