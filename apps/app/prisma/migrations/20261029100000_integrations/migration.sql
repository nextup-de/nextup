-- A company's connection to a tool NextUp syncs with from inside the app - Jira first
-- (docs/plans/2026-10-29_jira-in-app.md). Settings and sealed secrets live here; the sync loop
-- comes in a later change. Written to match `prisma migrate diff`; add only.
-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL,
    "secretSealed" TEXT,
    "webhookSecretSealed" TEXT,
    "account" JSONB,
    "pushedSeq" INTEGER NOT NULL DEFAULT 0,
    "pulledAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_on_system_idx" ON "Integration"("on", "system");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_companyId_system_key" ON "Integration"("companyId", "system");

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
