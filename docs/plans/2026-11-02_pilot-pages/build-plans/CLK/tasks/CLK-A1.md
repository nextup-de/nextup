---
id: CLK-A1
title: Working-day calendar with German federal and state holidays
wp: A
needs: [ CLK-G1, IDN-Z1 ]
host: any
owns:
  - apps/app/src/features/clock/calendar.ts
  - apps/app/src/features/clock/holidays.ts
  - apps/app/tests/unit/clk/calendar.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D5, D6, D7, D15 ]
proofs:
  - id: B1
    says: holidaysOf gives the federal and state holidays of D7 for 2026 and 2027,
      and workdayOf, dateOfWorkday, isWorkday and addWorkdays skip weekends,
      holidays and extra holidays and count extra workdays
    run: npm test -w @nextup/app -- tests/unit/clk/calendar.test.ts -t 'CLK working
      days'
status: merged
lane: pc/a
branch: orch/clk-a1
pr: 313
merge: "bd0f2f0"
---

Plan CLK (sub-plan of PILOT): the calendar, pure date arithmetic. Read first: `apps/app/src/features/clock/index.ts`
(CLK-G1: `CalendarSpec`, `Region`), D5-D7 of the plan.

## What

- `apps/app/src/features/clock/holidays.ts` (new): `easterSunday(year): string` (anonymous Gregorian algorithm) and
  `holidaysOf(year, region): string[]` (ISO dates, sorted, no duplicates) exactly as D7, with the state table as one
  readable constant.
- `apps/app/src/features/clock/calendar.ts` (new): `CLOCK_EPOCH = "2025-01-01"`, `berlinDate(date: Date): string`
  (the Europe/Berlin calendar date, via `Intl.DateTimeFormat` with `timeZone: "Europe/Berlin"`), `isWorkday(iso,
  cal)` (weekday in `cal.workdays` and not a holiday of `cal.region` and not in `extraHolidays`, or in
  `extraWorkdays`), `workdayOf(date, cal)`, `dateOfWorkday(n, cal)`, `addWorkdays(iso, n, cal)` exactly as D5.
  Fast enough for a year of days per call (cache holidays per year and region).
- `apps/app/tests/unit/clk/calendar.test.ts`, `describe("CLK working days", …)`: 2026 Easter is 5 Apr; DE 2026 has
  exactly the nine federal days; DE-BY 2026 adds 6 Jan, 4 Jun (Corpus Christi) and 1 Nov; DE-SN 2026 has Repentance
  Day 18 Nov and 31 Oct; DE-BE has 8 Mar; `isWorkday("2026-05-14", DE)` (Ascension) is false; for DE,
  `workdayOf(Friday 2026-05-01 12:00 Berlin)` equals `workdayOf(Thursday 2026-04-30)` (1 May is a holiday) and
  `addWorkdays("2026-04-30", 1, DE)` is "2026-05-04"; 23:30 UTC on 2026-04-30 is already 1 May in Berlin;
  `dateOfWorkday(workdayOf(d))` is d for working days; an `extraHolidays` entry is skipped and an `extraWorkdays`
  Saturday counts.

## Not

- No database, no reducer, no page (CLK-B1, CLK-C1). No package (D3).

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(clk-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
