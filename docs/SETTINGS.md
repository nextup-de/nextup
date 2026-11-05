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
| Rules | `settings/rules` | Spend text, reward, measure days, and the company goals (title, KPI, target, period, keywords, unit). |
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

Each step uses the same actions as its own page. `/setup` opens the first step not done, a later step in the address
leads back to it, and *Next* opens once the step is done.

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

`setup/open` shows the go-live checks and a dialog repeating the runbook's hand list. *Open NextUp* runs the checks again
on the server (`canOpen`): every step and every needed check done, the same rule as the move to pilot, with no override.
It stores the time, writes `audit.company.opened`, then sends the held invitations. A mail that fails stays held, and the
page offers to send again. The stage does not move and nobody is signed out.
A case reaches a route's owner through the seat: a seat a leader is linked to puts the case in that leader's inbox,
and the raise page offers the seat by its name.

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
saved; after Open the leader's held invitation goes out, and a member's case about the rig reaches that leader.
