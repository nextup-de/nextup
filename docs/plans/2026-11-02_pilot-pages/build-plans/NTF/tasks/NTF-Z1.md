---
id: NTF-Z1
title: "NTF acceptance: reminders once, webhook retries, sandbox sends nothing"
wp: Z
needs: [ NTF-G1, NTF-A1, NTF-B1, NTF-C1, NTF-D1 ]
host: any
owns:
  - apps/app/tests/db/outbox.test.ts
  - docs/NOTIFICATIONS.md
risk: normal
profile: orch
budget: { minutes: 45, window_pct: 8 }
uses: [ D1, D6, D7, D8, D9, D15 ]
proofs:
  - id: B1
    says: a deadline gives exactly one reminder per recipient across repeated runs
      and a restart, a failing webhook is retried and then marked failed, and a
      sandbox company sends nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/outbox.test.ts -t 'NTF acceptance'
status: ready
---

Plan NTF (sub-plan of PILOT): acceptance. Every other NTF task is merged. Read first: the plan's decisions,
`apps/app/src/server/notify/`, `apps/app/src/server/scheduler/clock.ts` (CLK), `apps/app/tests/db/ntf-*.test.ts`.

## What

- `apps/app/tests/db/outbox.test.ts`, `describe("NTF acceptance: reminders once, webhook retries, sandbox sends
  nothing", …)` (D15), with a test mail channel and a local webhook receiver:
  1. A pilot company from the demo template, notifications and n8n on, a subscription for `case.raised`; raise a case
     on r1 and let it pass its promise; run CLK's `runClockOnce`, `dispatchOnce` and `deliverOnce` on each of ten
     days: exactly one `reminder.deadline` per recipient (the deputy seat's users and the owner seat's users), each
     sent once; a fresh import of the notify modules (restart) and five more days add none.
  2. The receiver answers 500: the raise's webhook row is retried on the backoff schedule (time passed in) and is
     `failed` after attempt 6.
  3. A sandbox company with the same setup: every row is `skipped` "sandbox", the mail channel and the receiver saw
     nothing.
- `docs/NOTIFICATIONS.md` (new): outbox, keys, gating, retries, channels and how TMS adds one, digest, opt-in, and
  `## NTF gaps` for every row of docs/audit/gaps with phase NTF (task or 'open' with a reason).

## Not

- No source file outside the test and the doc. A failure caused by the code is reported `blocked` with the path in
  backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
