-- Test Now session persistence and golden question eligibility
ALTER TABLE "MCQQuestion"
  ADD COLUMN IF NOT EXISTS "testNowEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isGoldenEligible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "goldenWeight" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "goldenBonusXp" INTEGER NOT NULL DEFAULT 50;

DO $$ BEGIN
  CREATE TYPE "GameSessionMode" AS ENUM ('TEST_NOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "GameSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "GameSession" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "mode" "GameSessionMode" NOT NULL,
  "status" "GameSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "lane" "ContentLane" NOT NULL DEFAULT 'TEST_NOW',
  "setId" TEXT,
  "placementId" TEXT,
  "currentIndex" INTEGER NOT NULL DEFAULT 0,
  "questionCount" INTEGER NOT NULL DEFAULT 10,
  "goldenSpawned" BOOLEAN NOT NULL DEFAULT false,
  "stateJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "GameSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "GameSessionQuestion" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "questionId" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "isGolden" BOOLEAN NOT NULL DEFAULT false,
  "goldenBonusXp" INTEGER,
  "answered" BOOLEAN NOT NULL DEFAULT false,
  "isCorrect" BOOLEAN,
  "selectedAnswer" JSONB,
  "answeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameSessionQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "GameSession_userId_mode_status_createdAt_idx" ON "GameSession"("userId", "mode", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "GameSessionQuestion_sessionId_answered_orderIndex_idx" ON "GameSessionQuestion"("sessionId", "answered", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "GameSessionQuestion_sessionId_orderIndex_key" ON "GameSessionQuestion"("sessionId", "orderIndex");

UPDATE "MCQQuestion"
SET "testNowEligible" = CASE WHEN EXISTS (SELECT 1 FROM "QuestionSetPlacement" p WHERE p."setId" = "MCQQuestion"."setId" AND p."lane" = 'TEST_NOW' AND p."isActive" = true) THEN true ELSE "testNowEligible" END,
    "isGoldenEligible" = CASE WHEN EXISTS (SELECT 1 FROM "QuestionSetPlacement" p WHERE p."setId" = "MCQQuestion"."setId" AND p."lane" = 'TEST_NOW' AND p."isActive" = true) AND "difficulty" >= 2 THEN true ELSE "isGoldenEligible" END;
