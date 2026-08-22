-- AlterTable
ALTER TABLE "StyleDocument" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'default';

-- AlterTable
ALTER TABLE "LessonLearned" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE INDEX "StyleDocument_companyId_idx" ON "StyleDocument"("companyId");

-- CreateIndex
CREATE INDEX "LessonLearned_companyId_idx" ON "LessonLearned"("companyId");
