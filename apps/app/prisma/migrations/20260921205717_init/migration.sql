-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mark" TEXT NOT NULL DEFAULT '',
    "anonymousHandles" BOOLEAN NOT NULL DEFAULT true,
    "stage" TEXT NOT NULL DEFAULT 'demo',
    "accessCodeHash" TEXT NOT NULL,
    "demoDay" INTEGER NOT NULL DEFAULT 0,
    "seedJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyConfig" (
    "companyId" TEXT NOT NULL,
    "aiRouting" BOOLEAN NOT NULL DEFAULT false,
    "n8n" BOOLEAN NOT NULL DEFAULT false,
    "notifications" BOOLEAN NOT NULL DEFAULT false,
    "demoData" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CompanyConfig_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "dept" TEXT NOT NULL DEFAULT '',
    "line" TEXT NOT NULL DEFAULT '',
    "ini" TEXT NOT NULL DEFAULT '',
    "handle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "day" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetId" TEXT,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'app',
    "idemKey" TEXT,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "User_companyId_name_idx" ON "User"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CaseEvent_seq_key" ON "CaseEvent"("seq");

-- CreateIndex
CREATE INDEX "CaseEvent_companyId_seq_idx" ON "CaseEvent"("companyId", "seq");

-- CreateIndex
CREATE INDEX "CaseEvent_companyId_targetId_idx" ON "CaseEvent"("companyId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "CaseEvent_companyId_idemKey_key" ON "CaseEvent"("companyId", "idemKey");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_hash_key" ON "ApiToken"("hash");

-- CreateIndex
CREATE INDEX "ApiToken_companyId_idx" ON "ApiToken"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyConfig" ADD CONSTRAINT "CompanyConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
