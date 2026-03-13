-- Phase 6: sweepstakes architecture hardening
-- Adds campaign lifecycle safety flags, source reference tracking, and stronger auditability.

DO $$ BEGIN
  CREATE TYPE "RaffleSourceRefType" AS ENUM (
    'QUESTION',
    'SESSION',
    'BOSS_ENCOUNTER',
    'LOOT_BOX',
    'FREE_ENTRY_SUBMISSION',
    'MANUAL_ADJUSTMENT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "SweepstakesCampaign"
  ADD COLUMN IF NOT EXISTS "isLive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "entryCapPerUserPerWeek" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "RaffleEntry"
  ADD COLUMN IF NOT EXISTS "sourceRefType" "RaffleSourceRefType",
  ADD COLUMN IF NOT EXISTS "sourceRefId" TEXT,
  ADD COLUMN IF NOT EXISTS "auditKey" TEXT;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "RaffleEntry_auditKey_key" ON "RaffleEntry"("auditKey");
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "RaffleEntry_sourceRefType_sourceRefId_idx"
  ON "RaffleEntry"("sourceRefType", "sourceRefId");

ALTER TABLE "SuspiciousAccountFlag"
  ADD COLUMN IF NOT EXISTS "reviewedBy" TEXT;
