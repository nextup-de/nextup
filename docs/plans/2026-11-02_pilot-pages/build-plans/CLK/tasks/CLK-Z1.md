---
id: CLK-Z1
title: "CLK acceptance: a deadline hands to the deputy once on the right working day"
wp: Z
needs: [ CLK-G1, CLK-A1, CLK-C1, CLK-B1, CLK-D1 ]
host: any
owns:
  - apps/app/tests/db/clock.test.ts
  - docs/CLOCK.md
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D4, D9, D11, D13, D15, D16 ]
proofs:
  - id: B1
    says: a case raised on the Friday before a holiday in a sandbox company reaches
      the deputy's desk on the right working day, exactly once, also after a
      restart of the scheduler
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/clock.test.ts -t 'CLK acceptance'
status: ready
---

Plan CLK (sub-plan of PILOT): acceptance. Every other CLK task is merged. Read first: `docs/CLOCK.md`,
`apps/app/src/server/scheduler/clock.ts`, `apps/app/src/lib/db/events.ts`, `apps/app/tests/db/clk-scheduler.test.ts`.

## What

- `apps/app/tests/db/clock.test.ts`, `describe("CLK acceptance: deadline hands to the deputy once on the right
  working day", …)` (D15): a sandbox company from the demo template with calendar DE-BY and the default promise
  of 5 days. Raise a case on route r1 with appendEventRow at `now` = Friday 2026-05-22 10:00 Berlin (Whit Monday,
  25 May, is a holiday). Its working days are Tue 26, Wed 27, Thu 28, Fri 29 May and Mon 1 Jun, so it is due on
  Monday 1 June and falls due on Tuesday 2 June. Run `runClockOnce` at 09:00 Berlin on every calendar day from 22 May
  to 12 June: no deadline fact before 2 June, exactly one written by the run of 2 June, the reduced case escalated to
  the deputy's role and `onDeskOf` true for the deputy's seat and still for the owner's. Then restart the scheduler
  (`vi.resetModules()` and a fresh import) and run every day to 19 June: still exactly one fact. Compute nothing
  about these dates in the test with the code under test; write them out.
- `docs/CLOCK.md`: `## CLK gaps` with G-001 and G-002 and the task that answers each (D16).

## Not

- No source file outside the test and the doc. If the acceptance fails because of the clock, report `blocked` with
  the path in backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(clk-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
