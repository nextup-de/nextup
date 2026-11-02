---
id: VIS-D1
title: Rate limits count in Postgres and the connection pool is configured
wp: D
needs: [ VIS-G1, CLK-Z1 ]
host: any
owns:
  - apps/app/src/lib/db/rate-limit.ts
  - apps/app/src/server/throttle.ts
  - apps/app/src/features/security/rate-limit.ts
  - apps/app/src/i18n/messages/errors.ts
  - apps/app/src/lib/db/client.ts
  - apps/app/.env.example
  - docs/DEPLOY.md
  - apps/app/tests/db/vis-rate-limit.test.ts
  - apps/app/tests/unit/vis/pool.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D11, D12, D13 ]
proofs:
  - id: B1
    says: two callers sharing the database count against one limit, an expired
      window starts again, and clearShared resets a key
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/vis-rate-limit.test.ts -t 'VIS shared rate limits'
  - id: B2
    says: the pool size and statement timeout come from DATABASE_POOL_MAX and
      DATABASE_STATEMENT_TIMEOUT_MS with their defaults
    run: npm test -w @nextup/app -- tests/unit/vis/pool.test.ts -t 'VIS pool
      settings'
status: ready
---

Plan VIS (sub-plan of PILOT): shared rate limits and the pool (G-225, G-240). Read first: D11 and D12 of the plan,
`apps/app/src/server/throttle.ts`, `apps/app/src/features/security/rate-limit.ts`, `apps/app/src/lib/db/client.ts`.

## What

- `apps/app/src/lib/db/rate-limit.ts` (new): `hitShared`, `clearShared`, `sweepShared(now)` as D11, one SQL statement
  per hit (`INSERT … ON CONFLICT … DO UPDATE` that resets an expired window), returning the same `Verdict` as the pure
  `hit`.
- `apps/app/src/server/throttle.ts`: every rule goes through `hitShared` when a database is there, else the in-memory
  store as today; the hourly sweep also runs `sweepShared`. The refusal sentence comes from `getT()` (D11): keys
  `tooManyAttempts`, `waitMinutes_one/_other`, `waitSeconds_one/_other` in `i18n/messages/errors.ts`, German and
  English; `waitText` in `features/security/rate-limit.ts` goes. Its header no longer says "replace with a shared table".
- `apps/app/src/lib/db/client.ts`: `poolSettings(env)` (pure, exported) reads D12's variables; the adapter uses it.
  `.env.example` and `docs/DEPLOY.md` name both variables.
- `apps/app/tests/db/vis-rate-limit.test.ts`, `describe("VIS shared rate limits", …)` (D13): two `hitShared` callers
  (two "instances") on a limit of 2 refuse the third hit; after `resetAt` it passes; `clearShared` resets.
  `apps/app/tests/unit/vis/pool.test.ts`, `describe("VIS pool settings", …)`: defaults 10 and 15000, env values used,
  junk falls back.

## Not

- No change to the rules' numbers. No pooler service in `stack/` (OPS). No .prisma change (VIS-G1 did it).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(vis-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
