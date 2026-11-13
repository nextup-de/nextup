# The console (/admin)

A console admin (`isStackAdmin`) finds the console under "IT console" in their account menu; it has its own sign-in.

`/admin` is the company's own IT and privacy console. It is for the customer's IT and data-protection
people, not for NextUp staff. It exists only in a one-company stack (`TENANT_MODE=single` with
`COMPANY_SLUG` set); with `TENANT_MODE=multi` every `/admin` path answers 404.

The managers' business setup is a different place: `/<company>/settings`, 19 sections (docs/SETTINGS.md): Go-live, Company, Rules, Approvals,
Calendar, Org, Routing, Members, Import and export, Notifications, Sign-in, Support access, Microsoft Teams, Areas, Data and privacy, Audit log,
Pilot report, and Webhooks and API tokens out of the menu. The console holds what IT and privacy own.

## The sections

The list is `CONSOLE_SECTIONS` in `apps/app/src/features/admin/nav.ts`, in this order:

1. **Overview** (`/admin`): who can get in, what is switched on, whether support access is open.
2. **Setup** (`/admin/setup`): the setup phases, read-only, and the hand-over (below).
3. **Access** (`/admin/people`): people, console admins, authenticator reset, and the company's Microsoft tenant id (Settings → Sign-in only shows it).
4. **Connectors** (`/admin/connectors`): Jira Cloud and Data Center, Microsoft 365, the AI provider, directory status. These connectors are set only here. Microsoft Teams and the OIDC, SAML and SCIM cards are not: they live in the company's Settings (Microsoft Teams, Sign-in).
5. **Assistant and data protection** (`/admin/assistant`): what the assistant may read.
6. **Company data** (`/admin/company-data`): what is stored, and exports.
7. **Routing review** (`/admin/decisions`): the log of routing decisions.
8. **Support access** (`/admin/support`): open or revoke a code for NextUp support, valid 24 hours; the last 20 sign-ins (time only). A company admin can also grant access in Settings (below).

### The AI provider on Connectors

Five choices: Amazon Bedrock, Azure OpenAI, OpenAI-compatible, **Model on this stack**, and Off. The first three
send redacted text to a provider and need the data-processing agreement's date on Assistant before any model is
called for real people. **Model on this stack** (`local`, Q8.4) needs no endpoint, no key and no agreement: every
model call (routing, reading and coaching, plans and check-ins, the assistant, the context draft) goes to this
stack's brain service and its model, and the card says "Model on this stack · nothing leaves the server". Values
typed for another choice are dropped when it is saved. While the stack has no brain service (installed without
`--brain`) the card says so and shows "Needs you"; while the brain does not answer or its model is not loaded yet it
shows "Error". In both cases no model is called and raise and routing work by keywords. The monthly budget on
Assistant counts these calls too: give the stack's model a price (0 is allowed) or it is held to the token limit.
Setup: docs/ops/AI_PROVIDER.md, "Model on this stack".

## Setup and "We do not use this"

`/admin/setup` shows the company's setup overview read-only (docs/SETTINGS.md, The overview), also to a support
session. The IT phases 2 and 3 list Microsoft sign-in, the directory sync, Microsoft 365 search, Teams, Jira and the AI
provider. A system the company decided against reads "not used, decided <date>" with its reason. That decision is made
on the company's own `/setup` page, by a stack admin signed in to the app, never in the console: **We do not use this**
with a one-line reason writes `audit.connector.declined`, **Use it after all** writes `audit.connector.reopened`. Neither
blocks or opens anything, and both show in the audit log. A system switched on in Connectors shows as on again.

## Who can enter

Every page and every action calls `consoleCompany()` (`src/server/console-guard.ts`) first. A page
without a result answers 404, an action returns `{ ok: false, code: 'not-allowed' }`. A write names the
company id from the guard, never from a form.

- **Microsoft sign-in** with the `NextUp.Admin` app role (`via: 'entra'`). Each sign-in writes `audit.access.console_signin`
  (actor `console`, no name: the address stays in the server log).
- **Stack admin**: a person with `isStackAdmin` signs in on `/admin/login` with the personal login code and an authenticator code (`via: 'stack-admin'`).
- **Break-glass**: on a real stage a window the host's operator opens with `stack/break-glass.sh <slug> open`; on a demo
  stage the shared `ADMIN_ACCESS_CODE`. Each use writes `audit.access.break_glass` and the console shows a banner
  (`via: 'break-glass'`). `stack/install.sh` prints the shared code on a demo stage only.
