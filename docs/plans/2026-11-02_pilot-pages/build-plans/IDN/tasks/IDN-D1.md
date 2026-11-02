---
id: IDN-D1
title: Demo content carries seat and user ids, locally and in demo companies
wp: D
needs: [ IDN-G1 ]
host: any
owns:
  - apps/app/src/features/demo/identity.ts
  - apps/app/src/features/demo/index.ts
  - apps/app/src/features/demo/static-demo.ts
  - apps/app/src/lib/db/demo-identity.ts
  - apps/app/src/server/actions/admin.ts
  - apps/app/prisma/seed.ts
  - apps/app/tests/unit/idn/demo-ids.test.ts
  - apps/app/tests/db/idn-demo.test.ts
  - apps/app/tests/unit/static-demo.test.ts
  - apps/app/tests/unit/create-company.test.ts
  - apps/app/tests/unit/admin-demo.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D3, D5, D7, D9, D10, D11, D15 ]
proofs:
  - id: B1
    says: bindDemoIds fills only the id fields and never a label, and the local demo
      seed gives every route an owner seat, every persona a user, the member
      persona's cases their fromUserId, and the same ids on every call
    run: npm test -w @nextup/app -- tests/unit/idn/demo-ids.test.ts -t 'IDN demo
      content on ids'
  - id: B2
    says: a demo company built like /admin builds it has its seats linked to its
      users and its stored seed bound to their ids after bindDemoCompany, and a
      second run changes nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/idn-demo.test.ts -t 'IDN demo company bound'
status: merged
lane: pc/b
branch: orch/idn-d1
pr: 302
merge: "b97a2ce"
---

Plan IDN (sub-plan of PILOT): demo content on ids. The built-in seed and every demo company still name people in
their cases, history, projects and personas. This task binds them to seat and user ids once, in the one module
that may match a label to an id (D9), so the domain tasks after it compare ids only. IDN-G1 added the fields.
Read first: `docs/IDENTITY.md`, `apps/app/src/features/auth/identity.ts`, `apps/app/src/features/demo/types.ts`,
`seed.ts` (`ROLES`, `PEOPLE`, `ROUTES`, `CASES`, `PROJECTS`), `static-demo.ts`, `index.ts`, `content.ts`,
`apps/app/src/features/knowledge/index.ts` (`rowsFromSeed`, `structureSeed`), `apps/app/src/lib/db/structure-writes.ts`,
`apps/app/src/server/actions/admin.ts` (create company) and `apps/app/prisma/seed.ts`.

## What

- `apps/app/src/features/demo/identity.ts` (new): `DemoUser`, `userByLabel`, `seatByLabel`, `bindDemoIds` exactly as
  D9, and `localDemoSeed` exactly as D10. The header says that this file is the only place a label meets an id and
  who may call it (D9).
- `apps/app/src/features/demo/index.ts`: `export const LOCAL_SEED = localDemoSeed(SEED)`; `seedFor` returns it
  for acme when there is no database (instead of `SEED`). `seedTemplate` keeps returning the raw seed.
- `apps/app/src/features/demo/static-demo.ts`: the raw seed is renamed `STATIC_DEMO_RAW`, `STATIC_DEMO_SEED =
  localDemoSeed(STATIC_DEMO_RAW)`; every importer of `STATIC_DEMO_SEED` keeps its import.
- `apps/app/src/lib/db/demo-identity.ts` (new): `bindDemoCompany(companyId)` as D9 (reads holders, users and
  `seedJson`, writes holder `userId`s and `seedJson`; the company at the top level of every query).
- `apps/app/src/server/actions/admin.ts` create company: users with role member and no handle get
  `newHandle(<handles already given in this form>)` (D11); after `writeStructure` for the demo template, call
  `bindDemoCompany(company.id)`.
- `apps/app/prisma/seed.ts`: after the users are upserted, call `bindDemoCompany` for each seeded company.
- Existing tests touched only where `STATIC_DEMO_SEED`, `seedFor` or create-company now carry ids:
  `tests/unit/static-demo.test.ts`, `tests/unit/create-company.test.ts`, `tests/unit/admin-demo.test.ts`.
- Tests:
  - `apps/app/tests/unit/idn/demo-ids.test.ts`, `describe("IDN demo content on ids", …)`: `bindDemoIds` on `SEED`
    with two seats and two users leaves every label (`from`, `assignee`, `actor`, `lead`, `name`) unchanged
    (deep-compare with the input after deleting the id fields); `userByLabel` gives null when two users share the
    label; `LOCAL_SEED`: every route has a non-null `ownerSeatId`; every persona has a `who.userId`; the cases whose
    `from` is the member persona's handle have `fromUserId` equal to that persona's `userId`, and the others' is
    null or another user; `meFor(leader persona userId, LOCAL_SEED.seats)` holds the role of route r1's
    `ownerSeatId`; `localDemoSeed(SEED)` deep-equals a second call; `STATIC_DEMO_SEED.routes` all have an owner
    seat.
  - `apps/app/tests/db/idn-demo.test.ts`, `describe("IDN demo company bound", …)` (D15): create a company with
    `templateWrites("demo", …)`, `writeStructure` and the users `B. Hartmann` (manager), `T. Vogel` (leader) and
    `J. Schmidt` (member, handle `Anonymous #4471`) the way `/admin` does; after `bindDemoCompany` the holder
    labelled `T. Vogel` has T. Vogel's user id, the stored seed's case c3 has `fromUserId` = J. Schmidt's id and
    `assigneeRoleHolderId` set, the stored seed has `seats: []`; a second `bindDemoCompany` returns `{ seatsLinked:
    0 }` and leaves `seedJson` equal.

## Not

- No stored events: the backfill of `CaseEvent` rows is IDN-M1. No reducer, selector or page change (IDN-A1,
  IDN-B1, IDN-P1, IDN-S1). No JIT or member-add handles (IDN-C1).
- No matching of labels outside `features/demo/identity.ts` (D9).
- No `.prisma` file, no migration (D3).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(idn-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
