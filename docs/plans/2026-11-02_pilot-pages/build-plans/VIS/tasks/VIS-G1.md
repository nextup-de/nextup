---
id: VIS-G1
title: CaseView and RateCounter tables
wp: G
needs: [ DIR-G1 ]
host: any
owns:
  - apps/app/prisma/schema/core.prisma
  - apps/app/prisma/migrations/20261118080000_vis_projections/**
  - apps/app/tests/db/vis-tables.test.ts
risk: normal
profile: orch
budget: { minutes: 45, window_pct: 8 }
uses: [ D1, D3, D5, D11, D13 ]
proofs:
  - id: B1
    says: a CaseView row with access keys is found by an array-overlap query on its
      keys and not by another company, and a RateCounter row upserts
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/vis-tables.test.ts -t 'VIS tables'
status: ready
---

Plan VIS (sub-plan of PILOT): the schema. Read first: `docs/adr/0007-areas.md`, `apps/app/prisma/schema/core.prisma`,
D3, D5 and D11 of the plan.

## What

- `apps/app/prisma/schema/core.prisma`: `CaseView` exactly as D5 and `RateCounter` exactly as D11, back-relation
  `caseViews CaseView[]` in the `// -- core --` block of Company (RateCounter has no company); the file's header names
  them.
- `apps/app/prisma/migrations/20261118080000_vis_projections/migration.sql`: both tables (from `prisma migrate
  diff`), plus `CREATE INDEX "CaseView_accessKeys_gin" ON "CaseView" USING GIN ("accessKeys");`.
- `apps/app/tests/db/vis-tables.test.ts`, `describe("VIS tables", …)` (D13): two companies' CaseView rows; a raw query
  `WHERE "companyId" = $1 AND "accessKeys" && $2::text[]` finds company A's row by `["r:x"]` and not B's; an upsert of
  RateCounter increments `count`.

## Not

- No code that writes or reads the tables (VIS-B1, VIS-D1). No other .prisma file (D3).

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(vis-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
