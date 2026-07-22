-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "due" TIMESTAMP(3) NOT NULL,
    "lastReview" TIMESTAMP(3),
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" INTEGER NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewState_userId_idx" ON "ReviewState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_userId_conceptId_key" ON "ReviewState"("userId", "conceptId");

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

