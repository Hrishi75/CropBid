-- Prepaid credits, and the ledger behind them.
--
-- 1 credit is 1 rupee. No exchange rate, no bonus multiplier, no expiry: each
-- of those is a pricing decision nobody has taken, and inventing one in a
-- migration is the worst place to take it.
--
-- The balance on Wallet is a CACHE of the entries. WalletEntry is the record.
-- Both move inside one transaction in the service; if they ever disagree, the
-- ledger is right.

CREATE TYPE "WalletEntryType" AS ENUM ('TOPUP', 'SPEND', 'REFUND', 'ADJUSTMENT');

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- One wallet per account. The service creates it on first read rather than at
-- signup, so most accounts never have a row.
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CASCADE, unlike CoverageRequest: a deleted account's credit balance is not a
-- fact anyone needs to keep, and leaving orphaned money rows behind is worse.
ALTER TABLE "Wallet"
  ADD CONSTRAINT "Wallet_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletEntryType" NOT NULL,
    -- Signed: positive adds, negative removes. So the ledger sums to the
    -- balance with a plain SUM and cannot be summed wrongly.
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpayOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- THE IDEMPOTENCY GUARANTEE. Verify can be called twice by a retrying client,
-- or by a webhook racing the checkout callback. The second insert loses to this
-- constraint instead of crediting the account a second time.
CREATE UNIQUE INDEX "WalletEntry_razorpayPaymentId_key" ON "WalletEntry"("razorpayPaymentId");

-- A statement is read newest-first, per wallet.
CREATE INDEX "WalletEntry_walletId_createdAt_idx" ON "WalletEntry"("walletId", "createdAt");

ALTER TABLE "WalletEntry"
  ADD CONSTRAINT "WalletEntry_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
