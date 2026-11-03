-- CreateTable
CREATE TABLE "FloorArea" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "on" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "FloorArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "areaIds" TEXT[],
    "tokenHash" TEXT,
    "pairCodeHash" TEXT,
    "pairCodeUntil" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "FloorDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorCode" (
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "FloorCode_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FloorReference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "areaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FloorReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FloorArea_companyId_key_key" ON "FloorArea"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FloorDevice_tokenHash_key" ON "FloorDevice"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "FloorDevice_pairCodeHash_key" ON "FloorDevice"("pairCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "FloorCode_codeHash_key" ON "FloorCode"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "FloorReference_companyId_hash_key" ON "FloorReference"("companyId", "hash");

-- AddForeignKey
ALTER TABLE "FloorArea" ADD CONSTRAINT "FloorArea_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorArea" ADD CONSTRAINT "FloorArea_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "OrgUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorArea" ADD CONSTRAINT "FloorArea_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "OrgRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorDevice" ADD CONSTRAINT "FloorDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorCode" ADD CONSTRAINT "FloorCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorReference" ADD CONSTRAINT "FloorReference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

