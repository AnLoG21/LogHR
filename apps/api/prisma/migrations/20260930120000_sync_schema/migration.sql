-- AlterTable
ALTER TABLE "AutoPublishRule" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN     "aiScore" DOUBLE PRECISION,
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "consentType" TEXT,
ADD COLUMN     "employmentType" TEXT,
ADD COLUMN     "isFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastJobMonths" INTEGER,
ADD COLUMN     "meetingAt" TIMESTAMP(3),
ADD COLUMN     "meetingType" TEXT,
ADD COLUMN     "resumeUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "salaryExpect" DOUBLE PRECISION,
ADD COLUMN     "willingToRelocate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "workSchedule" TEXT;

-- AlterTable
ALTER TABLE "CustomFieldDefinition" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Funnel" ADD COLUMN     "transitions" JSONB;

-- CreateIndex
CREATE INDEX "Candidate_isFavorite_idx" ON "Candidate"("isFavorite");

-- CreateIndex
CREATE INDEX "Candidate_meetingAt_idx" ON "Candidate"("meetingAt");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
