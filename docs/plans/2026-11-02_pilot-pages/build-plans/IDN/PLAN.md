---
id: IDN
project: nextup
title: Identity by id
state: archived
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-02, note: Kevin im Chat },
    { level: 1, by: kevin, at: 2026-11-02, note: Kevin im Chat },
    { level: 2, by: kevin, at: 2026-11-02, note: Kevin im Chat }
  ]
milestone: PILOT IDN
summary: "IDN makes NextUp decide who someone is by user id and role seat
  instead of display names: inbox, desk, mine, permissions, co-signs, project
  lead and notice mails. A case sits on a role, and everyone holding that role
  sees it; a Microsoft just-in-time leader or manager gets the top role of their
  department, and every new member gets an anonymous handle. Demo content and
  stored events are bound to ids once (a backfill you run per stack after a
  backup). No schema change; 9 tasks, 165 % of a window. Two tasks are risk high
  (sign-in, backfill); like every task they start and merge on their own
  (autopilot.yaml)."
phases:
  - { id: G, title: Identity scaffold, wps: [ G ], gate: auto }
  - {
      id: W1,
      title: Demo ids,
      accounts and backfill,
      wps: [ D, C, M ],
      gate: auto
    }
  - { id: W2, title: Case and project domain on ids, wps: [ A, B ], gate: auto }
  - { id: W3, title: Case pages on ids, wps: [ P ], gate: auto }
  - { id: W4, title: Shell, search and clean-up, wps: [ S ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 2
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD10) Once IDN is merged, people are identified by user id
        and role holder only. Display names are for display and are never
        compared. In IDN this means: every decision about WHO someone is - whose
        inbox or desk a case is on, which cases are mine, who may append an
        event, who co-signed, who is affected, who acted, who is invited, who
        leads or is on a project, who gets a notice mail - compares user ids
        (User.id) or seat ids (OrgRoleHolder.id) and role ids (OrgRole.id). The
        display labels (CaseEvent.actor, payload assignee / to / lead / name /
        owner, the reduced `from`, `assignee`, `by`, `lead`, `members` strings)
        stay in events and state only to be shown."
    }
  - {
      id: D3,
      text: "(from PILOT/HD11 and HD12) IDN changes no .prisma file and adds no
        migration folder: CaseEvent.actorUserId, OrgRoleHolder.userId and
        User.handle already exist on main. Lane sessions never change
        package.json or package-lock.json and install no packages. A task that
        finds it needs either reports `blocked` with the path in backticks."
    }
  - {
      id: D4,
      text: "Identity types and helpers live in apps/app/src/features/auth/identity.ts
        (pure, no Prisma): `type SeatRow = { id: string; roleId: string; label:
        string; userId: string | null; sort: number }` (one OrgRoleHolder row:
        id = holder id, label = holder name); `type Me = { userId: string |
        null; seatIds: string[]; roleIds: string[] }`; `const NOBODY: Me = {
        userId: null, seatIds: [], roleIds: [] }`; `meFor(userId: string | null,
        seats: readonly SeatRow[]): Me` (the seats whose userId equals userId,
        by sort; roleIds without duplicates; NOBODY for null); `meOfSeat(seatId:
        string, seats): Me` ({ userId: that seat's userId, seatIds: [seatId],
        roleIds: [its roleId] }, NOBODY for an unknown seat); `holderOf(seats,
        userId: string): SeatRow | null` (first by sort); `usersOfRole(seats,
        roleId: string): string[]` (distinct non-null userIds by sort);
        `seatsOfRole(seats, roleId): SeatRow[]`; `holdsRole(me, roleId: string |
        null): boolean` (false for null); `type Actor = { role: Role; userId:
        string | null; me: Me; name: string; handle: string | null }` (name and
        handle are labels); `actorLabel(a: { role: Role; name: string; handle:
        string | null }): string` (the handle for a member who has one, else the
        name - today's rule in server/actions/events.ts). DB versions in
        apps/app/src/lib/db/holders.ts: `loadSeats(companyId)`,
        `loadHolderOf(companyId, userId)`, `loadUsersOfRole(companyId, roleId)`,
        each with the company at the top level of the query."
    }
  - {
      id: D5,
      text: "Event fields (apps/app/src/features/cases/events.ts). CaseEvent, NewEvent
        and SeedEvent gain `actorUserId?: string | null` (the person behind
        `actor`; null or absent for system actors such as system:n8n and for
        history nobody is bound to). It comes from the CaseEvent.actorUserId
        column for stored rows, from the signed-in viewer or the demo persona
        for appends, from the demo binding (D9) for seed history. EventPayload
        gains, all optional: `assigneeRoleHolderId: string | null` (case.raised:
        the seat it lands on), `toRoleHolderId: string | null` (case.handed),
        `invitedUserIds: string[]` (case.discussion, case.invited), `leadUserId:
        string | null` (case.decided yes with projectId), `userId: string |
        null` (project.member), `toUserId: string | null` (project.handed),
        `ownerUserId: string | null` (project.step.added and
        project.step.edited; null clears). The label fields next to them stay."
    }
  - {
      id: D6,
      text: "Reduced state. Cases (IDN-A1): ReducedCase gains `fromUserId`,
        `assigneeSeatId`, `assigneeRoleId` (all string | null); HandOver gains
        `fromUserId`, `toSeatId`; Decision, Question, Answer, Building, Shipped,
        Override, CheckIn and Version gain `byUserId`; Discussion gains
        `byUserId` and `invitedUserIds: string[]`; Escalation gains `toSeatId`
        and `toRoleId`; Cosign gains `userId`; IdeaQuestion and Approval gain
        `byUserId`. State gains `seats: SeatRow[]` (IDN-G1). Projects (IDN-B1):
        ReducedProject gains `leadUserId: string | null`, `memberUserIds:
        string[]`, `authorUserIds: string[]`; a step gains `ownerUserId: string
        | null`; the project escalation gains `toSeatId` and `toRoleId`. Every
        id field is null or [] when the event carried no id; a missing id never
        falls back to a label."
    }
  - {
      id: D7,
      text: "Seed fields (apps/app/src/features/demo/types.ts). `Seed.seats:
        SeatRow[]` is required and comes ONLY from the OrgRoleHolder rows
        through structureSeed() in features/knowledge (like the rest of the
        structure, STR/D5): parseSeed() ignores a stored `seats` and gives [],
        contentOnly() sets []. Route gains optional `ownerRoleId`,
        `ownerSeatId`, `deputyRoleId`, `deputySeatId` (string | null;
        seedParts() fills them from the first holder by sort of the rule's owner
        and deputy role); SeedCase gains optional `fromUserId` and
        `assigneeRoleHolderId`; Persona gains optional `userId`; SeedProject
        (features/projects/types.ts) gains optional `leadUserId`,
        `memberUserIds`, `authorUserIds`. ReduceSeed gains optional `seats`
        (default [])."
    }
  - {
      id: D8,
      text: "Desk by role (Kevin, 2026-11-02). A case sits on one seat
        (`assigneeSeatId`, from payload assigneeRoleHolderId, else the route's
        ownerSeatId; a hand-over moves it to toRoleHolderId; an override to the
        chosen route's ownerSeatId), and everyone who holds that seat's role has
        it on their desk: `onDeskOf(c, me) = holdsRole(me, c.assigneeRoleId) ||
        holdsRole(me, c.escalated?.toRoleId ?? null)`. A case whose seat is
        unknown is on nobody's desk; managers keep every right they have today.
        Escalation: when c.assigneeRoleId equals the route's ownerRoleId it goes
        to the deputy (deputySeatId, deputyRoleId, label route.deputy),
        otherwise to the owner (ownerSeatId, ownerRoleId, label
        route.owner.name). The same rule for projects, comparing the lead's user
        id with the user of the route owner's seat."
    }
  - {
      id: D9,
      text: "Demo binding is the only place a label is matched to an id. It lives in
        apps/app/src/features/demo/identity.ts and is called only by that file,
        apps/app/src/lib/db/demo-identity.ts and
        apps/app/src/lib/db/identity-backfill.ts; it runs on demo content and,
        once, on stored data (D12, PILOT/HQ5). `type DemoUser = { id: string;
        name: string; handle: string | null }`; `userByLabel(users, label):
        string | null` = the id of the ONE user whose name or handle equals the
        trimmed label, null when none or several; `seatByLabel(seats, label):
        string | null` = the first seat by sort whose label equals the trimmed
        label; `bindDemoIds(seed, seats, users): Seed` fills only the optional
        id fields of D5 and D7 - seed cases (fromUserId from `from`,
        assigneeRoleHolderId from `assignee`), every seedEvents entry of cases,
        ideas and projects (actorUserId from `actor`; case.handed toRoleHolderId
        from payload.to; case.discussion and case.invited invitedUserIds from
        payload.invited; case.decided leadUserId from payload.lead;
        project.member userId from payload.name; project.handed toUserId from
        payload.to), seed projects (leadUserId, memberUserIds, authorUserIds),
        personas (who.userId) - never changes a label and never overwrites an id
        that is set. `bindDemoCompany(companyId)` in lib/db/demo-identity.ts:
        for every OrgRoleHolder of the company with userId null whose label
        userByLabel finds, set userId; then store
        toSeedJson(contentOnly(bindDemoIds(stored seed, seats, users))) as
        seedJson; returns { seatsLinked, seedBound }; a second run changes
        nothing."
    }
  - {
      id: D10,
      text: "Local demo ids (no database: npm run dev, the demo e2e suite, the static
        /demo). `localDemoSeed(raw: Seed): Seed` in features/demo/identity.ts:
        knowledge = rowsFromSeed(raw, raw.goals, ids \"local-1\", \"local-2\", …
        in call order); one DemoUser per distinct holder label in holder order
        with id `demo-u-<n>` (n from 1), then one per persona whose name holds
        no seat, with the persona's handle; every holder's userId = its label's
        user; result = bindDemoIds(structureSeed(raw, knowledge, { promiseDays:
        raw.promiseDays, outcomeDays: raw.outcomeDays, spend: raw.spend }),
        seats, users). Deterministic: two calls give equal results. `SEED` stays
        the raw built-in seed (templates and tests use it);
        features/demo/index.ts exports `LOCAL_SEED = localDemoSeed(SEED)`, which
        seedFor() returns for acme without a database; STATIC_DEMO_SEED is
        localDemoSeed of the raw static seed (renamed STATIC_DEMO_RAW)."
    }
  - {
      id: D11,
      text: "Handles. Every user whose role is member gets an anonymous handle when it
        is created - Microsoft just-in-time, a manager's Add member, /admin
        Create company - and when a manager changes a user without a handle to
        member. `newHandle(taken: Iterable<string>, random = Math.random):
        string` in apps/app/src/features/auth/handle.ts gives \"Anonymous #\"
        plus 4 digits (0000-9999) not in `taken` (the company's handles), 6
        digits after 50 tries. An existing handle never changes; leaders and
        managers get none."
    }
  - {
      id: D12,
      text: "Just-in-time seat (Kevin, 2026-11-02). MicrosoftIdentity gains
        `department: string` from the ID token's `department` claim (trimmed,
        \"\" when missing). `jitSeatRole(k, department, role): string | null` in
        features/auth/entra.ts (pure; k has the knowledge units and roles): null
        for role member or an empty department; the unit is the first by sort
        whose name or key equals the department case-insensitively; its top role
        is the role of that unit whose reportsToId is null or points to a role
        of another unit, lowest sort; null when there is none.
        `linkJitSeat(companyId, user, department)` in
        apps/app/src/lib/db/accounts.ts: when the user holds no seat and
        jitSeatRole gives a role, it creates an OrgRoleHolder { roleId, name:
        user.name, userId: user.id, sort: highest sort of the company + 1 }
        (when that role already has a holder named user.name, the label is
        `<name> (<email>)`). server/microsoft-login.ts calls it after creating a
        user and on every sign-in of a known user who holds no seat. No match:
        the account is created as today, without a seat."
    }
  - {
      id: D13,
      text: "Server stamping. `stampEvent(type, payload, seed): EventPayload` in
        apps/app/src/features/cases/stamp.ts (pure): for case.raised it sets
        assigneeRoleHolderId to the ownerSeatId of the route payload.routeId
        names in the server's seed, or null, and drops whatever the client sent;
        every other type passes unchanged. appendEventAction stores the stamped
        payload. mayAppend refuses a case.handed whose toRoleHolderId is not a
        seat in state.seats, with the new message `cases.permHandSeat` (en
        \"Choose who to hand it to.\", de \"Wähle, an wen du es übergibst.\").
        The integration endpoint (app/api/[company]/events, not IDN's) is
        unchanged: a hand-over from n8n without a seat id moves the label and
        leaves the case on no desk."
    }
  - {
      id: D14,
      text: "Not moved to ids in IDN (they show org data, they do not decide who
        someone is, and their files belong to later phases):
        features/cases/visibility.ts custom `seenBy` lists (VIS), the label
        lookups in features/ideas/{brief,receivers,finalize}.ts and
        components/ideas/** (LOOP), features/org, features/metrics,
        features/evaluate and the dashboard directory lookups (MET), the
        /people/[name] pages (ADM), the comment in
        apps/app/prisma/schema/auth.prisma (DIR). IDN-Z1 lists every one of them
        in docs/IDENTITY.md under `## Name lookups left` with file and phase."
    }
  - {
      id: D15,
      text: "Tests and proofs. A unit test lives in apps/app/tests/unit/idn/ and runs
        with `npm test -w @nextup/app -- tests/unit/idn/<file> -t '<title>'`. A
        DB test lives in apps/app/tests/db/idn-*.test.ts, follows
        tests/db/setup.ts (it truncates), creates its own companies and runs
        from the repo root as
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. A demo e2e test runs with
        `npm run e2e -w @nextup/app -- tests/e2e/demo/<spec> -g '<title>'`. Run
        them yourself before you report done; run only your own DB tests (the
        test database is shared) and repeat a red DB run once before it counts."
    }
  - {
      id: D16,
      text: "Register rows: G-003, G-004, G-005 and G-046 of docs/audit/gaps (phase
        IDN) are listed by IDN-Z1 in docs/IDENTITY.md under `## IDN gaps` with
        the task that answers each, or 'open' with a one-line reason. IDN builds
        nothing beyond its tasks for them."
    }
  - {
      id: D17,
      text: "apps/app/src/features/cases/reducer.ts says \"Only Kevin changes this
        file\". IDN-G1 and IDN-A1 change it under Kevin's L2 approval of this
        plan, keep the header line and change nothing in it beyond their task."
    }
  - {
      id: D18,
      text: "Hand-over between the domain and the pages. IDN-A1 and IDN-B1 add the id
        functions next to the old label functions and mark each old one `/**
        @deprecated IDN-S1 removes this - use <new name>. */`, so pages they do
        not own keep compiling. IDN-P1 and IDN-S1 move every caller; IDN-S1
        deletes the deprecated functions. New names: features/cases/selectors.ts
        `onDeskOf(c, me)`, `inboxOf(state, me)`, `mineOf(state, me)`,
        `cosignedOf(state, me)`, `actedByMe(c, me)`, `deskOf(state, me)`,
        `clearedByMe(state, me)`, `deskSeats(state)` (the seats that hold an
        open or asked case); features/projects/selectors.ts `projectsOfMe(state,
        me)`, `authoredByMe(state, me)`, `escalatedToMe(state, me)`;
        features/projects/views.ts takes `{ role, userId }` in the `…For`
        variants of the functions that take a Viewer today."
    }
