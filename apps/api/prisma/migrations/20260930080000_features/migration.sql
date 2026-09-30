-- AlterEnum
ALTER TYPE "JobBoard" ADD VALUE IF NOT EXISTS 'CAREER_SITE';

-- AlterTable Vacancy
ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "isPublicApply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vacancy" ADD COLUMN IF NOT EXISTS "extra" JSONB;

-- AlterTable Candidate
ALTER TABLE "Candidate" ADD COLUMN IF NOT EXISTS "extra" JSONB;

-- CreateTable AutoPublishRule
CREATE TABLE IF NOT EXISTS "AutoPublishRule" (
    "id" TEXT NOT NULL,
    "vacancyId" TEXT NOT NULL,
    "board" "JobBoard" NOT NULL,
    "templateId" TEXT,
    "intervalHours" INTEGER NOT NULL DEFAULT 24,
    "regionHint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutoPublishRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutoPublishRule_isActive_nextRunAt_idx" ON "AutoPublishRule"("isActive", "nextRunAt");

DO $$ BEGIN
  ALTER TABLE "AutoPublishRule" ADD CONSTRAINT "AutoPublishRule_vacancyId_fkey"
    FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable CustomFieldDefinition
CREATE TABLE IF NOT EXISTS "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'string',
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldDefinition_entityType_code_key" ON "CustomFieldDefinition"("entityType", "code");
