-- Where a shopper has things delivered.
--
-- A household does not have one address: home, a parent's flat, the office.
-- Retyping the street at every checkout is what makes people abandon a basket.
--
-- SEPARATE FROM User.location, which stays and still means the DELIVERY CITY:
-- it decides which shelf a shopper sees and the server refuses purchases that
-- cross it. This is the street address within that city.
--
-- The address line is free text on purpose. Indian addresses do not decompose
-- into house/street/postcode ("near Shivaji Chowk, behind the temple" is a real
-- and useful address), and a required "Street line 2" makes them unenterable.

CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- What the shopper calls it. Free text, not an enum: the third one is never
    -- on anyone's list.
    "label" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    -- Denormalised at save time rather than joined off User.location, because
    -- an address does not move when the account's delivery city changes.
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "landmark" TEXT,
    -- Exactly one true per user, held by the service inside a transaction.
    -- A partial unique index cannot express it: setting a new default UPDATEs
    -- the old row rather than deleting it, so the constraint would fire
    -- mid-transaction on a state that is about to be corrected.
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- Read as "this shopper's addresses, default first".
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- CASCADE: a deleted account's addresses are personal data with no reason to
-- outlive it, unlike CoverageRequest where the point on the map is the record.
ALTER TABLE "Address"
  ADD CONSTRAINT "Address_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
