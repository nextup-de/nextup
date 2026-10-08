-- Errors the stack runs into by itself, one row per kind (features/errors; docs/plans/2026-10-05_admin-vs-ses.md,
-- PR 3 "auto tickets"). Generated with `prisma migrate diff`; add only.
-- CreateTable
CREATE TABLE "ErrorGroup" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "frame" TEXT NOT NULL DEFAULT '',
    "route" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "appCommit" TEXT,
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "forwardedAt" TIMESTAMP(3),
    "forwardError" TEXT,

    CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErrorGroup_fingerprint_key" ON "ErrorGroup"("fingerprint");

-- CreateIndex
CREATE INDEX "ErrorGroup_pending_lastSeenAt_idx" ON "ErrorGroup"("pending", "lastSeenAt");

