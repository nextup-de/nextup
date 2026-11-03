-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetKind" TEXT,
    "targetId" TEXT,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectUserId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "deliverTo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preparing',
    "sizeBytes" INTEGER,
    "file" BYTEA,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRule" (
    "companyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "keepDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "RetentionRule_pkey" PRIMARY KEY ("companyId","kind")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "companyId" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "removed" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "PrivacyPolicy" (
    "companyId" TEXT NOT NULL,
    "reportScreenshots" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PrivacyPolicy_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "Pseudonym" (
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pseudonym_pkey" PRIMARY KEY ("companyId","userId")
);

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_at_idx" ON "AuditEvent"("companyId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_action_at_idx" ON "AuditEvent"("companyId", "action", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_targetKind_targetId_idx" ON "AuditEvent"("companyId", "targetKind", "targetId");

-- CreateIndex
CREATE INDEX "DataExport_companyId_createdAt_idx" ON "DataExport"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pseudonym_companyId_number_key" ON "Pseudonym"("companyId", "number");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataExport" ADD CONSTRAINT "DataExport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRule" ADD CONSTRAINT "RetentionRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRun" ADD CONSTRAINT "RetentionRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacyPolicy" ADD CONSTRAINT "PrivacyPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pseudonym" ADD CONSTRAINT "Pseudonym_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