- **Support session**: see below (`via: 'support'`).

A manager who is no console admin is sent to `/admin/login`.

## First access and the hand-over

A real stack's company is created by the stack at its first start (`apps/app/src/lib/db/bootstrap-company.ts`, run by the
migrate service): empty, sandbox, closed, no people. The app cannot create a company, and the console cannot create a
person.

- **Tenant at install.** `stack/install.sh --entra-tenant-id` writes `ENTRA_TENANT_ID` to the stack's `.env`; the first
  start copies it into the company once, with `audit.access.entra_tenant` and `audit.company.created` rows whose actor and
  source are `install`. Later starts copy it only while the company has no tenant and the console never set or removed
  one (no `audit.access.entra_tenant` row), so a value from **Access** is never overwritten.
- **The first people.** With Microsoft, the Entra roles create them: `NextUp.Admin` opens the console, and a
  `NextUp.Manager` is created as a manager at the first sign-in even while the company is closed
  (`features/pilot/open.ts`, `createMicrosoftUser`). Without Microsoft, the bootstrap (`docs/pilot/RUNBOOK.md`, section 4).
- **The hand-over.** On `/admin/setup`, once the server phase is done, a console admin who came in via Microsoft or as
  stack admin presses **Confirm the hand-over** (`confirmHandOverAction`, `server/actions/setup-handover.ts`). It writes
  one `audit.setup.handed_over` row (actor `console`, `changes.by` = `entra` or `stack-admin`); a second press answers with
  the first. The page and the server phase then say "Handed over on <date> by <role>". Break-glass and support see the
  card without a button.

## Support access

There are two places to grant NextUp's team access, and they differ in how long it lasts.

- **The console** (`/admin/support`). A console admin who came in via Microsoft or as stack admin opens it. It makes one code of 12
  characters (`A-H J-N P-Z 2-9`), shown once and stored only as an scrypt hash, valid 24 hours (`SUPPORT_GRANT_HOURS`) or until revoked, at
  most one open per company. NextUp support enters it in the "Support code" field on `/admin/login`.
- **Settings** (`/<company>/settings/support-access`). A company admin chooses 1, 4, 24 or 72 hours (4 is shown first) and may extend the open grant,
  never past 72 hours from now. The page also shows the grant's log and the break-glass window (`features/admin/support-code.ts`,
  `lib/db/support-grants.ts`).

The session is read-only: every console write returns `support-read-only`, and the console shows the
banner "NextUp support until <time>". Each sign-in logs `[admin] support <ISO time>` without personal
data. Revoking (or opening a new code) ends the session on the next page.

## What NextUp can and cannot see

NextUp developers do not see customer data. The app has no platform function: company creation,
stage moves, deleting companies, API tokens, pilot requests, tickets, connections/health and
cross-company decision logs are not in the app. `/admin/companies`, `/admin/requests`,
`/admin/tickets` and `/admin/connections` answer 404.

- Keys, tokens and codes are never sent back to the browser after saving, except the support code once at creation.
- Without an open support grant NextUp has no way into the console.
- With one, support reads, and cannot change anything. What the console shows is the company's own configuration; see docs/SECURITY.md for what the stack stores and what the AI provider receives.

## How admin.sellux.ch reaches a stack

`admin.sellux.ch` is NextUp's own platform tool. It never reads a stack's database. A stack is reached
only through what the stack itself pulls or pushes: flags, health, errors, demo logins and platform
jobs. The stack opens every connection (pulls only). Health, errors, tickets and pilot requests live
there (docs/plans/2026-09-27_platform.md).

## Where it differs from the page specs

The page specs in the Nextup repo (`docs/plans/2026-11-02_pilot-pages*`) describe `/admin` differently
in places. The ITC plan wins: these sections, connectors only in the console (not in `/settings`), no
platform pages, and the support session of this document.

## Proof

`apps/app/tests/e2e/db/itc-console.spec.ts` ("ITC acceptance") covers the nav, the 404 platform paths,
the refused manager, and the support code, banner, read-only Connectors page and revoke.
