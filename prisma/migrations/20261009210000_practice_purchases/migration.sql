CREATE TABLE "PracticePurchase" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "bankKey" TEXT NOT NULL,
  "ownerHash" TEXT NOT NULL,
  "userId" TEXT,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "orderId" TEXT,
  "captureId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PracticePurchase_captureId_key" ON "PracticePurchase"("captureId");
CREATE UNIQUE INDEX "PracticePurchase_orderId_key" ON "PracticePurchase"("orderId");
CREATE INDEX "PracticePurchase_ownerHash_bankKey_status_idx" ON "PracticePurchase"("ownerHash", "bankKey", "status");
CREATE INDEX "PracticePurchase_userId_bankKey_status_idx" ON "PracticePurchase"("userId", "bankKey", "status");
