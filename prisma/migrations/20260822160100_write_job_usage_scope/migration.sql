-- AlterTable
ALTER TABLE "WriteJob" ADD COLUMN     "companyId" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "projectTitle" TEXT;
