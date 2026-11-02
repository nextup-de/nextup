---
id: DIR-C1
title: The directory sync runs per company under a lease, and /admin shows and switches it
wp: C
needs: [ DIR-A1, DIR-B1, CLK-D1 ]
host: any
owns:
  - apps/app/src/server/directory/sync.ts
  - apps/app/instrumentation.ts
  - apps/app/src/app/admin/integrations/page.tsx
  - apps/app/src/components/admin/DirectoryAdmin.tsx
  - apps/app/src/server/actions/directory-admin.ts
  - apps/app/src/i18n/messages/connectors.ts
  - apps/app/tests/db/dir-sync.test.ts
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D3, D5, D11, D14 ]
proofs:
  - id: B1
    says: runDirectoryOnce reads every page of a round, applies it, stores the new
      cursor only after the last page, keeps the old one on an error, skips a
      company whose lease is held or whose sync is off, and two runs at once
      apply once
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/dir-sync.test.ts -t 'DIR sync loop'
status: open
---

Plan DIR (sub-plan of PILOT): the loop. Read first: D11 of the plan, `apps/app/src/server/jira-sync.ts` and
`apps/app/src/server/scheduler/clock.ts` (the loop pattern; CLK-D1 already added the clock to `instrumentation.ts`),
`apps/app/src/lib/db/directory-run.ts`, `apps/app/src/lib/db/directory.ts`, `apps/app/src/server/directory/graph.ts`,
`apps/app/src/app/admin/integrations/page.tsx` and `apps/app/src/components/admin/JiraAdmin.tsx` (the admin pattern).

## What

- `apps/app/src/server/directory/sync.ts` (new): `runDirectoryOnce(now, source?)` and `startDirectorySync()` exactly
  as D11; the default source for a company is `graphDirectory({ tenantId: company.entraTenantId, app: entraApp() })`
  when `DirectoryRun.source` is graph; a company whose source is not graph is skipped with a recorded error "no
  adapter for <source>" (SFX adds one). One company's failure never stops the others. Not a "use server" module.
- `apps/app/instrumentation.ts`: start it after the clock, with a one-line comment.
- `/admin` integrations page: `components/admin/DirectoryAdmin.tsx` (new) per company - on/off, source, last run,
  last ok, last error, the four counts, a "Run now" button - through `server/actions/directory-admin.ts` (new;
  admin session checked like the Jira admin actions: `setDirectoryAction`, `runDirectoryNowAction`). Never the
  cursor, never an employeeId (D5). Strings through `t()` in `i18n/messages/connectors.ts` (de and en).
- `apps/app/tests/db/dir-sync.test.ts`, `describe("DIR sync loop", …)` (D14) with an injected source serving pages:
  a round of two pages applies both and stores the cursor of the last; a source that throws on page two records
  lastError and leaves the stored cursor as it was; a company with `on: false` and one whose lease another run holds
  are not read; `Promise.all` of two runs applies the pages once (counts unchanged on the second); a company with a
  `successfactors` source records "no adapter for successfactors".

## Not

- No change to `applyDirectoryDelta` or the adapter (DIR-A1, DIR-B1). No member action (DIR-D1).
- Nothing in `instrumentation.ts` beyond the start line and its comment.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
