---
id: NTF-C1
title: The dispatcher plans every event into the outbox, and the old senders are
  switched off
wp: C
needs: [ NTF-A1, NTF-B1, DIR-C1 ]
host: any
owns:
  - apps/app/src/server/notify/dispatch.ts
  - apps/app/src/server/notify/loop.ts
  - apps/app/instrumentation.ts
  - apps/app/src/server/actions/events.ts
  - apps/app/src/server/case-notice.ts
  - apps/app/src/server/loop-notice.ts
  - apps/app/tests/unit/loop-notice.test.ts
  - apps/app/tests/db/ntf-dispatch.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D3, D6, D7, D13, D14, D15 ]
proofs:
  - id: B1
    says: dispatchOnce plans each new event once behind the cursor, starts a new
      company at its newest event, and a crash between planning and moving the
      cursor writes no duplicate
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ntf-dispatch.test.ts -t 'NTF dispatcher'
  - id: B2
    says: a raise through the server action produces exactly one raised mail via the
      outbox and none from the old path, and the admin resend reuses the same
      row
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ntf-dispatch.test.ts -t 'NTF old senders off'
status: ready
---

Plan NTF (sub-plan of PILOT): the switch-over. After this task every message NextUp sends comes from the outbox.
Read first: D6, D7, D13, D14 of the plan, `apps/app/src/server/case-notice.ts`, `apps/app/src/server/loop-notice.ts`,
`apps/app/src/server/actions/events.ts` (where `notifyRaised` and `notifyLoop` are called),
`apps/app/src/server/actions/admin.ts` (the resend, read only), `apps/app/src/server/jira-sync.ts` (loop pattern),
`apps/app/instrumentation.ts`, and NTF-A1's `planNotices`, NTF-B1's `deliverOnce`.

## What

- `apps/app/src/server/notify/dispatch.ts` (new): `dispatchOnce(now)` exactly as D6: per company the NotifyCursor
  lease (5 min), reduce, people with id, email and locale (`localeForEmail`), prefs, switches and subscriptions,
  `planNotices` per new event, `enqueue` and the cursor move in one transaction.
- `apps/app/src/server/notify/loop.ts` (new): `startNotify()` as D14; `apps/app/instrumentation.ts` starts it.
- `apps/app/src/server/actions/events.ts`: the `notifyRaised` and `notifyLoop` calls and their helper are removed
  (D13); nothing else changes.
- `apps/app/src/server/case-notice.ts`: `notifyCaseRaised` removed; `deliverRaisedNotice(companyId, notice)` keeps its
  signature and result and now enqueues the `raised` row for that raise's key (or finds it) and delivers that row
  once; `companyBaseUrl` stays. `apps/app/src/server/loop-notice.ts`: `notifyLoop` removed; the file keeps only what
  the dispatcher reuses (or is deleted if nothing remains). `tests/unit/loop-notice.test.ts` follows.
- `apps/app/tests/db/ntf-dispatch.test.ts` (D15):
  - `describe("NTF dispatcher", …)`: events appended after the first run are planned once (rows by key), a second
    run plans nothing; a company with history gets no rows for it; with the cursor rolled back by hand the next run
    writes no duplicate row; another instance holding the lease makes the run skip that company.
  - `describe("NTF old senders off", …)`: in a demo company, appending a raise the way appendEventAction stores it
    and running dispatch then delivery (test mail channel) gives exactly one `raised` mail to the seat's user and the
    "noted on the case" comment; `deliverRaisedNotice` for the same raise returns ok without a second mail; nothing
    in `src/` imports `notifyCaseRaised` or `notifyLoop` (a file scan in the test).

## Not

- No new kind of message (NTF-A1), no digest (NTF-D1). No change to `server/actions/admin.ts` (the resend keeps
  working through `deliverRaisedNotice`). No `lib/db/events.ts` change (D6).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
