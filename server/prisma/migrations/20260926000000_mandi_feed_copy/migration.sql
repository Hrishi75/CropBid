-- The last complete copy of the mandi feed, so a restart can serve it.
-- A new table: nothing existing is constrained, so the old API running
-- through the migration is unaffected.
CREATE TABLE "MandiFeedCopy" (
    "key" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "rows" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MandiFeedCopy_pkey" PRIMARY KEY ("key")
);
