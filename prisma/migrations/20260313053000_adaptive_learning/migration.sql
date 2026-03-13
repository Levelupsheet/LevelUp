ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'IDENTITY';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'SECURITY';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'COMPUTE';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'STORAGE';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'AZURE';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'AWS';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'WINDOWS';
ALTER TYPE "QuestionDomain" ADD VALUE IF NOT EXISTS 'GENERAL';

CREATE TABLE IF NOT EXISTS "UserLearningProfile" (
  "userId" TEXT NOT NULL,
  "overallMastery" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "weakestDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserLearningProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "UserDomainMastery" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" "QuestionDomain" NOT NULL,
  "mastery" DOUBLE PRECISION NOT NULL DEFAULT 50,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "totalAnswers" INTEGER NOT NULL DEFAULT 0,
  "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "currentDifficulty" INTEGER NOT NULL DEFAULT 1,
  "lastAnsweredAt" TIMESTAMP(3),
  CONSTRAINT "UserDomainMastery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserDifficultyAccuracy" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "domain" "QuestionDomain" NOT NULL,
  "difficulty" INTEGER NOT NULL,
  "correctCount" INTEGER NOT NULL DEFAULT 0,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "totalAnswers" INTEGER NOT NULL DEFAULT 0,
  "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastAnsweredAt" TIMESTAMP(3),
  CONSTRAINT "UserDifficultyAccuracy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserQuestionHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "type" "QuestionType",
  "domain" "QuestionDomain" NOT NULL,
  "difficulty" INTEGER NOT NULL DEFAULT 1,
  "correct" BOOLEAN NOT NULL,
  "lane" "ContentLane",
  "questionSetId" TEXT,
  "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserQuestionHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserDomainMastery_userId_domain_key" ON "UserDomainMastery"("userId", "domain");
CREATE INDEX IF NOT EXISTS "UserDomainMastery_userId_mastery_idx" ON "UserDomainMastery"("userId", "mastery");
CREATE UNIQUE INDEX IF NOT EXISTS "UserDifficultyAccuracy_userId_domain_difficulty_key" ON "UserDifficultyAccuracy"("userId", "domain", "difficulty");
CREATE INDEX IF NOT EXISTS "UserDifficultyAccuracy_userId_difficulty_idx" ON "UserDifficultyAccuracy"("userId", "difficulty");
CREATE INDEX IF NOT EXISTS "UserQuestionHistory_userId_answeredAt_idx" ON "UserQuestionHistory"("userId", "answeredAt");
CREATE INDEX IF NOT EXISTS "UserQuestionHistory_userId_domain_difficulty_idx" ON "UserQuestionHistory"("userId", "domain", "difficulty");
CREATE INDEX IF NOT EXISTS "UserQuestionHistory_userId_questionId_idx" ON "UserQuestionHistory"("userId", "questionId");

DO $$ BEGIN
  ALTER TABLE "UserLearningProfile" ADD CONSTRAINT "UserLearningProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserDomainMastery" ADD CONSTRAINT "UserDomainMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserDifficultyAccuracy" ADD CONSTRAINT "UserDifficultyAccuracy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "UserQuestionHistory" ADD CONSTRAINT "UserQuestionHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
