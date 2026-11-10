# Identity by id

Plan IDN. People are identified by id, never by display name.

## Seats and roles

- A **role** is an `OrgRole` row (`roleId`). A **seat** is one `OrgRoleHolder` row (`seatId`): a role can have several seats, and a seat may be held by a user (`userId`) or by nobody yet.
- `Seed.seats: SeatRow[]` (`features/auth/identity.ts`) is one entry per seat: `{ id, roleId, label, userId, sort }`. It comes **only from the tables**, through `structureSeed()` in `features/knowledge`. A `seats` stored in `Company.seedJson` is ignored by `parseSeed()`, and `contentOnly()` sets it to `[]`.
- `label` is the holder's name. It is for display. Routes carry `ownerRoleId`, `ownerSeatId`, `deputyRoleId`, `deputySeatId` (the rule's roles and the first holder by sort of each).

## Me

`Me = { userId, seatIds, roleIds }` says who a signed-in person is: their user id, the seats they hold and the roles those seats belong to. `meFor(userId, seats)` builds it, `NOBODY` is the empty one. `holdsRole(me, roleId)` is the question "am I in this role". `DemoProvider` exposes `me` and `actorUserId`; the server action builds the same from the session.

## Events

`CaseEvent.actorUserId` is the person behind `actor` (null for system actors such as `system:n8n` and for history nobody is bound to). It is stored in the `CaseEvent.actorUserId` column. Payloads gain id fields next to the label fields: `assigneeRoleHolderId`, `toRoleHolderId`, `invitedUserIds`, `leadUserId`, `userId` (project.member), `toUserId`, `ownerUserId`.

## Labels are for display only (D2)

`actor`, `assignee`, `to`, `lead`, `owner`, the reduced `from`, `by`, `members` strings stay in events and state so a page can show them. Nothing decides who someone is by comparing them.

## Status

IDN-G1 only adds the types, the ids and the data flow; **nothing reads the new ids yet**. The readers switch in later tasks (permissions, selectors, projects, structure). The desk rule (a case is on the desk of a seat, matched by seat id and role id) applies from IDN-A1 on.

Anonymous handles for members (`features/auth/handle.ts`, `newHandle`, `needsHandle`) are given when a member is created; an existing handle never changes. A member may post a single idea by name instead (decision Q1.7, `features/ideas/posting.ts`); their own later events on that case carry the same label, so the handle is never shown next to the name.

## Backfill

Companies stored before IDN have events whose `actor` and payload name people, and seats without users. `backfillIdentity()` (`src/lib/db/identity-backfill.ts`) rewrites them once (PILOT/HQ5), for every company:

1. `bindDemoCompany`: seats with no user get the user whose name or handle equals the seat label; the stored seed is bound to seat and user ids.
2. Its events, by `seq`: `actorUserId` where it is null and `userByLabel(actor)` finds one user, and the payload ids (`assigneeRoleHolderId`, `toRoleHolderId`, `invitedUserIds`, `leadUserId`, `userId`, `toUserId`, `ownerUserId`) where absent and the label finds a user or seat.

It never touches a label (`actor`, `assignee`, `to`, `lead`, `name`, `owner`), a `type`, `day`, `seq` or `targetId`, a system actor (`system:` prefix), an id that is already set, or a label that finds nothing (including one that names several users). It uses only `userByLabel` and `seatByLabel` (D9). A second run writes nothing and prints `<slug>: left as it is`.

Command, in `apps/app`: `npx tsx prisma/identity-backfill.ts`. Kevin runs it once per stack after the IDN release and after `stack/backup.sh` (Q1); it is safe to repeat.

## IDN gaps

The register rows of phase IDN (`docs/audit/gaps/product.md`, D16) and the task that answers each.

