-- Scalable training taxonomy: industries and career paths are free-form strings
-- so adding CNA, LPN, RN, CDL, etc. does not require another enum migration.
ALTER TABLE "QuestionSetPlacement" ADD COLUMN "industry" TEXT;
ALTER TABLE "QuestionSetPlacement" ADD COLUMN "careerPath" TEXT;

CREATE INDEX "QuestionSetPlacement_lane_industry_careerPath_idx"
ON "QuestionSetPlacement"("lane", "industry", "careerPath");
