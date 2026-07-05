-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
