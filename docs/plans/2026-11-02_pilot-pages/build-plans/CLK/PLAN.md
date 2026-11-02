---
id: CLK
project: nextup
title: Real clock and scheduler
state: active
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 1, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 2, by: kevin, at: 2026-11-02, note: Workbench Control }
  ]
milestone: PILOT CLK
summary: "CLK gives real companies a working-day clock: a case raised before a
  weekend or a German holiday is due on the right working day, and a scheduler
  writes each deadline, check-in and measure that falls due as one event, once,
  even with two app instances or after a restart. Demo companies keep their
  simulated clock and the day button. Escalation now comes from those stored
  events, so the owner keeps the case and the deputy gets it too, as today. One
  calendar per company (German federal plus one state's holidays); per-site
  calendars wait for ADM. 6 tasks, 90 % of a window; it starts after IDN."
phases:
  - {
      id: G,
      title: Calendar table,
      clock types and lease,
      wps: [ G ],
      gate: auto
    }
  - {
      id: W1,
      title: Working-day calendar and the reducer on stored due facts,
      wps: [ A, C ],
      gate: auto
    }
  - { id: W2, title: Day stamping and the scheduler, wps: [ B, D ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 2
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD4 and HD7) What differs between companies - here the
        calendar - is configuration in the database, never code. The core loop
        works with the clock: no AI and no integration is needed for a deadline
        to fall due."
    }
  - {
      id: D3,
      text: "(from PILOT/HD11 and HD12) CLK changes only core.prisma: the models
        CompanyCalendar and ClockLease (D6, D12) and their back-relations
        `calendar CompanyCalendar?` and `clockLease ClockLease?` in the `// --
        core --` block of Company; no scalar column on Company. One migration
        folder apps/app/prisma/migrations/20261110080000_clk_calendar/ with
        migration.sql. Lane sessions never change package.json or
        package-lock.json."
    }
  - {
      id: D4,
      text: "(from IDN) People and desks are ids: a case's seat and role are
        `assigneeSeatId` / `assigneeRoleId`, escalation goes to a role (IDN/D8:
        to the deputy role when the case sits with the route owner's role, else
        to the owner role), `holderOf` and `seatsOfRole` from
        apps/app/src/features/auth/identity.ts. CLK compares no display name."
    }
  - {
      id: D5,
      text: "Working-day number. A real company's `day` (on events and on the log) is
        a working-day number: `workdayOf(date: Date, cal: CalendarSpec): number`
        = how many working days of `cal` lie in (CLOCK_EPOCH, d], where d is the
        Europe/Berlin calendar date of `date` and CLOCK_EPOCH = \"2025-01-01\";
        a non-working date has the number of the working day before it.
        `dateOfWorkday(n, cal): string` gives the ISO date of working day n (n
        >= 1); `isWorkday(isoDate, cal)`; `addWorkdays(isoDate, n, cal)`. All
        pure, in apps/app/src/features/clock/calendar.ts, no package."
    }
  - {
      id: D6,
      text: "Calendar. `type Region = \"DE\" | \"DE-BW\" | \"DE-BY\" | \"DE-BE\" |
        \"DE-BB\" | \"DE-HB\" | \"DE-HH\" | \"DE-HE\" | \"DE-MV\" | \"DE-NI\" |
        \"DE-NW\" | \"DE-RP\" | \"DE-SL\" | \"DE-SN\" | \"DE-ST\" | \"DE-SH\" |
        \"DE-TH\"`; `type CalendarSpec = { region: Region; workdays: number[]
        (ISO weekday 1 = Monday … 7); extraHolidays: string[]; extraWorkdays:
        string[] }` (ISO dates); `DEFAULT_CALENDAR = { region: \"DE\", workdays:
        [1,2,3,4,5], extraHolidays: [], extraWorkdays: [] }`;
        `calendarSpec(row)` checks a row and falls back per field. Table `model
        CompanyCalendar { companyId String @id; company Company
        @relation(fields: [companyId], references: [id], onDelete: Cascade);
        region String @default(\"DE\"); workdays Int[] @default([1, 2, 3, 4,
        5]); extraHolidays String[]; extraWorkdays String[]; updatedAt DateTime
        @updatedAt; updatedBy String? }` in core.prisma. A company without a row
        has DEFAULT_CALENDAR. One calendar per company: a per-site calendar
        needs a site on the org unit (ADM)."
    }
  - {
      id: D7,
      text: "Holidays (PILOT/HQ4), `holidaysOf(year, region): string[]` in
        apps/app/src/features/clock/holidays.ts, computed (Easter by the
        anonymous Gregorian algorithm). Federal, every region: 1 Jan, Good
        Friday (Easter -2), Easter Monday (+1), 1 May, Ascension (+39), Whit
        Monday (+50), 3 Oct, 25 Dec, 26 Dec. States: 6 Jan BW, BY, ST; 8 Mar BE,
        MV; Corpus Christi (+60) BW, BY, HE, NW, RP, SL; 15 Aug SL; 20 Sep TH;
        31 Oct BB, HB, HH, MV, NI, SN, ST, SH, TH; 1 Nov BW, BY, NW, RP, SL;
        Repentance Day (the Wednesday before 23 Nov) SN. Region \"DE\" has the
        federal days only. Partial-state holidays (Augsburg, parts of BY, SN,
        TH) are not in the table; a company adds them as extraHolidays."
    }
  - {
      id: D8,
      text: "Clock mode. `type ClockSpec = { mode: \"demo\" } | { mode: \"workdays\";
        calendar: CalendarSpec }` (features/clock/index.ts). `Seed.clock:
        ClockSpec` is set by companySeed() from the company: stage demo → `{
        mode: \"demo\" }`, any other stage → workdays with the company's
        calendar; parseSeed ignores a stored `clock`, contentOnly drops it,
        every Seed literal and the no-database seeds carry `{ mode: \"demo\" }`.
        `ReduceSeed.clock?: ClockSpec` (default demo)."
    }
  - {
      id: D9,
      text: "Days of a real company. In workdays mode appendEventRow stamps `day =
        workdayOf(now, calendar)` (never Company.demoDay) and loadLog gives
        `log.day = workdayOf(now, calendar)`; demo mode keeps Company.demoDay
        for both, unchanged. Dates on pages: in workdays mode the day formatter
        (features/cases/rows.ts) shows day n as dateOfWorkday(n); \"Today\" and
        \"Yesterday\" stay relative to log.day. Every rule day count
        (promiseDays, outcomeDays, discussEveryDays, measureDays) counts working
        days in workdays mode (Q2)."
    }
  - {
      id: D10,
      text: "Due facts. New event type `clock.due` (internal, not in the public
        vocabulary), actor `system:clock`, actorUserId null, target the case or
        project id, payload `{ kind: \"deadline\" | \"checkin\" | \"start\" |
        \"measure\"; dueDay: number; check?: number; toRoleHolderId?: string |
        null }`, idemKey `clk:<kind>:<target>:<dueDay>` plus `:<check>` for
        measure. It is not in APP_EVENT_TYPES: no browser and no integration may
        append it. EventPayload gains `kind`, `dueDay` (and reuses `check`,
        `toRoleHolderId`)."
    }
  - {
      id: D11,
      text: "The reducer on due facts. Demo mode: exactly today's render-time
        escalation, `clock.due` ignored. Workdays mode: a case's `escalated` is
        set only by its latest `clock.due` kind deadline (to the seat
        payload.toRoleHolderId and its role, `day` = dueDay + 1, `live: true`)
        and cleared once the case is no longer open; a project's `escalated`
        only by `clock.due` kind start or measure, the same way. `overdue` and
        `dueDay` stay computed (they are what the scheduler reads). checkin is a
        fact for NTF and changes no state. The ledger counts escalations from
        those events."
    }
  - {
      id: D12,
      text: "What falls due. `dueNow(state: State, today: number): Due[]` in
        apps/app/src/features/clock/due.ts (pure), `type Due = { kind; target;
        dueDay; check?: number; toRoleHolderId?: string | null; idemKey }`: an
        open case with dueDay < today and no `clock.due` deadline for that
        dueDay (toRoleHolderId = the deputy's or owner's seat by IDN/D8 at that
        moment); a discussion whose next check-in dueDay < today without a
        checkin fact for it; a planning project past its start dueDay (start); a
        measuring project's late check (measure, with check). Nothing for demo
        mode."
    }
  - {
      id: D13,
      text: "Scheduler. apps/app/src/server/scheduler/clock.ts: `runClockOnce(now =
        new Date())` - for every company whose stage is not demo, claim its
        ClockLease (`model ClockLease { companyId String @id; company Company
        @relation(fields: [companyId], references: [id], onDelete: Cascade);
        leaseUntil DateTime?; lastRunAt DateTime?; lastOkAt DateTime?; lastError
        String? }`, claimed with an updateMany on leaseUntil null or past, 5
        minutes, created on first use), load seed and log, append every dueNow()
        entry with appendEventRow(…, { source: \"clock\", idemKey }) (a
        duplicate counts as done), record the run, release. `startClock()` runs
        it every CLOCK_INTERVAL_MS (default 60 000) from
        apps/app/instrumentation.ts, guarded by globalThis like
        server/jira-sync.ts; a no-op without a database. Two instances or a
        restart never write a fact twice: the idemKey is unique per company."
    }
  - {
      id: D14,
      text: "Demo companies are untouched: day.advanced moves Company.demoDay, the
        reducer escalates at render time, the scheduler skips them, the dev
        panel's day button works as today."
    }
  - {
      id: D15,
      text: "Tests and proofs. Unit tests in apps/app/tests/unit/clk/, run with `npm
        test -w @nextup/app -- tests/unit/clk/<file> -t '<title>'`. DB tests in
        apps/app/tests/db/clk-*.test.ts (and the acceptance clock.test.ts),
        following tests/db/setup.ts, run from the repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. Time is always passed in
        (`now`), never read from the system clock in a test. Run them yourself;
        only your own DB tests; repeat a red DB run once."
    }
  - {
      id: D16,
      text: "Register rows G-001 and G-002 (phase CLK) are listed by CLK-Z1 in
        docs/CLOCK.md under `## CLK gaps` with the task that answers each, or
        'open' with a one-line reason."
    }
