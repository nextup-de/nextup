-- CreateTable
CREATE TABLE "AdminRevocation" (
    "id" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminRevocation_pkey" PRIMARY KEY ("id")
);
