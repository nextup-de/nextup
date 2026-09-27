-- Raise-page assistant: documents to search, the audit of every turn, per-company switches.
-- docs/ASSISTANT.md. Document.search is a generated full-text column (Prisma: Unsupported).

-- AlterTable
ALTER TABLE "CompanyProfile" ADD COLUMN     "complianceRules" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "assistant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "classificationCeiling" TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN     "dpaSignedAt" TIMESTAMP(3),
ADD COLUMN     "redactPatterns" TEXT[],
ADD COLUMN     "retentionDays" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'confidential',
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("body", ''))) STORED,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistTurn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "redactions" JSONB NOT NULL DEFAULT '{}',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "unsourced" BOOLEAN NOT NULL DEFAULT false,
    "helpful" BOOLEAN,
    "raisedCaseId" TEXT,
    "model" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_companyId_idx" ON "Document"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_companyId_source_externalId_key" ON "Document"("companyId", "source", "externalId");

-- CreateIndex
CREATE INDEX "AssistTurn_companyId_createdAt_idx" ON "AssistTurn"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistTurn_companyId_sessionId_idx" ON "AssistTurn"("companyId", "sessionId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistTurn" ADD CONSTRAINT "AssistTurn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistTurn" ADD CONSTRAINT "AssistTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "Document_search_idx" ON "Document" USING GIN ("search");
