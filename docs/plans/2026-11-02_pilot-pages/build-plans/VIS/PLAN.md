---
id: VIS
project: nextup
title: Read model and server-side visibility
state: active
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 1, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 2, by: kevin, at: 2026-11-02, note: Workbench Control }
  ]
milestone: PILOT VIS
summary: "VIS stops sending every browser the whole case log: the server keeps a
  projection per case with who may see it, and a member's browser gets only the
  events of the cases they may see (their own, their desk's, the ones shared
  with them, and for a leader their reports'). A manager still sees everything,
  but only open cases and what moved in the last 90 working days come along;
  older cases load one at a time. The raiser's custom audience is stored by user
  id and unit, the rate limits move into Postgres so two app instances count
  together, and the connection pool is set by configuration. Inbox and case
  pages stay under one second with 50,000 events. 6 tasks, 100 % of a window; it
  starts after CLK and LNG."
phases:
  - { id: G, title: Projection tables, wps: [ G ], gate: auto }
  - {
      id: W1,
      title: The visibility rule and the shared rate limits,
      wps: [ A, D ],
      gate: auto
    }
  - { id: W2, title: Case projections, wps: [ B ], gate: auto }
  - { id: W3, title: A filtered log for every browser, wps: [ C ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 2
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD5 and HD10) Roles, not people; people are identified by
        user id and seat only, display names are never compared. Visibility
        decides by user ids, seat and role ids and org unit ids
        (apps/app/src/features/auth/identity.ts: `Me`, `SeatRow`, `holdsRole`;
        IDN's `onDeskOf`, `fromUserId`, `invitedUserIds`, project `leadUserId`,
        `memberUserIds`, `authorUserIds`)."
    }
  - {
      id: D3,
      text: "(from PILOT/HD11 and HD12) VIS changes only core.prisma: the models of D5
        and D11 with their back-relations in the `// -- core --` block of
        Company. One migration folder
        apps/app/prisma/migrations/20261118080000_vis_projections/ with
        migration.sql. No package.json or package-lock.json change."
    }
  - {
      id: D4,
      text: "The rule (apps/app/src/features/cases/visibility.ts, pure). A viewer may
        OPEN a case when one of these holds: they raised it (`fromUserId ===
        me.userId`); it is on their desk (`onDeskOf`); they are invited
        (`invitedUserIds`); they are on a project the case opened or joined
        (lead, member or author); the raiser's choice lets them (visibility
        \"everyone\"; \"custom\" with their user id in `seenByUserIds` or one of
        their units in `seenByUnitIds`; \"private\" lets nobody else); with no
        choice: a manager always, a leader when the raiser holds a seat whose
        role reports to one of the leader's roles, a member never. The pages'
        lists show exactly the cases a viewer may open; derive.ts `visibleTo`
        and `canOpen` call this rule and keep no rule of their own."
    }
  - {
      id: D5,
      text: "Access keys. `accessKeys(c: ReducedCase, ctx): string[]` gives every key
        that opens the case: `u:<userId>` (raiser, invitees, project people),
        `r:<roleId>` (the desk's role, the escalation's role, the roles the
        raiser's seats report to when there is no choice), `n:<unitId>` (custom
        units), `all` (everyone), `m` (managers, when there is no choice or the
        choice is not private). `viewerKeys(me, role, units: string[]):
        string[]` gives the viewer's keys (`u:` own id, `r:` every role id, `n:`
        every unit id of their seats' roles, `all`, and `m` for a manager).
        canOpen(c, viewer) is `accessKeys ∩ viewerKeys ≠ ∅`. Projection table
        `model CaseView { companyId String; caseId String; kind String; status
        String; open Boolean; routeId String?; assigneeSeatId String?;
        assigneeRoleId String?; escalatedRoleId String?; fromUserId String?;
        dueDay Int; firstAnswerDay Int?; lastDay Int; lastSeq Int; accessKeys
        String[]; updatedAt DateTime @updatedAt; company Company
        @relation(fields: [companyId], references: [id], onDelete: Cascade);
        @@id([companyId, caseId]); @@index([companyId, open, lastDay]) }` plus a
        GIN index on accessKeys in the migration SQL. One row per case, seed
        cases included."
    }
  - {
      id: D6,
      text: "Keeping it current. `projectCases(companyId, caseIds)` in
        apps/app/src/lib/db/projections/case-view.ts reduces the company's seed
        with only the events of those cases (and the null-target events) and
        upserts their CaseView rows; appendEventRow calls it for the event's
        target after its transaction commits (a projection error is logged and
        never fails the append). `rebuildProjections(companyId)` rebuilds every
        row; `apps/app/prisma/rebuild-projections.ts` runs it for every company.
        Org changes (seats, roles) are picked up by a rebuild; the projection
        test compares every row with the full reducer."
    }
  - {
      id: D7,
      text: "Readers for later phases (lib/db/projections/): `inboxView(companyId,
        viewerKeys, me)` (open cases on the viewer's desk, by CaseView),
        `caseView(companyId, caseId)`, `visibleCaseIds(companyId, viewerKeys,
        window)` and `metricInputs(companyId, from, to)` (status, route, dueDay,
        firstAnswerDay, lastDay per case, no person; firstAnswerDay = the day of
        the first answer, question or hand-over by the desk, null while none,
        for MET's time to first answer). `visibleTo(userId)` in
        lib/db/projections/visible.ts gives a user's viewerKeys from their seats
        and role."
    }
  - {
      id: D8,
      text: "What a browser gets (server mode). The layout builds the log with
        `loadLogFor(companyId, viewer)`: every event whose target is a case in
        `visibleCaseIds` for the viewer inside the window, every event of a
        project one of those cases opened or joined, every idea.* event, every
        event with no target; the seed passed to DemoProvider keeps only those
        seed cases and projects (`seedForViewer`). The window (D9) applies to
        everyone, managers too. The reducer runs on this smaller log unchanged:
        an absent case is simply not there."
    }
  - {
      id: D9,
      text: "The window: a case is shipped when it is open, or its lastDay is within
        the last 90 working days, at most the 500 newest by lastDay (Q2). A case
        outside the window that the viewer may open is loaded on its page by the
        server action `loadCaseLog(slug, caseId)` (checks canOpen, returns that
        case's events and seed row) and merged into DemoProvider's log
        (`ctx.loadCase`); a case the viewer may not open is a 404 on its page."
    }
  - {
      id: D10,
      text: "The raiser's audience by id. EventPayload gains `seenByUserIds?:
        string[]` and `seenByUnitIds?: string[]` (case.raised with visibility
        custom); the raise page's audience picker sends them next to the old
        `seenBy` labels, which are shown and never compared. Old custom raises
        without ids are visible to nobody but the raiser, the desk and managers
        until the backfill of D6's rebuild maps them (labels matched once with
        `userByLabel` from features/demo/identity.ts, the IDN rule)."
    }
  - {
      id: D11,
      text: "Shared rate limits. `model RateCounter { key String @id; count Int;
        resetAt DateTime }` in core.prisma; apps/app/src/lib/db/rate-limit.ts
        `hitShared(key, rule, now)` (one upsert that resets an expired window
        and increments in one statement) and `clearShared(key)`;
        server/throttle.ts uses it when a database is there and the in-memory
        store otherwise; the pure rules in features/security/rate-limit.ts stay.
        A sweep deletes expired rows once an hour. The refusal a person reads
        comes from the catalog in their language (`getT()`, keys
        `errors.tooManyAttempts` with a plural wait in minutes or seconds), not
        from the English `waitText`."
    }
  - {
      id: D12,
      text: "Connection pool. apps/app/src/lib/db/client.ts reads `DATABASE_POOL_MAX`
        (default 10) and `DATABASE_STATEMENT_TIMEOUT_MS` (default 15 000) into
        the pg adapter; .env.example and docs/DEPLOY.md name them. No pooler
        service in stack/ (OPS's)."
    }
  - {
      id: D13,
      text: "Tests and proofs. Unit tests in apps/app/tests/unit/vis/ (`npm test -w
        @nextup/app -- tests/unit/vis/<file> -t '<title>'`). DB tests in
        apps/app/tests/db/vis-*.test.ts following tests/db/setup.ts, run from
        the repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. Bulk test data comes from
        a generator under apps/app/tests/, never from prisma/seed.ts. Run your
        own DB tests only; repeat a red DB run once."
    }
  - {
      id: D14,
      text: "Register rows G-039, G-040, G-225 and G-240 (phase VIS) are listed by
        VIS-Z1 in docs/VISIBILITY.md under `## VIS gaps` with the task that
        answers each, or 'open' with a one-line reason (G-240's pooler service
        belongs to OPS/SEC)."
    }
