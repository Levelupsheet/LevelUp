-- AlterEnum: add broader certification support
ALTER TYPE "CertExam" ADD VALUE IF NOT EXISTS 'AWS';
ALTER TYPE "CertExam" ADD VALUE IF NOT EXISTS 'AZURE';

-- AlterEnum: add log analysis question type
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'LOG_ANALYSIS';
