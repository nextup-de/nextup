---
id: IDN-M1
title: One-off backfill binds stored companies and events to user and seat ids
wp: M
needs: [ IDN-D1 ]
host: any
owns:
  - apps/app/prisma/identity-backfill.ts
  - apps/app/src/lib/db/identity-backfill.ts
  - docs/IDENTITY.md
  - apps/app/tests/db/idn-backfill.test.ts
risk: high
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D2, D3, D5, D9, D15 ]
proofs:
  - id: B1
    says: on a company built the way it was before IDN, backfillIdentity sets
      actorUserId and the payload ids of its events and binds its seats and
      seed, leaves every label and every system event as it was, and a second
      run changes nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/idn-backfill.test.ts -t 'IDN identity backfill'
status: merged
lane: pc/a
branch: orch/idn-m1
pr: 303
merge: "f05fc56"
---

Plan IDN (sub-plan of PILOT): the backfill. Companies stored before IDN have events whose actor and payload name
people, and seats without users. PILOT/HQ5 allows rewriting them once (only demo data exists today). This script
does it, with the matching rules of D9, and is run by Kevin per stack after a backup (Q1). Read first:
`docs/IDENTITY.md`, `apps/app/src/features/demo/identity.ts` and `apps/app/src/lib/db/demo-identity.ts` (IDN-D1),
`apps/app/src/features/cases/events.ts` (the payload ids of D5), `apps/app/prisma/backfill-structure.ts` and
`apps/app/src/lib/db/structure-writes.ts` `backfillStructure` (the pattern to follow).

## What

- `apps/app/src/lib/db/identity-backfill.ts` (new): `backfillIdentity(): Promise<{ slug: string; line: string }[]>`.
  For every company, in this order:
  1. `bindDemoCompany(company.id)` (IDN-D1).
  2. Its `CaseEvent` rows by `seq`, with the company's users and seats: `actorUserId` null and
     `userByLabel(users, actor)` finds one → set it; system actors (`system:` prefix) untouched. Payload, only when
     the id field is absent: case.raised `assigneeRoleHolderId` = `seatByLabel(seats, payload.assignee)`;
     case.handed `toRoleHolderId` = `seatByLabel(seats, payload.to)`; case.discussion and case.invited
     `invitedUserIds` = the found users of `payload.invited`; case.decided `leadUserId` = `userByLabel(users,
     payload.lead)`; project.member `userId` from `payload.name`; project.handed `toUserId` from `payload.to`;
     project.step.added and project.step.edited `ownerUserId` from `payload.owner`. A label that finds nothing
     leaves the field absent. No label, `type`, `day`, `seq` or `targetId` changes.
  3. One line: `<slug>: <n> events, <m> seats linked, seed bound` or `<slug>: left as it is`.
  Idempotent: a second run writes nothing. The company at the top level of every query.
- `apps/app/prisma/identity-backfill.ts` (new): runs it as `npx tsx prisma/identity-backfill.ts` in `apps/app`,
  reading `.env.local` like `prisma/seed.ts`, and prints the lines. Its header says: run once per stack after the IDN
  release, after `stack/backup.sh`; safe to repeat.
- `docs/IDENTITY.md`: a section `## Backfill` with what it rewrites, what it never touches, the command, and Q1.
- `apps/app/tests/db/idn-backfill.test.ts`, `describe("IDN identity backfill", …)` (D15): build a company the
  pre-IDN way - demo template rows, the users `T. Vogel`, `M. Roth`, `J. Schmidt` (handle `Anonymous #4471`), a
  stored seed from `toSeedJson(contentOnly(SEED))`, and events written with `appendEventRow` without
  `actorUserId`: a case.raised by `Anonymous #4471` with `assignee: "T. Vogel"`, a case.handed by `T. Vogel` with `to:
  "M. Roth"`, a case.commented by `system:n8n`, a case.commented by an actor nobody has. After `backfillIdentity`:
  the raise has J. Schmidt's `actorUserId` and the seat of T. Vogel as `assigneeRoleHolderId`; the hand-over has
  T. Vogel's `actorUserId` and M. Roth's seat as `toRoleHolderId`; both n8n and the unknown actor keep
  `actorUserId` null; every `actor` and label is unchanged; the reducer over `loadSeed` and `loadLog` gives the case
  `assigneeSeatId` = M. Roth's seat. A second run returns `left as it is` and every row is equal. A second company
  with the same names is not touched by the first company's users.

## Not

- No schema change, no migration folder (D3); no change to `stack/` (OPS) - Kevin runs the script (Q1).
- No matching rule of its own: only `userByLabel` and `seatByLabel` from `features/demo/identity.ts` (D9).
- Not run against any real stack from the lane.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(idn-m1): …`. Leave nothing unsaved. orch pushes and opens the PR.