questions:
  - {
      id: Q1,
      text: "Who runs the day backfill (CLK-B1) on stacks with non-demo companies
        stored before CLK?",
      default: "Kevin, once per stack after the CLK release and after
        `stack/backup.sh`, in the app container: `npx tsx
        prisma/clock-backfill.ts`. docs/CLOCK.md names the command."
    }
  - {
      id: Q2,
      text: "Do the 30- and 90-day measure checks of a real company count working days
        like every other rule?",
      default: "Yes: every rule counts working days in a real company (30 and 90
        working days are about 6 and 18 weeks). A company that wants calendar
        weeks sets other numbers in its loop rules."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 90 # tasks 72 % + 20 %
talk:
  telegram:
    [
      question_open,
      blocked_twice,
      proof_red_twice,
      budget_over,
      gate_kevin,
      merge_waiting,
      start_high,
      other_repo,
      plan_done
    ]
  pane: [ blocked, task_merged, phase_done ]
  none: [ task_started ]
---

# CLK Real clock and scheduler

Sub-plan of PILOT.

## Goal

After CLK, deadlines, deputy hand-overs, check-ins and measures of a real company fall due on real working days and
are written as events. On `main` every deadline runs on `Company.demoDay`, which only a `day.advanced` event moves and
which the server refuses outside the demo stage (G-001), and escalation is computed at render time and never stored
(G-002). CLK keeps the reducer's integer days and gives a real company working-day numbers (D5, D9), so promise,
discussion and measure rules count working days without a second time model; a scheduler writes what fell due as
`clock.due` facts exactly once (D10-D13).

