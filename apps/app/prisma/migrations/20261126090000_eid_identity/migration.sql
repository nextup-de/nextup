-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoReplay" (
    "key" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoReplay_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AuditExportRun" (
    "companyId" TEXT NOT NULL,
    "cursorAt" TIMESTAMP(3),
    "cursorId" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "day" TEXT,
    "sentToday" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AuditExportRun_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_companyId_provider_issuer_subject_key" ON "ExternalIdentity"("companyId", "provider", "issuer", "subject");

-- CreateIndex
CREATE INDEX "SsoReplay_expiresAt_idx" ON "SsoReplay"("expiresAt");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

