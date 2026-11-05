-- Closed until opened (docs/SETTINGS.md, Setup). Every company that exists today is running, so it stays open;
-- only a company created from now on starts closed.
ALTER TABLE "Company" ADD COLUMN "openedAt" TIMESTAMP(3);
UPDATE "Company" SET "openedAt" = CURRENT_TIMESTAMP;

-- An invitation held back until the company opens.
ALTER TABLE "User" ADD COLUMN "invitationHeldAt" TIMESTAMP(3);
