-- A shopper now pays for a whole basket at once, which can be several shop
-- orders, so the Razorpay order moves off RetailOrder onto RetailPayment.
--
-- Ordered so nothing is lost if shop orders already exist: create the new
-- tables, copy every payment already opened on a shop order into a
-- RetailPayment of its own, and only then drop the old columns.

-- CreateTable
CREATE TABLE "RetailPayment" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RetailOrderToRetailPayment" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RetailOrderToRetailPayment_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailPayment_razorpayOrderId_key" ON "RetailPayment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailPayment_razorpayPaymentId_key" ON "RetailPayment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "RetailPayment_buyerId_paidAt_idx" ON "RetailPayment"("buyerId", "paidAt");

-- CreateIndex
CREATE INDEX "_RetailOrderToRetailPayment_B_index" ON "_RetailOrderToRetailPayment"("B");

-- AddForeignKey
ALTER TABLE "RetailPayment" ADD CONSTRAINT "RetailPayment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RetailOrderToRetailPayment" ADD CONSTRAINT "_RetailOrderToRetailPayment_A_fkey" FOREIGN KEY ("A") REFERENCES "RetailOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RetailOrderToRetailPayment" ADD CONSTRAINT "_RetailOrderToRetailPayment_B_fkey" FOREIGN KEY ("B") REFERENCES "RetailPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry across every payment already opened on a shop order, one payment per
-- order, keeping its Razorpay ids so a webhook still finds it.
INSERT INTO "RetailPayment" ("id", "buyerId", "amount", "currency", "razorpayOrderId", "razorpayPaymentId", "paidAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "buyerId", "totalAmount", "currency", "razorpayOrderId", "razorpayPaymentId", "paidAt", "createdAt", CURRENT_TIMESTAMP
FROM "RetailOrder"
WHERE "razorpayOrderId" IS NOT NULL;

INSERT INTO "_RetailOrderToRetailPayment" ("A", "B")
SELECT o."id", p."id"
FROM "RetailOrder" o
JOIN "RetailPayment" p ON p."razorpayOrderId" = o."razorpayOrderId";

-- DropIndex
DROP INDEX "RetailOrder_razorpayOrderId_key";

-- DropIndex
DROP INDEX "RetailOrder_razorpayPaymentId_key";

-- AlterTable
ALTER TABLE "RetailOrder" DROP COLUMN "razorpayOrderId",
DROP COLUMN "razorpayPaymentId";
