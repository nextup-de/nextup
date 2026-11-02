---
id: DIR-A1
title: applyDirectoryDelta writes any directory page into users, vacates leavers' seats and hands their cases
wp: A
needs: [ DIR-G1 ]
host: any
owns:
  - apps/app/src/features/directory/apply.ts
  - apps/app/src/lib/db/directory.ts
  - apps/app/tests/unit/dir/apply.test.ts
  - apps/app/tests/db/dir-apply.test.ts
risk: high
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D3, D4, D5, D8, D9, D14 ]
proofs:
  - id: B1
    says: planDirectoryDelta matches entries by source key, places them in units by
      department, resolves managers after the page and marks leavers, without
      ever comparing a display name
    run: npm test -w @nextup/app -- tests/unit/dir/apply.test.ts -t 'DIR plan a
      directory page'
  - id: B2
    says: applyDirectoryDelta creates, moves and deactivates users, vacates a
      leaver's seats, hands their open cases to the role's other holder once,
      and changes nothing on the same page twice
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/dir-apply.test.ts -t 'DIR apply a directory page'
status: open
---

Plan DIR (sub-plan of PILOT): applying a page. This is the source-agnostic core that the Graph adapter (DIR-B1) and
later SuccessFactors (SFX) feed. Read first: D4, D8, D9 of the plan, `docs/IDENTITY.md`,
`packages/contracts/src/public/connectors/directory-source.ts`, `apps/app/src/features/auth/identity.ts` and
`handle.ts`, `apps/app/src/features/auth/entra.ts` (`jitSeatRole`, the department rule),
`apps/app/src/lib/db/accounts.ts`, `apps/app/src/lib/db/events.ts` (`appendEventRow` with idemKey: call it, do not
change it), `apps/app/src/lib/db/companies.ts` (`loadSeed`: call it).

## What

- `apps/app/src/features/directory/apply.ts` (new, pure): `planDirectoryDelta(input: { source:
  DirectorySourceKind; page: DirectoryPage; users: { id; entraOid; employeeId; email; active; managerId; dept }[];
  units: { key; name; sort }[]; takenHandles: string[] }): DirectoryPlan` with `creates`, `updates` (only changed
  fields), `managers` (userId or new-entry index → managerId), `leavers`, `skipped`; exactly D4, D8, D9. The unit by
  department uses the same comparison as `jitSeatRole` (export a shared `unitForDepartment` from apply.ts or reuse
  IDN's; do not edit entra.ts).
- `apps/app/src/lib/db/directory.ts` (new): `applyDirectoryDelta(companyId, source, page, now = new Date()):
  Promise<DirectoryCounts>` - loads users, units and seats, runs the plan in one transaction for the user writes,
  then the leavers: seats vacated, open cases on those seats (from `loadSeed` + `loadLog` + `reduce`) handed with
  `appendEventRow` exactly as D9. `deactivateUser(companyId, userId, now)` (the same leaver path for one user,
  exported for DIR-D1). The company at the top level of every query. `employeeId` never in a log line (D5).
- Tests:
  - `apps/app/tests/unit/dir/apply.test.ts`, `describe("DIR plan a directory page", …)`: a new entry with
    department "Engineering" is a create with dept "ENG", role member and a handle not in `takenHandles`; an entry
    whose department matches nothing is skipped; an existing user matched by `entraOid` whose department changes is
    an update of `dept`; a user without entraOid is matched by email; two users with the same display name but
    different object ids stay two users; the manager of an entry created in the same page resolves to it; `active:
    false` and `removedExternalIds` give leavers; source successfactors matches by `employeeId`.
  - `apps/app/tests/db/dir-apply.test.ts`, `describe("DIR apply a directory page", …)` (D14): a sandbox company from
    the demo template (IDN-bound) where two users hold the Engineering lead role and an open case sits on the first
    one's seat: a page that adds a user, moves one to Quality and disables the first holder gives counts { added: 1,
    updated: 1, deactivated: 1, handed: 1 }; the leaver is inactive, their seat has `userId: null`, the case's
    reduced `assigneeSeatId` is the other holder's seat; applying the same page again gives zero counts and writes no
    event.

## Not

- No Graph, no fetch (DIR-B1); no loop or lease (DIR-C1); no page and no member action (DIR-D1).
- No change to `lib/db/events.ts`, `lib/db/companies.ts` or `features/auth/entra.ts` (CLK's and IDN's): call them. No
  `.prisma` file. No comparison of display names (D4).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
