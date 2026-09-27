-- Session epoch: signed into the session cookie, bumped on a stage change so older sessions end.
-- Additive only; existing cookies carry no epoch, read as 0, and keep working until the next bump.

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
