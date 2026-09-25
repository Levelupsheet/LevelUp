-- Secure fulfillment claims for sweepstakes winners.
CREATE TABLE IF NOT EXISTS "SweepstakesPrizeClaim" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "shippingAddress1" TEXT,
  "shippingAddress2" TEXT,
  "city" TEXT,
  "region" TEXT,
  "postalCode" TEXT,
  "country" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SweepstakesPrizeClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SweepstakesPrizeClaim_campaignId_userId_key" ON "SweepstakesPrizeClaim"("campaignId","userId");
CREATE INDEX IF NOT EXISTS "SweepstakesPrizeClaim_status_submittedAt_idx" ON "SweepstakesPrizeClaim"("status","submittedAt");
DO $$ BEGIN
  ALTER TABLE "SweepstakesPrizeClaim" ADD CONSTRAINT "SweepstakesPrizeClaim_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "SweepstakesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "SweepstakesPrizeClaim" ADD CONSTRAINT "SweepstakesPrizeClaim_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
