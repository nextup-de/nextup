---
id: IDN-G1
title: Identity types, seats from the tables and ids on events, with no change
  in behaviour
wp: G
needs: [ STR-Z1, LNG-F1, LNG-D1 ]
host: any
owns:
  - apps/app/src/features/auth/identity.ts
  - apps/app/src/features/auth/handle.ts
  - apps/app/src/features/cases/events.ts
  - apps/app/src/features/cases/persist.ts
  - apps/app/src/features/cases/permissions.ts
  - apps/app/src/features/cases/reducer.ts
  - apps/app/src/features/projects/types.ts
  - apps/app/src/features/projects/reduce.ts
  - apps/app/src/features/demo/types.ts
  - apps/app/src/features/demo/seed.ts
  - apps/app/src/features/demo/static-demo.ts
  - apps/app/src/features/demo/index.ts
  - apps/app/src/features/demo/parse.ts
  - apps/app/src/features/demo/content.ts
  - apps/app/src/features/knowledge/index.ts
  - apps/app/src/lib/db/events.ts
  - apps/app/src/lib/db/holders.ts
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/src/server/actions/events.ts
  - docs/IDENTITY.md
  - apps/app/tests/unit/idn/identity.test.ts
  - apps/app/tests/unit/idn/seats.test.ts
  - apps/app/tests/db/idn-holders.test.ts
  - apps/app/tests/unit/*.test.ts
  - apps/app/tests/unit/str/*.test.ts
risk: normal
profile: orch
budget: { minutes: 120, window_pct: 20 }
uses: [ D1, D2, D3, D4, D5, D7, D11, D15, D17 ]
proofs:
  - id: B1
    says: meFor, meOfSeat, holderOf, usersOfRole, seatsOfRole, holdsRole and
      actorLabel answer by ids only, and newHandle gives an unused Anonymous
      handle
    run: npm test -w @nextup/app -- tests/unit/idn/identity.test.ts -t 'IDN identity
      helpers'
  - id: B2
    says: structureSeed fills seats and the routes' owner and deputy seat and role
      ids from the holder rows, parseSeed and contentOnly never keep stored
      seats, and actorUserId survives logFromRows and appendEvent
    run: npm test -w @nextup/app -- tests/unit/idn/seats.test.ts -t 'IDN seats in
      the seed'
  - id: B3
    says: loadSeats, loadHolderOf and loadUsersOfRole answer for the company asked
      only, and loadLog returns each event's actorUserId
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/idn-holders.test.ts -t 'IDN holder helpers'
status: merged
lane: pc/a
branch: orch/idn-g1
retries: 1
last_failure: "Die CI auf PR #300 ist rot (db-tests · vitest against Postgres).
  Hol zuerst main herein (git merge origin/main), lies die rote Ausgabe der CI
  (gh pr checks 300 --repo nextup-de/nextup, dann gh run view <run>
  --log-failed) und mach genau diese Prüfungen grün, ohne Tests abzuschwächen.
  Der PR bleibt derselbe."
pr: 300
merge: "f172baf"
---

Plan IDN (sub-plan of PILOT): the scaffold. After this task the ids exist everywhere they will be needed, but
nothing reads them yet, so no page and no permission behaves differently. The later tasks of IDN switch the
readers. Read first: `docs/COMPANY_KNOWLEDGE.md`, `docs/adr/0001-canonical-model.md`,
`apps/app/src/features/cases/events.ts`, `persist.ts`, `permissions.ts`, `reducer.ts`,
`apps/app/src/features/knowledge/index.ts` (`seedParts`, `structureSeed`), `apps/app/src/features/demo/types.ts`,
`parse.ts`, `content.ts`, `apps/app/src/lib/db/events.ts`, `lib/db/knowledge.ts`,
`apps/app/src/server/actions/events.ts`, and `components/dashboard/DemoProvider.tsx` around `persona`, `actor` and
`emit`.

## What

- `apps/app/src/features/auth/identity.ts` (new, pure): exactly the types and functions of D4 (`SeatRow`, `Me`,
  `NOBODY`, `meFor`, `meOfSeat`, `holderOf`, `usersOfRole`, `seatsOfRole`, `holdsRole`, `Actor`, `actorLabel`),
  each with a one-line doc comment.
- `apps/app/src/features/auth/handle.ts` (new, pure): `HANDLE_PREFIX = "Anonymous #"`, `newHandle(taken, random)`
  and `needsHandle(role) = role === "member"` as D11.
- `apps/app/src/features/cases/events.ts`: the fields of D5 on `CaseEvent`, `NewEvent`, `SeedEvent` and
  `EventPayload`, with the per-type comments at the top updated; `appendEvent` copies `actorUserId` (null when the
  caller gives none).
- `apps/app/src/features/cases/persist.ts`: `EventRow.actorUserId?: string | null`; `toEvent` copies it (null when
  absent).
- `apps/app/src/lib/db/events.ts`: `SELECT` includes `actorUserId`.
- `apps/app/src/features/cases/permissions.ts`: the local `Actor` type is replaced by `export type { Actor } from
  "@/features/auth/identity"` (the extra fields `userId` and `me` are not read yet). Nothing else.
- `apps/app/src/features/demo/types.ts` and `apps/app/src/features/projects/types.ts`: the seed fields of D7.
  Every `Seed` literal gets `seats: []`: `SEED` (`features/demo/seed.ts`), `STATIC_DEMO_SEED`
  (`features/demo/static-demo.ts`), `EMPTY_SEED` (`features/demo/index.ts`), and any test fixture that builds a
  full `Seed` literal (only that one line in each such test).
- `apps/app/src/features/demo/parse.ts`: a stored `seats` is ignored, the result has `seats: []` (D7).
  `apps/app/src/features/demo/content.ts`: `contentOnly` also sets `seats: []`.
- `apps/app/src/features/knowledge/index.ts`: `seedParts` fills each route's `ownerRoleId`, `ownerSeatId`,
  `deputyRoleId`, `deputySeatId` (the rule's role id, and the id of that role's first holder by sort; null when
  absent); `structureSeed` fills `seats` from `k.holders` by sort as `SeatRow` (`label` = holder `name`), [] for a
  company without rows. The header comment names `seats`.
- `apps/app/src/features/cases/reducer.ts` (D17): `ReduceSeed.seats?: SeatRow[]`, `State.seats` (the seed's seats
  or []), and `finishProjects` gets `seats` in its context. `apps/app/src/features/projects/reduce.ts`: the type
  `Source` gains `fromUserId?: string | null` and the type `Finish` gains `seats?: readonly SeatRow[]`; nothing
  reads them yet.
- `apps/app/src/lib/db/holders.ts` (new): `loadSeats`, `loadHolderOf`, `loadUsersOfRole` as D4.
- `apps/app/src/server/actions/events.ts`: builds `const seed = await seedFor(slug)` once and an `Actor` `{ role,
  userId: viewer.userId, me: meFor(viewer.userId, seed.seats), name: viewer.name, handle: viewer.handle }` for
  `mayAppend`; the stored actor label is `actorLabel(viewer)` (the same rule as today); `notifyLoop` gets
  `actorUserId: viewer.userId` in its event object.
- `apps/app/src/components/dashboard/DemoProvider.tsx`: the context gains `me: Me` (server mode `meFor(viewer.userId,
  seed.seats)`, local mode `meFor(persona.who.userId ?? null, seed.seats)`) and `actorUserId: string | null`
  (`viewer.userId`, or `persona.who.userId ?? null`); the optimistic local `appendEvent` passes `actorUserId`.
  Nothing else in the file changes.
- `docs/IDENTITY.md` (new): the model in a page - seats and roles, `Me`, `actorUserId` and the payload ids of D5,
  labels for display only (D2), the desk rule of D8 as "from IDN-A1 on", and that `Seed.seats` comes only from the
  tables.
- Tests:
  - `apps/app/tests/unit/idn/identity.test.ts`, `describe("IDN identity helpers", …)`: `meFor` with two seats of one
    role and one of another gives both seat ids and two role ids; `meFor(null, seats)` is `NOBODY`; `meOfSeat` of
    an unknown seat is `NOBODY`; `holderOf` picks the lowest sort; `usersOfRole` skips seats without a user and
    duplicates; `holdsRole(me, null)` is false; `actorLabel` gives a member's handle and a leader's name;
    `newHandle(["Anonymous #0001"], () => 0.0001)` is not `Anonymous #0001` and matches `/^Anonymous #\d{4}$/`.
  - `apps/app/tests/unit/idn/seats.test.ts`, `describe("IDN seats in the seed", …)`: `structureSeed(EMPTY_SEED,
    rowsFromSeed(SEED, DEMO_GOALS, counter), DEMO_RULES)` has one seat per holder and route r1's `ownerSeatId` is
    the seat labelled `T. Vogel`, its `deputySeatId` the seat labelled `M. Roth` (the labels are read here only to
    check the fixture); `parseSeed` of a blob with `seats: [{…}]` gives `seats: []`; `contentOnly` gives
    `seats: []`; `logFromRows` keeps `actorUserId` and gives null when the row has none; `appendEvent` keeps it.
  - `apps/app/tests/db/idn-holders.test.ts`, `describe("IDN holder helpers", …)` (D15): two companies with rows;
    `loadSeats` of company A has only A's holders; `loadHolderOf(A, user)` gives that user's first seat and null
    for a user of B; `loadUsersOfRole` gives the role's users; an event appended with `appendEventRow(…, {
    actorUserId })` comes back from `loadLog` with that `actorUserId`.

## Not

- No reader of the new ids: selectors, permissions, the reducer's case logic and every page keep comparing as today
  (IDN-A1, IDN-B1, IDN-P1, IDN-S1). No binding of demo content (IDN-D1): `SEED.seats` stays [].
- No `.prisma` file, no migration (D3). No `package.json`.
- No new comparison of display names (D2).

## Done when

All three proofs are green and lint, typecheck, test, build stay green; every existing test passes unchanged except
for added `seats: []` lines.

Commit everything; an unfinished state as `wip(idn-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
