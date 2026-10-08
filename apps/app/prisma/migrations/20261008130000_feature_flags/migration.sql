-- Feature flags as admin.sellux.ch set them for this company (src/config/flags.ts, src/features/flags).
-- Generated with `prisma migrate diff`; add only.
-- CreateTable
CREATE TABLE "FeatureFlag" (
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'admin',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("companyId","key")
);

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

