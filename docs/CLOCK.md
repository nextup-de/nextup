# The company clock

Every event carries a `day`, and the log carries today's `day`. What that number means depends on the company's stage.

## Two modes

- **Demo** (stage `demo`): `day` is the simulated counter `Company.demoDay`. `day.advanced` moves it, the reducer escalates at render time, the scheduler skips these companies.
- **Workdays** (any other stage): `day` is a working-day number. `appendEventRow` stamps `workdayOf(now, calendar)`, `loadLog` sets `log.day` to the same, and `Company.demoDay` is ignored. `companyDay()` in `lib/db/events.ts` is the one place that chooses.

## An unanswered question

A case that is `asked` is paused, so its answer date never falls due. `dueNow` looks at the question itself: 3 working
days after it was asked it yields one `clock.due` fact of kind `question` (the reminder to the raiser), and after 5 a
due of kind `unanswered`, which the scheduler writes as the event `case.unanswered` with actor `system:clock`. The
reducer accepts that event from the clock only; it opens the case, adds the paused days and keeps the question with
`unanswered` set to the day. Idempotency keys: `clk:question:<case>:<asked day>` and `clk:unanswered:<case>:<asked day>`,
so a second question on the same case counts again from its own day.

## A result nobody confirmed

A typed result that still has no second person (`unconfirmedOf`, `features/projects/confirm.ts`) is chased with two
`clock.due` facts of kind `confirm`, each with the measure's `check`. The first falls due the working day after the
result's date (the day it was typed plus `CONFIRM_DAYS`, 5) and has no seat: it reminds who may confirm. The second
falls due `CONFIRM_ESCALATE_DAYS` (3) later and names the seat above the deputy's desk in `toRoleHolderId`; that seat's
role may confirm from then on. It is only written when someone sits above, and never names the desk of the lead or of
who typed the number. Keys: `clk:confirm:<project>:<dueDay>:<check>`. A confirmed result, or a stopped project, is not chased.

## A desk nobody sits at

An open case whose desk has no occupied seat of its role is handed on at once: `dueNow` yields a hand-over with
`why: "vacant"` to the route's other desk (the deputy's, or back to the owner's) when someone sits there, else to the
seat above; with nobody there either it stays. The key is `clk:vacant:<case>:<seat it leaves>`, so each seat is left
once. `vacant` is one of the clock's own reasons (`CLOCK_REASONS`): a person cannot write it. It also catches a desk
that empties later, when its last holder is taken off the seat. A seat whose user is deactivated still counts as
occupied here.

## A raise without a route

A case with no route used to be skipped by `dueNow`. It now gets the deadline fact of any case once it sits on a desk
(its hand-over seat is nobody, because a route names the deputy) and, after `escalation_days`, the second level to the
seat above its desk. While it still sits on the fallback desk, one working day after the raise `dueNow` yields a fact of
kind `triage` (`clk:triage:<case>:<day>`), the reminder to pass it on. A case on no desk at all still yields nothing.

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
