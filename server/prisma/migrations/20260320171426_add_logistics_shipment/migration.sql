-- CreateEnum
CREATE TYPE "LogisticsType" AS ENUM ('TRUCKING', 'COLD_CHAIN', 'LOCAL', 'FREIGHT', 'EXPORT');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaidBy" AS ENUM ('BUYER', 'FARMER', 'SPLIT');

-- CreateTable
CREATE TABLE "LogisticsPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LogisticsType" NOT NULL,
    "coverageRegions" TEXT[],
    "coverageCountries" TEXT[],
    "vehicleTypes" TEXT[],
    "minQuantityKg" DOUBLE PRECISION NOT NULL,
    "maxQuantityKg" DOUBLE PRECISION NOT NULL,
    "costPerKmPerKg" DOUBLE PRECISION NOT NULL,
    "avgDeliveryDays" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.0,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "commissionPercent" DOUBLE PRECISION NOT NULL DEFAULT 7.5,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "logisticsPartnerId" TEXT NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "pickupDate" TIMESTAMP(3) NOT NULL,
    "deliveryLocation" TEXT NOT NULL,
    "estimatedDeliveryDate" TIMESTAMP(3) NOT NULL,
    "actualDeliveryDate" TIMESTAMP(3),
    "vehicleType" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "totalWeightKg" DOUBLE PRECISION NOT NULL,
    "transportCost" DOUBLE PRECISION NOT NULL,
    "platformCommission" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "paidBy" "PaidBy" NOT NULL,
    "splitPercentBuyer" DOUBLE PRECISION,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING_PICKUP',
    "trackingUpdates" JSONB NOT NULL DEFAULT '[]',
    "proofOfDelivery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_transactionId_key" ON "Shipment"("transactionId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_logisticsPartnerId_fkey" FOREIGN KEY ("logisticsPartnerId") REFERENCES "LogisticsPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
