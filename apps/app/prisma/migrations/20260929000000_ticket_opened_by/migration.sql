-- Demo stacks: who of the NextUp team (or sales) opened a report. Hand-written: add only.
ALTER TABLE "Ticket" ADD COLUMN "openedBy" TEXT NOT NULL DEFAULT '';
