-- Where a shop physically is, and how far it will actually go.
--
-- A city is far too coarse to promise same-day delivery on. Nagpur is roughly
-- 220 km2: a shop in Narendra Nagar cannot serve Hingna, 14 km west. The Quick
-- lane filters on real distance, and these columns are what make that possible.
--
-- Coordinates are nullable because every seller onboarded before this has none.
-- A shop whose location is unknown cannot be distance checked, so it is left
-- out of the Quick lane rather than shown on an unverified promise.

ALTER TABLE "FarmerProfile" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "FarmerProfile" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "FarmerProfile" ADD COLUMN "deliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 5;

-- Haversine cannot use an index, so the shop search narrows on a lat/lng
-- bounding box first and computes exact distance only on the survivors.
CREATE INDEX "FarmerProfile_latitude_longitude_idx" ON "FarmerProfile"("latitude", "longitude");
