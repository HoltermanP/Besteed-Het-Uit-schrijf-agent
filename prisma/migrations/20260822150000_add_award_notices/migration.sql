-- CreateTable
CREATE TABLE "AwardNotice" (
    "publicatieId" TEXT NOT NULL,
    "kenmerk" INTEGER,
    "buyer" TEXT NOT NULL,
    "buyerKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishedOn" TEXT,
    "cpvCodes" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "format" TEXT,
    "lots" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwardNotice_pkey" PRIMARY KEY ("publicatieId")
);

-- CreateIndex
CREATE INDEX "AwardNotice_buyerKey_idx" ON "AwardNotice"("buyerKey");
