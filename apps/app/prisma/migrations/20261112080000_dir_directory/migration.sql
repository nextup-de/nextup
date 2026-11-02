-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivatedAt" TIMESTAMP(3),
ADD COLUMN     "directorySyncedAt" TIMESTAMP(3),
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "DirectoryRun" (
    "companyId" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'graph',
    "cursor" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "lastError" TEXT,
    "added" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "deactivated" INTEGER NOT NULL DEFAULT 0,
    "handed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "DirectoryRun_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "User_companyId_managerId_idx" ON "User"("companyId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_employeeId_key" ON "User"("companyId", "employeeId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryRun" ADD CONSTRAINT "DirectoryRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

