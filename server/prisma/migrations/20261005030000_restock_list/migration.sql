-- Restock lists (CLAUDE.md §9): several requests posted together. Nullable
-- columns only, so the running API is unaffected while this applies.
ALTER TABLE "BuyerRequirement" ADD COLUMN "listId" TEXT, ADD COLUMN "listName" TEXT;
CREATE INDEX "BuyerRequirement_listId_idx" ON "BuyerRequirement"("listId");
