---
id: DIR
project: nextup
title: Directory sync
state: draft
level: 0
approved: []
milestone: PILOT DIR
summary: "DIR syncs people from Entra into NextUp: new employees appear with department, manager and personnel
  number, movers change unit, and leavers are deactivated, their seats left vacant and their open cases handed to the
  role's other holder. A deactivated person can no longer sign in, and a manager can deactivate or delete someone in
  Members. Where a route has no deputy role, the deputy follows the owner's manager. The sync runs every 15 minutes
  per company behind the DirectorySource interface, so SuccessFactors (SFX) later adds a second source without
  touching it. 6 tasks, 85 % of a window; it starts after IDN and next to CLK."
phases:
  - { id: G, title: Directory fields, run table and inactive users, wps: [ G ], gate: auto }
  - { id: W1, title: Apply a directory page and the Graph adapter, wps: [ A, B ], gate: auto }
  - { id: W2, title: Sync loop, status, manager deputies and member actions, wps: [ C, D ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 1
decisions:
  - { id: D1, text: "(from PILOT/HD13) Plans, code, comments and PRs are in English." }
  - {
      id: D2,
      text: "(from PILOT/HD2 and HD3) Every external system sits behind a connector
        interface of @nextup/contracts/public; the Graph directory is an adapter
        of `DirectorySource`. Public contracts are only extended: DIR may add
        the optional field `employeeId: string | null` (`.nullable().optional()`)
        to `DirectoryEntry` and nothing else."
    }
  - {
      id: D3,
      text: "(from PILOT/HD4) The company's directory source is configuration in the
        database (DirectoryRun.source, D7), never code. `applyDirectoryDelta`
        takes any `DirectoryPage`, never Graph types, so SFX adds
        `successfactors` without changing DIR's code."
    }
  - {
      id: D4,
      text: "(from PILOT/HD10) People are matched by ids only: a directory entry is
        matched to a user by its source key - Graph: `User.entraOid` =
        entry.externalId (the Entra object id), else for a user without
        entraOid by the same email (lower case, as the Microsoft sign-in does);
        successfactors: `User.employeeId` = entry.externalId. Display names are
        never compared. Seats and roles are IDN's (`SeatRow`, `holderOf`,
        `usersOfRole`, `seatsOfRole`, `linkJitSeat`, desk by role)."
    }
  - {
      id: D5,
      text: "(from PILOT/HD14) Allowed directory fields: object id, employeeId (the
        personnel number, when HR feeds Entra from SuccessFactors or SAP HCM),
        display name, work email, department, job title, manager, account
        enabled. Nothing else is requested or stored (no absences, no HR data).
        `employeeId` is never shown in the UI, never logged and never sent to
        the AI. NextUp never writes to the directory."
    }
  - {
      id: D6,
      text: "(from PILOT/HD11 and HD12) DIR changes auth.prisma and, in core.prisma,
        only the back-relation `directoryRun DirectoryRun?` inside the `// --
        auth --` block of Company (after CLK-G1, which owns core.prisma first).
        One migration folder
        apps/app/prisma/migrations/20261112080000_dir_directory/ with
        migration.sql. No package.json or package-lock.json change."
    }
  - {
      id: D7,
      text: "Schema (auth.prisma). User gains `employeeId String?`, `managerId
        String?` with `manager User? @relation(\"UserManager\", fields:
        [managerId], references: [id], onDelete: SetNull)` and `reports User[]
        @relation(\"UserManager\")`, `active Boolean @default(true)`,
        `deactivatedAt DateTime?`, `directorySyncedAt DateTime?`, and
        `@@unique([companyId, employeeId])`, `@@index([companyId, managerId])`.
        New `model DirectoryRun { companyId String @id; company Company
        @relation(fields: [companyId], references: [id], onDelete: Cascade); on
        Boolean @default(false); source String @default(\"graph\"); cursor
        String?; leaseUntil DateTime?; lastRunAt DateTime?; lastOkAt DateTime?;
        lastError String?; added Int @default(0); updated Int @default(0);
        deactivated Int @default(0); handed Int @default(0); updatedAt DateTime
        @updatedAt; updatedBy String? }` (`cursor` is the Graph deltaLink or
        another source's cursor; never shown)."
    }
  - {
      id: D8,
      text: "Scope and unit. An entry belongs to the company when its department
        names an OrgUnit (name or key, case-insensitive, trimmed - IDN's JIT
        rule); `User.dept` is that unit's key, `User.line` the job title. An
        entry whose department names no unit is skipped when it is new; an
        existing user keeps their account with `dept: \"\"`. A new user is
        created with role member, a handle (`newHandle`), the email, `ini`,
        the source key, `employeeId`; sync never changes a role and creates no
        seat (seats come from the Microsoft sign-in, IDN/D12, or an admin).
        Entra groups are carried in the page and not stored (ADM maps groups to
        units)."
    }
  - {
      id: D9,
      text: "`applyDirectoryDelta(companyId, source, page, now)` in
        apps/app/src/lib/db/directory.ts, planned by the pure
        `planDirectoryDelta(input): DirectoryPlan` in
        apps/app/src/features/directory/apply.ts: create and update users
        (name, email, dept, line, employeeId, directorySyncedAt); managers are
        resolved after all entries of the page (managerExternalId → the user
        with that source key, else null); an entry with `active: false` or in
        `removedExternalIds` is a leaver: `active: false`, `deactivatedAt: now`,
        every seat of theirs gets `userId: null` (a vacant seat of the same
        role), and each open case on such a seat is handed with a `case.handed
        { to: <seat label>, toRoleHolderId: <the role's first other seat with an
        active user>, why: \"leaver\" }` by actor `system:directory`, idemKey
        `dir:leaver:<caseId>:<seatId>` (no other holder: no hand-over, the case
        stays with the role). A leaver who comes back (`active: true`) is
        reactivated, without seats. Idempotent: the same page twice changes
        nothing. Returns counts { added, updated, deactivated, handed }."
    }
  - {
      id: D10,
      text: "Graph adapter, apps/app/src/server/directory/graph.ts:
        `graphDirectory(opts: { tenantId; app: EntraApp; fetch?: typeof fetch
        }): DirectorySource`. App-only token by client credentials
        (`tokenUrl(tenantId)`, scope `https://graph.microsoft.com/.default`,
        application permission User.Read.All, admin consent), cached in memory
        until 5 minutes before expiry, never logged. `delta({ cursor })`: cursor
        null → `GET /v1.0/users/delta?$select=id,displayName,mail,userPrincipalName,department,jobTitle,employeeId,accountEnabled&$expand=manager($select=id)`,
        else the cursor URL; follows `@odata.nextLink` one page per call
        (nextCursor = nextLink), and the last page's `@odata.deltaLink` becomes
        the stored cursor (nextCursor null). Maps to DirectoryEntry (email =
        mail or userPrincipalName, externalId = id, `@removed` → removedExternalIds).
        A cursor URL must start with https://graph.microsoft.com/ or it is
        refused."
    }
  - {
      id: D11,
      text: "Sync loop, apps/app/src/server/directory/sync.ts: `runDirectoryOnce(now
        = new Date(), source?: (company) => DirectorySource | null)` - for every
        company with `DirectoryRun.on` and an entraTenantId (graph), claim the
        run's lease (updateMany on leaseUntil null or past, 10 minutes), read
        pages from the stored cursor until nextCursor is null (at most 50 pages
        a round), apply each, store the new cursor only after the last page,
        record counts and lastOkAt, or lastError (cut to 500 characters) and
        keep the old cursor; release. `startDirectorySync()` every
        DIRECTORY_INTERVAL_MS (default 900 000) from apps/app/instrumentation.ts,
        guarded by globalThis like server/jira-sync.ts; a no-op without a
        database or without ENTRA_CLIENT_ID / ENTRA_CLIENT_SECRET."
    }
  - {
      id: D12,
      text: "Deputy from the manager chain. In features/knowledge `seedParts`, a
        route without a deputy role gets as deputy the first seat by sort of
        the owner seat user's manager (`deputyRoleId`, `deputySeatId`, label);
        `Knowledge.managers?: { userId: string; managerId: string }[]` is filled
        by `loadKnowledge` for the company's active users with a manager. A
        route with a deputy role keeps it."
    }
  - {
      id: D13,
      text: "Inactive users and member actions. An inactive user cannot sign in:
        `sessionStillValid` (lib/db/sessions.ts) is false for them, the login
        code is refused (server/actions/auth.ts), the Microsoft sign-in refuses a
        found inactive user with reason `unknown`. In Members, a manager may
        `deactivateMemberAction` (the leaver path of D9 for one user, not
        oneself) and `deleteMemberAction` (only an inactive user; their events
        keep the label, `actorUserId` becomes null by the existing SetNull).
        New strings through `t()` in i18n/messages/settings.ts."
    }
  - {
      id: D14,
      text: "Tests and proofs. Unit tests in apps/app/tests/unit/dir/, run with `npm
        test -w @nextup/app -- tests/unit/dir/<file> -t '<title>'`. DB tests in
        apps/app/tests/db/dir-*.test.ts and the acceptance directory.test.ts,
        following tests/db/setup.ts, run from the repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. Recorded Graph delta pages
        live in apps/app/tests/fixtures/graph-directory/ (made-up tenant, no real
        person), fetch is always injected, never a live call. Top-level files
        apps/app/tests/unit/*.test.ts are not edited (CLK-G1 owns them while
        CLK runs). Run them yourself; only your own DB tests; repeat a red DB
        run once."
    }
  - {
      id: D15,
      text: "Register rows G-015, G-016, G-017 (phase DIR) are listed by DIR-Z1 in
        docs/DIRECTORY.md under `## DIR gaps` with the task that answers each,
        or 'open' with a one-line reason."
    }
questions:
  - {
      id: Q1,
      text: "Which Entra users does a company's sync bring in?",
      default: "Everyone whose department names one of the company's org units
        (D8). A department that matches nothing is skipped; an admin adds the
        unit or its key first."
    }
  - {
      id: Q2,
      text: "How often does the directory sync run?",
      default: "Every 15 minutes (DIRECTORY_INTERVAL_MS), delta only after the
        first full round."
    }
  - {
      id: Q3,
      text: "Who grants the Graph application permission User.Read.All for the test
        tenant?",
      default: "Kevin, in nextuptest.onmicrosoft.com, when TST runs the live check;
        DIR proves everything against recorded pages and
        docs/customer/ENTRA_SETUP.md names the permission."
    }
autonomy:
  merge: [low, normal]
  start_high: true
  replan: none
  budget_window_pct: 85 # tasks 69 % + 20 %
talk:
  telegram: [ question_open, blocked_twice, proof_red_twice, budget_over, gate_kevin, merge_waiting, start_high, other_repo, plan_done ]
  pane: [ blocked, task_merged, phase_done ]
  none: [ task_started ]
---

# DIR Directory sync

Sub-plan of PILOT.

## Goal

After DIR, users, managers and leavers come from Entra, and deputies follow the manager chain where a route names
none. On `main` people reach NextUp only through a login code or the first Microsoft sign-in (G-015, G-016), and
nobody can be deactivated or deleted (G-017). DIR adds a Graph adapter behind `DirectorySource`, a source-agnostic
`applyDirectoryDelta`, a sync loop per company, deactivation that frees seats and hands cases to the role, and the
member actions around it.

## Scope

- User fields for the directory (employeeId, manager, active) and the `DirectoryRun` table (D7).
- `applyDirectoryDelta` for any `DirectoryPage` (D8, D9); leavers' seats vacated and their cases handed (D9).
- Graph delta adapter with app-only credentials (D10); the sync loop with lease and cursor (D11); its status and
  switch in `/admin`.
- Deputy from the manager chain (D12); inactive users cannot sign in; deactivate and delete in Members (D13).

**Takes from:** IDN: user ids, seats and roles, `linkJitSeat` and the department rule, `newHandle`. ARC:
`DirectorySource`, `DirectoryPage`. CLK: `core.prisma` after CLK-G1, `instrumentation.ts` after CLK-D1.

**Hands to:** EID and SFX: `DirectorySource` with the Graph adapter, `applyDirectoryDelta(companyId, source, page)`,
`DirectoryRun.source` (DIR-A1/B1, DIR-B1/B1). ADM and SFX: the sync status (`loadDirectoryStatus`, DIR-C1).

**Not in scope:** SCIM inbound (EID); the SuccessFactors adapter (SFX); storing Entra groups or mapping them to
units (ADM); any HR data beyond D5 (HD14).

## Done when

All proofs are green on `main` and all tasks are merged (work 6/6). That covers the brief: against recorded Graph
delta pages a new user appears with department, manager and employeeId, a mover changes unit, a leaver is
deactivated and their cases move to the role's other holder (DIR-Z1). The acceptance test
`apps/app/tests/db/directory.test.ts` › `DIR acceptance: delta sync adds, moves and deactivates users` is green.

## Phases

- **G Directory fields, run table and inactive users:** the schema change every other task reads, and the sign-in
  refusal for inactive users, which must be in place before any sync can deactivate someone.
- **W1 Apply and adapter:** A writes a page into users and seats, B reads Graph into pages. Disjoint files; with one
  lane they run one after the other.
- **W2 Loop, status, deputies, member actions:** C connects B to A in a loop and shows it in `/admin` (needs CLK-D1 for
  `instrumentation.ts`); D adds the manager-chain deputy and the deactivate and delete actions.
- **Z Acceptance:** recorded pages through the adapter and the loop, and the DIR gaps list.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | User fields, `DirectoryRun`, migration; run helpers; inactive users refused | DIR-G1 | IDN-Z1, CLK-G1 | `prisma/schema/auth.prisma`, `core.prisma` (auth block), `migrations/20261112080000_dir_directory/`, `features/directory/index.ts`, `lib/db/directory-run.ts`, `lib/db/sessions.ts`, `server/actions/auth.ts`, `server/microsoft-login.ts` |
| A | `planDirectoryDelta`, `applyDirectoryDelta`, leaver hand-over | DIR-A1 | G | `features/directory/apply.ts`, `lib/db/directory.ts` |
| B | Graph adapter, contract field, fixtures, Entra setup doc | DIR-B1 | G | `server/directory/graph.ts`, `packages/contracts/src/public/connectors/directory-source.ts`, `tests/fixtures/graph-directory/`, `docs/customer/ENTRA_SETUP.md` |
| C | Sync loop, `/admin` status and switch | DIR-C1 | A, B, CLK-D1 | `server/directory/sync.ts`, `instrumentation.ts`, `app/admin/integrations/page.tsx`, `components/admin/DirectoryAdmin.tsx`, `server/actions/directory-admin.ts`, `i18n/messages/connectors.ts` |
| D | Manager-chain deputy; deactivate and delete in Members | DIR-D1 | A | `features/knowledge/index.ts`, `lib/db/knowledge.ts`, `server/actions/members.ts`, `components/settings/MembersView.tsx`, `i18n/messages/settings.ts` |
| Z | Acceptance and gaps | DIR-Z1 | all | `tests/db/directory.test.ts`, `docs/DIRECTORY.md` |

Paths under `apps/app/src/` unless they start with `prisma/`, `tests/`, `instrumentation.ts` (under `apps/app/`),
`packages/` or `docs/`.

## Risks

- **DIR runs next to CLK and touches two of its files.** → DIR-G1 needs CLK-G1 (core.prisma, one back-relation line in
  the auth block), DIR-C1 needs CLK-D1 (`instrumentation.ts`); every other path is disjoint from CLK and AIP.
- **Deactivating a person is a change on real accounts.** → DIR-G1 and DIR-A1 are `risk: high`; a leaver is never
  deleted by the sync, only deactivated, and comes back when Entra enables them again.
- **A wrong delta page could deactivate many people.** → Only an entry with `active: false` or an explicit
  `@removed` deactivates; a skipped department never does; the run records counts, shown in `/admin`.
- **Graph needs admin consent at the customer** (User.Read.All, application). → `docs/customer/ENTRA_SETUP.md` names
  it (DIR-B1); proofs use recorded pages (Q3); the live check runs in TST.
- **The employeeId is a personnel number** (HD14). → Stored for matching only, never shown, logged or sent to the AI
  (D5); the acceptance test checks it does not appear in the seed the pages receive.
- **Budget:** 85 % against 60 % in PILOT (6 tasks, 69 %): G-017's deactivate and delete actions and the sign-in
  refusal for inactive users were not in the brief's size.
