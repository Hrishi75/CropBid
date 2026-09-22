-- The running "usual" price per crop per state behind every "vs usual" signal
-- on the rates pages and in the forecast (services/usualPrices.ts). State ""
-- is the all-India row.
--
-- A new table and nothing else, so it is safe while the old API is still
-- serving during the deploy: the old code never reads or writes it. It starts
-- empty; the first day's prices fill it.

-- CreateTable
CREATE TABLE "UsualPrice" (
    "commodity" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "perQuintal" DOUBLE PRECISION NOT NULL,
    "days" INTEGER NOT NULL,
    "lastDay" DATE,
    "pendingDay" DATE NOT NULL,
    "pendingPerQuintal" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsualPrice_pkey" PRIMARY KEY ("commodity","state")
);