questions:
  - {
      id: Q1,
      text: "The token-based events GET (/api/[company]/events, n8n) returns every
        event of the company. Filter it by visibility too?",
      default: "No: a token is an integration acting for the company, not a person. It
        keeps reading every event; docs/VISIBILITY.md says so, and API (phase
        API) decides scopes such as private cases for v1."
    }
  - {
      id: Q2,
      text: "How much history comes along to the browser?",
      default: "Open cases plus everything touched in the last 90 working days, at
        most 500 cases; older ones load on their page."
    }
  - {
      id: Q3,
      text: "Who runs the first projection rebuild on stacks that exist before VIS?",
      default: "Kevin, once per stack after the VIS release, in the app container:
        `npx tsx prisma/rebuild-projections.ts`. Until then pages fall back to
        the full log for a company without CaseView rows."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 100 # tasks 80 % + 20 %
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

# VIS Read model and server-side visibility

Sub-plan of PILOT.

## Goal

After VIS, each user receives only the cases and events their role may see, served from projections, so no page
reduces the whole log. On `main` the app layout loads every event and the whole seed for every signed-in user and
the browser applies visibility (`derive.ts` `visibleTo` / `canOpen`, G-039); every append and page reduces the full
log (G-040); the rate limits count in process memory (G-225); the pool is the adapter's default (G-240).

## Scope

- The visibility rule on the server, as access keys (D4, D5), with the raiser's custom audience by user and unit id
  (D10).
- A `CaseView` projection per case, updated on append, rebuildable, compared with the reducer (D5, D6), and its
  readers for later phases (D7).
- The layout ships only the visible cases inside a window; older ones load on demand (D8, D9).
- Rate limits in Postgres (D11) and pool settings (D12).

**Takes from:** CLK: working-day `day` and the `clock.due` escalation (the projection's `escalatedRoleId`,
`dueDay`, `lastDay`). IDN: `Me`, seats, `onDeskOf`, the id fields. LNG: the catalog for any new page string.

**Hands to:** GDP, LOOP, MET, API: `inboxView`, `caseView`, `metricInputs`, `visibleTo(userId)` (VIS-B1/B1-B2,
VIS-C1/B1). VIS-A1/B1: `canOpen`, `accessKeys`, `viewerKeys`.

**Not in scope:** dashboards on projections (MET); public API (API); a pooler service in `stack/` (OPS/SEC);
filtering the token-based events GET (Q1).

## Done when

All proofs are green on `main` and all tasks are merged (work 6/6): a member's browser receives no event of a case
they may not see, and inbox and case pages load in under 1 s with 50,000 events in the test database (VIS-Z1). The
acceptance test `apps/app/tests/e2e/db/visibility.spec.ts` › `VIS acceptance: a member receives only visible cases
and pages stay fast with 50,000 events` is green.

## Phases

- **G Projection tables:** the one schema change (`CaseView`, `RateCounter`), because B and D both need it.
- **W1 Rule and rate limits:** A is the pure rule and the raise page's audience by id; D the shared rate limits and
  pool. Disjoint.
- **W2 Case projections:** B needs A's `accessKeys`.
- **W3 Filtered log:** C needs B's rows to select a viewer's cases.
- **Z Acceptance:** the visibility and speed test with a 50,000-event generator, and the gaps list.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | `CaseView`, `RateCounter`, migration | VIS-G1 | DIR-G1 | `prisma/schema/core.prisma`, `prisma/migrations/20261118080000_vis_projections/` |
| A | The rule as access keys; derive.ts on it; audience by id | VIS-A1 | G | `features/cases/visibility.ts`, `features/cases/events.ts`, `components/dashboard/derive.ts`, `components/ideas/RaiseMenu.tsx`, `components/ideas/RaisePublish.tsx` |
| D | Rate limits in Postgres; pool settings | VIS-D1 | G | `lib/db/rate-limit.ts`, `server/throttle.ts`, `lib/db/client.ts`, `.env.example`, `docs/DEPLOY.md` |
| B | `CaseView` projections, rebuild, readers | VIS-B1 | A | `lib/db/projections/**`, `lib/db/events.ts`, `prisma/rebuild-projections.ts` |
| C | Filtered log and seed for the browser; load a case on demand | VIS-C1 | B, DIR-C1, AIP-A1 | `app/[company]/(app)/layout.tsx`, `app/[company]/(app)/cases/[caseId]/page.tsx`, `components/dashboard/DemoProvider.tsx`, `server/actions/case-log.ts`, `lib/db/viewer-log.ts` |
| Z | Acceptance, generator, gaps | VIS-Z1 | all | `tests/e2e/db/visibility.spec.ts`, `tests/e2e/db/fixtures/bulk-events.ts`, `docs/VISIBILITY.md` |

Paths under `apps/app/src/` unless they start with `prisma/`, `tests/`, `.env.example` (under `apps/app/`) or `docs/`.

## Risks

- **A manager still sees everything.** Without a window a manager's browser would get 50,000 events. → D9 ships only
  open and recent cases; the ledger counts and dashboards that sum all history move to projections in MET.
- **Projections drift from the log.** → Rebuilt per case on every append, a rebuild script, and a test that compares
  every row with the full reducer (VIS-B1). A projection error never fails an append; the next append or a rebuild
  fixes it.
- **Org changes move visibility** (a leader's reports, a seat's role). → Keys are recomputed by a rebuild; ADM's
  org editor calls `rebuildProjections` after a save (named for ADM in docs/VISIBILITY.md).
- **Old custom audiences are names.** → D10: the rebuild maps them once with IDN's matching; unmatched ones fall back
  to raiser, desk and managers.
- **Companies without rows after the release.** → Q3: pages use the full log until the first rebuild.
- **VIS runs next to DIR, AIP, ADM and NTF.** → VIS owns none of their files; `server/actions/events.ts`,
  `lib/db/sessions.ts` and `features/knowledge/` are not VIS's. Projections update from `appendEventRow`, so VIS
  never edits the event action.
- **The speed test needs a built app** on port 3101 (`playwright.db.config.ts`). → `CI=1` in the proof, own companies,
  deleted at the end.
- **Budget:** 100 % as in PILOT (6 tasks, 80 % + 20 %).
