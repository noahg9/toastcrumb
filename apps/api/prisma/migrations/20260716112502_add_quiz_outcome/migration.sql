-- CreateTable
CREATE TABLE "QuizOutcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "isPretest" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "surface" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizOutcome_questionId_idx" ON "QuizOutcome"("questionId");

-- CreateIndex
CREATE INDEX "QuizOutcome_userId_idx" ON "QuizOutcome"("userId");

-- AddForeignKey
ALTER TABLE "QuizOutcome" ADD CONSTRAINT "QuizOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

