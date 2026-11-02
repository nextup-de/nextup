---
id: DIR-G1
title: Directory fields on users, the DirectoryRun table, and inactive users
  cannot sign in
wp: G
needs: [ IDN-G1, CLK-G1 ]
host: any
owns:
  - apps/app/prisma/schema/auth.prisma
  - apps/app/prisma/schema/core.prisma
  - apps/app/prisma/migrations/20261112080000_dir_directory/**
  - apps/app/src/features/directory/index.ts
  - apps/app/src/lib/db/directory-run.ts
  - apps/app/src/lib/db/sessions.ts
  - apps/app/src/server/actions/auth.ts
  - apps/app/src/server/microsoft-login.ts
  - apps/app/tests/unit/dir/directory-types.test.ts
  - apps/app/tests/db/dir-run.test.ts
risk: high
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D3, D5, D6, D7, D13, D14 ]
proofs:
  - id: B1
    says: the directory source kinds and the status shape are fixed, and an unknown
      source reads as graph
    run: npm test -w @nextup/app -- tests/unit/dir/directory-types.test.ts -t 'DIR
      directory types'
  - id: B2
    says: the DirectoryRun lease goes to one claimer only, a run records its counts
      and error per company, and an inactive user's session, login code and
      Microsoft sign-in are refused
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/dir-run.test.ts -t 'DIR run and inactive users'
status: running
lane: pc/e
branch: orch/dir-g1
retries: 1
last_failure: "Beweise rot: B2"
---

Plan DIR (sub-plan of PILOT): the scaffold. After this task users can carry an employeeId, a manager and an active
flag, each company has a directory run row, and a deactivated user is shut out everywhere. Nothing syncs yet. Read
first: `docs/adr/0007-areas.md`, `docs/IDENTITY.md`, `apps/app/prisma/schema/auth.prisma` and `core.prisma` (the
Company blocks), `apps/app/src/lib/db/integrations.ts` (`claimLease`, `recordRun`: the pattern),
`apps/app/src/lib/db/sessions.ts`, `apps/app/src/server/actions/auth.ts` (login code),
`apps/app/src/server/microsoft-login.ts` (found user).

## What

- `apps/app/prisma/schema/auth.prisma`: the User fields and `DirectoryRun` of D7; replace the User comment that names
  must match the seed with one line on ids (IDN). `core.prisma`: only `directoryRun DirectoryRun?` in the `// --
  auth --` block of Company (D6). Migration `20261112080000_dir_directory/migration.sql` (generated with `prisma
  migrate diff`, checked by hand).
- `apps/app/src/features/directory/index.ts` (new, pure): `type DirectorySourceKind = "graph" | "successfactors"`,
  `sourceKind(v: unknown)` (unknown → "graph"), `type DirectoryCounts = { added; updated; deactivated; handed }`,
  `type DirectoryStatus = { on; source; lastRunAt; lastOkAt; lastError; counts }`.
- `apps/app/src/lib/db/directory-run.ts` (new): `loadDirectoryRun(companyId)`, `setDirectoryOn(companyId, on, source,
  by)`, `claimDirectoryLease(companyId, ms, now)` (creates the row when missing, then updateMany on leaseUntil null
  or past; true only for the winner), `releaseDirectoryLease`, `saveDirectoryCursor(companyId, cursor)`,
  `recordDirectoryRun(companyId, { counts?, error? }, now)`, `loadDirectoryStatus(companyId): DirectoryStatus`
  (never the cursor), `companiesWithDirectoryOn()`.
- Inactive users (D13): `sessionStillValid` false when `active` is false; the login code action refuses an inactive
  user with the same message as an unknown code; `server/microsoft-login.ts` refuses a found inactive user with reason
  `unknown`.
- Tests:
  - `apps/app/tests/unit/dir/directory-types.test.ts`, `describe("DIR directory types", …)`: `sourceKind("graph")`,
    `sourceKind("successfactors")`, `sourceKind("x")` → graph, `sourceKind(null)` → graph.
  - `apps/app/tests/db/dir-run.test.ts`, `describe("DIR run and inactive users", …)` (D14): two
    `claimDirectoryLease` calls with `Promise.all` give one true; after `releaseDirectoryLease` it can be claimed
    again; `recordDirectoryRun` with counts sets lastOkAt and clears lastError, with an error keeps lastOkAt; another
    company's row is untouched; `loadDirectoryStatus` has no cursor field; a user set `active: false` makes
    `sessionStillValid` false.

## Not

- No sync, no adapter, no page (DIR-A1, DIR-B1, DIR-C1). No member actions (DIR-D1).
- In core.prisma nothing but the one back-relation line (D6); no other .prisma file. No package.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(dir-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
