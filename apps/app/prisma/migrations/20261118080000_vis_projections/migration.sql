-- CreateTable
CREATE TABLE "CaseView" (
    "companyId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL,
    "routeId" TEXT,
    "assigneeSeatId" TEXT,
    "assigneeRoleId" TEXT,
    "escalatedRoleId" TEXT,
    "fromUserId" TEXT,
    "dueDay" INTEGER NOT NULL,
    "firstAnswerDay" INTEGER,
    "lastDay" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL,
    "accessKeys" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseView_pkey" PRIMARY KEY ("companyId","caseId")
);

-- CreateTable
CREATE TABLE "RateCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CaseView_companyId_open_lastDay_idx" ON "CaseView"("companyId", "open", "lastDay");

-- AddForeignKey
ALTER TABLE "CaseView" ADD CONSTRAINT "CaseView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "CaseView_accessKeys_gin" ON "CaseView" USING GIN ("accessKeys");