## Scope

- Working-day calendar with German federal and state holidays (D5-D7), one per company, stored in `CompanyCalendar`.
- Clock mode per company (D8): demo companies keep the simulated clock (D14), every other stage runs on working days.
- Events and the log of a real company stamped with working-day numbers; dates on pages mapped back (D9); a one-off
  backfill of stored non-demo events (Q1).
- `clock.due` facts and the reducer reading escalation from them in workdays mode (D10, D11).
- `dueNow` and a scheduler loop with a lease and idempotency keys (D12, D13).

**Takes from:** IDN: `assigneeSeatId`, `assigneeRoleId`, the escalation rule by role, `holderOf`, `seatsOfRole`
(D4). STR: `CompanyRule` (promise days).

**Hands to:** VIS: persisted deadline facts (`clock.due` kind deadline) and the escalation they set. NTF: `clock.due`
events with kind and target (CLK-C1/B1, CLK-D1/B1). MET: event days on the real clock. ADM: `CompanyCalendar` and
`calendarSpec` to edit.

**Not in scope:** sending reminders or mails (NTF); per-site calendars (ADM, D6); a calendar editor (ADM).

## Done when

All proofs are green on `main` and all tasks are merged (work 6/6). That covers the brief: with a fake clock, a case
raised on the Friday before a holiday is handed to the deputy on the right working day, exactly once, also after a
restart (CLK-Z1). The acceptance test `apps/app/tests/db/clock.test.ts` › `CLK acceptance: deadline hands to the
deputy once on the right working day` is green.

