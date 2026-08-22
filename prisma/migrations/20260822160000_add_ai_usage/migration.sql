-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'default',
    "projectId" TEXT,
    "projectTitle" TEXT,
    "draftId" TEXT,
    "draftTitle" TEXT,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsdMicros" INTEGER,
    "cacheRequested" BOOLEAN NOT NULL DEFAULT false,
    "month" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudget" (
    "companyId" TEXT NOT NULL,
    "monthlyCapEur" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usdToEur" DOUBLE PRECISION NOT NULL DEFAULT 0.92,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudget_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "AiUsage_companyId_month_idx" ON "AiUsage"("companyId", "month");

-- CreateIndex
CREATE INDEX "AiUsage_companyId_projectId_idx" ON "AiUsage"("companyId", "projectId");

-- CreateIndex
CREATE INDEX "AiUsage_month_idx" ON "AiUsage"("month");
