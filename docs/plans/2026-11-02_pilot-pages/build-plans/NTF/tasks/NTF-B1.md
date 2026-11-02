---
id: NTF-B1
title: Channel registry, mail and signed webhook channels, and delivery with retries
wp: B
needs: [ NTF-G1 ]
host: any
owns:
  - apps/app/src/server/notify/registry.ts
  - apps/app/src/server/notify/deliver.ts
  - apps/app/src/server/notify/sign.ts
  - apps/app/src/server/notify/channels/**
  - apps/app/tests/unit/ntf/sign.test.ts
  - apps/app/tests/db/ntf-deliver.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D9, D11, D15 ]
proofs:
  - id: B1
    says: the signature header carries one v1 per secret over t.body and a receiver
      check with the contract's parseSignatureHeader accepts it
    run: npm test -w @nextup/app -- tests/unit/ntf/sign.test.ts -t 'NTF webhook
      signature'
  - id: B2
    says: deliverOnce sends a pending row once, retries a failing webhook on the
      backoff schedule, marks it failed after the sixth attempt, never sends a
      row twice from two concurrent runs, and a registered channel receives its
      rows
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ntf-deliver.test.ts -t 'NTF delivery'
status: ready
---

Plan NTF (sub-plan of PILOT): sending. Read first: D9, D11 of the plan, `docs/adr/0004-webhook-and-outbox.md`,
`packages/contracts/src/public/webhook.ts` and `connectors/notify-channel.ts`, `apps/app/src/server/mail.ts`,
`apps/app/src/server/case-notice.ts` (the "noted on the case" comment), `apps/app/src/lib/db/outbox.ts` and
`webhooks.ts` (NTF-G1).

## What

- `apps/app/src/server/notify/registry.ts` (new): `registerChannel(name, channel)`, `channelFor(name)`; `mail` and
  `webhook` registered on import.
- `apps/app/src/server/notify/channels/mail.ts` (new): a `NotifyChannel` over `sendMail`; for template `raised` it
  appends the "noted on the case" comment with idemKey `notify:<eventId>` after a successful send, exactly as
  `deliverRaisedNotice` does today; without SMTP_URL it returns retryable without counting as an error (D9).
- `apps/app/src/server/notify/channels/webhook.ts` (new): builds the `WebhookEnvelope` from the row's `data.event`,
  signs it (`sign.ts`), POSTs with 10 s timeout, maps the status as D9.
- `apps/app/src/server/notify/sign.ts` (new): `signatureHeader(secrets, timestamp, rawBody)` with node:crypto (D11).
- `apps/app/src/server/notify/deliver.ts` (new): `deliverOnce(now = new Date())` exactly as D9.
- Tests:
  - `apps/app/tests/unit/ntf/sign.test.ts`, `describe("NTF webhook signature", …)`: two secrets give two `v1`;
    `parseSignatureHeader` reads it back; recomputing with either secret matches one `v1`; another body matches none.
  - `apps/app/tests/db/ntf-deliver.test.ts`, `describe("NTF delivery", …)` (D15): a test channel registered as `mail`
    receives a pending row once and the row is `sent`; a local server answering 500 gets attempt 1, and with `now`
    moved past each nextAt (1 min, 5 min, 30 min, 2 h, 12 h) the row is `failed` after attempt 6 with lastError set; a
    404 fails at once; 200 on the second try is `sent` with attempt 2 and the receiver saw the same
    `x-nextup-delivery` both times; two concurrent `deliverOnce` send each row once.

## Not

- No planning from the log, no loop, no change to the old senders (NTF-C1). No subscription editor (Q1).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
