# The console (/admin)

A console admin (`isStackAdmin`) finds the console under "IT console" in their account menu; it has its own sign-in.

`/admin` is the company's own IT and privacy console. It is for the customer's IT and data-protection
people, not for NextUp staff. It exists only in a one-company stack (`TENANT_MODE=single` with
`COMPANY_SLUG` set); with `TENANT_MODE=multi` every `/admin` path answers 404.

The managers' business setup is a different place: `/<company>/settings` (company, rules, calendar,
org, routing, members, goals, notifications, setup). The console holds what IT and privacy own.

## The seven sections

The list is `CONSOLE_SECTIONS` in `apps/app/src/features/admin/nav.ts`, in this order:

1. **Overview** (`/admin`): who can get in, what is switched on, whether support access is open.
2. **Access** (`/admin/people`): people, console admins, authenticator reset.
3. **Connectors** (`/admin/connectors`): Jira Cloud and Data Center, Microsoft 365, the AI provider, directory status. Connectors exist only here.
4. **Assistant and data protection** (`/admin/assistant`): what the assistant may read.
5. **Company data** (`/admin/company-data`): what is stored, and exports.
6. **Routing review** (`/admin/decisions`): the log of routing decisions.
7. **Support access** (`/admin/support`): open or revoke a code for NextUp support; the last 20 sign-ins (time only).

## Who can enter

Every page and every action calls `consoleCompany()` (`src/server/console-guard.ts`) first. A page
without a result answers 404, an action returns `{ ok: false, code: 'not-allowed' }`. A write names the
company id from the guard, never from a form.

- **Microsoft sign-in** with the `NextUp.Admin` app role (`via: 'entra'`).
- **Stack admin**: a person with `isStackAdmin` signs in on `/admin/login` with the personal login code and an authenticator code (`via: 'stack-admin'`).
- **Break-glass**: the shared `ADMIN_ACCESS_CODE`. Each use is logged and the console shows a banner (`via: 'break-glass'`).
- **Support session**: see below (`via: 'support'`).

A manager who is no console admin is sent to `/admin/login`.

## Support access

A console admin who came in via Microsoft or as stack admin opens support access on `/admin/support`.
It makes one code of 12 characters (`A-H J-N P-Z 2-9`), shown once and stored only as an scrypt hash,
valid 24 hours or until revoked, at most one open per company. NextUp support enters it in the
"Support code" field on `/admin/login`.

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
in places. The ITC plan wins: seven sections, connectors only in the console (not in `/settings`), no
platform pages, and the support session of this document.

## Proof

`apps/app/tests/e2e/db/itc-console.spec.ts` ("ITC acceptance") covers the nav, the 404 platform paths,
the refused manager, and the support code, banner, read-only Connectors page and revoke.
