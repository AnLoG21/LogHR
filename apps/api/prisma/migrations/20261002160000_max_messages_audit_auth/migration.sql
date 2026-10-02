-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MaxMessage" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fromBot" BOOLEAN NOT NULL DEFAULT false,
    "attachment" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatQuickReply" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatQuickReply_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "MaxMessage_candidateId_externalId_key" ON "MaxMessage"("candidateId", "externalId");
CREATE INDEX IF NOT EXISTS "MaxMessage_candidateId_createdAt_idx" ON "MaxMessage"("candidateId", "createdAt");
CREATE INDEX IF NOT EXISTS "MaxMessage_candidateId_fromBot_readAt_idx" ON "MaxMessage"("candidateId", "fromBot", "readAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditEvent_actorId_idx" ON "AuditEvent"("actorId");

-- FKs
DO $$ BEGIN
  ALTER TABLE "MaxMessage" ADD CONSTRAINT "MaxMessage_candidateId_fkey"
    FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed quick replies if empty
INSERT INTO "ChatQuickReply" ("id", "text", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT * FROM (VALUES
  ('a1000000-0000-4000-8000-000000000001', 'Здравствуйте! Чем могу помочь?', 0, true, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000002', 'Подскажите, пожалуйста, удобное время для созвона.', 1, true, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000003', 'Спасибо, передам информацию коллегам и вернусь с ответом.', 2, true, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000004', 'Ждём вас на интервью. Если планы изменятся — напишите.', 3, true, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000005', 'Отправили оффер. Посмотрите, пожалуйста, и напишите решение.', 4, true, NOW(), NOW())
) AS v("id", "text", "sortOrder", "isActive", "createdAt", "updatedAt")
WHERE NOT EXISTS (SELECT 1 FROM "ChatQuickReply" LIMIT 1);
