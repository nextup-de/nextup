---
id: VIS-C1
title: Each browser gets only the visible cases inside the window, and older
  ones load on their page
wp: C
needs: [ VIS-B1, DIR-C1, AIP-A1 ]
host: any
owns:
  - apps/app/src/lib/db/viewer-log.ts
  - apps/app/src/app/[company]/(app)/layout.tsx
  - apps/app/src/app/[company]/(app)/cases/[caseId]/page.tsx
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/src/server/actions/case-log.ts
  - apps/app/tests/db/vis-viewer-log.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D8, D9, D13 ]
proofs:
  - id: B1
    says: loadLogFor gives a member only the events of cases they may open, of their
      projects, the idea events and the untargeted ones, keeps only those seed
      cases, applies the window to a manager, and loadCaseLog refuses a case the
      viewer may not open
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/vis-viewer-log.test.ts -t 'VIS log per viewer'
status: ready
---

Plan VIS (sub-plan of PILOT): what leaves the server. Read first: D8 and D9 of the plan,
`apps/app/src/app/[company]/(app)/layout.tsx`, `apps/app/src/app/[company]/(app)/cases/[caseId]/page.tsx`,
`apps/app/src/components/dashboard/DemoProvider.tsx` (the log state, `router.refresh` every 8 s),
`apps/app/src/lib/db/projections/readers.ts` and `visible.ts` (VIS-B1).

## What

- `apps/app/src/lib/db/viewer-log.ts` (new): `loadLogFor(companyId, viewer: { userId; role }, now)` and
  `seedForViewer(seed, caseIds, projectIds)` exactly as D8 and D9; a company without CaseView rows falls back to the
  full log (Q3).
- `layout.tsx`: server mode uses `loadLogFor` and `seedForViewer` instead of `loadLogForSlug` and the full seed.
- `apps/app/src/server/actions/case-log.ts` (new, "use server"): `loadCaseLog(slug, caseId)` as D9 (`getViewerFor`,
  canOpen by the projection's keys, returns the case's events and seed row, or `{ ok: false }`).
- `DemoProvider.tsx`: `ctx.loadCase(id)` merges a loaded case into the log (dedupe by event id) and keeps it across
  the refreshes of the same page.
- `cases/[caseId]/page.tsx`: a case not in the shipped log is loaded through `loadCaseLog`; one the viewer may not
  open is `notFound()`.
- `apps/app/tests/db/vis-viewer-log.test.ts`, `describe("VIS log per viewer", …)` (D13): a company with a private case of
  member A, a case shared with member B by id, a case on leader L's desk and one closed case 120 working days back:
  member A gets their case and no other; B gets the shared one; L gets the desk case; the manager gets all but the old
  one; `seedForViewer` drops seed cases outside the set; `loadCaseLog` of the old case works for the manager and
  refuses member B.

## Not

- No change to the rule (VIS-A1) or the projection (VIS-B1). No change to the token events GET (Q1).
- No page outside `owns`; if a page breaks because a case is absent, report `blocked` with its path.

## Done when

The proof is green, lint, typecheck, test, build stay green, and the demo e2e suite passes (local mode is unchanged).

Commit everything; an unfinished state as `wip(vis-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
