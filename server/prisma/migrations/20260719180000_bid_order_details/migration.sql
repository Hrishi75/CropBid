-- Order fulfilment details captured at bid/purchase time so the seller can
-- arrange delivery and contact the buyer. All nullable — old bids simply
-- have none.
ALTER TABLE "Bid" ADD COLUMN "deliveryAddress" TEXT;
ALTER TABLE "Bid" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "Bid" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "Bid" ADD COLUMN "deliveryTerms" TEXT;
