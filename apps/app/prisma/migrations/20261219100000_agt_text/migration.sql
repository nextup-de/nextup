-- Plan AGT (D23): the words of an agent suggestion or planning draft, deleted with the company's AI-text retention (assist_turns).
-- CreateTable
CREATE TABLE "AgentText" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentText_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentText_companyId_createdAt_idx" ON "AgentText"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentText" ADD CONSTRAINT "AgentText_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
