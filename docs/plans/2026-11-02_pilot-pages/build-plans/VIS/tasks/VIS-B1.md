---
id: VIS-B1
title: Every case has a CaseView row with its access keys, kept current on
  append and rebuildable
wp: B
needs: [ VIS-A1 ]
host: any
owns:
  - apps/app/src/lib/db/projections/**
  - apps/app/src/lib/db/events.ts
  - apps/app/prisma/rebuild-projections.ts
  - apps/app/tests/db/vis-projections.test.ts
risk: normal
profile: orch
budget: { minutes: 120, window_pct: 20 }
uses: [ D1, D2, D5, D6, D7, D10, D13 ]
proofs:
  - id: B1
    says: after appends and after a rebuild every CaseView row equals what the full
      reducer and accessKeys give, seed cases included, and a projection error
      does not fail the append
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/vis-projections.test.ts -t 'VIS projections match
      the reducer'
  - id: B2
    says: inboxView, caseView, visibleCaseIds and visibleTo answer from the rows for
      the company asked only
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/vis-projections.test.ts -t 'VIS projection
      readers'
status: ready
---

Plan VIS (sub-plan of PILOT): the read model. Read first: D5-D7 and D10 of the plan,
`apps/app/src/features/cases/visibility.ts` (VIS-A1), `apps/app/src/lib/db/events.ts` (`appendEventRow`, `loadLog`),
`apps/app/src/lib/db/companies.ts` (`companySeed`), `apps/app/src/lib/db/knowledge.ts`,
`apps/app/src/features/demo/identity.ts` (`userByLabel`).

## What

- `apps/app/src/lib/db/projections/case-view.ts` (new): `projectCases(companyId, caseIds)` and
  `rebuildProjections(companyId)` exactly as D6 (the roles for `VisCtx` from `loadKnowledge`); during a rebuild, a
  custom case.raised without `seenByUserIds` gets them once from its `seenBy` labels with `userByLabel` and the payload
  is updated (D10, the one label match, like IDN's backfill).
- `apps/app/src/lib/db/projections/readers.ts` (new): `inboxView`, `caseView`, `visibleCaseIds` (window of D9 as
  parameters), `metricInputs`; `projections/visible.ts`: `visibleTo(companyId, userId)` (D7). Every query names the
  company at the top level; the array overlap through `$queryRaw` with parameters only.
- `apps/app/src/lib/db/events.ts`: `appendEventRow` calls `projectCases` for the target after the commit (D6).
- `apps/app/prisma/rebuild-projections.ts` (new): `npx tsx prisma/rebuild-projections.ts` in apps/app, one line per
  company `<slug>: <n> cases` (Q3).
- `apps/app/tests/db/vis-projections.test.ts` (D13):
  - `describe("VIS projections match the reducer", …)`: a demo-template company plus 30 events over five cases (raise,
    hand-over, decision, a custom audience, a clock.due deadline); after the appends and after `rebuildProjections`,
    each row's status, open, assignee seat and role, escalated role, dueDay, lastDay and accessKeys equal the full
    reducer's case and `accessKeys`; seed cases have rows; with `projectCases` made to throw, `appendEventRow` still
    returns ok.
  - `describe("VIS projection readers", …)`: `inboxView` for the deputy after a deadline lists the case;
    `visibleCaseIds` for a member gives own and shared cases only; `visibleTo` keys equal `viewerKeys`; another
    company's rows never appear.

## Not

- No change to what the layout loads (VIS-C1). No dashboards on the readers (MET).
- No edit of `server/actions/events.ts` (not VIS's): projections update inside `appendEventRow`.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(vis-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
