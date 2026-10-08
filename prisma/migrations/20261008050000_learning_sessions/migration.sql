ALTER TYPE "GameSessionMode" ADD VALUE IF NOT EXISTS 'LEARNING';
ALTER TABLE "GameSession" ADD COLUMN IF NOT EXISTS "scopeKey" TEXT,
 ADD COLUMN IF NOT EXISTS "industry" TEXT, ADD COLUMN IF NOT EXISTS "careerPath" TEXT,
 ADD COLUMN IF NOT EXISTS "trainingMode" TEXT NOT NULL DEFAULT 'STANDARD',
 ADD COLUMN IF NOT EXISTS "learningCycle" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS "GameSession_userId_scopeKey_createdAt_idx" ON "GameSession" ("userId", "scopeKey", "createdAt");
CREATE INDEX IF NOT EXISTS "GameSessionQuestion_questionId_answeredAt_idx" ON "GameSessionQuestion" ("questionId", "answeredAt");

CREATE INDEX IF NOT EXISTS "GameSession_userId_scopeKey_trainingMode_learningCycle_idx" ON "GameSession" ("userId", "scopeKey", "trainingMode", "learningCycle");
