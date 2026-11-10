# Settings

Plan ADM. What a company's manager configures in the app at `/<company>/settings`, without `/admin`. The nav is
`SETTINGS_SECTIONS` in `apps/app/src/features/settings/sections.ts`; each page calls `companyAdminOf(slug)` first
(`server/actions/settings/guard.ts`).

## Who may use it

Only an **active manager of the company** (`role = manager`, checked against the database on every page and action).
Everyone else gets a 404. Every write names the company from the viewer, never from the form. Leaders and members have
no settings; they sign in with their code (or Microsoft) as before.

## Sections

In this order. Setup is not a section: it has its own pages, and while the company is closed the menu shows a pill that leads there.

| Section | Path | What it does |
|---|---|---|
| Company | `settings/company` | Name, mark, vision, mission, principles, business model, compliance rules. |
| Rules | `settings/rules` | Spend text, reward, measure days, who a member's idea is preselected as on the last look (handle or name; CompanyRule `posting`), and the company goals (title, KPI, target, period, keywords, unit). |
| Calendar | `settings/calendar` | Region, workdays, extra holidays and extra workdays (one calendar per company). |
| Org | `settings/org` | Units, roles under a unit, seats under a role, and linking a seat to a member. |
| Routing | `settings/routing` | Request types with keywords, owner / deputy / buddy role, wait, and order. |
| Members | `settings/members` | Add or invite people, new login codes, roles, seats, deactivate or delete, reset a manager's second factor. |
| Notifications | `settings/notifications` | The company's switch, opt-out counts, failed outbox rows with Retry. |

Test ids are `settings-<section>-<thing>`; the setup steps are `setup-step-<key>`.

## Setup

Setup is its own process at `/<company>/setup`, outside the app shell and outside Settings, with one page per step:
`setup/company`, `setup/units`, `setup/roles`, `setup/routes`, `setup/members`, `setup/done`, `setup/open`. Settings holds the
results. How far a company is gets derived from what exists on every load (`setupStep(counts)`), never stored:

- `company`: saved once with a name. Only the name is required.
- `units`: at least one unit.
- `roles`: at least one seat. It may stay vacant.
- `routes`: at least one route.
- `members`: more than the admin alone.

Each step uses the same actions as its own page. A later step in the address leads back to the first one not done,
and *Next* opens once the step is done.

**Closed until opened.** A new company starts closed (`Company.openedAt` null): a demo company is opened when it is
created, and a company that existed before this rule stays open. While closed:

- Only setup people get a session: active managers and stack admins (`features/pilot/open.ts`, `signInEntry`). Every path
  that issues one asks first: the personal code, Microsoft, OIDC and SAML, the demo button, the dev panel's switch.
  Everyone else sees on the login page that NextUp is not open yet. Microsoft creates and binds nobody before the answer.
- Setup people land on `/setup` after sign-in; a `next` target still wins.
- Sessionless ways to raise a case are off too: a shop-floor area says it is paused and the floor code refuses, and the
  Teams bot answers as if Teams were off.
- Inviting mails only setup people. Anyone else's invitation is held (`User.invitationHeldAt`) and shown as waiting on
  Members. Their first code was never seen by anyone; Open mails a new one. Issuing a code by hand ends the wait.
- The move to pilot is refused: Open comes first.

`setup/open` shows the go-live checks and a dialog repeating what is left of the runbook's hand list (restore test,
security findings, leftover access). *Open NextUp* runs the checks again on the server (`canOpen`): every step and every
needed check done, with no override. The move to pilot asks the same and, on top, reminders and the digest (below).
It stores the time, writes `audit.company.opened`, then sends the held invitations. A mail that fails stays held, and the
page offers to send again. The stage does not move and nobody is signed out.
A case reaches a route's owner through the seat: a seat a leader is linked to puts the case in that leader's inbox,
and the raise page offers the seat by its name.

### The overview

`/<company>/setup` shows every phase with its owner, its status and a link, so people can leave and come back. The
status is one of done, your turn, waiting, problem or not used. `setupPhases(facts)` in
`features/settings/setup-phases.ts` derives it on every load from what exists, and nothing is stored.

