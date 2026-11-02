---
id: DIR-Z1
title: "DIR acceptance: delta sync adds, moves and deactivates users"
wp: Z
needs: [ DIR-G1, DIR-A1, DIR-B1, DIR-C1, DIR-D1, IDN-Z1 ]
host: any
owns:
  - apps/app/tests/db/directory.test.ts
  - docs/DIRECTORY.md
risk: normal
profile: orch
budget: { minutes: 45, window_pct: 8 }
uses: [ D1, D4, D5, D9, D11, D14, D15 ]
proofs:
  - id: B1
    says: through the Graph adapter on recorded pages and the sync loop, a new user
      appears with department, manager and employeeId, a mover changes unit, a
      leaver is deactivated and their open case moves to the role's other holder
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/directory.test.ts -t 'DIR acceptance'
status: ready
---

Plan DIR (sub-plan of PILOT): acceptance. Every other DIR task is merged. Read first: D9, D11 of the plan,
`apps/app/src/server/directory/{graph,sync}.ts`, `apps/app/tests/fixtures/graph-directory/`,
`apps/app/tests/db/dir-apply.test.ts`.

## What

- `apps/app/tests/db/directory.test.ts`, `describe("DIR acceptance: delta sync adds, moves and deactivates users",
  …)` (D14): a sandbox company from the demo template with an Entra tenant id, the sync switched on, two users
  holding the Engineering lead role (bound to the fixtures' object ids) and an open case on r2 on the first one's
  seat. Run `runDirectoryOnce` with the Graph adapter on an injected `fetch` serving the fixtures' full round, then
  the delta round. Assert: the new user exists with dept, `managerId` = their manager's user, `employeeId`; the mover's
  `dept` changed; the disabled first holder is inactive and holds no seat; the case's reduced `assigneeSeatId` is the
  second holder's seat; `/admin`'s `loadDirectoryStatus` shows the counts; the employeeId appears nowhere in
  `loadSeed`'s JSON (D5); a third run with the same delta changes nothing.
- `docs/DIRECTORY.md` (new): what the sync does, the fields (D5), scope (Q1), interval (Q2), leavers, the manager-chain
  deputy, and `## DIR gaps` with G-015, G-016, G-017 and the task that answers each (D15).

## Not

- No source file outside the test and the doc. If the acceptance fails because of the sync, report `blocked` with
  the path in backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
