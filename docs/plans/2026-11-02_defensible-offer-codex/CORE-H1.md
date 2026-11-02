---
id: CORE-H1
title: A breached deadline hands the case to the deputy seat, once, when the company's rule says so
phase: CORE
needs: [ CLK-Z1, CORE-S1 ]
owns:
  - apps/app/src/features/clock/due.ts
  - apps/app/src/server/scheduler/clock.ts
  - apps/app/src/features/knowledge/rules.ts
  - apps/app/src/features/cases/reducer.ts                        # Kevin's file: only the case.handed why "deadline" branch
  - apps/app/tests/unit/core/handover.test.ts
  - apps/app/tests/db/core-handover.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO4, HD4, HD10, CLK/D10, CLK/D11, CLK/D12, CLK/D13 ]
proofs:
  - id: B1
    says: with deadline_handover on, dueNow gives a hand-over to the deputy seat once after the deadline fact, and the reducer moves the case to that seat with why deadline; with it off, only the clock.due fact as today
    run: npm test -w @nextup/app -- tests/unit/core/handover.test.ts -t 'CORE deadline hand-over'
    expect: '[1-9]\d* passed'
  - id: B2
    says: runClockOnce on a sandbox company writes exactly one case.handed {why deadline} per breached case, also when run twice or by two instances, and none when the rule is off
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/core-handover.test.ts -t 'CORE hand-over once'
    expect: '[1-9]\d* passed'
pr_title: "feat(clock): hand a breached case to the deputy"
---

# CORE-H1 A breached deadline hands the case to the deputy seat, once, when the company's rule says so

## Goal

CLK chose "the owner keeps the case and the deputy gets it too" (CLK plan, Risks); the landing page promises "moves
to the deputy by itself". After this task a company rule `deadline_handover` decides: on, the scheduler hands a
breached case to the deputy seat, once, as a normal `case.handed` with `why: "deadline"`; off, CLK's escalation flag
stays as it is. This is the delta on top of CLK, not a rebuild.

## Context (read first)

- `AGENTS.md`; [CLK plan](../2026-11-02_pilot-pages/build-plans/CLK/PLAN.md) D10-D13 and Risks;
  `apps/app/src/features/clock/due.ts` (`dueNow`, `Due`), `apps/app/src/server/scheduler/clock.ts` (`runClockOnce`,
  lease, idemKey).
- `apps/app/src/features/cases/reducer.ts` (`case.handed`, `escalated`); it is Kevin's file: change only the branch
  named below and say so in the PR.
- `apps/app/src/features/knowledge/rules.ts` (company rules from `CompanyRule`, defaults per key), IDN/D8 (deputy
  seat by role).
- Open question DQ3 in [the Codex plan](../2026-11-02_defensible-offer-codex.md#open-questions).

## What

- `rules.ts`: new key `deadline_handover` (boolean). Default `true` for a company created after this change; for the
  existing companies the default is `false` (no surprise hand-overs on running stacks); clamp like the other keys.
- `due.ts`: when the rule is on, `dueNow` adds `{ kind: "handover", target, toRoleHolderId, idemKey:
  "clk:handover:<target>:<dueDay>" }` for a case whose latest `clock.due` deadline for its current `dueDay` exists and
  that is still with the owner's seat. Never twice (the idemKey), never for demo mode.
- `scheduler/clock.ts`: a `handover` entry appends `case.handed { to, toRoleHolderId, why: "deadline" }` with actor
  `system:clock` through `appendEventRow` (same idemKey rule).
- `reducer.ts`: `case.handed` with `why: "deadline"` moves the case like any hand-over and clears `escalated`; nothing
  else changes.
- Tests: `tests/unit/core/handover.test.ts` (`describe("CORE deadline hand-over", …)`),
  `tests/db/core-handover.test.ts` (`describe("CORE hand-over once", …)`, two `runClockOnce` calls, the rule off).

## Not

- No notification (NTF plans a `case.handed` into a message already), no settings page (the Rules page shows the
  switch: Sam, spec 11), no new event type (`case.handed` exists).

## Constraints

- Edit only the paths in `owns`; in `reducer.ts` only the `case.handed` branch. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/core/handover.test.ts -t 'CORE deadline hand-over'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/clk`

## Done when

- B1, B2 red on `main`, green on the branch; CLK's own tests stay green; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
