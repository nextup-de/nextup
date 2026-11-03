-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);
