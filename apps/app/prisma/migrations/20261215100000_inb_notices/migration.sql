-- Plan INB: how the company wants each notice group delivered (decision D6), and the read state of an in-app notice (D5).
-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "noticeChannels" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "OutboxMessage" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OutboxMessage_companyId_recipientUserId_channel_idx" ON "OutboxMessage"("companyId", "recipientUserId", "channel");
