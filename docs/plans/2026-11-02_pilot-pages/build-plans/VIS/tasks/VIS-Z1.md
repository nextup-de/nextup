---
id: VIS-Z1
title: "VIS acceptance: a member receives only visible cases and pages stay fast with 50,000 events"
wp: Z
needs: [ VIS-G1, VIS-A1, VIS-D1, VIS-B1, VIS-C1 ]
host: any
owns:
  - apps/app/tests/e2e/db/visibility.spec.ts
  - apps/app/tests/e2e/db/fixtures/bulk-events.ts
  - docs/VISIBILITY.md
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D8, D9, D13, D14 ]
proofs:
  - id: B1
    says: a member's browser never receives an event of a case they may not see,
      and with 50,000 events the inbox and a case page load in under one second
    run: cd apps/app && export
      DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test
      AUTH_SECRET=<test value, see the plans repo>
      ADMIN_ACCESS_CODE=vis-proof-admin-code CI=1 && npx prisma migrate deploy
      && npx playwright test -c playwright.db.config.ts
      tests/e2e/db/visibility.spec.ts -g 'VIS acceptance'
    expect: 'VIS acceptance[\s\S]*[1-9]\d* passed'
status: open
---

Plan VIS (sub-plan of PILOT): acceptance. Every other VIS task is merged. Read first: `apps/app/tests/e2e/db/structure.spec.ts`
and `identity.spec.ts` (own companies, login codes, cleanup), `apps/app/src/lib/db/projections/case-view.ts`.

## What

- `apps/app/tests/e2e/db/fixtures/bulk-events.ts` (new): `seedBulk(companyId, { cases, eventsPerCase, now })` writes
  cases and events straight with `createMany` (raisers, desks and audiences spread over the company's seats and users,
  days over the last year), then `rebuildProjections`. Deterministic.
- `apps/app/tests/e2e/db/visibility.spec.ts`, `test.describe("VIS acceptance: a member receives only visible cases and
  pages stay fast with 50,000 events", …)`: a demo-template company in sandbox stage with 50,000 bulk events; member M
  with one private and one shared case, and another member's private case; sign in as M, record every response of the
  layout and of `loadCaseLog`, and assert that no other member's private case id or title appears in them; as the
  route owner's leader and as the manager, the inbox and one case page reach `load` in under 1000 ms (Navigation
  Timing, after one warm-up visit). Companies deleted at the end.
- `docs/VISIBILITY.md` (new): the rule, the keys, the window, the rebuild command, Q1, and `## VIS gaps` (D14).

## Not

- No source file outside the test, its fixture and the doc. If the acceptance fails because of a page or the
  projection, report `blocked` with the path in backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(vis-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
