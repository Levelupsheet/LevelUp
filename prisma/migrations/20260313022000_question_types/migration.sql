-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM (
  'MULTIPLE_CHOICE',
  'FILL_BLANK',
  'SEQUENCE_ORDER',
  'MULTI_SELECT',
  'INCIDENT',
  'CLI_COMMAND'
);

-- AlterTable
ALTER TABLE "MCQQuestion"
  ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
  ADD COLUMN "data" JSONB,
  ALTER COLUMN "choices" DROP NOT NULL,
  ALTER COLUMN "correctIndex" DROP NOT NULL;

-- Backfill data for existing multiple choice rows
UPDATE "MCQQuestion"
SET "data" = jsonb_build_object(
  'choices', COALESCE("choices", '[]'::jsonb),
  'correctIndex', COALESCE("correctIndex", 0)
)
WHERE "data" IS NULL;

-- CreateIndex
CREATE INDEX "MCQQuestion_setId_type_sortOrder_idx" ON "MCQQuestion"("setId", "type", "sortOrder");
