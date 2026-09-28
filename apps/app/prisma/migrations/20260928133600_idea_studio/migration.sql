-- Idea studio: drafts developed in the chat on /raise, their turns, and the per-company
-- publish threshold. docs/IDEAS.md.

-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "publishThreshold" INTEGER NOT NULL DEFAULT 70;

-- CreateTable
CREATE TABLE "IdeaDraft" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "overall" INTEGER NOT NULL DEFAULT 0,
    "scores" JSONB NOT NULL DEFAULT '[]',
    "affected" TEXT[],
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "caseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "IdeaDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaTurn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "overall" INTEGER,
    "model" TEXT NOT NULL DEFAULT '',
    "promptVersion" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdeaTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IdeaDraft_companyId_userId_updatedAt_idx" ON "IdeaDraft"("companyId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "IdeaTurn_companyId_draftId_createdAt_idx" ON "IdeaTurn"("companyId", "draftId", "createdAt");

-- AddForeignKey
ALTER TABLE "IdeaDraft" ADD CONSTRAINT "IdeaDraft_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaDraft" ADD CONSTRAINT "IdeaDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaTurn" ADD CONSTRAINT "IdeaTurn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaTurn" ADD CONSTRAINT "IdeaTurn_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "IdeaDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
