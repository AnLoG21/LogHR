-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mangoExtension" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentials" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "UserIntegration_userId_provider_key" ON "UserIntegration"("userId", "provider");
CREATE INDEX IF NOT EXISTS "UserIntegration_provider_idx" ON "UserIntegration"("provider");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "UserIntegration" ADD CONSTRAINT "UserIntegration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
