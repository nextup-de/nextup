---
id: CLK-G1
title: Calendar table, clock types, Seed.clock and the clock.due event type
wp: G
needs: [ IDN-G1 ]
host: any
owns:
  - apps/app/prisma/schema/core.prisma
  - apps/app/prisma/migrations/20261110080000_clk_calendar/**
  - apps/app/src/features/clock/index.ts
  - apps/app/src/features/cases/events.ts
  - apps/app/src/features/cases/reducer.ts
  - apps/app/src/features/demo/types.ts
  - apps/app/src/features/demo/seed.ts
  - apps/app/src/features/demo/static-demo.ts
  - apps/app/src/features/demo/index.ts
  - apps/app/src/features/demo/parse.ts
  - apps/app/src/features/demo/content.ts
  - apps/app/src/lib/db/calendar.ts
  - apps/app/src/lib/db/companies.ts
  - apps/app/tests/unit/clk/clock-spec.test.ts
  - apps/app/tests/db/clk-calendar.test.ts
  - apps/app/tests/unit/*.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D2, D3, D6, D8, D10, D15 ]
proofs:
  - id: B1
    says: calendarSpec falls back per field, parseSeed and contentOnly never keep a
      stored clock, and every no-database seed runs in demo mode
    run: npm test -w @nextup/app -- tests/unit/clk/clock-spec.test.ts -t 'CLK clock
      spec'
  - id: B2
    says: companySeed gives a demo company the demo clock and a sandbox company the
      workdays clock with its CompanyCalendar row, or the default calendar
      without one
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/clk-calendar.test.ts -t 'CLK company clock'
status: merged
lane: pc/b
branch: orch/clk-g1
pr: 309
merge: "be913f4"
---

Plan CLK (sub-plan of PILOT): the scaffold. After this task a company has a calendar row, the seed says which clock
the company runs on, and `clock.due` exists as a type; nothing reads them yet. Read first: `docs/IDENTITY.md`,
`docs/adr/0007-areas.md`, `apps/app/prisma/schema/core.prisma`, `apps/app/src/features/cases/events.ts`,
`apps/app/src/features/demo/types.ts`, `parse.ts`, `content.ts`, `apps/app/src/lib/db/companies.ts`
(`companySeed`).

## What

- `apps/app/prisma/schema/core.prisma`: `CompanyCalendar` (D6) and `ClockLease` (D13) with their back-relations in the
  `// -- core --` block of Company (D3); the header comment names them. Migration
  `apps/app/prisma/migrations/20261110080000_clk_calendar/migration.sql` creating both tables (generate it with
  `prisma migrate diff`, then check it by hand).
- `apps/app/src/features/clock/index.ts` (new, pure): `Region`, `CalendarSpec`, `DEFAULT_CALENDAR`, `calendarSpec(row:
  unknown): CalendarSpec` (an unknown region → "DE", workdays filtered to 1-7 and never empty, dates kept only when
  they are ISO dates), `ClockSpec`, `DEMO_CLOCK = { mode: "demo" }` (D6, D8).
- `apps/app/src/features/cases/events.ts`: `clock.due` in `CaseEventType` with its payload comment; `EventPayload`
  gains `kind?: "deadline" | "checkin" | "start" | "measure"` and `dueDay?: number` (D10). Not in APP_EVENT_TYPES.
- `apps/app/src/features/cases/reducer.ts`: `ReduceSeed.clock?: ClockSpec` only (type; the reducer's logic is
  CLK-C1's).
- `apps/app/src/features/demo/types.ts`: `Seed.clock: ClockSpec`; every Seed literal (`SEED`, the static demo seed,
  `EMPTY_SEED`, test fixtures that build a full literal) gets `clock: DEMO_CLOCK`; `parse.ts` ignores a stored clock
  and gives `DEMO_CLOCK`; `content.ts` `contentOnly` sets `DEMO_CLOCK` (D8).
- `apps/app/src/lib/db/calendar.ts` (new): `loadCalendar(companyId): Promise<CalendarSpec>` (DEFAULT_CALENDAR without
  a row) and `saveCalendar(companyId, spec, by)`.
- `apps/app/src/lib/db/companies.ts`: `companySeed` sets `clock` from the company's stage and `loadCalendar` (D8); the
  row it reads includes `stage`.
- Tests:
  - `apps/app/tests/unit/clk/clock-spec.test.ts`, `describe("CLK clock spec", …)`: `calendarSpec(null)` is
    DEFAULT_CALENDAR; `{ region: "XX", workdays: [9] }` gives region "DE" and workdays [1..5]; extra dates that are
    not ISO dates are dropped; `parseSeed` of a blob with `clock: { mode: "workdays" }` gives DEMO_CLOCK;
    `contentOnly` gives DEMO_CLOCK; `LOCAL_SEED.clock` and `STATIC_DEMO_SEED.clock` are DEMO_CLOCK.
  - `apps/app/tests/db/clk-calendar.test.ts`, `describe("CLK company clock", …)` (D15): a demo company's
    `companySeed(...).clock` is DEMO_CLOCK; a sandbox company without a row gets `{ mode: "workdays", calendar:
    DEFAULT_CALENDAR }`; after `saveCalendar` with region "DE-BY" it gets that; another company's row never leaks.

## Not

- No date arithmetic (CLK-A1), no reducer logic (CLK-C1), no day stamping (CLK-B1), no scheduler (CLK-D1).
- No other .prisma file; no scalar column on Company (D3). No package.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(clk-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
