-- Identity constraints for the curated equipment catalogue.
--
-- The catalogue loader (prisma/seedEquipment.ts) treats (name, state) as a
-- dealer's identity and (dealerId, title) as a machine's. Without the database
-- enforcing that, the loader's find-then-insert had a race: two overlapping
-- runs could both find nothing and both insert, leaving permanent duplicates
-- that later runs would then update only one of.
--
-- Name alone is deliberately NOT unique for dealers — a chain with branches in
-- two states is two dealers, each with its own contact number and stock.
--
-- Safe to apply: the equipment tables carry no rows in production, and any
-- development database is rebuilt by the seed.

CREATE UNIQUE INDEX "EquipmentDealer_name_state_key" ON "EquipmentDealer"("name", "state");

CREATE UNIQUE INDEX "Equipment_dealerId_title_key" ON "Equipment"("dealerId", "title");
