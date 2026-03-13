-- Sweepstakes / raffle system expansion
ALTER TYPE "RaffleEntrySource" ADD VALUE IF NOT EXISTS 'BOSS_BATTLE';
ALTER TYPE "RaffleEntrySource" ADD VALUE IF NOT EXISTS 'CHEST_REWARD';
ALTER TYPE "RaffleEntrySource" ADD VALUE IF NOT EXISTS 'FREE_ENTRY';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SweepstakesCampaignStatus') THEN
    CREATE TYPE "SweepstakesCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'DRAWN');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE TABLE IF NOT EXISTS "SweepstakesCampaign" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "SweepstakesCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "prizePoolCents" INTEGER NOT NULL DEFAULT 0,
  "prizePoolLabel" TEXT,
  "termsUrl" TEXT,
  "winnerEntryId" TEXT,
  "winnerUserId" TEXT,
  "drawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SweepstakesCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SweepstakesCampaign_slug_key" ON "SweepstakesCampaign"("slug");
CREATE INDEX IF NOT EXISTS "SweepstakesCampaign_status_startsAt_endsAt_idx" ON "SweepstakesCampaign"("status", "startsAt", "endsAt");

ALTER TABLE "RaffleEntry"
  ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
CREATE INDEX IF NOT EXISTS "RaffleEntry_campaignId_createdAt_idx" ON "RaffleEntry"("campaignId", "createdAt");

CREATE TABLE IF NOT EXISTS "FreeEntrySubmission" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "captchaProvider" TEXT,
  "captchaVerifiedAt" TIMESTAMP(3),
  "verificationToken" TEXT NOT NULL,
  "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,
  CONSTRAINT "FreeEntrySubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FreeEntrySubmission_verificationToken_key" ON "FreeEntrySubmission"("verificationToken");
CREATE UNIQUE INDEX IF NOT EXISTS "FreeEntrySubmission_campaignId_normalizedEmail_key" ON "FreeEntrySubmission"("campaignId", "normalizedEmail");
CREATE INDEX IF NOT EXISTS "FreeEntrySubmission_campaignId_createdAt_idx" ON "FreeEntrySubmission"("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "FreeEntrySubmission_normalizedEmail_idx" ON "FreeEntrySubmission"("normalizedEmail");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'RaffleEntry_campaignId_fkey'
  ) THEN
    ALTER TABLE "RaffleEntry"
      ADD CONSTRAINT "RaffleEntry_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "SweepstakesCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'SweepstakesCampaign_winnerUserId_fkey'
  ) THEN
    ALTER TABLE "SweepstakesCampaign"
      ADD CONSTRAINT "SweepstakesCampaign_winnerUserId_fkey"
      FOREIGN KEY ("winnerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FreeEntrySubmission_campaignId_fkey'
  ) THEN
    ALTER TABLE "FreeEntrySubmission"
      ADD CONSTRAINT "FreeEntrySubmission_campaignId_fkey"
      FOREIGN KEY ("campaignId") REFERENCES "SweepstakesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'FreeEntrySubmission_userId_fkey'
  ) THEN
    ALTER TABLE "FreeEntrySubmission"
      ADD CONSTRAINT "FreeEntrySubmission_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