| Gap | What | Answered by |
|---|---|---|
| G-003 | The inbox matched people by display name, so a just-in-time user never matched a route owner. | IDN-A1 (desk by seat and role, D8), IDN-S1 (shell and search on ids), IDN-C1 and IDN-Z1 (a JIT leader holding the role gets its cases: `tests/e2e/db/identity.spec.ts`). |
| G-004 | The event actor was a display name or handle and permissions and the thread compared those strings. | IDN-G1 (`actorUserId` on events), IDN-B1 (permissions and the thread compare user ids). |
| G-005 | Route owners and deputies were names in the seed. | IDN-D1 (`ownerRoleId`, `ownerSeatId`, `deputyRoleId`, `deputySeatId` from the tables), IDN-M1 (backfill of stored seeds and events). |
| G-046 | JIT members and members a manager adds had no handle. | IDN-C1 (`createMicrosoftUser` gives a handle to a member, and a seat to a leader or manager, D12). |

## Name lookups left

Not moved to ids in IDN (D14): they show org data, they do not decide who someone is. Found with a grep over
`apps/app/src` for comparisons of `.name`, `.from`, `.assignee`, `.lead`, `.by` outside `features/cases` and
`features/projects`. Hits that are not people (`err.name`, Jira and connector `name` fields, `cookie.ts`, the
`features/demo/identity.ts` binding used by the backfill, D9) are left out.

| File | Phase |
|---|---|
| `features/cases/visibility.ts` custom `seenBy` lists | VIS |
| `features/ideas/brief.ts`, `receivers.ts`, `finalize.ts`, `company-read.ts` | LOOP |
| `components/ideas/Raise.tsx`, `RaiseMenu.tsx`, `RaisePublish.tsx` | LOOP |
| `features/evaluate/index.ts` | MET |
| `features/metrics/index.ts`, `overview.ts` | MET |
| `features/org/index.ts` | MET |
| `features/knowledge/index.ts` (`deptKeyByName`) | MET |
| `server/brain.ts` (`roleOf`) | MET |
| `components/dashboard/**` (`derive.ts`, `DemoProvider.tsx`, `leader/*`, `shared/*`, `team/*`) | MET |
| `app/[company]/(app)/people/[name]/page.tsx`, `app/demo/(app)/people/[name]/page.tsx` | ADM |
| `components/profile/ProfileView.tsx` | ADM |
| `components/shell/LoopSheets.tsx`, `SimpleShell.tsx`, `TopBar.tsx` (role beside a name; "am I the author" for the handle) | open: D14 names no phase |
| comment in `apps/app/prisma/schema/auth.prisma` | DIR |

# Enterprise identity (plan EID)

> **Updated 2026-11-04.** OIDC, SAML, SCIM and the audit log export. Customer-facing setup: [customer/SSO_SETUP.md](customer/SSO_SETUP.md).
> All four are **off for every company until an admin switches them on** on the Sign-in page; with them off, the code and
> Microsoft sign-in and the core loop are unchanged, no button shows, SCIM answers 403 and the exporter does not run.

## Sign-in and linking

- **OIDC** (`/<company>/login/oidc`, callback `…/login/oidc/callback`): code flow with PKCE, state and nonce in a flow cookie,
  ID token checked for signature, issuer, audience, nonce and expiry; RS256 only.
- **SAML 2.0** (start `…/login/saml`, ACS `…/login/saml/acs`, SP metadata `…/login/saml/metadata`; node-saml): the assertion must
  be signed; audience, issuer, `InResponseTo` and `NotOnOrAfter` are checked; request ids and assertion ids are single-use
  (`SsoReplay`); an encrypted assertion is refused. `RelayState` is a signed token, not a cookie.
- **Linking.** A sign-in finds the person through an `ExternalIdentity` row (company, provider, issuer, subject). Only without
  one does it match, once, exactly one active user of that company by email (case-insensitive) with no link of that provider,
  and writes the link. Display names are never compared. No match, several or an inactive user → refused with an
  `sso_error` code on the login page. OIDC and SAML never create an account and never change a role. `lastSeenAt` updates on every sign-in.
- An admin's `?test=1` run stores its result on the card and links and signs in nobody.

## SCIM

