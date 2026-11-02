---
id: ADM
project: nextup
title: Administration in the app
state: draft
level: 0
approved: []
milestone: PILOT ADM
summary: "ADM lets a company's managers set the company up in the app instead of /admin and the seed: company
  profile and rules, the calendar, the org with roles and seats, the routing table, members with invites, and the
  connectors (Microsoft 365, Jira Cloud and Data Center, the AI provider, directory status). An empty company is
  set up end to end by a wizard, and its first case reaches the right inbox. The stack's /admin opens only for named
  admins with a second factor; the shared admin code still works as a logged break-glass. Per-site calendars and
  mapping Entra groups to units are left out. Added from the page specs (2026-11-02): the goals editor, the company
  notifications page, resetting a lost second factor, and setup that stays open until it is done. 11 tasks, 180 % of
  a window."
phases:
  - { id: G, title: Settings frame, wps: [ G ], gate: auto }
  - { id: W1, title: Company, rules, calendar, org and routing editors, wps: [ A, B ], gate: auto }
  - { id: W2, title: Connectors, members, admin access and goals, wps: [ C, D, E, H ], gate: auto }
  - { id: W3, title: Setup wizard, notifications page and second-factor reset, wps: [ F, N, R ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 2
decisions:
  - { id: D1, text: "(from PILOT/HD13) Plans, code, comments and PRs are in English." }
  - {
      id: D2,
      text: "(from PILOT/HD4) What differs between companies is configuration in the
        database. Every ADM editor writes the company's own rows (STR's
        structure tables, CompanyRule, CompanyCalendar, the integration rows);
        nothing is written into seedJson or code."
    }
  - {
      id: D3,
      text: "(from PILOT/HD9) Every user-facing string goes through the message
        catalog and exists in German and English. ADM-G1 registers the
        namespaces `settingsCompany`, `settingsOrg`, `settingsConnectors`,
        `settingsSetup` and `adminAccess` (files
        apps/app/src/i18n/messages/<name>.ts, empty objects, wired into de.ts and
        en.ts); each later task adds keys only to the namespace its `owns`
        names, and to `settings` / `auth` where it owns those files."
    }
  - {
      id: D4,
      text: "(from PILOT/HD11 and HD12) ADM changes one schema file: auth.prisma,
        in ADM-E1 only (fields of D13), with its own migration folder
        apps/app/prisma/migrations/20261116090000_adm_admin_access/. PILOT's
        area map gives auth.prisma to DIR; ADM-E1 needs DIR-G1 and touches only
        model User. No structure.prisma change. Lane sessions never change
        package.json or package-lock.json."
    }
  - {
      id: D5,
      text: "(from IDN, DIR) People are ids (IDN/D2): seats are OrgRoleHolder rows
        (`SeatRow`, apps/app/src/features/auth/identity.ts), a seat links to a
        member by user id, never by name. Members can be deactivated and deleted
        (DIR-D1); a deactivated member cannot sign in (DIR-G1)."
    }
  - {
      id: D6,
      text: "Company admin. A company admin is a user of that company with role
        manager (ROLE_ACCESS already limits /settings to managers).
        `companyAdminOf(slug)` in apps/app/src/server/actions/settings/guard.ts
        returns the viewer (getViewerFor) when the database still says they are
        an active manager of that company, else null; every settings page and
        settings action calls it first. A company admin never reaches another
        company's rows: every write names the company id from the guard, never
        from the form."
    }
  - {
      id: D7,
      text: "Settings frame. /<company>/settings has the sections, in this order:
        Setup (while `setupStep` is not `done`, D14), Company, Rules,
        Calendar, Org, Routing, Members, Connectors; the nav is
        `SETTINGS_SECTIONS` in apps/app/src/features/settings/sections.ts with
        key, path and message key. The settings index redirects to Setup while setup
        is not done, else to Company. Every form element and step a
        test needs has a `data-testid` `settings-<section>-<thing>` (wizard:
        `setup-step-<key>`)."
    }
  - {
      id: D8,
      text: "Org and routing editor. Writes go through
        apps/app/src/lib/db/org-edit.ts, one function per change (`addUnit`,
        `updateUnit`, `removeUnit`, `addRole`, `updateRole`, `removeRole`,
        `addSeat`, `linkSeat(seatId, userId | null)`, `removeSeat`, `saveRoute`,
        `removeRoute`, `moveRoute`), each with `updatedBy` = the admin's name,
        each checked first by pure rules in apps/app/src/features/org-edit/
        (key 1-32 [A-Z0-9_], unique per company; title 1-120; no reportsTo
        loop; a role whose holders own a route cannot be removed while the route
        names it; a route needs an owner role; keywords 1-30 of 1-40 chars).
        A refused change returns the message key of the rule that refused it."
    }
  - {
      id: D9,
      text: "Rules and calendar. The Rules page edits `promise_days`,
        `outcome_days` and `spend` through `saveCompanyRules` (STR) and the loop
        rules through `saveLoopRules` (apps/app/src/lib/db/loop.ts). The Calendar
        page edits the one company calendar through `saveCalendar` (CLK):
        region, workdays, extra holidays and extra workdays, and shows the
        holidays of this and next year from `holidaysOf`. No per-site calendar
        (CLK counts one working-day number per company)."
    }
  - {
      id: D10,
      text: "Connectors page. Microsoft 365: the company's search switch (the action
        behind `setM365SearchAction`) and the data block of PR D of
        docs/plans/2026-10-22_sso-and-data-access.md (how many people are
        connected, when the last search ran; never content, never a name).
        Jira: the form of the /admin Jira screen with both flavors, `cloud` and
        `dc` (base URL and personal access token; the Data Center client is
        server/jira/dc.ts), test, save, on/off, sync now. AI: AIP's
        `loadAiSettings` / `saveAiSettings` (provider, region, endpoint, model,
        key write-only). Directory: DIR's `loadDirectoryStatus` read-only (source,
        on, last run, last error). A key or token is never sent back to the
        browser; the form shows only whether one is set."
    }
  - {
      id: D11,
      text: "Members. The page DIR-D1 built gains: the seats a member holds (link
        and unlink through `linkSeat`), and Invite: the person is added as today
        and gets a mail with their personal login code and the company's login
        address (the code is in the mail body, never in a URL), sent through
        `sendMail` (apps/app/src/server/mail.ts). The (auth) pages signup,
        invite/[token] and forgot-password stop saying \"coming\": signup and
        invite redirect to the company login, forgot-password tells the person
        to ask their manager for a new code (G-018)."
    }
  - {
      id: D12,
      text: "Second factor. TOTP (RFC 6238, SHA-1, 6 digits, 30 s, one step of drift)
        in apps/app/src/features/auth/totp.ts with node:crypto and a base32
        codec of its own; the secret is sealed with the connector vault
        (`seal` / `open`, context `totp:<companyId>:<userId>`). A manager who
        signs in with a personal code must enter a TOTP code once they enrolled;
        a manager without one is sent to enrol (the key and an otpauth: link
        shown as text, no QR image, Q2) before any page. Members and leaders
        sign in by code as today. Microsoft sign-in needs no TOTP (Entra does
        MFA)."
    }
  - {
      id: D13,
      text: "Stack admin (/admin). Opens for (a) a Microsoft sign-in with the
        NextUp.Admin app role, as today, or (b) a user with `isStackAdmin` who
        signs in with their personal code and TOTP. ADMIN_ACCESS_CODE still
        opens it as break-glass: every use writes one log line `[admin]
        break-glass <ISO time>` (no personal data) and /admin shows a banner
        \"opened with the shared code\" for that session (a flag in the admin
        cookie). Fields on
        User (auth.prisma): `totpSecretSealed String?`, `totpEnabledAt
        DateTime?`, `isStackAdmin Boolean @default(false)`; `isStackAdmin` is set
        in /admin People by an admin, never by the user."
    }
  - {
      id: D14,
      text: "Setup wizard. /<company>/settings/setup, steps `company` (name,
        profile), `units` (at least one), `roles` (at least one role with a
        seat), `routes` (at least one route with an owner role), `members` (add
        or invite), `done`; each step saves through the same actions as its
        page (no second write path) and can be left and resumed. The step is
        derived from what exists, never stored: `setupStep(counts)` in
        features/settings/sections.ts (ADM-G1, pure) takes { named, units,
        linkedSeats, routes, members } and gives the first step not done; the
        settings menu shows Setup and the index redirects to it until it gives
        `done`. It hands TST and PIL the step
        test ids of D7."
    }
  - {
      id: D15,
      text: "Tests and proofs. Unit tests in apps/app/tests/unit/adm/, run with `npm
        test -w @nextup/app -- tests/unit/adm/<file> -t '<title>'`. DB tests in
        apps/app/tests/db/adm-*.test.ts following tests/db/setup.ts, run from the
        repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. E2E with the DB like
        STR-Z1 (CI=1, port of playwright.db.config.ts). Run them yourself; only
        your own DB tests; repeat a red DB run once."
    }
  - {
      id: D16,
      text: "Register rows G-012, G-013, G-014, G-018 and G-047 (phase ADM) are listed
        by ADM-Z1 in docs/SETTINGS.md under `## ADM gaps` with the task that
        answers each, or 'open' with a one-line reason."
    }
  - {
      id: D17,
      text: "Goals. The Rules page gets a Goals section (ADM-H1): company goals
        (`Goal`: title, kpi, target, period, keywords, orgUnitId null = company-
        wide) listed company-wide first, then by unit, edited in a drawer, through
        `addGoal`, `updateGoal`, `removeGoal` in apps/app/src/lib/db/goals-edit.ts,
        checked first by pure rules in features/org-edit/goals.ts (title 1-120,
        keywords 0-30 of 1-40 chars, a unit of the same company). Ideas already
        scored keep their score."
    }
  - {
      id: D18,
      text: "Notifications page (ADM-N1), section `notifications` after
        Connectors: the company's switch `CompanyConfig.notifications`, the stage
        gate in words (a sandbox sends nothing), how many people opted out per
        kind (counts only, below 5 shown as 'fewer than 5'), and the outbox's
        failed messages of the last 14 days from NTF's `listOutbox(companyId,
        { status: \"failed\" })` (kind, channel, time, error; never a body,
        never an address of a person) with Retry for one row. Webhook
        subscriptions are not here: API builds their editor (PILOT, API)."
    }
  - {
      id: D19,
      text: "A lost second factor (ADM-R1). In Members a company admin can 'Reset
        second factor' for another manager of the company (never for
        themselves); a stack admin can do it in /admin People. It clears
        `totpSecretSealed` and `totpEnabledAt`, logs `[auth] totp reset
        <ISO time>` without personal data, and the person enrols again at their
        next code login. Managers of demo-stage companies sign in through the
        demo and never enrol."
    }
  - {
      id: D20,
      text: "Company login (ADM-E1): the side panel with the sample numbers
        (\"26 h\", \"84 %\", \"3\") shows only for demo-stage companies; a
        real company's login shows its name and mark only."
    }
  - {
      id: D21,
      text: "UI follows the page specs in the Nextup repo,
        docs/plans/2026-11-02_pilot-pages.md and its files 01 (shell, Company,
        Rules, Calendar, Org, Members), 02 (Routing, Setup), 03 (Connectors), 06
        (Notifications) and 08 (second factor, company login, /admin login).
        Where a spec shows more than a task here builds, the task builds only
        its part; where they disagree on a function, field or limit, this plan
        wins."
    }
questions:
  - {
      id: Q1,
      text: "PILOT's brief asks for a calendar per site. CLK counts one working-day
        number per company. Build per-site calendars in ADM?",
      default: "No. ADM edits the company calendar; a site calendar needs a per-case
        clock and is recorded as open in docs/SETTINGS.md for after the pilot."
    }
  - {
      id: Q2,
      text: "Show a QR code for TOTP enrolment? A QR image needs a package.",
      default: "No QR in ADM: the key and an otpauth: link as text, which every
        authenticator app accepts by hand; a QR comes with a deps/ADM PR if you
        want it."
    }
  - {
      id: Q3,
      text: "DIR says Entra groups are mapped to units in ADM, but DIR stores no
        groups. Build a group mapping?",
      default: "No. Units come from the department attribute (IDN, DIR); a group
        mapping waits until a pilot customer needs it."
    }
  - {
      id: Q4,
      text: "Must leaders and members also use a second factor with their code?",
      default: "No: only managers (company admins) and stack admins; everyone else
        signs in by code as today or with Microsoft."
    }
autonomy:
  merge: [low, normal]
  start_high: true
  replan: none
  budget_window_pct: 180 # tasks 150 % + 20 %, rounded
talk:
  telegram: [ question_open, blocked_twice, proof_red_twice, budget_over, gate_kevin, merge_waiting, start_high, other_repo, plan_done ]
  pane: [ blocked, task_merged, phase_done ]
  none: [ task_started ]
---

# ADM Administration in the app

Sub-plan of PILOT.

## Goal

After ADM, a company admin manages members, org, routes, rules, calendar and connectors in the app, with a second
factor for code logins, and the shared admin code is only a logged break-glass. On `main` `/settings/company` is an
empty page (G-014), the routing table is read-only from the seed (G-012), the org is written once at creation with
no editor (G-013), signup, invite and password reset are stubs (G-018), and `/admin` opens with one shared code
(G-047). Connector settings live only in the stack's `/admin`.

## Scope

- Settings frame and guard for company admins (D6, D7).
- Company profile, rules and calendar pages (D9); org, seats and routing editor (D8).
- Connectors page: Microsoft 365 with the data block, Jira Cloud and Data Center, AI provider, directory status (D10).
- Members: seats and invite; the auth stubs (D11).
- TOTP for managers' code logins and named stack admins; break-glass logged (D12, D13); a lost second factor
  reset by another manager or a stack admin (D19); the login's sample numbers only on demo (D20).
- Goals on the Rules page (D17); the company notifications page with failed messages (D18).
- Setup wizard for an empty company (D14).

**Takes from:** STR: the structure tables, `saveCompanyRules`. IDN: seats, `linkJitSeat`, ids. CLK: `CompanyCalendar`,
`saveCalendar`, `holidaysOf`. DIR: deactivate and delete in Members, `loadDirectoryStatus`, inactive users refused.
AIP: `loadAiSettings` / `saveAiSettings`. CNX: the Jira Data Center client. LNG: `t(key)`.

**Hands to:** FLR: the settings frame (`SETTINGS_SECTIONS`) to add an Areas section. TST: the wizard's step test ids
(ADM-F1). PIL: the wizard as the pilot bootstrap.

**Not in scope:** per-site calendars (Q1), mapping Entra groups to units (Q3), QR codes (Q2), the directory sync
itself (DIR), QR areas (FLR), an audit view (GDP).

## Done when

All proofs are green on `main` and all tasks are merged (work 8/8). That covers the brief: a fresh company is
configured end to end in the UI (wizard → org → routes → first case reaches the right inbox) without `/admin`
(ADM-Z1). The acceptance test `apps/app/tests/e2e/db/admin-setup.spec.ts` › `ADM acceptance: an empty company is
configured in the app and its first case is routed` is green.

## Phases

- **G Settings frame:** the guard, the section list, the namespaces and the nav, so the editors after it each own
  their own pages and message files.
- **W1 Editors:** A (company, rules, calendar) and B (org, seats, routing) touch different pages and tables.
- **W2 Connectors, members, admin access:** C, D and E are disjoint; each waits for the plan whose files it edits
  (AIP, DIR, CLK).
- **W3 Setup wizard:** F reuses the actions of A, B and D.
- **Z Acceptance:** the end-to-end setup of an empty company and the ADM gaps list.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | Guard, sections, nav, namespaces | ADM-G1 | IDN-Z1, LNG-Z1 | `server/actions/settings/guard.ts`, `features/settings/sections.ts`, `app/[company]/(app)/settings/{layout,page}.tsx`, `i18n/{de,en}.ts`, the five new namespace files |
| A | Company, rules, calendar | ADM-A1 | G, CLK-G1, CLK-A1 | `app/[company]/(app)/settings/{company,rules,calendar}/**`, `components/settings/{CompanyForm,RulesForm,CalendarForm}.tsx`, `server/actions/settings/company.ts`, `i18n/messages/settingsCompany.ts` |
| B | Org, seats, routing | ADM-B1 | G | `app/[company]/(app)/settings/{org,routing}/**`, `components/settings/{OrgEditor,RoutingEditor}.tsx`, `server/actions/settings/org.ts`, `lib/db/org-edit.ts`, `features/org-edit/**`, `i18n/messages/settingsOrg.ts` |
| C | Connectors | ADM-C1 | G, AIP-G1, DIR-C1 | `app/[company]/(app)/settings/connectors/**`, `components/settings/connectors/**`, `server/actions/settings/connectors.ts`, `i18n/messages/settingsConnectors.ts` |
| D | Members seats and invite; auth stubs | ADM-D1 | B, DIR-D1 | `components/settings/MembersView.tsx`, `server/actions/members.ts`, `app/(auth)/{signup,invite,forgot-password}/**`, `i18n/messages/{settings,auth}.ts` |
| E | TOTP, named stack admins, break-glass | ADM-E1 | G, DIR-G1, CLK-B1 | `prisma/schema/auth.prisma`, `migrations/20261116090000_adm_admin_access/`, `features/auth/totp.ts`, `server/actions/{auth,admin}.ts`, `server/admin-session.ts`, `app/[company]/login/**`, `app/admin/{login,people}/**`, `components/auth/CompanyLoginForm.tsx`, `components/admin/AdminLoginForm.tsx`, `i18n/messages/adminAccess.ts` |
| H | Goals on the Rules page | ADM-H1 | A | `app/[company]/(app)/settings/rules/page.tsx`, `components/settings/GoalsEditor.tsx`, `lib/db/goals-edit.ts`, `features/org-edit/goals.ts`, `server/actions/settings/goals.ts`, `i18n/messages/settingsGoals.ts`, `i18n/{de,en}.ts` |
| N | Notifications page | ADM-N1 | G, H, NTF-B1 | `app/[company]/(app)/settings/notifications/**`, `components/settings/NotificationsSettings.tsx`, `server/actions/settings/notifications.ts`, `features/settings/sections.ts`, `i18n/messages/settingsNotifications.ts`, `i18n/{de,en}.ts` |
| R | Reset a lost second factor | ADM-R1 | D, E | `components/settings/MembersView.tsx`, `server/actions/settings/totp-reset.ts`, `app/admin/people/**`, `i18n/messages/{settings,adminAccess}.ts` |
| F | Setup wizard | ADM-F1 | A, B, D | `app/[company]/(app)/settings/setup/**`, `components/settings/SetupWizard.tsx`, `server/actions/settings/setup.ts`, `i18n/messages/settingsSetup.ts` |
| Z | Acceptance | ADM-Z1 | all | `tests/e2e/db/admin-setup.spec.ts`, `docs/SETTINGS.md` |

Paths under `apps/app/src/` unless they start with `prisma/`, `migrations/` (under `apps/app/prisma/`), `tests/` or
`docs/`.

## Risks

- **Sign-in changes** (ADM-E1: TOTP, stack admins, break-glass) lock people out if they go wrong. → risk high;
  Microsoft sign-in and members' code sign-in stay as they are; the shared code still opens /admin (logged).
- **auth.prisma is DIR's file in PILOT's area map** (HD11). → ADM-E1 needs DIR-G1, changes only model User, and the
  main chat records the exception in PILOT.
- **Files of other plans:** Members (DIR-D1), `server/actions/{auth,admin}.ts` (DIR-G1,
  CLK-B1). → `needs` on those tasks instead of sharing; ADM runs only after them.
- **The org editor can break routing** (a removed role a route still names). → D8's rules refuse it before any
  write; ADM-B1 proves each rule.
- **The acceptance needs a TOTP code for the manager.** → ADM-Z1 computes it with `features/auth/totp.ts` from the
  sealed secret it reads with the vault key of the test environment.
- **Budget:** 180 % against 100 % in PILOT (11 tasks, 150 %): the connectors page, the invite and the admin access
  are each a task of their own; goals, notifications and the second-factor reset came from the page specs.
