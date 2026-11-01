-- Who pays for delivery is now a term of a trade deal (utils/freight.ts).
-- Every existing row keeps the old rule: the seller pays.
ALTER TABLE "Listing" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER';
ALTER TABLE "Bid" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER';
ALTER TABLE "Transaction" ADD COLUMN "freightPaidBy" "PaidBy" NOT NULL DEFAULT 'FARMER',
  ADD COLUMN "freightQuote" DOUBLE PRECISION,
  ADD COLUMN "freightQuotedAt" TIMESTAMP(3);
