-- Prisma's MCQQuestion model already selects subdomain on every full-row read,
-- but no previous migration created it. Preserve existing rows and any manually
-- added column/data while bringing migration-managed databases into alignment.
ALTER TABLE "MCQQuestion" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