Base `/api/scim/<company>/v2` (route files under `src/app/api/scim/[company]/v2/`; `api/` bypasses the proxy, so each handler
checks itself). Bearer token with scope `scim` for that company, rate limited, and the `scim` Integration row must be on.
Writes go through `applyDirectoryDelta(companyId, 'scim', …)`. DELETE and `active: false` deactivate. Only these attributes
are stored: userName, externalId, name parts, displayName, work email, active, title, and from the enterprise extension
department, manager (a SCIM id mapped to the manager's link subject) and employeeNumber (kept as the personnel number, never
returned, shown, logged or sent to the AI). Everything else is dropped.

## Log export

Only `AuditEvent` rows go out, as `LogRecord` (`id`, `companyId`, `at`, `type` = `audit.*`, `actorUserId`, `target`, `data`).
Syslog RFC 5424 (`<110>1 …`, UDP, TCP or TLS with octet counting) or `audit-<YYYY-MM-DD>.jsonl` under `LOG_EXPORT_DIR`. The
scheduler runs every 60 s per company with the `logsink` row on: 120 s lease on `AuditExportRun`, up to 500 rows after the cursor
(`at`, `id`), cursor moved after the write (at least once). Switching on starts the cursor at now. A failure keeps the cursor
and stores `lastError`. The test record (`audit.test`) moves no cursor.

## Tables

| Table | Holds |
|---|---|
| `Integration` (systems `oidc`, `saml`, `scim`, `logsink`) | settings JSON, `on`, sealed secret (OIDC client secret), `account.lastTest`, `lastOkAt`, `lastError` |
| `ExternalIdentity` | `companyId, userId, provider (oidc, saml, scim), issuer, subject, createdAt, lastSeenAt`; unique per company, provider, issuer, subject |
| `SsoReplay` | `key, companyId, expiresAt`: SAML request ids and assertion ids, OIDC state; swept when expired |
| `AuditExportRun` | per company: cursor (`cursorAt`, `cursorId`), lease, last run, last ok, last error, sent today |
| `ApiToken` | the SCIM token (scope `scim`, no expiry), replaced from the Sign-in page |

## Fakes for tests

`tests/fixtures/oidc/fake-issuer.ts` (local issuer with a switch per attack), `tests/fixtures/saml/idp.ts` (test IdP with key and
certificate made at test time, attacks as options), `tests/fixtures/syslog/receiver.ts` (UDP, TCP and TLS listeners). The
acceptance over all of them is `tests/db/enterprise-identity.test.ts` ("EID acceptance"): SCIM-provisioned person signs in through
OIDC and SAML to the same user id, a SCIM deactivation refuses the next sign-in, the audit rows reach the receiver in order, and
with everything off the code sign-in works and SCIM answers 403.

## Claims

Public claims about SSO, SCIM and SIEM export, judged by what runs on main for a non-demo company (a demo company cannot use
OIDC, SAML or SCIM).

| Claim | Where | Status |
|---|---|---|
| Sign in with Microsoft Entra (OIDC, tenant checked) | customer/SECURITY_GUIDE.md, ENTRA_SETUP.md | holds (before EID) |
| Generic OIDC (Okta, Keycloak, others) | customer/SSO_SETUP.md | holds since EID |
| SAML 2.0 with signature, audience, request and replay checks | customer/SECURITY_GUIDE.md, SSO_SETUP.md | holds since EID |
| SCIM provisioning and deactivation, with a fixed attribute list | customer/SECURITY_GUIDE.md, SSO_SETUP.md | holds since EID |
| Audit log export to syslog (UDP, TCP, TLS) or JSON file | SSO_SETUP.md, gap-register G-220 | holds since EID |
| SCIM groups, bulk, SAML single logout, SAML signing or encryption, SCIM role mapping | none, deliberately not offered | still planned (not built) |
| Named admin users via SSO plus 2FA | SECURITY.md item 3 | still planned (SSO sign-in exists; the admin area itself still opens through Entra, a stack admin or break-glass, not through OIDC or SAML) |
| Public pricing and security pages (nextup-landing) | not in this checkout | not reviewed here; they must claim only the "holds" rows. EID does not change the landing repo. |
