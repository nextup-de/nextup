-- Bug reports (docs/PLATFORM_PLAN.md, "Tickets"). Hand-trimmed: `prisma migrate dev` also wanted to
-- drop "Document_search_idx" and the "search" default - both are hand-written full-text search from
-- 20260924180000_raise_assistant that the schema cannot express. Leave them alone.

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reporterId" TEXT,
    "reporterRole" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "expected" TEXT NOT NULL DEFAULT '',
    "context" JSONB NOT NULL,
    "screenshot" BYTEA,
    "screenshotMime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "forwardedAt" TIMESTAMP(3),
    "forwardError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketReply" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "opsReplyId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),

    CONSTRAINT "TicketReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_companyId_reporterId_createdAt_idx" ON "Ticket"("companyId", "reporterId", "createdAt");

-- CreateIndex
CREATE INDEX "Ticket_companyId_forwardedAt_idx" ON "Ticket"("companyId", "forwardedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_companyId_number_key" ON "Ticket"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TicketReply_opsReplyId_key" ON "TicketReply"("opsReplyId");

-- CreateIndex
CREATE INDEX "TicketReply_companyId_createdAt_idx" ON "TicketReply"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketReply_ticketId_createdAt_idx" ON "TicketReply"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketReply" ADD CONSTRAINT "TicketReply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
