-- Dynamic Boss AI + combat enhancement fields
ALTER TABLE "BossEncounter"
  ADD COLUMN IF NOT EXISTS "bossDomain" "QuestionDomain",
  ADD COLUMN IF NOT EXISTS "difficultyScale" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "playerLevelSnapshot" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "sessionAccuracySnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "playerStatsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "bossStatsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "abilitiesJson" JSONB,
  ADD COLUMN IF NOT EXISTS "resultMetaJson" JSONB;

CREATE INDEX IF NOT EXISTS "BossEncounter_bossDomain_spawnedAt_idx"
  ON "BossEncounter"("bossDomain", "spawnedAt");
