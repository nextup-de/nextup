-- CreateTable
CREATE TABLE "SupportGrant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "openedBy" TEXT NOT NULL,
    "signins" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportGrant_companyId_idx" ON "SupportGrant"("companyId");