## Phases

- **G Calendar table, clock types and lease:** the one schema change and the shared types (`CalendarSpec`,
  `ClockSpec`, `Seed.clock`, the `clock.due` type), because the calendar, the reducer and the scheduler all need them.
- **W1 Calendar and reducer:** A is pure date arithmetic; C makes the reducer read escalation from `clock.due` in
  workdays mode and adds `dueNow`. Disjoint files.
- **W2 Day stamping and the scheduler:** B stamps real companies' events with working-day numbers and maps them back
  on pages; D runs `dueNow` under a lease. Both need A's calendar; D also C's `dueNow`.
- **Z Acceptance:** the Friday-before-a-holiday test and the CLK gaps list.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | `CompanyCalendar`, `ClockLease`, migration; clock types; `Seed.clock`; `clock.due` type | CLK-G1 | IDN-Z1 | `prisma/schema/core.prisma`, `prisma/migrations/20261110080000_clk_calendar/`, `features/clock/index.ts`, `features/cases/events.ts`, `features/demo/{types,seed,static-demo,index,parse,content}.ts`, `features/cases/reducer.ts` (type only), `lib/db/calendar.ts`, `lib/db/companies.ts` |
| A | Working days and holidays | CLK-A1 | G | `features/clock/{calendar,holidays}.ts` |
| C | Reducer escalation from due facts; `dueNow` | CLK-C1 | G | `features/cases/reducer.ts`, `features/projects/reduce.ts`, `features/clock/due.ts` |
| B | Working-day stamps, log day, page dates, day backfill | CLK-B1 | A, G | `lib/db/events.ts`, `features/cases/rows.ts`, `server/jira-sync.ts`, `server/actions/{events,admin}.ts`, `server/connections.ts`, `prisma/clock-backfill.ts`, `lib/db/clock-backfill.ts`, `docs/CLOCK.md` |
| D | Scheduler with lease and idempotency keys | CLK-D1 | A, C, G | `server/scheduler/clock.ts`, `lib/db/clock-lease.ts`, `instrumentation.ts` |
| Z | Acceptance | CLK-Z1 | all | `tests/db/clock.test.ts`, `docs/CLOCK.md` (gaps) |

Paths under `apps/app/src/` unless they start with `prisma/`, `tests/`, `instrumentation.ts` (under `apps/app/`) or
`docs/`.

## Risks

- **The brief says `case.handed{why:"deadline"}`.** A hand-over takes the case off the owner's desk; today an
  escalated case stays with the owner and the deputy gets it too. → CLK stores the escalation as a `clock.due` fact
  that sets the same escalation (D11); the behaviour people know stays. Reported to PILOT.
- **Two app instances or a restart write a fact twice.** → Lease plus a unique idemKey per company (D13); CLK-D1
  proves both, CLK-Z1 proves the restart.
- **Stored non-demo events carry day 0** (Company.demoDay never moved outside demo) and would look years old. → CLK-B1's
  backfill sets their day from `ts`, risk high; Kevin runs it per stack after a backup (Q1). Only demo and sandbox
  data exist today.
- **The reducer is Kevin's file** (header "Only Kevin changes this file") → CLK-G1 (type only) and CLK-C1 change it
  under his L2 approval of this plan, as in IDN.
- **CLK depends on names IDN fixes** (seats, escalation by role). → Its first task needs IDN-Z1; if IDN's names
  change before it merges, the main chat corrects CLK's tasks before they start.
- **Budget:** 90 % against 60 % in PILOT (6 tasks, 72 %): the day stamping and the page dates were not in the brief.
