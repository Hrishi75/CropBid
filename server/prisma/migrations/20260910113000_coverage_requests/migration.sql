-- Somebody wanted us somewhere we are not.
--
-- A shopper who opens Daily outside the delivery area is the most useful signal
-- the product gets: they wanted to buy and could not. Losing that to an
-- apologetic empty screen throws away the only map of where to open next.
--
-- Deliberately separate from "Waitlist", which is an email address for the
-- marketing site. That one says "tell me when you launch"; this one says
-- "come to Hingna", and they are different questions.

CREATE TABLE "CoverageRequest" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "areaLabel" TEXT,
    "phone" TEXT,
    "userId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverageRequest_pkey" PRIMARY KEY ("id")
);

-- The queue is read as "where are people asking from", newest first.
CREATE INDEX "CoverageRequest_createdAt_idx" ON "CoverageRequest"("createdAt");
CREATE INDEX "CoverageRequest_latitude_longitude_idx" ON "CoverageRequest"("latitude", "longitude");

-- SET NULL rather than CASCADE: a deleted account must not erase the fact that
-- somebody in that area wanted us. The point on the map outlives the person.
ALTER TABLE "CoverageRequest"
  ADD CONSTRAINT "CoverageRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
