---
id: NTF-G1
title: Outbox, webhook subscription, preference and cursor tables with their helpers
wp: G
needs: [ CLK-Z1, AIP-Z1, LNG-Z1, CNX-Z1, DIR-G1, VIS-G1 ]
host: any
owns:
  - apps/app/prisma/schema/integrations.prisma
  - apps/app/prisma/schema/core.prisma
  - apps/app/prisma/migrations/20261120080000_ntf_outbox/**
  - apps/app/src/lib/db/outbox.ts
  - apps/app/src/lib/db/webhooks.ts
  - apps/app/src/lib/db/notify-prefs.ts
  - apps/app/tests/db/ntf-tables.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D4, D5, D8, D15 ]
proofs:
  - id: B1
    says: enqueue writes one row per key and ignores a second, listOutbox and the
      subscription and preference helpers answer for the company asked only, and
      subscription secrets are stored sealed
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ntf-tables.test.ts -t 'NTF outbox tables'
status: ready
---

Plan NTF (sub-plan of PILOT): the tables. Read first: `docs/adr/0004-webhook-and-outbox.md`, `docs/adr/0007-areas.md`,
`apps/app/prisma/schema/integrations.prisma`, the `// -- integrations --` block of `core.prisma`,
`apps/app/src/features/connectors/vault.ts` and `apps/app/src/lib/db/integrations.ts` (pattern and sealing).

## What

- `apps/app/prisma/schema/integrations.prisma`: `OutboxMessage`, `WebhookSubscription`, `NotifyPreference`,
  `NotifyCursor` exactly as D5; header comment names them. `core.prisma`: their back-relations in the
  `// -- integrations --` block only (D4). Migration
  `apps/app/prisma/migrations/20261120080000_ntf_outbox/migration.sql` (from `prisma migrate diff`, checked by hand).
- `apps/app/src/lib/db/outbox.ts` (new): `type OutboxDraft` (every column a planner sets: channel, key,
  recipientUserId, address, template, locale, subject, text, link, data, status "pending" or "skipped", lastError);
  `enqueue(companyId, drafts)` (createMany skipDuplicates, returns the count written); `listOutbox(companyId, {
  status?, template?, key? })` ordered by createdAt; `claimDue(now, limit)` and `markSent` / `markRetry` /
  `markFailed` used by the delivery (the claim moves rows to attempt + 1 with a guard on the old attempt, so two
  callers never get one row).
- `apps/app/src/lib/db/webhooks.ts` (new): `saveSubscription(companyId, { url, secrets, events, on }, by)` (secrets
  sealed with `seal` from features/connectors/vault.ts, context `webhook:<companyId>`, key from the vault's existing
  env), `subscriptionsOf(companyId)` (secrets opened; a secret that does not open is dropped and logged once).
- `apps/app/src/lib/db/notify-prefs.ts` (new): `prefsOf(companyId, userIds)`, `setPref(companyId, userId, template,
  on)`.
- `apps/app/tests/db/ntf-tables.test.ts`, `describe("NTF outbox tables", …)` (D15): two enqueues of the same key write
  one row; another company's rows are not in `listOutbox`; `claimDue` from two concurrent calls returns each row once;
  a saved subscription's stored secret is not the plain secret and `subscriptionsOf` gives the plain one back; prefs
  are per company.

## Not

- No planner, channel or loop (NTF-A1, NTF-B1, NTF-C1). No other .prisma file; in core.prisma only the integrations
  block (D4). No package.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
