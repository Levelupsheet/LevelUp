
CREATE TABLE IF NOT EXISTS "GameSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lane" TEXT,
  "title" TEXT,
  "startingPosition" TEXT,
  "certExam" TEXT,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "totalQuestions" INTEGER NOT NULL DEFAULT 0,
  "xpEarned" INTEGER NOT NULL DEFAULT 0,
  "hintXpSpent" INTEGER NOT NULL DEFAULT 0,
  "hintsUsedCount" INTEGER NOT NULL DEFAULT 0,
  "hintsUsedJson" JSONB,
  "leaderboardPenalty" INTEGER NOT NULL DEFAULT 0,
  "outcome" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "GameSession_userId_createdAt_idx" ON "GameSession"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "GameSession_createdAt_idx" ON "GameSession"("createdAt");
DO $$ BEGIN
  ALTER TABLE "GameSession"
  ADD CONSTRAINT "GameSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
