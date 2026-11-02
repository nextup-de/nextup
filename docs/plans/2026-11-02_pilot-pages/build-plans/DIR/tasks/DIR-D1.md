---
id: DIR-D1
title: Deputies follow the manager chain, and a manager can deactivate or delete a member
wp: D
needs: [ DIR-A1 ]
host: any
owns:
  - apps/app/src/features/knowledge/index.ts
  - apps/app/src/lib/db/knowledge.ts
  - apps/app/src/server/actions/members.ts
  - apps/app/src/components/settings/MembersView.tsx
  - apps/app/src/i18n/messages/settings.ts
  - apps/app/tests/unit/dir/deputy.test.ts
  - apps/app/tests/db/dir-members.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D4, D9, D12, D13, D14 ]
proofs:
  - id: B1
    says: a route without a deputy role gets the owner's manager's seat as deputy,
      and a route with one keeps it
    run: npm test -w @nextup/app -- tests/unit/dir/deputy.test.ts -t 'DIR deputy
      from the manager chain'
  - id: B2
    says: a manager deactivates a member through the leaver path and deletes only an
      inactive one, never themselves, and another company's member is out of
      reach
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/dir-members.test.ts -t 'DIR member actions'
status: open
---

Plan DIR (sub-plan of PILOT): deputies and member actions. Read first: D12 and D13 of the plan,
`apps/app/src/features/knowledge/index.ts` (`seedParts`), `apps/app/src/lib/db/knowledge.ts` (`loadKnowledge`),
`apps/app/src/lib/db/directory.ts` (`deactivateUser`, DIR-A1), `apps/app/src/server/actions/members.ts`,
`apps/app/src/components/settings/MembersView.tsx`.

## What

- `apps/app/src/features/knowledge/index.ts`: `Knowledge.managers?` and the deputy rule of D12 in `seedParts`;
  `NO_KNOWLEDGE` unchanged otherwise.
- `apps/app/src/lib/db/knowledge.ts`: `loadKnowledge` fills `managers` for the company's active users with a manager.
- `apps/app/src/server/actions/members.ts`: `deactivateMemberAction` and `deleteMemberAction` exactly as D13 (the
  manager check of the existing actions; a manager never acts on themselves).
- `apps/app/src/components/settings/MembersView.tsx`: per member "Deactivate" (active) and "Delete" (inactive),
  each with a confirm step, an "inactive" marker; strings through `t()` in `i18n/messages/settings.ts`.
- Tests:
  - `apps/app/tests/unit/dir/deputy.test.ts`, `describe("DIR deputy from the manager chain", …)`: knowledge from
    `rowsFromSeed(SEED, DEMO_GOALS, counter)` with one rule's `deputyRoleId` set to null and the owner seat's user
    managed by the user of another seat: that rule's route has the manager's seat as `deputySeatId` and its role as
    `deputyRoleId`; with no manager, null; a rule with a deputy role keeps it.
  - `apps/app/tests/db/dir-members.test.ts`, `describe("DIR member actions", …)` (D14): deactivating a member who
    holds a seat with an open case vacates the seat and hands the case like DIR-A1; delete of an active member is
    refused, of an inactive one removes the user and keeps their events with `actorUserId` null; a manager cannot
    deactivate themselves; a userId of another company changes nothing.

## Not

- No sync, no adapter (DIR-B1, DIR-C1). No editor for routes or deputies (ADM).
- No `.prisma` file. No comparison of display names (D4). No edit of top-level `tests/unit/*.test.ts` (D14).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
