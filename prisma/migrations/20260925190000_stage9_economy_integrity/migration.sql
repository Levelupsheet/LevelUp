CREATE TABLE "UserEconomyState" (
  "userId" TEXT NOT NULL,
  "streakDays" INTEGER NOT NULL DEFAULT 0,
  "lastClaimDate" TEXT,
  "lastSeenDate" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserEconomyState_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "RewardClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "claimKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RewardClaim_claimKey_key" ON "RewardClaim"("claimKey");
CREATE INDEX "RewardClaim_userId_createdAt_idx" ON "RewardClaim"("userId", "createdAt");

ALTER TABLE "UserEconomyState" ADD CONSTRAINT "UserEconomyState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
