-- Add golden ticket tracking to learning profile
ALTER TABLE "UserLearningProfile"
ADD COLUMN IF NOT EXISTS "sessionsSinceLastGolden" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastGoldenServedAt" TIMESTAMP(3);

-- Track whether a question history row was a golden question
ALTER TABLE "UserQuestionHistory"
ADD COLUMN IF NOT EXISTS "isGolden" BOOLEAN NOT NULL DEFAULT false;

-- Raffle entry source enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RaffleEntrySource') THEN
    CREATE TYPE "RaffleEntrySource" AS ENUM ('GOLDEN_QUESTION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "RaffleEntry" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" "RaffleEntrySource" NOT NULL DEFAULT 'GOLDEN_QUESTION',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta" JSONB,
  CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RaffleEntry_userId_createdAt_idx" ON "RaffleEntry"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RaffleEntry_userId_weekStart_idx" ON "RaffleEntry"("userId", "weekStart");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RaffleEntry_userId_fkey'
  ) THEN
    ALTER TABLE "RaffleEntry"
    ADD CONSTRAINT "RaffleEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
