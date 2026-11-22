-- A flat handling fee per household shop order, kept by CropBid.
-- Existing orders never charged one, so they keep 0.
ALTER TABLE "RetailOrder" ADD COLUMN "handlingFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
