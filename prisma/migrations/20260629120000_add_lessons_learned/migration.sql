-- CreateTable
CREATE TABLE "LessonLearned" (
    "id" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "buyer" TEXT,
    "outcome" TEXT NOT NULL,
    "score" INTEGER,
    "category" TEXT,
    "situation" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "sourceTenderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonLearned_pkey" PRIMARY KEY ("id")
);
