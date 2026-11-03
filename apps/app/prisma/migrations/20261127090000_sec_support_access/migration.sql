-- AlterTable
ALTER TABLE "SupportGrant" ADD COLUMN     "extendedAt" TIMESTAMP(3),
ADD COLUMN     "grantedById" TEXT,
ADD COLUMN     "reason" TEXT;
