CREATE TABLE "CareerCatalog" (
  "id" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "careerPath" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CareerCatalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CareerCatalog_industry_careerPath_key" ON "CareerCatalog"("industry", "careerPath");
CREATE INDEX "CareerCatalog_isActive_industry_sortOrder_idx" ON "CareerCatalog"("isActive", "industry", "sortOrder");
