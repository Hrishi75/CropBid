-- One equipment lead per account, per machine, per intent.
--
-- Until now nothing stopped the same account raising the same enquiry over and
-- over, so the table could be filled with copies of one lead and a dealer could
-- be shown the same farmer ten times. /inputs has had this guard since it
-- shipped; this is the matching one for /equipment.
--
-- DEDUPE FIRST. A unique index cannot be added over rows that already violate
-- it, and a migration that fails half way through a deploy is worse than the
-- duplicates. The oldest row of each group is the real lead: it is the one the
-- dealer was told about, and the one whose createdAt means anything. Ties on
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
