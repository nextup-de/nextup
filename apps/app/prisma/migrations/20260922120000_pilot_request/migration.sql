-- CreateTable
CREATE TABLE "PilotRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "council" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "PilotRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilotRequest_createdAt_idx" ON "PilotRequest"("createdAt");
