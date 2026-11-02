---
id: CLK-C1
title: In a real company escalation comes from stored due facts, and dueNow
  lists what fell due
wp: C
needs: [ CLK-G1 ]
host: any
owns:
  - apps/app/src/features/cases/reducer.ts
  - apps/app/src/features/projects/reduce.ts
  - apps/app/src/features/clock/due.ts
  - apps/app/tests/unit/cases.test.ts
  - apps/app/tests/unit/projects.test.ts
  - apps/app/tests/unit/clk/due.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D4, D10, D11, D12, D14, D15 ]
proofs:
  - id: B1
    says: in workdays mode a case and a project escalate only from a clock.due fact,
      to its seat's role, and stop when the case is decided; demo mode is
      exactly as before
    run: npm test -w @nextup/app -- tests/unit/clk/due.test.ts -t 'CLK reducer on
      due facts'
  - id: B2
    says: dueNow lists each overdue deadline, check-in, project start and measure
      once with its idemKey and the deputy's or owner's seat, and nothing that
      already has its fact or runs in demo mode
    run: npm test -w @nextup/app -- tests/unit/clk/due.test.ts -t 'CLK dueNow'
status: ready
---

Plan CLK (sub-plan of PILOT): the reducer side. After this task a real company's escalation is a stored fact the
reducer reads, and `dueNow` says which facts are missing; nothing writes them yet (CLK-D1). Read first: D4 and
D10-D12 of the plan, `docs/IDENTITY.md`, `apps/app/src/features/cases/reducer.ts` (the per-case derivation at the
end, the escalation by role), `apps/app/src/features/projects/reduce.ts` (`finishProjects`),
`apps/app/src/features/auth/identity.ts`.

## What

- `apps/app/src/features/cases/reducer.ts` (Kevin's file; the plan's L2 approval covers this change, keep the
  header): `seed.clock ?? DEMO_CLOCK`; demo mode keeps today's code path; workdays mode sets `c.escalated` only from
  the latest `clock.due` kind deadline on the case while it is open (D11), with `toSeatId` / `toRoleId` from
  payload.toRoleHolderId and `seed.seats`, `to` the seat's label, `from` the case's assignee label, `day` dueDay + 1,
  `live: true`. `clock.due` events are kept in the case's history. The ledger counts as before.
- `apps/app/src/features/projects/reduce.ts`: the same for projects in `finishProjects` (kind start for planning,
  kind measure for a late check), demo mode unchanged.
- `apps/app/src/features/clock/due.ts` (new, pure): `Due`, `dueNow(state, today)` exactly as D12; the target seat for
  a deadline by IDN's escalation rule (deputy role's first seat when the case sits with the route owner's role, else
  the owner role's first seat); idemKeys as D10.
- Existing tests updated only where they assert demo behaviour that must stay: `tests/unit/cases.test.ts`,
  `tests/unit/projects.test.ts`.
- `apps/app/tests/unit/clk/due.test.ts`:
  - `describe("CLK reducer on due facts", …)`: on `LOCAL_SEED` with `clock` set to workdays: an overdue case has
    `overdue: true` and `escalated: null` without a fact; with a `clock.due` deadline fact naming the deputy's seat it
    is escalated to that seat's role, and `onDeskOf` is true for the deputy and still for the owner; after
    `case.decided` it is not escalated; a project past its start date escalates only with a start fact; the same
    seed in demo mode gives exactly today's escalation (compare with the reduce result of `LOCAL_SEED` as is).
  - `describe("CLK dueNow", …)`: one deadline Due for an overdue case with idemKey `clk:deadline:<id>:<dueDay>`; none
    once the fact is in the log; none in demo mode; a check-in Due for a discussion past its check-in day; a measure
    Due with `check` for a late 30-day check; none for a case not yet due.

## Not

- No writing of facts, no lease, no instrumentation (CLK-D1). No day stamping or dates on pages (CLK-B1).
- No new comparison of display names (D4).

## Done when

Both proofs are green and lint, typecheck, test, build stay green; the demo e2e suite still passes.

Commit everything; an unfinished state as `wip(clk-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
