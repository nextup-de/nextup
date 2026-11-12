-- An admin-only copy marked as handed over by the company through its own channel (Q10.13).
ALTER TABLE "DataExport" ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveredByUserId" TEXT,
ADD COLUMN "deliveryNote" TEXT;
