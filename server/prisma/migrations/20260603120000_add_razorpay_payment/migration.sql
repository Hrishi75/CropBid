-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "razorpayOrderId" TEXT,
ADD COLUMN     "razorpayPaymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_razorpayOrderId_key" ON "Transaction"("razorpayOrderId");
