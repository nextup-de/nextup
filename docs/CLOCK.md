# The company clock

Every event carries a `day`, and the log carries today's `day`. What that number means depends on the company's stage.

## Two modes

- **Demo** (stage `demo`): `day` is the simulated counter `Company.demoDay`. `day.advanced` moves it, the reducer escalates at render time, the scheduler skips these companies.
- **Workdays** (any other stage): `day` is a working-day number. `appendEventRow` stamps `workdayOf(now, calendar)`, `loadLog` sets `log.day` to the same, and `Company.demoDay` is ignored. `companyDay()` in `lib/db/events.ts` is the one place that chooses.

## Working-day numbers and the epoch

`workdayOf(date, cal)` counts the working days of the calendar in (2025-01-01, d], where d is the Europe/Berlin date of `date`. A weekend or holiday has the number of the working day before it. `dateOfWorkday(n, cal)` is the inverse (n >= 1). Pages show day n as that date, "Today" for `log.day`, "Yesterday" for `log.day - 1`.

## Calendar and holidays

One `CompanyCalendar` row per company (region, working weekdays, extra holidays, extra workdays); no row means `DEFAULT_CALENDAR` (DE, Mon-Fri). German federal and state holidays come from `features/clock/holidays.ts`.

## Rules count working days

Every rule day count (promiseDays, outcomeDays, discussEveryDays, measureDays) counts working days in workdays mode (CLK-C1).

## Backfill

Events stored before this release carry `demoDay` stamps. Run once per stack after the CLK release, after `stack/backup.sh`:

```
cd apps/app && npx tsx prisma/clock-backfill.ts
```

It sets each non-demo event's `day` to `workdayOf(ts, calendar)` and prints `<slug>: <n> days set` or `<slug>: left as it is` per company. Safe to repeat; demo companies are untouched.

## CLK gaps

Register rows of phase CLK (`docs/audit/gaps/product.md`) and the task that answers each. The acceptance proof is `apps/app/tests/db/clock.test.ts` (CLK-Z1).

| Gap | What it said | Answered by |
|---|---|---|
| G-001 | Deadlines ran on `Company.demoDay`, which only `day.advanced` moves, and that is refused outside the demo stage: on a real company nothing ever fell due. | CLK-B1 (a real company's events and log run on working-day numbers, D9), with CLK-A1 (the working-day calendar) and CLK-D1 (the scheduler that reads them). |
| G-002 | Escalation to the deputy was computed at render time and never written as an event, and no scheduler job existed. | CLK-C1 (escalation from stored `clock.due` facts, D11) and CLK-D1 (the scheduler that writes each fact once, D13). |
