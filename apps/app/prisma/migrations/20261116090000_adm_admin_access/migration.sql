-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isStackAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecretSealed" TEXT;
