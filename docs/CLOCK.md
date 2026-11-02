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
