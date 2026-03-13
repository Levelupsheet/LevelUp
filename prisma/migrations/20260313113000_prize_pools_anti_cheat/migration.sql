-- CreateEnum
CREATE TYPE "PrizePoolType" AS ENUM ('WEEKLY_GOLDEN_POOL', 'LEADERBOARD_POOL', 'MONTHLY_GRAND_POOL');

-- CreateEnum
CREATE TYPE "SuspiciousFlagReason" AS ENUM ('RAPID_ANSWERS', 'IP_RATE_LIMIT', 'ACCOUNT_RATE_LIMIT', 'DEVICE_FINGERPRINT_REUSE', 'CAPTCHA_FAILED', 'COOLDOWN_ACTIVE');

-- CreateEnum
CREATE TYPE "SuspiciousFlagStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');

-- AlterTable
ALTER TABLE "UserLearningProfile"
ADD COLUMN "antiCheatCooldownUntil" TIMESTAMP(3),
ADD COLUMN "suspiciousScore" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PrizePool" (
  "id" TEXT NOT NULL,
  "poolType" "PrizePoolType" NOT NULL,
  "currentAmount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrizePool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttemptAudit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "ipAddress" TEXT,
  "deviceFingerprint" TEXT,
  "lane" "ContentLane",
  "answerCount" INTEGER NOT NULL DEFAULT 0,
  "rapidAnswerCount" INTEGER NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "captchaRequired" BOOLEAN NOT NULL DEFAULT false,
  "captchaPassed" BOOLEAN NOT NULL DEFAULT false,
  "blocked" BOOLEAN NOT NULL DEFAULT false,
  "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuizAttemptAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousAccountFlag" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "ipAddress" TEXT,
  "deviceFingerprint" TEXT,
  "reason" "SuspiciousFlagReason" NOT NULL,
  "status" "SuspiciousFlagStatus" NOT NULL DEFAULT 'OPEN',
  "score" INTEGER NOT NULL DEFAULT 1,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "SuspiciousAccountFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrizePool_poolType_key" ON "PrizePool"("poolType");
CREATE INDEX "QuizAttemptAudit_userId_createdAt_idx" ON "QuizAttemptAudit"("userId", "createdAt");
CREATE INDEX "QuizAttemptAudit_ipAddress_createdAt_idx" ON "QuizAttemptAudit"("ipAddress", "createdAt");
CREATE INDEX "QuizAttemptAudit_deviceFingerprint_createdAt_idx" ON "QuizAttemptAudit"("deviceFingerprint", "createdAt");
CREATE INDEX "SuspiciousAccountFlag_userId_createdAt_idx" ON "SuspiciousAccountFlag"("userId", "createdAt");
CREATE INDEX "SuspiciousAccountFlag_reason_status_createdAt_idx" ON "SuspiciousAccountFlag"("reason", "status", "createdAt");
CREATE INDEX "SuspiciousAccountFlag_ipAddress_createdAt_idx" ON "SuspiciousAccountFlag"("ipAddress", "createdAt");

-- AddForeignKey
ALTER TABLE "QuizAttemptAudit" ADD CONSTRAINT "QuizAttemptAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuspiciousAccountFlag" ADD CONSTRAINT "SuspiciousAccountFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
