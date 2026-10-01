-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Vacancy_parentId_idx" ON "Vacancy"("parentId");

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
