# Directory sync

NextUp reads the company's people from Microsoft Entra (Graph) or from SAP SuccessFactors and keeps its own users in step
with it. It is read-only: NextUp never writes to the directory. Plan: `docs/plans/2026-11-02_pilot-pages/build-plans/DIR/PLAN.md`.

## What the sync does

Every company with the sync switched on (`DirectoryRun.on`, set in `/admin`) and an `entraTenantId` is read by the loop in
`apps/app/src/server/directory/sync.ts`:

1. It takes the company's lease (one runner per company, also across processes; a dead round loses it after 10 minutes).
2. The Graph adapter (`server/directory/graph.ts`) reads `users/delta` page by page with an app-only token, from the stored
   cursor (the first round is a full read). At most 50 pages a round.
3. Each page is applied by `applyDirectoryDelta` (`lib/db/directory.ts`, planned by the pure `planDirectoryDelta`):
   - **New user:** created as `member` with a handle, the work email, department, job title, manager and employeeId. No seat
     is created; seats come from the Microsoft sign-in or an admin.
   - **Mover:** a changed department moves the user to the matching unit. Role and seats are never changed by the sync.
   - **Manager:** resolved after all entries of the page (manager's object id, else none).
   - **Leaver:** see below.
4. The new cursor (the Graph `deltaLink`) is stored only after the last page. Counts and `lastOkAt` are recorded, or
   `lastError` (cut to 500 characters) with the old cursor kept. `/admin` shows the counts.

Applying the same page twice changes nothing.

## Fields (D5)

Object id, employeeId (the personnel number, when HR feeds Entra), display name, work email, department, job title,
manager, account enabled. Nothing else is requested or stored. The employeeId is never shown in the UI, never logged and
never sent to the AI. People are matched by id only (`User.entraOid`, else the same email in lower case); display names are
never compared.

## Scope (Q1)

Everyone whose department names one of the company's org units (name or key, case-insensitive). A department that matches
nothing is skipped; an admin adds the unit first.

## SuccessFactors source (plan SFX)

A company can choose SAP SuccessFactors as its source (`DirectoryRun.source = successfactors`, set in the console under
Connectors → Directory). It needs no Entra app. Its access (API server, company id, API key, API user, sealed private
key) is one `Integration` row with system `successfactors`; setup for the customer is
`docs/customer/SUCCESSFACTORS_SETUP.md`.

- **Adapter:** `server/directory/successfactors/` reads OData v2 with an OAuth SAML bearer token and maps the rows
  (pure mapping in `features/directory/successfactors.ts`) to the same `DirectoryPage` the Graph adapter returns, so
  `applyDirectoryDelta` is shared. One entry per employment; `removedExternalIds` is always empty (leavers come as
  `active: false` from the end date).
- **Fields (D3):** `User` (userId, firstName, lastName, email), `EmpEmployment` (personIdExternal, userId, startDate,
  endDate), `EmpJob` (userId, startDate, department, jobTitle, managerId), `FODepartment` (externalCode, name, parent,
  status), each with `lastModifiedDateTime`, always with `$select` and `$format=json`. Only GET, plus the POST to
  `/oauth/token`. The personnel number is stored as `User.employeeId` and is never shown, logged or sent to the AI.
- **Daily full read, changes in between:** the first run of each UTC day reads all four entities in full (this applies a
  move or an end date that takes effect on a day without an edit); later runs read rows changed since the stored
  watermark (minus five minutes) and the full rows of those people. Effective-dated entities are asked with
  `asOfDate=<today>`. The stored cursor is JSON `{ v, watermark, fullDay }`, kept only after a finished round.
- **Email match (D8):** an entry whose personnel number matches no user is matched, once, to exactly one active user of
  the company with the same email (case-insensitive) and no `employeeId`; that user gets the number and is updated like
  a matched user. Several matches, or a user who already has another personnel number: skipped as `email-taken`. Graph
  matching is unchanged.
- **Units:** the department name (`FODepartment.name`) is matched to a unit by name or key like any other department;
  SFX creates no units.
- **Interval:** the same loop and interval as Graph. A company without the `successfactors` row on, or with the
  directory off, behaves exactly as before and the core loop never waits on SAP.

## Interval (Q2)

Every 15 minutes (`DIRECTORY_INTERVAL_MS`, default 900000), delta only after the first full round. The loop is a no-op
without a database or without `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET`.

## Leavers

A user who is disabled in Entra (`accountEnabled: false`) or removed from the directory becomes inactive
(`deactivatedAt` set) and cannot sign in. Every seat of theirs is vacated (`userId: null`). Each open case on such a seat is
handed by `system:directory` to the first other seat of the same role with an active user (`case.handed`, why `leaver`,
idempotent through its key). With no other holder the case stays with the role. A leaver who returns is reactivated, without
seats.

## Deputy from the manager chain

A route without a deputy role gets as deputy the first seat of the owner's manager (`Knowledge.managers`, filled from the
active users with a manager). A route with a deputy role keeps it.

## Acceptance

`apps/app/tests/db/directory.test.ts` runs the loop on the Graph adapter with an injected `fetch` serving
`apps/app/tests/fixtures/graph-directory/`: a full round, the delta round, then the same delta again.

`apps/app/tests/db/directory-successfactors.test.ts` does the same for SuccessFactors with a fake SuccessFactors serving
`apps/app/tests/fixtures/successfactors/` (it also verifies the signed assertion): credentials saved through the console
action, a full read, a delta later the same day, a full read on the next day (the future-dated move and the end date take
effect), the allow-list of requested fields, and the source off with sign-in and a raise unchanged.

## DIR gaps

| Gap | Question | Answered by |
|---|---|---|
| G-015 | A user created just-in-time had no department, handle or role holder | DIR-A1 (department, handle, source key on every synced user); seats stay with the sign-in (IDN) |
| G-016 | No directory sync: people, managers, deputies and leavers never reached NextUp | DIR-B1 (Graph adapter), DIR-C1 (sync loop and `/admin`), DIR-D1 (manager-chain deputy) |
| G-017 | No deactivate or delete action for users | DIR-D1 (Members actions), DIR-G1 (inactive users cannot sign in) |

Open: groups (Entra groups, SuccessFactors departments) are carried in the page but not stored (ADM maps groups to
units); SAP HCM on premise has no connector and is supported only through Entra; the first SuccessFactors run on a live
customer tenant is still to be done.
