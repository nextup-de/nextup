-- AlterTable
ALTER TABLE "PilotRequest" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PilotReply" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PilotReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PilotReply_requestId_sentAt_idx" ON "PilotReply"("requestId", "sentAt");

-- AddForeignKey
ALTER TABLE "PilotReply" ADD CONSTRAINT "PilotReply_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PilotRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
