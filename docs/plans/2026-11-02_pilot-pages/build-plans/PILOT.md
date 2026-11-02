---
id: PILOT
project: nextup
title: Pilot-ready NextUp for companies of 1,000-2,000 employees
state: draft
approved: null
plans:
  # after: phases whose last wave must be merged · go: auto | kevin · stage: idea | ready | planned | active | done
  - { id: AUD, title: Audit and gap register, after: [], go: auto, stage: active, size: M, budget_pct: 75 }
  - { id: ARC, title: Integration architecture and contracts, after: [AUD], go: auto, stage: active, size: M, budget_pct: 75 }
  - { id: OPS, title: Production deploy path per customer, after: [AUD], go: auto, stage: planned, size: L, budget_pct: 125 }
  - { id: STR, title: Company structure out of the seed, after: [ARC], go: kevin, stage: planned, size: L, budget_pct: 100 }
  - { id: LNG, title: German and English, after: [ARC], go: kevin, stage: planned, size: L, budget_pct: 150 }
  - { id: CNX, title: Knowledge and work connectors, after: [ARC], go: auto, stage: planned, size: M, budget_pct: 60 }
  - { id: IDN, title: Identity by id, after: [STR], go: auto, stage: active, size: L, budget_pct: 165 }
  - { id: CLK, title: Real clock and scheduler, after: [IDN], go: auto, stage: active, size: M, budget_pct: 90 }
  - { id: DIR, title: Directory sync, after: [IDN], go: auto, stage: planned, size: M, budget_pct: 85 }
  - { id: AIP, title: AI provider and quality, after: [IDN, CNX], go: auto, stage: planned, size: M, budget_pct: 85 }
  - { id: ADM, title: Administration in the app, after: [IDN, LNG], go: auto, stage: planned, size: L, budget_pct: 180 }
  - { id: VIS, title: Read model and server-side visibility, after: [CLK, LNG], go: auto, stage: planned, size: L, budget_pct: 100 }
  - { id: NTF, title: Notification engine and webhooks, after: [CLK, LNG, CNX, AIP], go: auto, stage: planned, size: M, budget_pct: 90 }
  - { id: GDP, title: Data protection functions, after: [VIS], go: auto, stage: idea, size: M, budget_pct: 60 }
  - { id: LOOP, title: Case loop v1, after: [VIS], go: auto, stage: idea, size: M, budget_pct: 60 }
  - { id: MET, title: Wait ledger and dashboards on real data, after: [VIS, AIP], go: auto, stage: idea, size: M, budget_pct: 60 }
  - { id: TMS, title: Microsoft Teams, after: [NTF, LNG], go: auto, stage: idea, size: L, budget_pct: 100 }
  - { id: FLR, title: Shop-floor access, after: [ADM, VIS], go: auto, stage: idea, size: S, budget_pct: 30 }
  - { id: API, title: Public API v1 and outbound webhooks, after: [VIS, NTF], go: auto, stage: idea, size: M, budget_pct: 60 }
  - { id: EID, title: Enterprise identity and log export, after: [DIR, GDP], go: auto, stage: idea, size: L, budget_pct: 100 }
  - { id: SFX, title: SuccessFactors directory adapter, after: [DIR], go: kevin, stage: idea, size: M, budget_pct: 60 }
  - { id: SEC, title: Security and compliance pack, after: [GDP, OPS], go: kevin, stage: idea, size: M, budget_pct: 60 }
  - { id: TST, title: Demo test phase, after: [LOOP, MET, TMS, FLR, API, EID, CNX, AIP, ADM, SEC], go: kevin, stage: idea, size: L, budget_pct: 100 }
  - { id: PIL, title: Pilot package, after: [TST], go: kevin, stage: idea, size: M, budget_pct: 60 }
decisions:
  - { id: HD1, text: "The goal is a product ready for a pilot with one company of 1,000-2,000 employees. First a demo test phase (TST) tests the whole system with a realistic demo company; only after it do pilots start." }
  - { id: HD2, text: "NextUp integrates into the customer's systems instead of building a parallel one. Every external system sits behind one of the connector interfaces exported from @nextup/contracts/public (IdentityProvider, DirectorySource, NotifyChannel, CaseSource, WorkTracker, KnowledgeSource, LogSink, AiProvider). A new system is a new adapter; the core does not change." }
  - { id: HD3, text: "Public contracts (API v1, webhook envelope, connector interfaces, event schemas) are only extended, never broken. A breaking change is a new version that runs next to the old one." }
  - { id: HD4, text: "No company-specific logic in code. What differs between companies (routes, goals, rules, calendars, connectors, flags) is configuration in the database." }
  - { id: HD5, text: "Roles, not people: routing goes to roles, and the product shows no person rankings or person metrics. Aggregates only per role, unit or company." }
  - { id: HD6, text: "One stack per company; the same images and scripts run hosted or on-prem. Real customer data never goes on the shared demo box (178.104.253.90)." }
  - { id: HD7, text: "The core loop (raise, route, answer, decide) works with the AI and every integration switched off. Each phase that adds a dependency proves this with its flag off." }
  - { id: HD8, text: "The AI provider is chosen per company (Bedrock eu-central-1, Azure OpenAI, a customer endpoint, or off). Off is a supported choice, not an error." }
  - { id: HD9, text: "Once LNG is merged, every user-facing string goes through the message catalog and exists in German and English." }
  - { id: HD10, text: "Once IDN is merged, people are identified by user id and role holder only. Display names are for display and are never compared." }
  - { id: HD11, text: "Once ARC is merged, the Prisma schema is split into one file per area under apps/app/prisma/schema/. A phase changes only the area files its brief names; every migration is its own folder. Area map: docs/adr/0007-areas.md (core, structure, auth, integrations, ops). Exception: a phase that adds a model with a relation to Company adds the back-relation field to model Company in core.prisma only inside the block of its own area (`// -- <area> --`), and never adds a scalar column to Company." }
  - { id: HD12, text: "Lane sessions never change package.json or package-lock.json. New packages arrive first in their own PR on branch deps/<phase id>, merged by Kevin." }
  - { id: HD13, text: "Plans, code, comments and PRs are in English (Kevin, 2026-11-01)." }
  - { id: HD14, text: "SAP is read-only and limited to the org chart (Kevin, 2026-11-01). NextUp reads HR structure either through Entra (DIR) or directly from SAP SuccessFactors Employee Central (SFX), and nothing else from SAP. Allowed fields: personnel number (SuccessFactors personIdExternal or Entra employeeId) as the external id, name, work email, unit, job title, manager, start and end date, active. Never requested or stored: absences or time data (EmployeeTime, infotype 2001), payroll, compensation, performance, talent, business partners. The personnel number is never shown in the UI and never sent to the AI. NextUp never writes into SAP. SAP HCM on-premise is only supported when it feeds Entra; there is no direct HCM connector." }
  - { id: HD15, text: "Pages follow the page specs in the Nextup repo, docs/plans/2026-11-02_pilot-pages.md and its nine files (Kevin, 2026-11-02). A Bauplan task that builds a page names its spec section under 'Read first'. Where a spec and a Bauplan disagree on a function, field or limit, the Bauplan wins and the spec is corrected in the same PR." }
questions:
  - { id: HQ1, text: "Is German required for the pilot?", default: "yes: German first, English second" }
  - { id: HQ2, text: "Where does the pilot run?", default: "a dedicated Hetzner VM in Germany; an Azure variant only if the pilot customer asks" }
  - { id: HQ3, text: "Which AI runs for the pilot?", default: "Bedrock eu-central-1 once a DPA is signed; until then off" }
  - { id: HQ4, text: "Which holiday calendar does the clock use?", default: "German federal plus state holidays per site, from a table in the repo" }
  - { id: HQ5, text: "May existing events be rewritten from display names to user ids?", default: "yes: only demo data exists today" }
  - { id: HQ6, text: "Teams needs an Azure bot registration and a Teams app in a tenant. Who sets them up, in which tenant?", default: "Kevin, in the test tenant nextuptest.onmicrosoft.com; TMS builds and proves against a local fake of the Bot Framework" }
  - { id: HQ7, text: "Message catalog: own typed catalog or a package such as next-intl?", default: "own typed catalog, no new package" }
  - { id: HQ8, text: "nextup-infra has no orch project yet. Create it so the parked phase INF (customer VM as code) joins PILOT?", default: "INF stays parked; the test-phase VM and the pilot VM are created by hand with harden.sh until the project exists" }
  - { id: HQ9, text: "Is there a SuccessFactors tenant to test SFX against?", default: "no: SFX builds and proves against recorded OData pages shaped like SAP's API reference; a live test waits for a customer tenant or an SAP demo tenant" }
budget_window_pct: 2505
---

# PILOT Pilot-ready NextUp for companies of 1,000-2,000 employees

Overview in the Nextup repo: `docs/plans/2026-11-01_pilot-readiness.md`; why this segment and order:
`docs/plans/2026-11-01_segment-analysis.md` (branch `docs/pilot-readiness-plan`).

## Goal

After PILOT, NextUp runs for one real company of 1,000-2,000 employees on its own server: real identities from
Entra, a working-day clock, German and English, Teams, Microsoft 365 knowledge and Jira, server-side visibility,
and the data-protection functions an IT department and a works council ask for. Before any pilot, a demo company
of 1,500 people tests the whole system. Every external system sits behind a versioned connector interface, so a
large corporate later adds adapters (SAML, SCIM, SAP, ServiceNow, PLM, SIEM) without a rebuild.

## Scope

- Product core rebuilt for real companies: structure, identity, clock, visibility.
- Administration, German and English, data-protection functions.
- Channels (mail, Teams, shop floor) and connectors (Microsoft 365, Jira, public API, webhooks, enterprise identity,
  log export, SAP SuccessFactors org chart read-only).
