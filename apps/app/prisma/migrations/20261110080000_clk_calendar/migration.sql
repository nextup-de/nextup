-- CreateTable
CREATE TABLE "CompanyCalendar" (
    "companyId" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'DE',
    "workdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "extraHolidays" TEXT[],
    "extraWorkdays" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "CompanyCalendar_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "ClockLease" (
    "companyId" TEXT NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "ClockLease_pkey" PRIMARY KEY ("companyId")
);

-- AddForeignKey
ALTER TABLE "CompanyCalendar" ADD CONSTRAINT "CompanyCalendar_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClockLease" ADD CONSTRAINT "ClockLease_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
