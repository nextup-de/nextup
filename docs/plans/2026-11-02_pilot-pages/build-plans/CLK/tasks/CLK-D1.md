---
id: CLK-D1
title: A scheduler writes each due fact once under a per-company lease
wp: D
needs: [ CLK-A1, CLK-C1, CLK-G1, IDN-Z1 ]
host: any
owns:
  - apps/app/src/server/scheduler/clock.ts
  - apps/app/src/lib/db/clock-lease.ts
  - apps/app/instrumentation.ts
  - apps/app/tests/db/clk-scheduler.test.ts
  - apps/app/src/instrumentation.ts
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D2, D10, D12, D13, D14, D15 ]
proofs:
  - id: B1
    says: runClockOnce appends each missing due fact of a real company once, writes
      nothing for a demo company, and two concurrent runs or a second run write
      no fact twice
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/clk-scheduler.test.ts -t 'CLK scheduler'
status: built
lane: pc/c
branch: orch/clk-d1
resumes: 0
---

Plan CLK (sub-plan of PILOT): the scheduler. `dueNow` (CLK-C1) says what fell due; this task writes it, once.
Read first: D10, D12, D13 of the plan, `apps/app/src/server/jira-sync.ts` and `apps/app/src/lib/db/integrations.ts`
(`claimLease`, `releaseLease`, `recordRun`: the pattern), `apps/app/instrumentation.ts`,
`apps/app/src/features/clock/due.ts`, `apps/app/src/lib/db/events.ts` (`appendEventRow` with `idemKey`).

## What

- `apps/app/src/lib/db/clock-lease.ts` (new): `claimClockLease(companyId, ms, now)` (creates the row on first use,
  then an updateMany on `leaseUntil` null or past, true only for the winner), `releaseClockLease(companyId)`,
  `recordClockRun(companyId, { error? }, now)`.
- `apps/app/src/server/scheduler/clock.ts` (new): `runClockOnce(now = new Date()): Promise<{ slug: string; written:
  number }[]>` and `startClock()` exactly as D13; the system actor `system:clock`, `actorUserId` null, `source:
  "clock"`, each fact's `day` its dueDay + 1's stamp from appendEventRow; one failing company never stops the others
  (its error is recorded). Not a "use server" module.
- `apps/app/instrumentation.ts`: start it next to the Jira sync, with a one-line comment.
- `apps/app/tests/db/clk-scheduler.test.ts`, `describe("CLK scheduler", …)` (D15): a sandbox company from the demo
  template (IDN's binding) with a case raised 10 working days before `now`: `runClockOnce(now)` appends exactly one
  `clock.due` deadline with idemKey `clk:deadline:<id>:<dueDay>` and the deputy's seat; a second call writes nothing;
  two calls with `Promise.all` write one fact; a demo company with an overdue case gets none; a company whose lease
  is held by another run until later is skipped this round.

## Not

- No mail, no reminder (NTF reads `clock.due`). No reducer change (CLK-C1). No integrations.prisma table (D3).

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(clk-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
