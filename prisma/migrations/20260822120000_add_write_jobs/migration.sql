-- CreateTable
CREATE TABLE "WriteJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftTitle" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "checkpoint" TEXT,
    "partialHtml" TEXT,
    "resultHtml" TEXT,
    "error" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "origin" TEXT,
    "heartbeatAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriteJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WriteJob_projectId_draftId_idx" ON "WriteJob"("projectId", "draftId");

-- CreateIndex
CREATE INDEX "WriteJob_status_heartbeatAt_idx" ON "WriteJob"("status", "heartbeatAt");
