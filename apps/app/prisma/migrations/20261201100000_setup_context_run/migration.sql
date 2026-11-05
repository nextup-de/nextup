-- CreateTable
CREATE TABLE "CompanyContextRun" (
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "draft" JSONB,
    "reviewedAt" TIMESTAMP(3),
    "mailedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompanyContextRun_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "CompanyContextRun_status_idx" ON "CompanyContextRun"("status");

-- AddForeignKey
ALTER TABLE "CompanyContextRun" ADD CONSTRAINT "CompanyContextRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
