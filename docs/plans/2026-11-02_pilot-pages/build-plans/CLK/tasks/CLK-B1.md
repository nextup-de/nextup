---
id: CLK-B1
title: A real company's events and log run on working-day numbers, pages show
  their dates, and stored days are backfilled
wp: B
needs: [ CLK-A1, CLK-G1 ]
host: any
owns:
  - apps/app/src/lib/db/events.ts
  - apps/app/src/features/cases/rows.ts
  - apps/app/src/server/jira-sync.ts
  - apps/app/src/server/actions/events.ts
  - apps/app/src/server/actions/admin.ts
  - apps/app/src/server/connections.ts
  - apps/app/prisma/clock-backfill.ts
  - apps/app/src/lib/db/clock-backfill.ts
  - docs/CLOCK.md
  - apps/app/tests/unit/rows.test.ts
  - apps/app/tests/unit/clk/day-format.test.ts
  - apps/app/tests/db/clk-days.test.ts
risk: high
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D5, D8, D9, D14, D15 ]
proofs:
  - id: B1
    says: in workdays mode the day formatter shows a working-day number as its date
      and keeps Today and Yesterday, and demo mode is unchanged
    run: npm test -w @nextup/app -- tests/unit/clk/day-format.test.ts -t 'CLK day
      labels'
  - id: B2
    says: a sandbox company's appended event and its log carry today's working-day
      number, a demo company's still carry demoDay, and the backfill sets stored
      non-demo days from their timestamps once
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/clk-days.test.ts -t 'CLK working-day stamps'
status: ready
---

Plan CLK (sub-plan of PILOT): the days of a real company. Today every event of a non-demo company is stamped with
`Company.demoDay`, which never moves outside demo (G-001). After this task such a company's events and log carry
working-day numbers (D9) and its pages show real dates. Read first: D5, D8, D9 of the plan,
`apps/app/src/features/clock/{index,calendar}.ts`, `apps/app/src/lib/db/events.ts` (`appendEventRow`, `loadLog`,
`loadLogForSlug`), `apps/app/src/lib/db/calendar.ts`, the day formatter at the top of
`apps/app/src/features/cases/rows.ts`, and the `demoDay` uses in the files of `owns`.

## What

- `apps/app/src/lib/db/events.ts`: `companyDay(company: { stage; demoDay }, cal, now)` (demo → demoDay, else
  `workdayOf(now, cal)`); `appendEventRow` stamps `day` with it inside its transaction; `loadLog(companyId, now = new
  Date())` reads stage, demoDay and the calendar itself and sets `log.day`; `loadLogForSlug` likewise. Both keep
  accepting a `now` for tests.
- Callers that passed `demoDay`: `server/jira-sync.ts` (`loadLog`), and the notice `day` in
  `server/actions/events.ts`, `server/actions/admin.ts`, `server/connections.ts` use `companyDay`.
- `apps/app/src/features/cases/rows.ts`: the day formatter takes the seed's `clock`; workdays mode shows day n as
  `dateOfWorkday(n, calendar)` formatted "dayMonth", "Today" when n is log.day and "Yesterday" for log.day - 1 (D9);
  demo mode exactly as today. Its callers keep their signature (the clock comes from the seed they already pass, or
  an optional parameter defaulting to demo).
- `apps/app/src/lib/db/clock-backfill.ts` (new) and `apps/app/prisma/clock-backfill.ts` (new, `npx tsx
  prisma/clock-backfill.ts` in apps/app, reads `.env.local`): for every company whose stage is not demo, set each
  event's `day` to `workdayOf(ts, calendar)` where it differs; one line per company `<slug>: <n> days set` or
  `<slug>: left as it is`; idempotent; demo companies untouched. Header: run once per stack after the CLK release,
  after `stack/backup.sh` (Q1).
- `docs/CLOCK.md` (new): the two clock modes, working-day numbers and the epoch, the calendar and holidays, that rules
  count working days (Q2), the backfill command.
- Tests:
  - `apps/app/tests/unit/clk/day-format.test.ts`, `describe("CLK day labels", …)`: workdays mode with DE, log.day =
    `workdayOf(2026-05-04)`: that day is "Today", `workdayOf(2026-04-30)` is "Yesterday" (1 May is a holiday), a day
    two weeks back is its "dayMonth" date; demo mode gives today's labels.
  - `apps/app/tests/db/clk-days.test.ts`, `describe("CLK working-day stamps", …)` (D15): with `now` = 2026-05-04
    09:00 Berlin, an event appended to a sandbox company has `day = workdayOf(now, DE)`, and `loadLog` gives that
    `log.day`; a demo company with demoDay 3 gets 3 for both; after inserting a sandbox event with `day: 0` and `ts`
    2026-04-30, the backfill sets it to `workdayOf(2026-04-30)`, leaves the demo company's events alone, and a second
    run reports `left as it is`.

## Not

- No reducer logic (CLK-C1), no scheduler (CLK-D1). No change to `day.advanced` or the demo dev panel (D14).
- No `.prisma` file (D3); no change to `stack/` (OPS): Kevin runs the backfill (Q1).

## Done when

Both proofs are green and lint, typecheck, test, build stay green; the demo e2e suite still passes.

Commit everything; an unfinished state as `wip(clk-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
