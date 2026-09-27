-- Personal login: a code per person, Microsoft (Entra) sign-in per company. The shared company
-- code becomes optional - it no longer opens anything. Additive only; safe on a live database.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "entraTenantId" TEXT,
ALTER COLUMN "accessCodeHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "entraOid" TEXT,
ADD COLUMN     "loginCodeAt" TIMESTAMP(3),
ADD COLUMN     "loginCodeHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_loginCodeHash_key" ON "User"("loginCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_entraOid_key" ON "User"("companyId", "entraOid");

