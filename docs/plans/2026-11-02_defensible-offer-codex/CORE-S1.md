---
id: CORE-S1
title: The submitter's answer promise (date, state, owner or deputy) is one pure function
phase: CORE
needs: [ CLK-Z1 ]
owns:
  - apps/app/src/features/cases/promise.ts                        # new, pure
  - apps/app/tests/unit/core/promise.test.ts
risk: normal
budget: { minutes: 90 }
executor: codex-local
uses: [ DO1, HD5, HD10, CLK/D9, CLK/D10, CLK/D11 ]
proofs:
  - id: B1
    says: answerPromise gives the answer-by date on the company calendar, the state (waiting, due today, late, answered on time, answered late) and whether the owner's or the deputy's role holds the case, in demo and workdays mode
    run: npm test -w @nextup/app -- tests/unit/core/promise.test.ts -t 'CORE answer promise'
    expect: '[1-9]\d* passed'
pr_title: "feat(cases): the submitter's answer promise"
---

# CORE-S1 The submitter's answer promise is one pure function

## Goal

The first differentiator is "the submitter sees an answer date". CLK gives real companies working days and stored due
facts; nothing turns them into one sentence the raiser can read. After this task `answerPromise()` gives every page
(case page, My cases, Teams card, email) the same answer: answer by when, where it stands, which role holds it.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/clock/` (`calendar.ts` `dateOfWorkday`, `due.ts` `dueNow`, `index.ts`
  `ClockSpec`), [CLK plan](../2026-11-02_pilot-pages/build-plans/CLK/PLAN.md) D9-D12.
- `apps/app/src/features/cases/reducer.ts` (read only: `dueDay`, `overdue`, `escalated`, first answer),
  `apps/app/src/features/cases/rows.ts` (day formatting).
- Spec: [11, "Answer date and deputy status"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#answer-date-and-deputy-status).

## What

- `features/cases/promise.ts`: `answerPromise(c: ReducedCase, ctx: { today: number; promiseDays: number; clock:
  ClockSpec; calendar: CalendarSpec }): AnswerPromise` with `AnswerPromise = { dueDay: number; dueDate: string |
  null /* ISO date in workdays mode, null in demo */; state: "waiting" | "due-today" | "late" | "answered-on-time" |
  "answered-late"; holder: "owner" | "deputy"; holderRoleId: string | null; answeredDay: number | null }`.
  The first answer is the first event the reducer counts as an answer to the raiser (read how the dashboard's
  "answered" is computed and reuse it, do not invent a new rule).
- Facts only, no sentences (events, not edits); pages build the text.
- New test `tests/unit/core/promise.test.ts`, `describe("CORE answer promise", …)`: raised Friday before a holiday
  gets the right due date; due today; late with the deputy holding it (after a `clock.due` deadline, and after a
  `case.handed {why: "deadline"}` once CORE-H1 exists: write that case as a pending `it.todo` if CORE-H1 is not
  merged); answered on time; answered late; demo mode gives `dueDate: null`.

## Not

- No page, no reducer change, no new event.

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/core/promise.test.ts -t 'CORE answer promise'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
