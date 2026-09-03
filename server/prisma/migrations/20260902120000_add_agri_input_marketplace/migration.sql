-- Agri-input marketplace: seed, fertiliser and crop-protection stock listed by
-- LICENSED suppliers, plus the farmer enquiries that hand a lead to the shop.
-- Lead-gen only, exactly like the equipment marketplace — no orders, no
-- payments, nothing here touches Transaction.
--
-- The licence columns on InputSupplier are load-bearing, not decoration: the
-- service refuses to surface stock in a category whose licence the supplier
-- does not hold, which is what keeps CropBid a listing venue rather than an
-- unlicensed seller under the Seeds (Control) Order 1983, the Fertiliser
-- (Control) Order 1985 and the Insecticides Act 1968.
--
-- EnquiryStatus already exists (created by the equipment migration) and is
-- reused here rather than duplicated — the NEW / CONTACTED / CLOSED lifecycle
-- is identical for both kinds of lead.

-- CreateEnum
CREATE TYPE "AgriInputCategory" AS ENUM ('SEED', 'FERTILISER', 'ORGANIC', 'CROP_PROTECTION', 'MICRONUTRIENT', 'SEEDLING');

-- CreateTable
CREATE TABLE "InputSupplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "seedLicence" TEXT,
    "fertiliserLicence" TEXT,
    "pesticideLicence" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgriInput" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "AgriInputCategory" NOT NULL,
    "brand" TEXT,
    "cropNames" TEXT[],
    "packSize" TEXT NOT NULL,
    "pricePerPack" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "subsidised" BOOLEAN NOT NULL DEFAULT false,
    "composition" TEXT,
    "germinationPct" DOUBLE PRECISION,
    "seedTreatment" TEXT,
    "dosagePerAcre" TEXT,
    "specs" TEXT[],
    "description" TEXT,
    "images" TEXT[],
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgriInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgriInputEnquiry" (
    "id" TEXT NOT NULL,
    "agriInputId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packQuantity" INTEGER,
    "acres" DOUBLE PRECISION,
    "message" TEXT,
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgriInputEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InputSupplier_name_state_key" ON "InputSupplier"("name", "state");

-- CreateIndex
CREATE INDEX "AgriInput_category_active_idx" ON "AgriInput"("category", "active");

-- CreateIndex
CREATE INDEX "AgriInput_state_active_idx" ON "AgriInput"("state", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AgriInput_supplierId_title_key" ON "AgriInput"("supplierId", "title");

-- CreateIndex
CREATE INDEX "AgriInputEnquiry_userId_createdAt_idx" ON "AgriInputEnquiry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgriInput" ADD CONSTRAINT "AgriInput_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "InputSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgriInputEnquiry" ADD CONSTRAINT "AgriInputEnquiry_agriInputId_fkey" FOREIGN KEY ("agriInputId") REFERENCES "AgriInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgriInputEnquiry" ADD CONSTRAINT "AgriInputEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
