-- Equipment marketplace: dealer-listed machines for sale or hire, plus the
-- farmer enquiries that hand a lead to the dealer. Lead-gen only — no orders,
-- no payments, so nothing here touches Transaction.

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('TRACTOR', 'TILLAGE', 'HARVESTER', 'IRRIGATION', 'SPRAYER', 'THRESHER', 'POWER', 'TOOLS');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "EquipmentMode" AS ENUM ('SALE', 'RENT', 'BOTH');

-- CreateEnum
CREATE TYPE "EnquiryIntent" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "EnquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "EquipmentDealer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "smamEmpanelled" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentDealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL,
    "brand" TEXT,
    "modelName" TEXT,
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'NEW',
    "yearMade" INTEGER,
    "mode" "EquipmentMode" NOT NULL DEFAULT 'SALE',
    "salePrice" DOUBLE PRECISION,
    "rentPricePerDay" DOUBLE PRECISION,
    "rentPricePerHour" DOUBLE PRECISION,
    "securityDeposit" DOUBLE PRECISION,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "powerHp" DOUBLE PRECISION,
    "specs" TEXT[],
    "description" TEXT,
    "images" TEXT[],
    "location" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentEnquiry" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "intent" "EnquiryIntent" NOT NULL,
    "message" TEXT,
    "rentFrom" TIMESTAMP(3),
    "rentTo" TIMESTAMP(3),
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Equipment_category_active_idx" ON "Equipment"("category", "active");

-- CreateIndex
CREATE INDEX "Equipment_state_active_idx" ON "Equipment"("state", "active");

-- CreateIndex
CREATE INDEX "EquipmentEnquiry_userId_createdAt_idx" ON "EquipmentEnquiry"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "EquipmentDealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEnquiry" ADD CONSTRAINT "EquipmentEnquiry_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEnquiry" ADD CONSTRAINT "EquipmentEnquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
