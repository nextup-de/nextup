---
id: IDN-A1
title: Cases on ids - reducer, desk by role, permissions and the server's raise stamp
wp: A
needs: [ IDN-G1, IDN-D1 ]
host: any
owns:
  - apps/app/src/features/cases/reducer.ts
  - apps/app/src/features/cases/selectors.ts
  - apps/app/src/features/cases/permissions.ts
  - apps/app/src/features/cases/stamp.ts
  - apps/app/src/features/cases/notice.ts
  - apps/app/src/server/actions/events.ts
  - apps/app/src/server/actions/admin.ts
  - apps/app/src/server/connections.ts
  - apps/app/src/i18n/messages/cases.ts
  - apps/app/tests/unit/cases.test.ts
  - apps/app/tests/unit/permissions.test.ts
  - apps/app/tests/unit/notice.test.ts
  - apps/app/tests/unit/integrations.test.ts
  - apps/app/tests/unit/idn/cases-ids.test.ts
  - apps/app/tests/unit/idn/permissions-ids.test.ts
  - apps/app/tests/unit/discussion.test.ts
  - apps/app/tests/unit/projects.test.ts
risk: normal
profile: orch
budget: { minutes: 120, window_pct: 20 }
uses: [ D1, D2, D3, D4, D5, D6, D8, D13, D15, D17, D18 ]
proofs:
  - id: B1
    says: the reducer puts each case on a seat and its role, moves it with a
      hand-over or override, escalates by role, and keeps user ids for raiser,
      deciders, co-signers and invitees; onDeskOf and inboxOf give a second
      holder of the owner role the case
    run: npm test -w @nextup/app -- tests/unit/idn/cases-ids.test.ts -t 'IDN cases
      on ids'
  - id: B2
    says: mayAppend decides desk, raiser and hand-over rights by user, seat and role
      ids, refuses a hand-over without a seat, and stampEvent sets the route
      owner's seat on a raise whatever the client sent
    run: npm test -w @nextup/app -- tests/unit/idn/permissions-ids.test.ts -t 'IDN
      permissions on ids'
status: proven
lane: pc/b
branch: orch/idn-a1
pr: 305
---

Plan IDN (sub-plan of PILOT): the case domain. After this task the reducer knows for every case which seat and role
it sits on and which user did what, the server decides who may act by those ids, and the raise carries the owner's
seat as `assigneeRoleHolderId`. Pages still call the old label selectors; they stay, deprecated (D18), until
IDN-P1 and IDN-S1 move the pages. Read first: `docs/IDENTITY.md`, `apps/app/src/features/auth/identity.ts`,
`apps/app/src/features/cases/events.ts`, `reducer.ts`, `selectors.ts`, `permissions.ts`, `notice.ts`,
`apps/app/src/server/actions/events.ts`, and the tests named in `owns`.

## What

- `apps/app/src/features/cases/reducer.ts` (D17): the fields of D6 for cases and ideas. Seat of a raise:
  `pl.assigneeRoleHolderId ?? routeOf(pl.routeId)?.ownerSeatId ?? null`; of a seed case: `row.assigneeRoleHolderId
  ?? routeOf(row.routeId)?.ownerSeatId ?? null`; `assigneeRoleId` from the seat's `roleId` in `seed.seats`.
  case.handed: `assigneeSeatId = pl.toRoleHolderId ?? null` (and its role); case.override: the chosen route's
  `ownerSeatId`. Escalation by role as D8 (replaces `route.owner.name === c.assignee`). Co-sign and uncosign by
  `actorUserId` (an event without one adds a co-signer with `userId: null` and never removes one). The call to
  `openOrJoin` passes `fromUserId: c.fromUserId`. Labels stay as they are (D2).
- `apps/app/src/features/cases/selectors.ts`: the new functions of D18 (`onDeskOf` exactly as D8); `affectedOn`
  entries gain `userId` and dedupe by `actorUserId` (an event without one is its own entry); `Comment` gains
  `byUserId`. The old `onDesk`, `inboxFor`, `mineFor`, `cosignedBy`, `actedBy`, `deskFor`, `clearedBy`,
  `deskHolders` stay with the `@deprecated` line of D18.
- `apps/app/src/features/cases/permissions.ts`: every "is this me / is it on my desk" uses the actor's `userId` and
  `me` (`onDeskOf(kase, actor.me)`; revise and answer: `kase.fromUserId !== null && kase.fromUserId ===
  actor.userId`); case.handed is refused with `cases.permHandSeat` unless `payload.toRoleHolderId` is a seat in
  `state.seats` (D13). `mayAppendProject` is called with the same actor (unchanged signature).
- `apps/app/src/features/cases/stamp.ts` (new): `stampEvent` as D13.
- `apps/app/src/server/actions/events.ts`: the stored payload is `stampEvent(type, payload, seed)`; the owner's
  notice gets users with `id`.
- `apps/app/src/features/cases/notice.ts`: `People` is `{ id: string; name: string; email: string }[]`; the owner
  is the seat `payload.assigneeRoleHolderId ?? route.ownerSeatId`, its user's email (no email when the seat has no
  user); the owner's label for the mail is the seat's label. Callers select `id`: `server/actions/events.ts`,
  `server/actions/admin.ts` (resend notice), `server/connections.ts`.
- `apps/app/src/i18n/messages/cases.ts`: `permHandSeat` in English and German (D13).
- Existing tests updated to the new rules and nothing else: `tests/unit/cases.test.ts`,
  `tests/unit/permissions.test.ts`, `tests/unit/notice.test.ts`, `tests/unit/integrations.test.ts`.
- Tests:
  - `apps/app/tests/unit/idn/cases-ids.test.ts`, `describe("IDN cases on ids", …)`, on `LOCAL_SEED`: a raise on r2
    sits on r2's `ownerSeatId` and role; a second seat of that role whose user is someone else gets the case from
    `inboxOf(state, meFor(thatUser, seats))`, and a user without a seat gets nothing; a hand-over with
    `toRoleHolderId` moves seat and role, without it the case is on no desk; an override moves it to the chosen
    route's owner seat; past the promise a case with the owner escalates to the deputy role and one handed to
    someone else escalates to the owner role; `fromUserId`, `decided.byUserId`, the co-signer's `userId` and
    `discussion.invitedUserIds` come from the events; two different users with the same `actor` label are two
    co-signers.
  - `apps/app/tests/unit/idn/permissions-ids.test.ts`, `describe("IDN permissions on ids", …)`: a leader holding the
    owner role may decide and hand over; the same name without the seat (`me = NOBODY`) may not; the raiser by
    `userId` may answer and revise, another user with the raiser's label may not; a hand-over to an unknown seat is
    refused with the `cases.permHandSeat` text; `stampEvent("case.raised", { routeId: "r2", assigneeRoleHolderId:
    "forged" }, LOCAL_SEED)` gives r2's owner seat, and with an unknown route null.

## Not

- No page, no `features/cases/{rows,discussion,thread,feed}.ts` (IDN-P1), no project logic (IDN-B1). The old label
  selectors are not deleted (IDN-S1).
- No change to `app/api/[company]/events` (D13) or `features/cases/visibility.ts` (D14).
- No `.prisma` file (D3). No new comparison of display names (D2).

## Done when

Both proofs are green and lint, typecheck, test, build stay green; the demo e2e suite still passes (the pages still
use the deprecated selectors).

Commit everything; an unfinished state as `wip(idn-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
