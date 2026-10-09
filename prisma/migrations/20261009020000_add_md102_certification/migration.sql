-- Add the MD-102 destination without modifying existing placements or questions.
ALTER TYPE "CertExam" ADD VALUE IF NOT EXISTS 'MD_102';