| # | Phase | Owner | Waits on |
|---|---|---|---|
| 1 | Server | NextUp and customer IT | mail relay, first good off-server backup |
| 2 | Sign-in and directory | Customer IT | Microsoft sign-in, first good directory sync |
| 3 | Connectors and AI | Customer IT | Microsoft 365, Teams, Jira, AI provider, signed agreement |
| 4 | Company context | System, started by a person | the background run |
| 5 | Company to Members | Pilot lead | the five steps above |
| 6 | Check and open | Customer admin | the five steps, the needed go-live checks, then opening |

- **Who.** `setupPersonOf(slug)` lets in active managers and, on a one-company stack, stack admins; anyone else gets a
  404. A manager acts on phases 4 to 6, a stack admin on phases 1 to 3, someone who is both on all of them. What a
  person cannot act on has no link, and "your turn" reads "open" for them.
- **One-company stacks only.** Phases 1 to 3 do not show in multi-tenant mode, which has no console.
- **Links.** Phase 1 has none, since the install is in the runbook and nothing in the app changes it. Phases 2 and 3 go
  to the console block that has the missing thing: `/admin/people#microsoft`, `/admin/connectors`, or `/admin/assistant`
  for the agreement. Phase 5 goes to the first step not done, and that page says the person is coming back.
- **Context.** The run's `ready` stays after the review, so phase 4 reads done once the run is over, and its line says a
  draft is reviewed on the Company step.
- **Waiting.** The page refreshes itself every 15 seconds while phase 1 to 5 waits, and not at all otherwise. A hidden
  tab does not poll. Open's own waiting does not count: it waits for people, or for a backup phase 1 already waits for.
- **Optional things.** No line in phases 2 and 3 stops Open by itself: only the go-live checks do. Each optional line
  that is not in use (Microsoft sign-in, the directory sync, Microsoft 365 search, Teams, Jira, an AI that is off) has
  **We do not use this** for a stack admin, with a one-line reason (Q9.1). It writes `audit.connector.declined
  {system, reason}` and the line reads "<system>: not used, decided <date>. Reason: …"; **Use it after all** writes
  `audit.connector.reopened`. The newest row per system decides (`features/settings/declined.ts`); there is no table.
  A decision never blocks or passes a go-live check, is ignored once the system is on, and is not offered for a failing
  Jira or an AI that still blocks Open (test model, missing agreement). "Nothing is connected yet" goes once every
  system of phase 3 that is off has a decision. The console shows the decisions without the buttons.
- **Teams.** Phase 3 has a Teams line: on when the switch is on, the stack's bot is set up and the tenant is known (as
  the dispatcher decides), otherwise off, and every notice goes by mail. The switch itself is Settings → Microsoft Teams.
- **NextUp's view.** `/admin/setup`, behind `consoleCompany()`, shows the same overview read-only, also to a support
  session. It only links to console pages, which keep their own rule for support.

Tests: `apps/app/tests/unit/adm/setup-phases.test.ts`, `apps/app/tests/unit/adm/setup-declined.test.ts`,
`apps/app/tests/db/setup-declined.test.ts`, `apps/app/tests/e2e/db/setup-overview.spec.ts`, and the stack admin and support
session in `apps/app/tests/e2e/db/itc-console.spec.ts`.

### Go-live: agreements and the move to pilot

Settings → Go-live has an **Agreements** card (Q9.4) for what is signed outside NextUp: the data-processing agreement
with NextUp, the works agreement, the IT security approval, the DPIA, and the information to employees about the AI.
Each takes the date it was signed and the signer's role (a role, never a name), or "not needed" with a one-line reason;
for the works agreement that reads **No works council**. The DPA and the AI information have no "not needed". A save
writes `audit.company.agreement {kind, status, date, signer | reason}`; the newest row per kind is the record
(`features/pilot/agreements.ts`), there is no table.

The go-live check **Agreements** is needed, so it blocks Open and the move to pilot: the DPA always, the works agreement
unless "no works council" is recorded, and the AI information while the AI is not off. The IT security approval and the
DPIA are recorded, not checked.

