-- People's own connections to sources NextUp reads on their behalf (Microsoft 365 first), and the
-- company switch for live Microsoft 365 search (docs/plans/2026-10-22_sso-and-data-access.md, phase 2).
-- Written to match `prisma migrate diff`; add only.
-- AlterTable
ALTER TABLE "CompanyConfig" ADD COLUMN     "m365Search" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "scopes" TEXT[],
    "refreshTokenSealed" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_companyId_idx" ON "Connection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_companyId_userId_provider_key" ON "Connection"("companyId", "userId", "provider");

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
