-- One equipment lead per account, per machine, per intent.
--
-- Until now nothing stopped the same account raising the same enquiry over and
-- over, so the table could be filled with copies of one lead and a dealer could
-- be shown the same farmer ten times. /inputs has had this guard since it
-- shipped; this is the matching one for /equipment.
--
-- ONE TRANSACTION, WITH THE TABLE LOCKED AGAINST WRITES FIRST, which review
-- caught. A deploy applies migrations BEFORE it restarts the API, so the old
-- code is still taking enquiries while this runs, and it knows nothing of the
-- rule being added. Delete the duplicates, let one more slip in, then build the
-- index, and the build fails on it and aborts the deploy: reproduced by
-- widening that gap and inserting into it. Locking first closes the gap.
--
-- SHARE ROW EXCLUSIVE blocks inserts, updates and deletes from everyone else
-- and nothing that only reads, so the site keeps showing leads and a farmer
-- enquiring in that moment waits a few milliseconds rather than failing. The
-- one write that does fail is an old-code duplicate arriving mid-migration,
-- which is refused by the new index once the lock lifts: exactly the row this
-- migration exists to refuse, and far better than a deploy that stops half way.
--
-- BEGIN and COMMIT are written out rather than assumed. Prisma happens to send
-- a migration file as one batch, which Postgres runs as a single implicit
-- transaction (checked: a LOCK TABLE line, which Postgres refuses outside a
-- transaction, applies cleanly), but the lock is the whole point here, and it
-- should not depend on how a tool chooses to send the file.
BEGIN;

LOCK TABLE "EquipmentEnquiry" IN SHARE ROW EXCLUSIVE MODE;

-- DEDUPE FIRST. A unique index cannot be added over rows that already violate
-- it. The oldest row of each group is the real lead: it is the one the dealer
-- was told about, and the one whose createdAt means anything. Ties on
-- createdAt fall back to the id so the comparison is total and the statement
-- cannot delete both sides of a pair.
DELETE FROM "EquipmentEnquiry" a
USING "EquipmentEnquiry" b
WHERE a."userId" = b."userId"
  AND a."equipmentId" = b."equipmentId"
  AND a."intent" = b."intent"
  AND (
    a."createdAt" > b."createdAt"
    OR (a."createdAt" = b."createdAt" AND a."id" > b."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentEnquiry_userId_equipmentId_intent_key"
  ON "EquipmentEnquiry"("userId", "equipmentId", "intent");

COMMIT;
