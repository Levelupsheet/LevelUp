
-- Boss battle system
ALTER TYPE "RaffleEntrySource" ADD VALUE IF NOT EXISTS 'GOLDEN_BOSS';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BossEncounterOutcome') THEN
    CREATE TYPE "BossEncounterOutcome" AS ENUM ('PENDING', 'VICTORY', 'DEFEAT');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "BossEncounter" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "lane" "ContentLane",
  "title" TEXT,
  "bossName" TEXT NOT NULL,
  "isGolden" BOOLEAN NOT NULL DEFAULT false,
  "spawnChance" DOUBLE PRECISION,
  "goldenChance" DOUBLE PRECISION,
  "outcome" "BossEncounterOutcome" NOT NULL DEFAULT 'PENDING',
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "totalQuestions" INTEGER NOT NULL DEFAULT 3,
  "xpFromQuestions" INTEGER NOT NULL DEFAULT 0,
  "bonusXpAwarded" INTEGER NOT NULL DEFAULT 0,
  "raffleEntriesAwarded" INTEGER NOT NULL DEFAULT 0,
  "questionsJson" JSONB,
  "answerEventsJson" JSONB,
  "spawnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "BossEncounter_userId_spawnedAt_idx" ON "BossEncounter"("userId", "spawnedAt");
CREATE INDEX IF NOT EXISTS "BossEncounter_userId_outcome_idx" ON "BossEncounter"("userId", "outcome");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'BossEncounter_userId_fkey'
  ) THEN
    ALTER TABLE "BossEncounter"
      ADD CONSTRAINT "BossEncounter_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