questions:
  - {
      id: Q1,
      text: "Who runs the identity backfill (D12 of the PILOT brief, HQ5) on the
        stacks that exist before IDN is deployed (the shared demo box)?",
      default: "Kevin, once per stack by hand after the IDN release and after a backup
        (`stack/backup.sh`), in the app container: `npx tsx
        prisma/identity-backfill.ts`. docs/IDENTITY.md names the command. No
        change to stack/ (OPS owns it)."
    }
  - {
      id: Q2,
      text: "What if the customer's IT does not put the department claim into the ID
        token?",
      default: "The user gets an account without a seat and sees no route's cases
        until DIR syncs their department or an admin seats them (ADM).
        docs/customer/ENTRA_SETUP.md says how to emit the claim (claims mapping
        policy on user.department)."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 165 # tasks 137 % + 20 %
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

# IDN Identity by id

Sub-plan of PILOT.

## Goal

After IDN, inbox, assignee, actor and permissions work on user ids and role holders, so a user created by Entra
just-in-time gets the cases of their role. On `main` (51a8e43) every decision about who someone is compares
display strings: `onDesk` compares `assignee` and `escalated.to` with a name, `mineFor` and `cosignedBy` compare
a handle, `mayAppend` and `mayAppendProject` compare `actor.name` and `actor.handle`, and routes carry the owner's
name. A user created by Microsoft sign-in has no seat and matches nothing. The database already stores
`CaseEvent.actorUserId` for every app event and has `OrgRoleHolder.userId` and `User.handle`, but the reducer
never reads them.

## Scope

- Identity model (D4-D7): seats (role holders) in the seed from the tables, ids on events, payloads, reduced
  cases and projects; labels stay for display only (D2).
- Desk by role (D8): everyone who holds the role of the seat a case sits on has it on their desk.
- Permissions, selectors and the server's raise stamp on ids (D13); projects on ids.
- Demo content bound to ids once, locally and for demo companies (D9, D10).
- Handles for every new member (D11); a just-in-time Microsoft user gets the top role of their department (D12).
- A one-off backfill of stored companies and events (PILOT/HQ5, Q1).
- Every page that decides who someone is (inbox, desk, mine, cosigned, affected, invited, project lead) on ids.

**Takes from:** STR: table `OrgRoleHolder` and `holdersOfRole` / `loadHoldersOfRole`, `structureSeed` and
`rowsFromSeed`. ARC: `Person` and `RoleHolder` in `@nextup/contracts/public` (docs/adr/0001-canonical-model.md).
LNG: the catalog `t(key)` (new messages in de and en).

**Hands to:** CLK, DIR, AIP, ADM, VIS: `holderOf(seats, userId)` and `usersOfRole(seats, roleId)` (and their DB
versions `loadHolderOf`, `loadUsersOfRole`), event fields `actorUserId` and `assigneeRoleHolderId` (proofs
IDN-G1/B1-B3 and IDN-A1/B2). DIR: `linkJitSeat` and the department rule (IDN-C1). VIS: `onDeskOf` and `Me` for
server-side visibility.

**Not in scope:** directory sync (DIR); the label lookups listed in D14; server-side visibility (VIS);
pseudonymising stored labels (GDP).

## Done when

All proofs are green on `main` and all tasks are merged (work 9/9). That covers the brief: no comparison of a
display name remains in `features/cases` and `features/projects` (IDN-S1/B1, the scan test), and a JIT user who
holds a route owner's role sees that route's new case in the inbox (IDN-Z1). The acceptance test
`apps/app/tests/e2e/db/identity.spec.ts` › `IDN acceptance: a JIT user holding a role gets its cases` is green.
Every task keeps lint, typecheck, test and build green.

## Phases

- **G Identity scaffold:** the types, fields and helpers every other task builds on, additive only: nothing reads
  the new ids yet, so behaviour does not change. One task, because the type files are shared by all others.
- **W1 Demo ids, accounts and backfill:** D binds demo content (local and demo companies) to ids, C gives new users
  handles and JIT seats, M rewrites stored data once. Their files are disjoint; M needs D's matching functions.
- **W2 Case and project domain on ids:** A switches reducer, permissions and the raise stamp for cases, B the same
  for projects and the loop mails. Disjoint files: G already put the shared plumbing (seats into `State`, the
  project hooks in the reducer) in place. The old label functions stay deprecated (D18).
- **W3 Case pages on ids:** P moves the dashboards and the case helpers they call to `me`.
- **W4 Shell, search and clean-up:** S moves the hand-over picker, shell, profile, search and the idea features,
  then deletes the deprecated functions and adds the scan test. After P, because both edit `DemoProvider.tsx` and
  `LoopSheets.tsx`.
- **Z Acceptance:** the end-to-end JIT test and the IDN gaps list.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | Identity types and helpers, handles helper, event/seed fields, seats from the tables, `ctx.me`, `Actor` on the server | IDN-G1 | STR-Z1, LNG-F1, LNG-D1 | `features/auth/{identity,handle}.ts`, `features/cases/{events,persist,permissions,reducer}.ts`, `features/projects/{types,reduce}.ts`, `features/demo/{types,seed,static-demo,index,parse,content}.ts`, `features/knowledge/index.ts`, `lib/db/{events,holders}.ts`, `components/dashboard/DemoProvider.tsx`, `server/actions/events.ts`, `docs/IDENTITY.md`, unit test fixtures |
| D | Demo content on ids: `bindDemoIds`, `localDemoSeed`, `bindDemoCompany`, demo template and `db:seed` | IDN-D1 | G | `features/demo/{identity,index,static-demo}.ts`, `lib/db/demo-identity.ts`, `server/actions/admin.ts`, `prisma/seed.ts` |
| C | Handles for new members, department claim, JIT seat | IDN-C1 | G | `features/auth/entra.ts`, `lib/db/accounts.ts`, `server/microsoft-login.ts`, `server/actions/members.ts`, `docs/customer/ENTRA_SETUP.md` |
| M | One-off identity backfill of stored companies and events | IDN-M1 | D | `prisma/identity-backfill.ts`, `lib/db/identity-backfill.ts`, `docs/IDENTITY.md` |
| A | Cases: reducer ids, id selectors, permissions, raise stamp, notice owner | IDN-A1 | G, D | `features/cases/{reducer,selectors,permissions,stamp,notice}.ts`, `server/actions/{events,admin}.ts`, `server/connections.ts`, `i18n/messages/cases.ts` |
| B | Projects: reducer ids, permissions, id selectors and views, project pages, loop mails | IDN-B1 | G, D | `features/projects/{reduce,permissions,selectors,views}.ts`, `components/projects/**`, `features/loop/notice.ts`, `server/loop-notice.ts`, `i18n/messages/projects.ts` |
| P | Dashboards and case helpers on `me`; view-as by seat | IDN-P1 | A, B | `features/cases/{rows,discussion,thread,feed}.ts`, `components/dashboard/**` callers, `components/shell/{LoopSheets,DevPanel}.tsx` |
| S | Hand-over picker, shell, profile, search, idea features; old functions removed; scan test | IDN-S1 | P | `components/shell/{InputSheet,SimpleShell,LoopSheets}.tsx`, `components/dashboard/{DemoProvider,shared/CollaborationView}.tsx`, `components/profile/ProfileView.tsx`, `features/search/navbar.ts`, `features/ideas/{company-read,demo-loop}.ts`, `features/projects/brain.ts`, `features/cases/selectors.ts`, `features/projects/{selectors,views}.ts` |
| Z | Acceptance and gaps | IDN-Z1 | all | `tests/e2e/db/identity.spec.ts`, `docs/IDENTITY.md` |

Paths under `apps/app/src/` unless they start with `prisma/`, `tests/` (both under `apps/app/`) or at the repo root
(`docs/`).

## Risks

- **The reducer is Kevin's file** (header "Only Kevin changes this file"). → D17: G1 and A1 change it under this
  plan's L2 approval, nothing else.
- **The backfill rewrites stored events** (an append-only table) and is not reversible. → IDN-M1 is `risk: high`,
  idempotent, never changes a label, matches only a unique name or handle, and is proven on a DB copy of a demo
  company built the pre-IDN way. Kevin runs it per stack after `stack/backup.sh` (Q1). Only demo data exists today
  (PILOT/HQ5).
- **Sign-in changes** (IDN-C1, `risk_guard` `**/auth/**`, `**/microsoft-login*`) → `risk: high`; under autopilot.yaml (2026-11-02) orch merges it once proofs and CI are green.
  A department that matches nothing still creates the account as today.
- **Pages break between W2 and W4** if the old functions vanish too early. → D18: the old ones stay deprecated until
  IDN-S1, so every PR compiles and keeps its behaviour.
- **IDN-P1 and IDN-S1 together touch ~30 page files.** Most changes are one token (`persona.who.name` → `me`), but
  the sessions may run long. → Split in two waves; each lists its files; a `wip` commit continues on the next start.
- **Local demo and the demo e2e suite** depend on the built-in seed's names. → D10 binds it once with deterministic
  ids; IDN-D1 proves every route and persona has its seat, IDN-P1 proves the demo inbox in the browser.
- **The JIT acceptance needs a Microsoft token.** → IDN-Z1 creates the user through `createMicrosoftUser` (the same
  code the sign-in calls, IDN-C1) and signs them in with a login code; the token parsing is proven by IDN-C1's unit
  test.
- **A route whose owner role is a top role is needed for the acceptance.** In the demo seed, Engineering's top role
  "Engineering lead" owns r2 and r4, so a JIT leader with department "Engineering" gets r2's cases.
- **Shared test database on :5442** (truncating `ops/test-db.sh`). → D15: own DB tests only, repeat a red run once.
- **Budget:** 165 % against 100 % in PILOT (9 tasks, 137 %). The brief's size missed the page work (every
  dashboard decides "is this mine" by name) and the demo binding; PILOT is updated with this plan.