- Deploy path for a dedicated customer server, security and compliance documents in the repo.
- Demo test phase and pilot package.

**Not in scope:** SAP adapters other than the SuccessFactors directory (SFX, HD14), ServiceNow and PLM adapters
(only their interfaces), a TISAX assessment, own mobile apps,
idea voting, reward scheme, 24/7 operations, high availability. Not code, so not orch work (Kevin and Marc):
legal entity and insurance, signing a DPA, the external pentest, two weeks of internal real-time use, finding and
running the pilot itself.

## Done when

All phases are `done` (proof n/n on `main`, acceptance of every phase green), and on `main`:
`apps/app/tests/e2e/db/musterwerk.spec.ts` › `TST acceptance: Musterwerk scenario suite` and
`apps/app/tests/load/musterwerk-load.test.ts` › `TST acceptance: 2,000 accounts within budget` are green.

## Situation

Audit of `origin/main` on 2026-11-01 (984f3b0, #249), details in the Nextup overview. Five findings set the order:
the clock is a demo counter (`Company.demoDay`, `day.advanced` refused outside `demo`); people are matched by
display name (`inboxFor`); every browser receives the whole case log (`visibility.ts`); `seedJson` mixes structure
and demo content (acme's goals leak into empty companies); real customer data has no server to go to.

| Area | State | Needed by |
| --- | --- | --- |
| `apps/app/prisma/schema.prisma` (one file) | there; split by ARC | ARC, STR, IDN, CLK, DIR, ADM, VIS, NTF, GDP, API, EID |
| `packages/contracts` (stack ↔ admin only) | partly | ARC, CNX, API, EID, TMS, NTF |
| `apps/app/src/features/cases` (reducer, selectors, visibility) | there, demo clock, names | IDN, CLK, VIS, LOOP |
| `apps/app/src/features/demo`, `features/evaluate`, `lib/db/companies.ts` | there, structure mixed with demo | STR, TST |
| `apps/app/src/features/auth`, `server/microsoft-login.ts` | Entra OIDC live | IDN, DIR, ADM, EID |
| `apps/app/src/features/routing`, `services/brain`, `server/assist` | there, client-side proposal | AIP, CNX |
| `apps/app/src/features/metrics`, dashboards, feed | placeholder data | MET |
| `apps/app/src/app/(app)/settings`, `/admin` | partly | ADM, FLR |
| `apps/app/src/server/case-notice.ts`, `loop-notice.ts` | mail only | NTF, TMS |
| `apps/app/src/app/api/[company]/events`, `knowledge` | pull API live | API |
| `apps/app/src/server/jira*`, `features/m365` | built, off | CNX |
| UI strings in `src/components`, `src/app` | English inline | LNG |
| `stack/`, `ops/`, `.github/workflows` | shared-box deploy, CI | AUD, OPS, SEC |
| `nextup-infra` | secrets only | INF (parked) |
| tests: `tests/unit` (~950), `tests/db` (~67, not in CI), `tests/e2e` (~44) | partly | AUD, TST |

## Phases

| Phase | Result (one sentence) | after | go | Size | Stage |
| --- | --- | --- | --- | --- | --- |
| AUD | Every suite runs in CI and a gap register maps each gap to a phase. | – | auto | M | active |
| ARC | The canonical model, connector interfaces, API v1 and webhook schemas exist as contracts, and the schema is split per area. | AUD | auto | M | active |
| OPS | A release can deploy to a dedicated customer server with off-box backups and a backup before every migration. | AUD | auto | L | planned |
| STR | The structure tables are the only source of a company's structure, and an empty company carries no acme content. | ARC | kevin | L | planned |
| LNG | Every screen and mail exists in German and English. | ARC | kevin | L | planned |
| CNX | Microsoft 365 search answers with source permissions, and Jira Cloud and Data Center sync behind WorkTracker. | ARC | auto | M | planned |
| IDN | Inbox, assignee, actor and permissions work on user ids and role holders. | STR | auto | L | active |
| CLK | Deadlines, deputy hand-overs, check-ins and measures fall due on a working-day clock. | IDN | auto | M | active |
| DIR | Users, groups, managers and leavers sync from Entra. | IDN | auto | M | planned |
| AIP | The AI provider is chosen per company, the routing proposal is made on the server, and the eval runs in CI. | IDN, CNX | auto | M | planned |
| ADM | A company admin manages members, org, routes, calendar and connectors in the app. | IDN, LNG | auto | L | planned |
| VIS | Each user receives only what their role may see, from projections instead of the whole log. | CLK, LNG | auto | L | planned |
| NTF | All outgoing messages go through one outbox with mail and webhook channels, digests and reminders. | CLK, LNG, CNX, AIP | auto | M | planned |
| GDP | Admin actions are audited, and a company can export, delete and retain data by rule. | VIS | auto | M | idea |
| LOOP | The case loop is complete without placeholders and works with AI and integrations off. | VIS | auto | M | idea |
| MET | Dashboards and feed show real wait-ledger numbers and a baseline. | VIS, AIP | auto | M | idea |
| TMS | People get notices in Teams, raise a case from Teams and answer from a card. | NTF, LNG | auto | L | idea |
| FLR | People without a PC raise a case through a QR code on a shared device. | ADM, VIS | auto | S | idea |
| API | Customer middleware reads and writes through a documented API v1 and receives signed webhooks. | VIS, NTF | auto | M | idea |
| EID | Companies log in through generic OIDC or SAML, provision through SCIM, and export audit logs. | DIR, GDP | auto | L | idea |
| SFX | Units, managers, joiners and leavers sync read-only from SAP SuccessFactors. | DIR | kevin | M | idea |
| SEC | Real stages run without standing team access, and the compliance documents are in the repo. | GDP, OPS | kevin | M | idea |
| TST | A 1,500-person demo company passes scenario, load and recovery tests on a dedicated server. | LOOP, MET, TMS, FLR, API, EID, CNX, AIP, ADM, SEC | kevin | L | idea |
| PIL | A pilot company is bootstrapped from configuration and its pilot numbers are reported. | TST | kevin | M | idea |

**Flow:** The project has 3 lanes on kev-pc. Window 1: AUD alone. Windows 2-3: ARC (max_parallel 2) next to OPS
(1). Gate: Kevin looks at ARC before STR and LNG are planned. Windows 4-6: STR (1), LNG (1) and CNX (1) together;
OPS ends. Windows 7-8: IDN (2) next to LNG. Windows 9-11: CLK, DIR and AIP (1 each), then ADM. Windows 12-14: VIS
(2) next to NTF (1). Windows 15-18: GDP, LOOP, MET, TMS, FLR, API in pairs and triples as lanes free up (each 1 when
three run). Windows 19-20: EID and SEC. Windows 21-22: TST, then PIL. About 22 windows
of 5 hours at full use; the real pace is measured after AUD and ARC (Part B, step 3).

**Why this order:**
- ARC after AUD: the contracts include what the register finds.
- OPS after AUD: it fixes the deploy gaps the register lists.
- STR and LNG after ARC: they use the schema split and the public types.
- CNX after ARC: it moves the existing connectors behind the new interfaces.
- IDN after STR: role holders are STR tables.
- CLK, DIR and AIP after IDN: they write events and users by id; AIP also after CNX, whose `KnowledgeSource` it calls.
- ADM after IDN and LNG: its editors write ids and use the catalog.
- VIS after CLK and LNG: projections need the persisted deadline events, and VIS touches the layout.
- NTF after CLK, LNG, CNX and AIP: reminders come from scheduler events; the notice templates are LNG's strings; the outbox table shares `integrations.prisma` with CNX and AIP.
- GDP, LOOP and MET after VIS: they read the projections; MET also after AIP for the override rate.
- TMS after NTF and LNG: it is a channel with translated cards.
- FLR after ADM and VIS: areas and QR codes are configured in ADM, and the anonymous raise uses VIS's rate-limit store.
- API after VIS and NTF: it serves projections and uses the outbox.
- EID after DIR and GDP: SCIM extends the directory, and log export reads the audit log.
- SEC after GDP and OPS: it needs both.
- TST after every feature phase; PIL after TST.

## Briefs

### AUD Audit and gap register

- **Result:** after AUD, Kevin sees every gap of the pilot target in one register, each with severity, owner and
  phase, and CI runs every existing suite.
- **Goal:** Re-check the audit of 2026-11-01 against `main` and record each gap in a machine-checkable register.
  Close the cheapest blind spot first: the DB tests and the brain tests do not run in CI.
- **Scope:** `docs/audit/gap-register.md` (table: id, area, gap, evidence, severity high/medium/low, phase id from
  this Hauptplan, owner K/S/V); a unit test that checks the register; CI jobs for `tests/db` (Postgres service) and
  `services/brain` pytest; the Nextup overview plan corrected where the register disagrees. · **Not in scope:**
  fixing any gap.
- **Done when:** the register lists at least every finding of the overview plan; every row has severity, a phase
  id that exists in PILOT and an owner; CI on a PR runs the DB tests and the brain tests.
- **Acceptance:** `apps/app/tests/unit/docs/gap-register.test.ts` › `AUD acceptance: every gap has severity, an
  existing phase and an owner`.
- **Code area:** `docs/audit/`, `docs/plans/`, `.github/workflows/ci.yml`, `apps/app/tests/unit/docs/`.
- **Takes from:** –
- **Hands to:** ARC, OPS and all later phases: `docs/audit/gap-register.md` with gap ids `G-001` … and their phase
  column; CI jobs `db-tests` and `brain-tests`.
- **New packages:** none.
- **Decisions:** HD13 · **Questions:** –
- **Risks:** the DB tests may be red on `main` → the register records them; fixing them belongs to the phase that
  owns the area.
- **Size:** 2 waves, ~4 tasks, 30 %.
- **Ready for the Bauplan when:** now.

### ARC Integration architecture and contracts

- **Result:** after ARC, every later phase builds against fixed names: the canonical model, eight connector
  interfaces, API v1 and webhook schemas, and a schema split per area.
- **Goal:** Write the integration architecture as decision records and as code contracts, without changing runtime
  behaviour. Split the single Prisma schema so phases can change their own areas in parallel.
- **Scope:** `docs/adr/` (canonical model, connector interfaces, API v1, webhook and outbox, event versioning,
  config-not-code); `packages/contracts/src/public/` with zod schemas `Person`, `OrgUnit`, `Role`, `RoleHolder`,
  `CaseRef`, `Decision`, `ProjectRef`, `WebhookEnvelope`, `ApiV1` request/response shapes; TypeScript interfaces
  `IdentityProvider`, `DirectorySource`, `NotifyChannel`, `CaseSource`, `WorkTracker`, `KnowledgeSource`, `LogSink`,
  `AiProvider`; export path `@nextup/contracts/public`; Prisma schema moved to `apps/app/prisma/schema/*.prisma`
  (one file per area: core, structure, auth, integrations, ops) with no model change; a file-ownership map per phase
  in `docs/adr/0007-areas.md`. · **Not in scope:** any adapter, any runtime change, any migration with a model
  change.
- **Done when:** the contracts compile and parse the fixtures in `packages/contracts/fixtures/`; `prisma validate`
  and `prisma migrate diff` show no change against `main`; all existing tests stay green.
- **Acceptance:** `apps/app/tests/unit/contracts/public.test.ts` › `ARC acceptance: canonical model, connector
  interfaces and API v1 schemas accept the fixtures`.
- **Code area:** `packages/contracts/`, `docs/adr/`, `apps/app/prisma/`.
- **Takes from:** AUD: `docs/audit/gap-register.md`.
- **Hands to:** STR, IDN, DIR: `Person`, `OrgUnit`, `Role`, `RoleHolder`. CNX: `KnowledgeSource`, `WorkTracker`.
  NTF, TMS: `NotifyChannel`, `WebhookEnvelope`. API: `ApiV1`. EID: `IdentityProvider`, `DirectorySource`, `LogSink`.
  AIP: `AiProvider`. Everyone: `apps/app/prisma/schema/<area>.prisma` and the ownership map `docs/adr/0007-areas.md`.
- **New packages:** none.
- **Decisions:** HD2, HD3, HD4, HD11, HD13 · **Questions:** –
- **Risks:** the interfaces are guessed too early → each one is checked against two real systems in its ADR (e.g.
  WorkTracker against Jira and Azure DevOps); adapters may extend them (HD3).
- **Size:** 3 waves, ~7 tasks, 60 %.
- **Ready for the Bauplan when:** now.

### OPS Production deploy path per customer

- **Result:** after OPS, a release can go to a dedicated customer server that is not the shared box, with an
  off-box backup before every migration and alerts to more than one person.
- **Goal:** Make `stack/` work on a single customer VM and close the operations gaps that block real data. The
  shared box keeps working unchanged.
- **Scope:** remote deploy over SSH with a forced command for a customer host (no box agent needed); restic to an
  off-box target (S3-compatible or Storage Box) per stack; `deploy.sh release` takes a backup before `migrate`;
  RPO 24 h and RTO 1 h written down and checked by the restore test; image digests instead of `:latest` in
  `stack/compose.yml`; brain image built in CI; external uptime check hook and alerts to a list of recipients; an
  on-prem install rehearsal script that installs a stack on a clean VM from images only. · **Not in scope:** VM
  creation and hardening as code (INF), Azure, high availability.
- **Done when:** a scripted test brings up a stack in a clean container host, runs `release` and finds a backup
  snapshot taken before the migration; the restore test restores it within the stated RTO; `compose.yml` has no
  `:latest`.
- **Acceptance:** `stack/tests/deploy-path.test.sh` › `OPS acceptance: release on a clean host backs up before migrating and restores within RTO`.
- **Code area:** `stack/`, `ops/`, `.github/workflows/images.yml`, `.github/workflows/deploy.yml`.
- **Takes from:** AUD: gap rows for `stack/` and CI.
- **Plan:** written 2026-11-01 (7 tasks): a Docker-in-Docker test host, off-box restic to S3-compatible storage
  (default Hetzner Object Storage), `pre-migrate` snapshots in `stack/nginx/deploy.sh` for stage, release and deploy,
  pinned digests, brain image in CI, alert lists and a heartbeat, `deploy-remote.sh` over a forced command.
- **Hands to:** SEC, TST, INF (parked): `stack/deploy-remote.sh <host> <tag>`, `stack/backup.sh` with `RESTIC_REPOSITORY`
  off-box, `docs/ops/RPO_RTO.md`, `stack/tests/install-clean.sh`.
- **New packages:** none.
- **Decisions:** HD6 · **Questions:** HQ2 (default: Hetzner VM in Germany).
- **Risks:** scripts run against the live shared box → every new path is tested in a container host first; changes
  to `stack/` and `.github/` are `risk: normal` or `high` (risk_guard).
- **Size:** 4 waves, ~9 tasks, 100 %.
- **Ready for the Bauplan when:** now.

### STR Company structure out of the seed

- **Result:** after STR, the structure tables are the only source of a company's org, roles, holders, routes, goals
  and rules, and a new empty company carries no acme content.
- **Goal:** `main` already has `CompanyProfile`, `OrgUnit`, `OrgRole`, `OrgRoleHolder`, `RoutingRule` and `Goal`, but
  `lib/db` overlays them onto the seed at read time and falls back to `Company.seedJson` for a company without rows
  (corrected 2026-11-01 from "projects them back into seedJson"). STR turns
  this around: pages and the reducer read the tables, and the seed keeps only demo content.
- **Scope:** reads of structure from the tables (a selector that still gives the reducer its old shape until IDN);
  the projection of tables into `seedJson` removed; a `CompanyRule` table for the spend rule and other company rules;
  `features/evaluate` goals and spend rule from `Goal` and `CompanyRule`; `EMPTY_SEED` without acme routes, personas,
  leaders, buddies, ledger, metrics and views; a backfill script for companies stored before STR; demo companies still seed their structure into the tables. · **Not in scope:** editors (ADM), user
  identity (IDN).
- **Done when:** a company created empty shows no acme goal, route or persona; acme still shows everything; no page
  reads structure from `seedJson`; all tests green.
- **Acceptance:** `apps/app/tests/e2e/db/structure.spec.ts` › `STR acceptance: an empty company has no acme
  content and acme is unchanged`.
- **Code area:** `apps/app/prisma/schema/structure.prisma`, `apps/app/prisma/migrations/`, `apps/app/src/features/knowledge/`,
  `apps/app/src/features/demo/`, `apps/app/src/features/evaluate/`, `apps/app/src/lib/db/`, `apps/app/prisma/seed.ts`,
  `apps/app/prisma/bootstrap-company.ts`.
- **Takes from:** ARC: `OrgUnit`, `Role`, `RoleHolder` schemas and their mapping onto `OrgUnit`, `OrgRole`,
  `OrgRoleHolder` in `docs/adr/0001-canonical-model.md`; `structure.prisma`.
- **Hands to:** IDN: table `OrgRoleHolder`, read through `holdersOfRole(roleId)`. ADM: the structure tables and
  `CompanyRule`. AIP: `RoutingRule`. TST: a seed path that writes structure for a generated company.
- **New packages:** none.
- **Decisions:** HD4, HD11 · **Questions:** –
- **Risks:** the reducer depends on the seed's shape → a compatibility selector keeps the old shape until IDN.
- **Size:** 3 waves, ~8 tasks, 100 %.
- **Plan:** written 2026-11-01 (6 tasks, 99 %): `CompanyRule`, reads only from the tables, neutral `EMPTY_SEED`,
  writers store only demo content, backfill, evaluate/ideas/brain on the company's goals; also `features/ideas/`
  (`SPEND_LIMIT_EUR`). STR-D1 changes six LNG files and is ordered by task needs against LNG (see LNG).
- **Ready for the Bauplan when:** ARC is merged and Kevin has seen it (go: kevin). Written early on Kevin's word
  (2026-11-01); he approves it only after seeing ARC.

### LNG German and English

- **Result:** after LNG, every screen, mail and date exists in German and English, chosen per user.
- **Goal:** Introduce a typed message catalog and move every inline string into it. German is the pilot language.
- **Scope:** catalog in `apps/app/src/i18n/` (`de.ts`, `en.ts`, typed keys), locale per user with company default,
  `<html lang>`, date and number formats, mail templates in both languages, a lint rule against new inline strings.
  · **Not in scope:** brain prompts (AIP), Teams cards (TMS).
- **Done when:** the lint rule finds no inline user-facing string; every key exists in both catalogs; a German user
  sees German on every route of the e2e suite.
- **Acceptance:** `apps/app/tests/e2e/demo/i18n.spec.ts` › `LNG acceptance: every route renders in German without
  an English fallback`.
- **Code area:** `apps/app/src/i18n/`, `apps/app/src/components/`, `apps/app/src/app/` (strings only),
  `apps/app/src/server/*-notice.ts` (templates), `apps/app/eslint.config.*`.
- **Takes from:** ARC: ownership map (LNG owns strings, not logic).
- **Hands to:** every later UI phase: `t(key)` from `@/i18n`, catalogs `de.ts` and `en.ts`, the lint rule
  `nextup/no-inline-strings`.
- **New packages:** none (HQ7 default).
- **Decisions:** HD9, HD13 · **Questions:** HQ1, HQ7.
- **Risks:** touches almost every component and collides with parallel UI work → UI phases wait for LNG (after);
  STR and CNX have no UI area.
- **Size:** 4 waves, ~10 tasks, 100 %.
- **Plan:** written 2026-11-01 (11 tasks, 150 %; ~1,500 inline strings in ~250 files): one typed file per namespace
  (`de.ts`/`en.ts` only assemble them), the mail text lives in `features/cases/notice.ts` and `features/loop/notice.ts`
  (LNG-F1 owns them with the `*-notice.ts` senders), `User.locale` in `auth.prisma` and `CompanyConfig.defaultLocale`
  in `integrations.prisma` (one migration; an exception to HD11's area map, Kevin approves it with LNG), English stays the
  default locale. Task order against STR: LNG-C1 after STR-C1, STR-D1 after LNG-A1/B1/C1, LNG-R1 after STR-D1;
  LNG-S1 translates STR's and CNX's folders after both are merged.
- **Ready for the Bauplan when:** ARC is merged and Kevin has seen it (go: kevin). Written early on Kevin's word
  (2026-11-01); he approves it only after seeing ARC.

### CNX Knowledge and work connectors

- **Result:** after CNX, the assistant answers from Microsoft 365 with the source's permissions, and approved projects
  sync to Jira Cloud and Jira Data Center, both behind the ARC interfaces.
- **Goal:** Finish the built-but-off connectors and move them behind `KnowledgeSource` and `WorkTracker`, so the
  next system is a new adapter.
- **Scope:** M365 search PR B-D of `docs/plans/2026-10-22_sso-and-data-access.md` (token helper, Graph search into
  `searchDocuments`); the 21 ground-truth questions as a test against recorded Graph responses; Jira adapter behind
  `WorkTracker`; Jira Data Center adapter (`server/jira/dc.ts`); a connector template doc. · **Not in scope:**
  Confluence, file shares, ServiceNow.
- **Done when:** 21/21 ground-truth answers on the recorded fixtures, no document returned to a person without
  access; the Jira e2e passes against the fake Jira for Cloud and Data Center.
- **Acceptance:** `apps/app/tests/db/connectors.test.ts` › `CNX acceptance: ground truth 21 of 21 and Jira Cloud
  and Data Center sync`.
- **Code area:** `apps/app/src/features/m365/`, `apps/app/src/server/jira/`, `apps/app/src/server/jira-sync.ts`,
  `apps/app/src/server/connectors/`, `apps/app/tests/fake-jira/`.
- **Takes from:** ARC: `KnowledgeSource`, `WorkTracker`, `integrations.prisma`.
- **Hands to:** AIP: `KnowledgeSource` adapter `m365`. TST: both adapters switchable per company; fixture recorder
  `tests/fixtures/graph/`.
- **New packages:** none.
- **Decisions:** HD2, HD3, HD7 · **Questions:** –
- **Risks:** live Graph calls in proofs are flaky → proofs use recorded responses; the live check runs in TST.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **Plan:** written 2026-11-01 (4 tasks, 60 %). M365 PR A-C (#236, #243, #244) and the in-app Jira engine (#245-#249)
  are already on main, so CNX is the two adapters (`m365` behind `KnowledgeSource`, Jira behind `WorkTracker`), the
  Data Center client and the ground-truth check. "21 of 21" is retrieval on synthetic Graph fixtures; the answer
  text and Microsoft's own permission trimming move to TST's live run. The M365 data page (PR D) and the Data Center
  option in the admin screen move to ADM. No prisma change.
- **Ready for the Bauplan when:** ARC is merged.

### IDN Identity by id

- **Result:** after IDN, inbox, assignee, actor and permissions work on user ids and role holders, so a user created
  by Entra just-in-time gets the cases of their role.
- **Goal:** Remove every comparison of display names from the case domain and migrate stored events.
- **Scope:** events carry `actorUserId` and `assigneeRoleHolderId`; reducer, `selectors.ts` (`inboxFor`, `mineFor`,
  `cosignedBy`), permissions and pages use ids; a migration rewrites existing events (HQ5); every member gets a handle
  at creation (JIT, manager add, admin); JIT links a user to a role holder by Entra app role and department claim.
  · **Not in scope:** directory sync (DIR).
- **Done when:** no `name ===` comparison remains in `features/cases` and `features/projects`; a JIT user who holds a
  route owner's role sees that route's new case in the inbox.
- **Acceptance:** `apps/app/tests/e2e/db/identity.spec.ts` › `IDN acceptance: a JIT user holding a role gets its
  cases`.
- **Code area:** `apps/app/src/features/cases/`, `apps/app/src/features/projects/`, `apps/app/src/features/auth/`,
  `apps/app/src/server/actions/`, `apps/app/src/server/microsoft-login.ts`, `apps/app/src/lib/db/` (holders,
  accounts, demo binding, backfill), `apps/app/src/features/demo/` (seat fields, demo binding),
  `apps/app/src/features/knowledge/index.ts` (seats), the dashboard, shell and project pages that decide "is this
  me", `apps/app/prisma/seed.ts`, `apps/app/prisma/identity-backfill.ts`. No schema change: `CaseEvent.actorUserId`,
  `OrgRoleHolder.userId` and `User.handle` exist on main (corrected 2026-11-02).
- **Takes from:** STR: table `OrgRoleHolder`, `holdersOfRole`. ARC: `Person`, `RoleHolder`.
- **Hands to:** CLK, DIR, AIP, ADM, VIS: helpers `holderOf(userId)`, `usersOfRole(roleId)`, event fields
  `actorUserId`, `assigneeRoleHolderId`.
- **New packages:** none.
- **Decisions:** HD10, HD11 · **Questions:** HQ5.
- **Risks:** the migration on events is irreversible → `risk: high`, backup first (OPS path), tested on a copy of
  the demo databases.
- **Size:** 3 waves, ~8 tasks, 100 %.
- **Ready for the Bauplan when:** STR is merged. Its tasks on `features/cases/` and `features/projects/` need LNG-F1
  and LNG-D1 (LNG moved their strings; IDN may run next to LNG).
- **Plan:** written 2026-11-02 (9 tasks, 165 %). Kevin: the desk is the role (everyone holding the case's role sees
  it), and a JIT Microsoft user gets the top role of the unit their department claim names (leader or manager;
  members get no seat). Labels stay in events and state for display only. The brief missed the pages (every dashboard
  decides "mine" by name) and the demo seed's names, so IDN binds demo content to ids once (the only label-to-id
  match, also used by the one-off backfill) and moves the pages in two waves. Label lookups that only show org data
  (ideas, org, metrics, people pages, visibility's custom lists) stay and are listed in `docs/IDENTITY.md` for LOOP,
  MET, ADM and VIS. Budget 100 → 165 %.

### CLK Real clock and scheduler

- **Result:** after CLK, deadlines, deputy hand-overs, check-ins and 30/90-day measures fall due on real working
  days and are written as events.
- **Goal:** Replace `Company.demoDay` as the clock for non-demo companies with a working-day clock and a scheduler.
- **Scope:** working-day calendar per company and site (HQ4); a scheduler loop with a lease (pattern of
  `server/jira-sync.ts`) that appends `case.handed{why:"deadline"}`, check-in and measure events with idempotency
  keys; the reducer stops computing escalation at render time; demo companies keep `day.advanced` as a simulated
  clock. · **Not in scope:** sending the messages (NTF).
- **Done when:** with a fake clock, a case raised on a Friday before a holiday hands to the deputy on the right
  working day, exactly once, also after a restart.
- **Acceptance:** `apps/app/tests/db/clock.test.ts` › `CLK acceptance: deadline hands to the deputy once on the
  right working day`.
- **Code area:** `apps/app/src/server/scheduler/`, `apps/app/src/features/clock/`, `apps/app/src/features/cases/reducer.ts`,
  `apps/app/instrumentation.ts`, `apps/app/prisma/schema/core.prisma`.
- **Takes from:** IDN: `assigneeRoleHolderId`, `holderOf`.
- **Hands to:** VIS: persisted deadline events. NTF: scheduler events `clock.due` with type and case id. MET: event
  timestamps on the real clock.
- **New packages:** none.
- **Decisions:** HD4, HD7 · **Questions:** HQ4.
- **Risks:** two app instances run the scheduler twice → lease plus idempotency key, tested.
- **Size:** 3 waves, ~6 tasks, 60 %.
- **Ready for the Bauplan when:** IDN is merged.
- **Plan:** written 2026-11-02 early, on Kevin's word, against IDN's names (6 tasks, 90 %). A real company's `day` is
  a working-day number, so every rule counts working days (measure checks too, CLK/Q2). The escalation is stored as a
  `clock.due` fact that sets today's escalation (owner keeps the case, the deputy gets it too) instead of
  `case.handed{why:"deadline"}`; NTF reads the same facts. One calendar per company (`CompanyCalendar`, region =
  German state); per-site calendars move to ADM with a site on the org unit. Backfill of stored non-demo days by hand
  (CLK/Q1). Budget 60 → 90 %.

### DIR Directory sync

- **Result:** after DIR, users, groups, managers and leavers come from Entra, and deputies follow the manager chain.
- **Goal:** A `DirectorySource` adapter for Microsoft Graph with delta sync, plus deprovisioning.
- **Scope:** Graph delta sync of users, groups and managers into `User`, `OrgUnit` membership and a `managerId`;
  deputy default from the manager chain; leavers deactivated and their open cases handed to the role; delete-user;
  sync status in `/admin`; Entra `employeeId` stored as the user's external id (it carries the SAP personnel number
  when HR provisions Entra from SuccessFactors or SAP HCM, HD14) and never shown or sent to the AI;
  `applyDirectoryDelta` takes any `DirectoryPage`, never Graph types, and the company's directory source is read from
  the database (HD4), so SFX adds a second source without touching DIR's code. · **Not in scope:** SCIM inbound
  (EID), the SuccessFactors adapter (SFX), absence or any other HR data (HD14).
- **Done when:** against recorded Graph delta pages, a new user appears with department, manager and employeeId, a
  leaver is deactivated and their cases move to the role's other holder.
- **Acceptance:** `apps/app/tests/db/directory.test.ts` › `DIR acceptance: delta sync adds, moves and deactivates
  users`.
- **Code area:** `apps/app/src/server/directory/`, `apps/app/src/features/directory/`, `apps/app/prisma/schema/auth.prisma`.
- **Takes from:** IDN: user ids and role holders. ARC: `DirectorySource`.
- **Hands to:** EID and SFX: `DirectorySource` with the Graph adapter, function `applyDirectoryDelta`, the
  per-company directory source setting. ADM and SFX: sync status.
- **New packages:** none.
- **Decisions:** HD2, HD4, HD10, HD14 · **Questions:** –
- **Risks:** Graph permissions need admin consent at the customer → `docs/customer/ENTRA_SETUP.md` gets the scopes.
- **Size:** 3 waves, ~6 tasks, 60 %.
- **Ready for the Bauplan when:** IDN is merged.
- **Plan:** written 2026-11-02 early, against IDN's names (6 tasks, 85 %). Unit membership comes from the department
  attribute (IDN's JIT rule); Entra groups are read but stored only once ADM maps groups to units. Leavers are
  deactivated, their seats left vacant in their role and their open cases handed to the role's other holder; the sync
  never deletes. Adds G-017's deactivate and delete in Members and refuses sign-in to inactive users. Runs after CLK's
  files: DIR-G1 needs CLK-G1 (core.prisma back-relation), DIR-C1 needs CLK-D1 (instrumentation.ts). Budget 60 → 85 %.

### SFX SuccessFactors directory adapter

- **Result:** after SFX, a company whose Entra lacks the HR structure syncs units, managers, joiners, movers and
  leavers read-only from SAP SuccessFactors Employee Central.
- **Goal:** A second `DirectorySource` adapter, for the SuccessFactors OData v2 API, that feeds DIR's
  `applyDirectoryDelta` unchanged. Background and compliance: the doc "NextUp × SAP"
  (https://claude.ai/artifact/HEXJujZg7ikeMhwkV5ofxk), route B.
- **Scope:** adapter in the app (not n8n, HD2) reading `User`, `EmpEmployment`, `EmpJob` and `FODepartment`, with a
  fixed field allow-list (HD14), paging and a delta on `lastModifiedDateTime`, and effective dates asked for
  explicitly (`EmpJob` returns only the latest record otherwise); mapping `personIdExternal` → `externalId`,
  `FODepartment` → `DirectoryGroup` with parent, the manager → `managerExternalId`, an end date that has passed →
  `active: false`; `successfactors` as a second value of the company's directory source; credentials (API host,
  company id, OAuth 2.0 SAML bearer for a read-only API user) in the integrations vault; the sync status DIR built;
  `docs/customer/SUCCESSFACTORS_SETUP.md` (API user, role-based permissions, the field list, text for the works
  agreement). · **Not in scope:** absences and time data, payroll, compensation, performance, business partners,
  SAP HCM on-premise directly, any write into SAP (all HD14), an n8n workflow.
- **Done when:** against recorded SuccessFactors OData pages, a new employee appears with unit and manager, a mover
  changes unit, a leaver is deactivated from their end date, and no request asks for a field outside the allow-list;
  with the source off, the core loop still works (HD7).
- **Acceptance:** `apps/app/tests/db/directory-successfactors.test.ts` › `SFX acceptance: SuccessFactors pages add,
  move and deactivate users`.
- **Code area:** `apps/app/src/server/directory/successfactors/`, `apps/app/src/features/directory/`,
  `apps/app/tests/fixtures/successfactors/`, `docs/customer/`.
- **Takes from:** DIR: `applyDirectoryDelta`, the directory source setting, the sync status. ARC: `DirectorySource`.
- **Hands to:** ADM: `successfactors` as a choice on the connectors page. EID: a second `DirectorySource` adapter.
- **New packages:** none (OData v2 with `$format=json` over `fetch`).
- **Decisions:** HD2, HD3, HD4, HD7, HD10, HD14 · **Questions:** HQ9.
- **Risks:** no SuccessFactors tenant (HQ9) → proven against recorded pages; the first live run is a customer step.
  The customer's API user and works agreement take weeks → the setup doc says so, and the source stays off until
  then.
- **Size:** 2 waves, ~4 tasks, 60 %.
- **Ready for the Bauplan when:** DIR is merged and Kevin says go (a customer with SuccessFactors but thin Entra
  data).

### AIP AI provider and quality

- **Result:** after AIP, each company chooses its AI provider or none, the routing proposal is made on the server,
  and routing quality is measured in CI.
- **Goal:** One `AiProvider` seam for assistant and brain, chosen per company, with the DPA gate on every model call.
- **Scope:** provider per company (Bedrock eu-central-1, Azure OpenAI, OpenAI-compatible endpoint, off); brain
  calls go through it; routing proposal computed on the server at `case.raised`; DPA gate also for the coach; `CompanyConfig.aiRouting` read where routing runs (moved from STR); eval
  set of 80+ cases, one third German, under `services/brain/eval`, run in CI with a threshold; override rate per
  company recorded. · **Not in scope:** a GPU server.
- **Done when:** with the provider off, raise and routing work by keywords; with a fake provider the server stores
  the proposal; the CI eval reports accuracy above the agreed threshold.
- **Acceptance:** `apps/app/tests/db/ai-provider.test.ts` › `AIP acceptance: proposal made on the server, off works,
  DPA gate holds`.
- **Code area:** `apps/app/src/server/assist/`, `apps/app/src/server/brain.ts`, `apps/app/src/features/routing/`,
  `services/brain/`, `apps/app/prisma/schema/integrations.prisma` (provider settings).
- **Takes from:** IDN: role holders. STR: `Route`. CNX: `KnowledgeSource`.
- **Hands to:** TST: provider switch per company, eval job `brain-eval` in CI. MET: override rate.
- **New packages:** none.
- **Decisions:** HD7, HD8 · **Questions:** HQ3.
- **Risks:** labelled German cases are missing → Victor writes them in wave 1; the threshold is set from the first run.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **Ready for the Bauplan when:** IDN and CNX are merged.
- **Plan:** written 2026-11-02 early, against IDN's names (6 tasks, 85 %). The AI choice is an `Integration` row "ai"
  with a sealed key (no schema change); Bedrock keeps the SDK already installed, Azure and OpenAI-compatible go through
  fetch. One gate for assist, coach, routing and brain; the brain had none on main, and `aiRouting` was read nowhere.
  The proposal is made at raise on the server (8 s brain timeout, then keywords). The CI eval scores recorded answers
  (no model in CI). AIP waits for CLK-G1 (tests folder) and CLK-B1 (`server/actions/events.ts`). Budget 60 → 85 %.

### ADM Administration in the app

- **Result:** after ADM, a company admin manages members, org, routes, calendar and connectors in the app, with SSO
  or 2FA, and the shared admin code is only logged break-glass.
- **Goal:** Move company configuration from `/admin` and the seed into in-app settings for company admins.
- **Scope:** `settings/company`, members (invite, role, deactivate), org and routing editor on the STR tables,
  calendar per site, connector settings (M365 incl. the data page of PR D, Jira incl. the Data Center option, AI
  provider), onboarding wizard for an empty company; named
  admins only, 2FA for code logins, `ADMIN_ACCESS_CODE` as logged break-glass. · **Not in scope:** directory sync
  itself (DIR), QR areas (FLR).
- **Done when:** a fresh company is configured end to end in the UI (wizard → org → routes → first case reaches the
  right inbox) without `/admin`.
- **Acceptance:** `apps/app/tests/e2e/db/admin-setup.spec.ts` › `ADM acceptance: an empty company is configured in
  the app and its first case is routed`.
- **Code area:** `apps/app/src/app/(app)/settings/`, `apps/app/src/components/settings/`, `apps/app/src/server/actions/settings/`.
- **Takes from:** STR: the six tables. IDN: ids. LNG: `t(key)`.
- **Hands to:** FLR: setting `areas` per site. TST: wizard steps addressable by test ids. PIL: wizard as the pilot
  bootstrap.
- **New packages:** none.
- **Decisions:** HD4, HD9 · **Questions:** –
- **Risks:** large UI surface → split into waves by page; the wizard last.
- **Size:** 4 waves, ~10 tasks, 100 %.
- **From the page specs (2026-11-02):** the goals editor on the Rules page (ADM-H1); the company notifications
  page with the failed messages, which NTF/Q1 handed to ADM (ADM-N1); resetting a lost second factor by another
  manager or a stack admin (ADM-R1); Setup stays in the menu until `setupStep` says `done`; the login's sample numbers
  show on demo companies only. 11 tasks, budget 145 → 180 %.
- **Ready for the Bauplan when:** IDN and LNG are merged.
- **Plan:** written 2026-11-02 early, against IDN's, CLK's, DIR's and AIP's names (8 tasks, 145 %). Company admin =
  the company's managers; the editors write STR's tables directly, rules checked first. The connectors page brings
  M365 (with the PR D data block), Jira Cloud and Data Center, the AI provider and directory status into the app.
  Members get seats and invites by mail; signup, invite and forgot-password become real (G-018). TOTP for managers'
  code logins and stack admins; `ADMIN_ACCESS_CODE` stays as logged break-glass. ADM-E1 adds three User fields to
  `auth.prisma` after DIR-G1 (an exception to HD11's area map). Per-site calendars and group-to-unit mapping stay out
  (ADM/Q1, Q3). Budget 100 → 145 %.

### VIS Read model and server-side visibility

- **Result:** after VIS, each user receives only the cases and events their role may see, served from projections,
  so no page reduces the whole log.
- **Goal:** Replace "send the whole log to the browser" with server-side filtering and incremental projections.
- **Scope:** projection tables updated on append (inbox, case summary, metrics inputs); visibility rules from
  `visibility.ts` enforced on the server for pages and the events GET, with the raiser's custom `seenBy` list by user
  id instead of names (left by IDN); paging; a shared rate-limit store in
  Postgres; connection pooling settings. · **Not in scope:** dashboards (MET), public API (API).
- **Done when:** a member's browser receives no event of a case they may not see; inbox and case pages load in
  under 1 s with 50,000 events in the test database.
- **Acceptance:** `apps/app/tests/e2e/db/visibility.spec.ts` › `VIS acceptance: a member receives only visible
  cases and pages stay fast with 50,000 events`.
- **Code area:** `apps/app/src/lib/db/projections/`, `apps/app/src/features/cases/visibility.ts`,
  `apps/app/src/app/(app)/layout.tsx`, `apps/app/src/app/api/[company]/events/`, `apps/app/src/server/throttle.ts`,
  `apps/app/prisma/schema/core.prisma`.
- **Takes from:** CLK: persisted deadline events. IDN: ids. LNG: catalog (layout strings).
- **Hands to:** GDP, LOOP, MET, API: projection readers `inboxView`, `caseView`, `metricInputs`; function
  `visibleTo(userId)`.
- **New packages:** none.
- **Decisions:** HD5, HD10 · **Questions:** –
- **Risks:** projections drift from the log → a rebuild command and a test that compares projection and reducer.
- **Size:** 4 waves, ~9 tasks, 100 %.
- **From the page specs (2026-11-02):** `firstAnswerDay` in `CaseView` and `metricInputs` for MET's time to first
  answer; the rate-limit refusal comes from the catalog in German and English, not the English `waitText` (VIS-D1).
- **Ready for the Bauplan when:** CLK and LNG are merged.
- **Plan:** written 2026-11-02 early, against IDN's and CLK's names (6 tasks, 100 %). One visibility rule by ids in
  `features/cases/visibility.ts`, stored as access keys on a `CaseView` row per case; the server sends each browser only
  its cases with one array-overlap query, and the reducer still runs in the browser over that smaller log. A window
  (open plus the last 90 working days, at most 500 cases) keeps a manager's payload small; older cases load on their
  page. Custom audiences by user and unit id. Rate limits in Postgres, pool size by env. The token-based events GET
  stays company-wide (VIS/Q1; API decides scopes).

### NTF Notification engine and webhooks

- **Result:** after NTF, every outgoing message goes through one outbox with mail and webhook channels, respects
  stage and opt-in, and sends digests and reminders.
- **Goal:** One delivery path for all notices behind `NotifyChannel`, so Teams and later channels are adapters.
- **Scope:** `OutboxMessage` table with retries; channels `mail` and `webhook` (signed, `WebhookEnvelope` v1);
  digest and reminder jobs on scheduler events; gating by stage, per-user opt-in and `CompanyConfig.notifications` / `n8n` (moved from STR); `case-notice.ts` and
  `loop-notice.ts` moved onto the outbox. · **Not in scope:** Teams (TMS).
- **Done when:** a deadline produces exactly one reminder per recipient, a failed webhook is retried and then
  marked failed, and a sandbox company sends nothing.
- **Acceptance:** `apps/app/tests/db/outbox.test.ts` › `NTF acceptance: reminders once, webhook retries, sandbox
  sends nothing`.
- **Code area:** `apps/app/src/server/notify/`, `apps/app/src/server/case-notice.ts`, `apps/app/src/server/loop-notice.ts`,
  `apps/app/prisma/schema/integrations.prisma`.
- **Takes from:** CLK: `clock.due` events. ARC: `NotifyChannel`, `WebhookEnvelope`.
- **Hands to:** TMS: `registerChannel("teams", …)`. API: outbox for customer webhooks. TST: outbox inspection in
  tests.
- **New packages:** none.
- **Decisions:** HD2, HD3, HD7 · **Questions:** –
- **Risks:** duplicate mails during migration → old senders switched off in the same task that moves them.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **Ready for the Bauplan when:** CLK is merged.
- **Plan:** written 2026-11-02 early, against IDN, CLK and AIP (6 tasks, 90 %). The outbox is filled from the event log
  behind a cursor with unique keys, not in the append transaction. Reminders come from CLK's `clock.due` facts. A
  sandbox company writes `skipped` rows and sends nothing; the notifications switch gates only reminders and digests.
  Webhooks carry v1 public events from a mapper built here (API reuses it). Digest opt-in on the profile page;
  subscriptions have no editor until ADM. Budget 60 → 90 %.

### GDP Data protection functions

- **Result:** after GDP, every admin action is an audit event, a company can export its data and delete or
  pseudonymise a person, and retention rules run.
- **Goal:** Close the data-protection gaps a DPA, a DPIA and a works council ask about.
- **Scope:** audit events for admin actions (create, stage, codes, tokens, delete); `/admin/audit`; company and
  person export (JSON); person deletion or pseudonymisation; retention rules for events, drafts and assistant turns;
  screenshot policy per company. ·
  **Not in scope:** log export (EID).
- **Done when:** an admin action shows in the audit view; a person's export contains their data only; after
  pseudonymisation their name appears nowhere.
- **Acceptance:** `apps/app/tests/e2e/db/data-protection.spec.ts` › `GDP acceptance: audit, export and pseudonymise`.
- **Code area:** `apps/app/src/features/privacy/`, `apps/app/src/server/audit/`, `apps/app/src/app/(app)/admin/audit/`,
  `apps/app/prisma/schema/ops.prisma`.
- **Takes from:** VIS: `visibleTo`, projections.
- **Hands to:** EID: audit events `audit.*` for log export. SEC: export and deletion functions named in the TOMs.
- **New packages:** none.
- **Decisions:** HD5 · **Questions:** –
- **Risks:** pseudonymisation of an append-only log → names are replaced in projections and display; ids stay.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **From the page specs (2026-11-02):** retention per kind (assistant turns, today's `retentionDays`; drafts;
  events of closed cases) and the screenshot policy are GDP's own rows in `ops.prisma` (e.g. `RetentionRule`), not
  new scalar columns on Company (HD11). The audit view lives in Settings at `/settings/audit`, not
  `(app)/admin/audit`, so the company admins find it next to the other settings.
- **Ready for the Bauplan when:** VIS is merged.

### LOOP Case loop v1

- **Result:** after LOOP, the whole loop from raise to project runs without placeholders, switchable per company,
  and with AI and integrations off.
- **Goal:** Finish the product loop for the pilot on the new foundation.
- **Scope:** raise-menu placeholders (receiver, colleagues, meeting) finished or removed; discussion and projects
  switchable per company; override visible to the author; decision log view; a loop test with every flag for AI and
  integrations off. · **Not in scope:** new features beyond the loop.
- **Done when:** the loop e2e passes on a non-demo company with AI, n8n, Jira and M365 off.
- **Acceptance:** `apps/app/tests/e2e/db/loop.spec.ts` › `LOOP acceptance: raise to project on a real company with
  AI and integrations off`.
- **Code area:** `apps/app/src/components/ideas/`, `apps/app/src/components/cases/`, `apps/app/src/features/ideas/`,
  `apps/app/src/config/flags.ts`.
- **Takes from:** VIS: `caseView`, `inboxView`. CLK: real deadlines.
- **Hands to:** TST: loop scenario steps.
- **New packages:** none.
- **Decisions:** HD7, HD9 · **Questions:** –
- **Risks:** placeholder features grow → each one is finished in its simplest form or removed, decided in the Bauplan.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **From the page specs (2026-11-02):** receiver suggestions rank desks (a role and its seats) by route,
  keywords and spend authority only. The per-person answer track record in `features/ideas/receivers.ts`
  (`TRACK_CASES`) goes and no score is shown for a person (HD5). The new log is `/decisions`; the stack's
  `/admin/decisions` (router proposals against what people did) is renamed "Routing review" so the two are not
  confused.
- **Ready for the Bauplan when:** VIS is merged.

### MET Wait ledger and dashboards on real data

- **Result:** after MET, management sees real wait-ledger numbers (time to first answer, share answered on time)
  per unit and role, with a baseline, and no placeholder widget remains.
- **Goal:** Replace `dashboardPreview`, `feedPreview` and `overviewPreview` with real data and add a baseline.
- **Scope:** metrics from projections; dashboards per company, unit and role; baseline period; CSV export; feed on
  real events; empty states; the "most relied-on contributors" ranking, `/people/[name]` counts and every other
  per-person number removed. · **Not in scope:** person metrics (HD5).
- **Done when:** with seeded real-clock data, the dashboard numbers equal a hand-computed fixture; no preview module
  is imported anywhere; no screen renders a per-person count or rank.
- **Acceptance:** `apps/app/tests/db/wait-ledger.test.ts` › `MET acceptance: dashboard numbers match the fixture`.
- **Code area:** `apps/app/src/features/metrics/`, `apps/app/src/components/dashboard/`, `apps/app/src/components/feed/`.
- **Takes from:** VIS: `metricInputs`. CLK: real timestamps. AIP: override rate.
- **Hands to:** PIL: report `pilotReport(companyId, from, to)`.
- **New packages:** none.
- **Decisions:** HD5, HD9 · **Questions:** –
- **Risks:** small numbers identify people → minimum group size of 5 for any breakdown.
- **Size:** 3 waves, ~6 tasks, 60 %.
- **From the page specs (2026-11-02):** person pages move from `/people/[name]` to `/people/[userId]` (HD10; IDN/D14
  left them to ADM, which does not take them, so MET does): a name URL redirects when exactly one active member has
  that name; a member with an anonymous handle has no person page and their handle is not a link. Time to first answer
  from VIS's `firstAnswerDay`. Code area adds `apps/app/src/app/[company]/(app)/people/`.
- **Ready for the Bauplan when:** VIS and AIP are merged.

### TMS Microsoft Teams

- **Result:** after TMS, people get NextUp notices in Teams, raise a case from Teams and answer from an adaptive card.
- **Goal:** A Teams channel adapter and a Teams app, without a new SDK.
- **Scope:** Teams app manifest; bot endpoint that verifies Bot Framework tokens; `NotifyChannel` adapter `teams`;
  raise as a message extension; answer and hand-over from adaptive cards; cards in German and English; a local fake
  of the Bot Framework for tests. · **Not in scope:** Slack, Webex.
- **Done when:** against the fake, a deadline reminder arrives as a card, an answer on the card appends the right
  event, and a raise from Teams creates a case.
- **Acceptance:** `apps/app/tests/db/teams.test.ts` › `TMS acceptance: card reminder, card answer and raise from
  Teams`.
- **Code area:** `apps/app/src/server/teams/`, `apps/app/src/app/api/[company]/teams/`, `ops/teams/` (manifest),
  `apps/app/tests/fake-botframework/`.
- **Takes from:** NTF: `registerChannel`. LNG: catalogs. ARC: `NotifyChannel`, `CaseSource`.
- **Hands to:** TST: Teams scenarios against the test tenant.
- **New packages:** none.
- **Decisions:** HD2, HD9 · **Questions:** HQ6.
- **Risks:** the live tenant setup takes Kevin's time → code and proofs use the fake; live check in TST.
- **Size:** 4 waves, ~8 tasks, 100 %.
- **Ready for the Bauplan when:** NTF and LNG are merged.

### FLR Shop-floor access

- **Result:** after FLR, a person without a PC or mail raises a case by scanning a QR code on a shared device and
  gets the answer on a printed or displayed reference.
- **Goal:** An installable web app with QR entry points and a shared-device mode.
- **Scope:** PWA manifest; QR codes per area from ADM's `areas`; shared-device mode with short login or anonymous
  raise with a reference number; status page by reference. · **Not in scope:** native apps.
- **Done when:** a QR URL opens the raise form for its area on a mobile viewport, the case reaches the right role,
  and the reference shows the answer.
- **Acceptance:** `apps/app/tests/e2e/db/shop-floor.spec.ts` › `FLR acceptance: QR raise reaches the role and the
  reference shows the answer`.
- **Code area:** `apps/app/src/app/(floor)/`, `apps/app/src/features/floor/`, `apps/app/public/manifest.webmanifest`.
- **Takes from:** ADM: the settings frame (`SETTINGS_SECTIONS`). VIS: the rate-limit store.
- **Hands to:** TST: QR scenario.
- **New packages:** a QR encoder for the area codes (e.g. `qrcode`), exact version fixed when FLR becomes ready, merged first as `deps/FLR`.
- **Decisions:** HD5, HD9 · **Questions:** –
- **Risks:** anonymous raise invites abuse → rate limit per device and area (VIS store).
- **Size:** 2 waves, ~4 tasks, 30 %.
- **From the page specs (2026-11-02):** FLR owns the area table, because ADM builds no areas: `FloorArea`
  (company, org unit, name, target role, anonymous raise allowed) and `FloorDevice` (area, label, hash of the short
  code) in `structure.prisma` (FLR names this file under HD11), and its settings section `areas` through ADM's
  `SETTINGS_SECTIONS`. QR images need a package, merged first as `deps/FLR` (HD12; a QR encoder, exact version fixed
  when FLR is ready). The sent page never puts the reference number into a URL. Takes from ADM: the settings frame,
  not `areas`.
- **Ready for the Bauplan when:** ADM and VIS are merged.

### API Public API v1 and outbound webhooks

- **Result:** after API, a customer's middleware reads and writes NextUp through a documented, versioned API and
  receives signed webhooks.
- **Goal:** Turn the internal events API into a public, rate-limited API v1 and expose webhooks to customers.
- **Scope:** `/api/v1/[company]/…` for cases, decisions, projects, org (read) and case creation (write); OpenAPI
  document generated from the `ApiV1` schemas; token scopes; rate limits; webhook subscriptions per company on the
  NTF outbox; the old events API kept as is (HD3); CSV bulk import and export of structure. · **Not in scope:**
  SDKs.
- **Done when:** the OpenAPI document validates; every v1 endpoint passes contract tests against the `ApiV1`
  schemas; a webhook subscription receives a signed event.
- **Acceptance:** `apps/app/tests/db/api-v1.test.ts` › `API acceptance: contract tests pass and a signed webhook
  arrives`.
- **Code area:** `apps/app/src/app/api/v1/`, `apps/app/src/server/api/`, `docs/api/`.
- **Takes from:** VIS: projection readers. NTF: outbox `webhook` channel. ARC: `ApiV1`, `WebhookEnvelope`.
- **Hands to:** TST: API scenarios. PIL: CSV import for the bootstrap.
- **New packages:** none.
- **Decisions:** HD2, HD3 · **Questions:** –
- **Risks:** the API leaks what VIS hides → every endpoint goes through `visibleTo` for user tokens; system tokens
  see aggregates only unless scoped.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **From the page specs (2026-11-02):** API builds the Webhooks settings page (subscriptions on NTF's outbox:
  URL, event types, a secret shown once, deliveries with retries and failures) and the API tokens page. NTF/Q1 gave
  the subscription editor to ADM; ADM builds only the notifications page (ADM-N1), so the editor is API's. Code area
  adds `apps/app/src/app/[company]/(app)/settings/{webhooks,api-tokens}/`.
- **Ready for the Bauplan when:** VIS and NTF are merged.

### EID Enterprise identity and log export

- **Result:** after EID, a company logs in through any OIDC provider or SAML, provisions users through SCIM, and
  streams audit events to its SIEM.
- **Goal:** The identity and logging seams a corporate expects, on the ARC interfaces.
- **Scope:** generic OIDC `IdentityProvider` (ADFS, Okta) next to Entra; SAML 2.0 SP; SCIM 2.0 inbound
  (`/scim/v2/Users`, `/Groups`) on `applyDirectoryDelta`; `LogSink` adapters JSON file and syslog for `audit.*`. ·
  **Not in scope:** HR connectors.
- **Done when:** a test IdP logs in through OIDC and SAML; SCIM create, update and deactivate change users; an
  audit event reaches a test syslog receiver.
- **Acceptance:** `apps/app/tests/db/enterprise-identity.test.ts` › `EID acceptance: OIDC, SAML, SCIM and syslog
  export`.
- **Code area:** `apps/app/src/server/identity/`, `apps/app/src/app/api/scim/`, `apps/app/src/server/logsink/`.
- **Takes from:** DIR: `applyDirectoryDelta`. GDP: `audit.*` events. ARC: `IdentityProvider`, `DirectorySource`,
  `LogSink`.
- **Hands to:** TST: identity scenarios.
- **New packages:** a SAML library (e.g. `@node-saml/node-saml`), exact version fixed when EID becomes ready, merged
  first as `deps/EID`.
- **Decisions:** HD2, HD3, HD12 · **Questions:** –
- **Risks:** SAML is easy to get wrong → signature and replay tests from known attack fixtures; `risk: high`.
- **Size:** 4 waves, ~9 tasks, 100 %.
- **Ready for the Bauplan when:** DIR and GDP are merged and the SAML package is chosen.

### SEC Security and compliance pack

- **Result:** after SEC, a real-stage company runs without standing team access, and the documents an IT department
  asks for are in the repo.
- **Goal:** Close the access gap and write the compliance pack from what the code actually does.
- **Scope:** the box agent stops copying stack secrets for real stages; customer-granted, time-limited, logged
  break-glass; key rotation script for `AUTH_SECRET`, `CONNECTOR_VAULT_KEY`, restic; ZAP baseline scan in CI; a CI job that releases to a customer host through `stack/deploy-remote.sh` (OPS leaves
  `deploy.yml` unchanged);
  `docs/compliance/` with DPA template, TOMs, record of processing, DPIA, works agreement template, VDA ISA
  self-assessment, sub-processor list; customer guides for install, operations, security. · **Not in scope:** the
  external pentest, signing anything.
- **Done when:** on a real-stage test stack, admin's vault holds no stack secret and a break-glass grant expires;
  the ZAP job has no high finding; every document exists and names the functions from GDP and EID.
- **Acceptance:** `stack/tests/no-standing-access.test.sh` › `SEC acceptance: no standing access and break-glass
  expires`.
- **Code area:** `stack/provision/`, `stack/`, `.github/workflows/`, `docs/compliance/`, `docs/customer/`.
- **Takes from:** GDP: export, deletion, audit. OPS: remote deploy, off-box backup.
- **Hands to:** TST: hardened stack defaults. PIL: the compliance pack.
- **New packages:** none.
- **Decisions:** HD6 · **Questions:** –
- **Risks:** documents promise more than the code does → each TOM line links to the test that proves it.
- **Size:** 3 waves, ~7 tasks, 60 %.
- **Ready for the Bauplan when:** GDP and OPS are merged, and Kevin has seen both (go: kevin).

### TST Demo test phase

- **Result:** after TST, a demo company "Musterwerk" with 1,500 people on 3 sites passes scenario, load and recovery
  tests on a dedicated server, against the Microsoft 365 test tenant and a Jira test site.
- **Goal:** Test the whole system hard before any pilot (HD1) and turn every finding into a fix inside this phase or
  a stop.
- **Scope:** generator for Musterwerk (structure, 1,500 users, routes, cases over simulated weeks); scenario suite
  over raise, routing, deadlines, deputies, Teams, QR, Jira, M365, API, SCIM; load test with 2,000 accounts (p95
  under 1 s for inbox and case pages); restore and on-prem install drill; bug-bash fixes. · **Not in scope:** the
  two weeks of internal real-time use (Kevin's team, after this phase).
- **Done when:** the scenario suite and the load test are green on the test VM and in CI (load test against the CI
  database at reduced size); the restore drill meets the RTO.
- **Acceptance:** `apps/app/tests/e2e/db/musterwerk.spec.ts` › `TST acceptance: Musterwerk scenario suite`, and
  `apps/app/tests/load/musterwerk-load.test.ts` › `TST acceptance: 2,000 accounts within budget`.
- **Code area:** `apps/app/tests/e2e/db/`, `apps/app/tests/load/`, `apps/app/prisma/generators/musterwerk/`, fixes in the
  areas the findings name (owned per task).
- **Takes from:** all feature phases (their "hands to TST" items); a dedicated test VM (from INF once it exists, else created by hand with `harden.sh`).
- **Hands to:** PIL: the generator as the template for a pilot bootstrap; a findings list.
- **New packages:** a load-test tool, chosen when TST becomes ready, merged first as `deps/TST`.
- **Decisions:** HD1, HD7 · **Questions:** –
- **Risks:** findings exceed the phase → high findings are fixed here, the rest go to PIL or after the pilot.
- **Size:** 4 waves, ~10 tasks, 100 %.
- **Ready for the Bauplan when:** every phase in `after` is merged and Kevin has seen the results (go: kevin).

### PIL Pilot package

- **Result:** after PIL, a pilot company is bootstrapped from configuration on its VM, and its pilot numbers are
  reported weekly.
- **Goal:** Everything the team needs to start and run the first pilot that is code or repo documentation.
- **Scope:** bootstrap from CSV or Graph into an empty company (wizard plus import); stage switch sandbox → pilot
  with a checklist test; weekly pilot report from `pilotReport`; onboarding and training material; support
  process and runbook in `docs/pilot/`. · **Not in scope:** the pilot itself, the contract.
- **Done when:** a scripted bootstrap of a sample company of 1,000 people reaches stage `pilot` with every check
  green and produces the first report.
- **Acceptance:** `apps/app/tests/e2e/db/pilot-bootstrap.spec.ts` › `PIL acceptance: bootstrap to pilot stage and
  first report`.
- **Code area:** `apps/app/src/features/pilot/`, `apps/app/prisma/generators/`, `docs/pilot/`.
- **Takes from:** TST: generator, findings. MET: `pilotReport`. ADM: wizard. API: CSV import. SEC: compliance pack.
- **Hands to:** – (the pilot).
- **New packages:** none.
- **Decisions:** HD1, HD4 · **Questions:** –
- **Risks:** the pilot customer's systems differ from the test tenant → the bootstrap reports every missing
  setting instead of failing silently.
- **Size:** 3 waves, ~6 tasks, 60 %.
- **From the page specs (2026-11-02):** a stage move bumps `sessionEpoch` (signs everyone out) only when it
  leaves `demo` (the "view as" list goes away) or goes back to a lower stage; sandbox → pilot → live keep everyone
  signed in. The stage texts (`STAGE_MEANING` in `features/admin/stages.ts`) read the company's `promise_days`
  instead of "two working days". Go-live and the pilot report follow spec 09.
- **Ready for the Bauplan when:** TST is merged and Kevin has seen its findings (go: kevin).

## Parked phase (not in `plans` until HQ8 is answered)

### INF Customer VM as code

- **Result:** after INF, a customer VM in Germany is created, hardened and registered for deploys from code.
- **Goal:** OpenTofu and Ansible (or plain scripts) for one VM per customer, with `harden.sh` committed and applied.
- **Scope:** VM, firewall, disk encryption, SSH over VPN, deploy key with forced command, uptime check registration.
  · **Not in scope:** Azure, Kubernetes.
- **Done when:** a plan/apply against a test project creates a VM that passes the hardening checks and accepts a
  `deploy-remote.sh` release.
- **Acceptance:** `tests/customer-vm.test.sh` › `INF acceptance: a new VM is hardened and takes a release`.
- **Code area:** nextup-infra `servers/`, `customers/` (project nextup-infra).
- **Takes from:** OPS: `stack/deploy-remote.sh`, `docs/ops/RPO_RTO.md`.
- **Hands to:** TST: the test-phase VM. PIL: the pilot VM.
- **New packages:** none in Nextup.
- **Decisions:** HD6 · **Questions:** HQ8.
- **Risks:** the orch project for nextup-infra does not exist → stays `idea` until Kevin answers HQ8.
- **Size:** 3 waves, ~6 tasks, 60 %.
- **Ready for the Bauplan when:** OPS is merged and the nextup-infra project exists.

## Risks

- **The foundation phases touch everything** (STR, IDN, CLK, VIS). → They run in a chain, one per area, with the full
  e2e suite as part of each acceptance.
- **Parallel phases collide on shared files.** → ARC splits the schema and writes the ownership map; `orch haupt`
  checks the `owns` of phases that can run together once their Baupläne exist.
- **Most phases are `idea` because they depend on the foundation's names.** → The briefs fix the names now; a phase
  becomes `ready` as soon as its `after` is merged (Part B).
- **Scope grows with every customer conversation.** → After TST starts, only fixes; new wishes go to a list for after
  the pilot.
- **Compliance and the pilot depend on people outside the team** (legal entity, DPA, works council, pentest). → Not
  orch work; Kevin and Marc start them in parallel with the foundation.
- **Budget:** 2,250 % of a 5-hour window (sum 1,875 % + 20 %), about 23 full windows. → Re-estimated after AUD and ARC
  with the measured factor.

## Course

- 2026-11-01 Draft.
- 2026-11-01 Baupläne AUD (5 tasks, 73 %), ARC (5 tasks, 73 %) and OPS (7 tasks, 125 %) written; budgets raised to
  75/75/125. STR brief re-cut, because the structure tables already exist on main. Overlaps found while planning ARC
  removed: NTF after LNG, CNX and AIP; the ranking removal moved from GDP to MET; HD11 got the Company block rule. Phases recut from the 22 phases of the Nextup overview plan to orch size; project `nextup` created; INF parked until nextup-infra is an orch project.
- 2026-11-01 Baupläne STR (6 tasks, 99 %), LNG (11 tasks, 150 %) and CNX (4 tasks, 60 %) written early against
  ARC's fixed names (Kevin: write all three now, one lane each); first waves need ARC-Z1. LNG budget 100 → 150 %.
  STR and LNG overlap on six components and `features/ideas/benchmarks.ts` → ordered by task needs (orch haupt now
  respects needs across plans). Briefs corrected: STR (overlay, not projection; `aiRouting` to AIP, `n8n` and
  `notifications` to NTF), CNX (A-C and Jira engine already merged; PR D and the DC admin option to ADM), LNG
  (namespaces, notice files, locale columns in auth and integrations); IDN needs LNG-F1 and LNG-D1.
- 2026-11-01 Phase CON renamed CNX: `CON` is a reserved device name on Windows, so git (and orch on kev-pc) cannot
  open `projects/nextup/CON/`. ADR 0007 (ARC-S1, already approved) still says CON; it means CNX.
- 2026-11-01 SAP (Kevin): phase SFX added after DIR (`go: kevin`), HD14 (SAP read-only, org chart only, no absences,
  no write-back, no direct HCM connector), HQ9. DIR's brief takes Entra `employeeId` as the personnel number and keeps
  `applyDirectoryDelta` source-agnostic. Route B of the SAP doc moved from an n8n workflow to an in-app adapter (HD2).
  SFX is not in TST's `after`: the pilot does not wait for it. Budget 2,178 → 2,250 %.
- 2026-11-02 Bauplan IDN (9 tasks, 165 %) written after STR merged. Kevin chose the desk by role and the
  department-claim JIT seat. Brief corrected: no schema change (the id columns exist), code area includes the pages,
  the demo binding and `lib/db`. VIS takes the custom `seenBy` lists by user id. Budget 2,250 → 2,315 %.
- 2026-11-02 Bauplan CLK (6 tasks, 90 %) written early after IDN was approved (Kevin: "continue with the next plan").
  Escalation persisted as `clock.due` facts, per-site calendars to ADM. Budget 2,315 → 2,345 %.
- 2026-11-02 Baupläne DIR (6 tasks, 85 %) and AIP (6 tasks, 85 %) written early next to CLK. No `after` on CLK, so they run next to it;
  their tasks need CLK-G1, CLK-B1 and CLK-D1 instead of sharing files. DIR: groups unstored until ADM, leavers
  deactivated with vacant seats. AIP: provider as an `Integration` row, one gate for every model call, eval on
  recorded answers. Budget 2,345 → 2,395 %.
- 2026-11-02 Baupläne ADM (8 tasks, 145 %), VIS (6 tasks, 100 %) and NTF (6 tasks, 90 %) written early, with task needs
  on DIR, AIP, CLK and VIS files instead of shared paths. ADM-E1 may change `auth.prisma` (HD11 exception, after
  DIR-G1). Per-site calendars (from CLK) and group-to-unit mapping (from DIR) are not in ADM: recorded as open for
  after the pilot. Budget 2,395 → 2,470 %.
- 2026-11-02 Page specs for Sam written in the Nextup repo (`docs/plans/2026-11-02_pilot-pages.md`, PR #306) → HD15.
  The gaps they found are given an owner: ADM gets the goals editor, the notifications page (NTF/Q1) and the reset of
  a lost second factor (ADM-H1, ADM-N1, ADM-R1), setup open until done, the login's sample numbers on demo only; VIS
  `firstAnswerDay` and the translated rate-limit text; LOOP desks instead of people in the receiver suggestions (HD5)
  and the `/admin/decisions` rename; MET person pages by user id; FLR the area and device tables and `deps/FLR`; API
  the Webhooks page; GDP retention per kind; PIL no sign-out between sandbox, pilot and live, stage texts from
  `promise_days`. NTF is active and unchanged. Budget 2,470 → 2,505 %.
