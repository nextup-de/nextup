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

Anonymous handles for members (`features/auth/handle.ts`, `newHandle`, `needsHandle`) are given when a member is created; an existing handle never changes.
