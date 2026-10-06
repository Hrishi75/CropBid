-- The breach register (/admin/incidents). A new type and a new table: no
-- existing rows are touched, so it is safe while the old API is still live.
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'CONTAINED', 'CLOSED');

CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "personalDataAffected" BOOLEAN NOT NULL DEFAULT false,
    "dataCategories" TEXT,
    "usersAffected" INTEGER,
    "actionsTaken" TEXT,
    "exposureRuledOut" TEXT,
    "boardNotifiedAt" TIMESTAMP(3),
    "boardReportAt" TIMESTAMP(3),
    "usersNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityIncident_status_detectedAt_idx" ON "SecurityIncident"("status", "detectedAt");
