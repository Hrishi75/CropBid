-- A farm's AgriStack Farmer ID. Nullable and optional: the rule about who may
-- give one lives in the service.
ALTER TABLE "FarmerProfile" ADD COLUMN "farmerId" TEXT;
