-- Who of the NextUp team is on a report, pulled from admin.sellux.ch. Hand-written: add only.
ALTER TABLE "Ticket" ADD COLUMN "assignee" TEXT NOT NULL DEFAULT '';
