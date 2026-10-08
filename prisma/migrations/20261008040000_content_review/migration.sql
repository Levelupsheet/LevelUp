ALTER TABLE "QuestionSet" ADD COLUMN IF NOT EXISTS "industry" TEXT, ADD COLUMN IF NOT EXISTS "careerPath" TEXT;
CREATE TABLE IF NOT EXISTS "QuestionImportIssue" (
 "id" TEXT PRIMARY KEY, "setId" TEXT NOT NULL, "rowIndex" INTEGER NOT NULL,
 "reason" TEXT NOT NULL, "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "QuestionImportIssue_setId_createdAt_idx" ON "QuestionImportIssue" ("setId", "createdAt");
