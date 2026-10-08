-- Preserve question sets, questions, placement IDs, and activation state.
-- Convert the three legacy IT roles to the Industry -> Career Path structure.
UPDATE "QuestionSetPlacement"
SET "industry" = 'Information Technology',
    "careerPath" = CASE "startingPosition"::text
      WHEN 'HELPDESK_SUPPORT' THEN 'Help Desk'
      WHEN 'DESKTOP_TECHNICIAN' THEN 'Desktop Technician'
      WHEN 'CLOUD_ENGINEER' THEN 'Cloud Engineer'
    END,
    "startingPosition" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "lane" = 'TRAINING' AND NULLIF(TRIM("careerPath"), '') IS NULL
  AND "startingPosition"::text IN ('HELPDESK_SUPPORT', 'DESKTOP_TECHNICIAN', 'CLOUD_ENGINEER');

-- Dynamic paths do not also need a legacy role filter. Player selection is separate.
UPDATE "QuestionSetPlacement"
SET "startingPosition" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "lane" = 'TRAINING' AND NULLIF(TRIM("careerPath"), '') IS NOT NULL
  AND "startingPosition" IS NOT NULL;

-- Remove filters ignored by the learner lane, so target identity is canonical.
UPDATE "QuestionSetPlacement" SET "industry" = NULL, "careerPath" = NULL,
  "startingPosition" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "lane" <> 'TRAINING' AND ("industry" IS NOT NULL OR "careerPath" IS NOT NULL OR "startingPosition" IS NOT NULL);
UPDATE "QuestionSetPlacement" SET "certExam" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "lane" <> 'CERTIFICATIONS' AND "certExam" IS NOT NULL;

-- Keep one live placement per identical set/target. Preserve redundant records
-- as inactive history rather than deleting them or deleting any question data.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "setId", "lane", COALESCE(LOWER(TRIM("industry")), ''),
      COALESCE(LOWER(TRIM("careerPath")), ''), "startingPosition", "certExam"
    ORDER BY "createdAt" DESC, "id" ASC
  ) AS rank
  FROM "QuestionSetPlacement" WHERE "isActive" = TRUE
)
UPDATE "QuestionSetPlacement" AS p
SET "isActive" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
FROM ranked WHERE ranked."id" = p."id" AND ranked.rank > 1;

-- Guard concurrent publication without changing any question or set data.
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionSetPlacement_live_dynamic_target"
ON "QuestionSetPlacement" ("setId", "lane", COALESCE(LOWER(TRIM("industry")), ''), COALESCE(LOWER(TRIM("careerPath")), ''))
WHERE "isActive" = TRUE AND "startingPosition" IS NULL AND "certExam" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionSetPlacement_live_cert_target"
ON "QuestionSetPlacement" ("setId", "lane", "certExam")
WHERE "isActive" = TRUE AND "certExam" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "QuestionSetPlacement_live_legacy_target"
ON "QuestionSetPlacement" ("setId", "lane", "startingPosition")
WHERE "isActive" = TRUE AND "startingPosition" IS NOT NULL;