**Reminders and digest** (`CompanyConfig.notifications`) is recommended for Open and needed for the move to pilot
(Q9.7), because the promise and the deputy hand-over depend on reminders. The Open step marks it "needed for the move to
pilot"; Go-live lists it with the needed checks (`levelAt(check, "pilot")`, `blockers(checks, "pilot")`).

The retention run keeps the rows of the agreements and of "We do not use this" past the audit log's 24 months
(`AUDIT_KEPT_ACTIONS` in `features/privacy/retention.ts`): they are state, not history.

Settings → Data and privacy names the date stored with the AI settings "AI provider's agreement": it is the AI provider's
agreement, not the DPA with NextUp, which is on the Agreements card.

Tests: `apps/app/tests/unit/pil/agreements.test.ts`, `apps/app/tests/unit/pil/open.test.ts`, `apps/app/tests/db/setup-open.test.ts`,
`apps/app/tests/db/pil-stage.test.ts`, and the card in `apps/app/tests/e2e/db/admin-setup.spec.ts`.

## Second factor and break-glass

- **TOTP for managers** (RFC 6238, SHA-1, 6 digits, 30 s, one step of drift; `features/auth/totp.ts`). A manager who
  signs in with a personal code and has not enrolled is sent to enrol before any page: the key and an `otpauth:` link
  are shown as text, no QR image. Once enrolled, every code login asks for a TOTP code. The secret is sealed with the
  connector vault (`CONNECTOR_VAULT_KEY`, which must be **64 hex characters**; without a valid key a manager cannot
  sign in).
- Leaders and members sign in with their code only; Microsoft sign-in needs no TOTP (Entra does MFA). Managers of
  demo-stage companies sign in through the demo and never enrol.
- **Lost second factor.** Another manager resets it on Members, or a stack admin in `/admin` People. It clears the
  sealed secret, logs `[auth] totp reset <ISO time>` without personal data, and the person enrols again at their next
  login. Nobody resets their own.
- **Stack admin (`/admin`).** Opens for a Microsoft sign-in with the `NextUp.Admin` role, or for a user with
  `isStackAdmin` who signs in with code and TOTP. `ADMIN_ACCESS_CODE` still opens it as **break-glass**: every use
  writes `[admin] break-glass <ISO time>` and `/admin` shows the banner "Opened with the shared code" for that session.
  After a company is created, `/admin` is not needed to configure it.

## ADM gaps

Register rows of phase ADM (`docs/audit/gaps/product.md`) and what answers each.

| Gap | Row | Answered by |
|---|---|---|
| G-012 | Routing table read-only from the seed | ADM-B1: the routing editor (owner, deputy, buddy, keywords, wait, order). |
| G-013 | No org editor | ADM-B1: units, roles and seats are edited in Org. |
| G-014 | `settings/company` was empty | ADM-A1: company, rules and calendar pages (goals: ADM-H1). |
| G-018 | Signup, accept-invite, password reset are stubs | ADM-D1: invites by mail with a personal code, seats on Members; the stub pages send people to the company login or to their manager. |
| G-047 | `/admin` opened with one shared code, no 2FA | ADM-E1: TOTP, named stack admins, logged break-glass; ADM-R1: reset of a lost second factor. |

Open items from the plan's questions, decided by their defaults:

- **Q1 per-site calendars: open.** ADM edits one company calendar; a site calendar needs a per-case clock (CLK) and is
  left for after the pilot.
- **Q2 QR code for TOTP enrolment: open.** Text key and `otpauth:` link only; a QR image needs a package and comes
  with a deps/ADM PR if wanted.
- **Q3 Entra group mapping to units: open.** Units come from the department attribute (IDN, DIR); a group mapping waits
  for a pilot customer that needs it.

Acceptance: `apps/app/tests/e2e/db/admin-setup.spec.ts` creates an empty closed company, and its manager enrols TOTP,
runs the steps and links the leader to the seat on Members. A member cannot sign in; Open is refused until the calendar is
saved and the DPA and "no works council" are recorded on Go-live; after Open the leader's held invitation goes out, and a member's case about the rig reaches that leader.
