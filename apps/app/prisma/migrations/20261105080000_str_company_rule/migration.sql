-- CreateTable
CREATE TABLE "CompanyRule" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CompanyRule_pkey" PRIMARY KEY ("companyId","key")
);

-- AddForeignKey
ALTER TABLE "CompanyRule" ADD CONSTRAINT "CompanyRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
