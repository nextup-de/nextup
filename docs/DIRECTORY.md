# Directory sync

NextUp reads the company's people from Microsoft Entra (Graph) and keeps its own users in step with it. It is read-only:
NextUp never writes to the directory. Plan: `docs/plans/2026-11-02_pilot-pages/build-plans/DIR/PLAN.md`.

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

## DIR gaps

| Gap | Question | Answered by |
|---|---|---|
| G-015 | A user created just-in-time had no department, handle or role holder | DIR-A1 (department, handle, source key on every synced user); seats stay with the sign-in (IDN) |
| G-016 | No directory sync: people, managers, deputies and leavers never reached NextUp | DIR-B1 (Graph adapter), DIR-C1 (sync loop and `/admin`), DIR-D1 (manager-chain deputy) |
| G-017 | No deactivate or delete action for users | DIR-D1 (Members actions), DIR-G1 (inactive users cannot sign in) |

Open: groups from Entra are carried in the page but not stored (ADM maps groups to units); only the Graph source has an
adapter.
