-- CreateEnum
CREATE TYPE "KnowledgeBlockStatus" AS ENUM ('DRAFT', 'PROCESSED', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GeneratedQuestionReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EDITED');

-- CreateTable
CREATE TABLE "KnowledgeBlock" (
    "id" TEXT NOT NULL,
    "sourceBlockId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "domain" "QuestionDomain" NOT NULL,
    "lane" "ContentLane" NOT NULL,
    "startingPosition" "StartingPosition",
    "certExam" "CertExam",
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "stage" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT,
    "status" "KnowledgeBlockStatus" NOT NULL DEFAULT 'DRAFT',
    "contentJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedQuestion" (
    "id" TEXT NOT NULL,
    "knowledgeBlockId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "data" JSONB NOT NULL,
    "choices" JSONB,
    "correctIndex" INTEGER,
    "explanation" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewStatus" "GeneratedQuestionReviewStatus" NOT NULL DEFAULT 'PENDING',
    "editorNotes" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GeneratedQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBlock_sourceBlockId_key" ON "KnowledgeBlock"("sourceBlockId");
CREATE INDEX "KnowledgeBlock_lane_status_createdAt_idx" ON "KnowledgeBlock"("lane", "status", "createdAt");
CREATE INDEX "KnowledgeBlock_domain_difficulty_idx" ON "KnowledgeBlock"("domain", "difficulty");
CREATE INDEX "GeneratedQuestion_knowledgeBlockId_reviewStatus_sortOrder_idx" ON "GeneratedQuestion"("knowledgeBlockId", "reviewStatus", "sortOrder");
CREATE INDEX "GeneratedQuestion_knowledgeBlockId_createdAt_idx" ON "GeneratedQuestion"("knowledgeBlockId", "createdAt");

-- AddForeignKey
ALTER TABLE "GeneratedQuestion" ADD CONSTRAINT "GeneratedQuestion_knowledgeBlockId_fkey" FOREIGN KEY ("knowledgeBlockId") REFERENCES "KnowledgeBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
