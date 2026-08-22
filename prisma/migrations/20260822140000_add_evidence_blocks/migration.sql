-- CreateTable
CREATE TABLE "EvidenceBlock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'default',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT,
    "period" TEXT,
    "category" TEXT,
    "situation" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "value" TEXT,
    "unit" TEXT,
    "proof" TEXT NOT NULL,
    "verifiedOn" TEXT,
    "validUntil" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceBlock_companyId_idx" ON "EvidenceBlock"("companyId");
