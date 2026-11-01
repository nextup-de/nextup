# 0004 Webhook and outbox

## Status

Accepted · PILOT/ARC · 2026-11

## Context

Customers want to be told when something happens (a case is raised, decided, a project starts) without polling.
The notification phase (NTF) delivers mail, Teams messages and webhooks; they should share one reliable path
instead of one queue per channel.

## Decision

Contract: `packages/contracts/src/public/webhook.ts`, exported from `@nextup/contracts/public`.

- **Envelope**: `WebhookEnvelope` = `{ specVersion: 1, deliveryId, attempt >= 1, sentAt, event: PublicEvent }`
  (`WEBHOOK_SPEC_VERSION`). `PublicEvent` is described in ADR 0005.
- **Headers**: `WEBHOOK_SIGNATURE_HEADER` (`x-nextup-signature`) and `WEBHOOK_DELIVERY_HEADER`
  (`x-nextup-delivery`, equals `deliveryId`).
- **Signature**: the header reads `t=<unix seconds>,v1=<hex>[,v1=<hex>]`; several `v1` appear during a secret
  rotation. `parseSignatureHeader` reads it. The signed string is `signaturePayload(timestamp, rawBody)` =
  `<timestamp>.<raw body>`.
- **Receiver check**: compute HMAC-SHA256 of `signaturePayload` over the raw body with the subscription secret,
  compare to every `v1` in constant time, accept if one matches, and reject if `timestamp` differs from the
  receiver's clock by more than 5 minutes (replay protection). The contract holds no `node:*` code; NTF computes
  the HMAC.
- **Delivery**: at least once. Receivers deduplicate on `deliveryId`; `attempt` counts tries. A non-2xx answer or a
  timeout is retried with exponential backoff; after the last attempt the message goes to a final `failed` state
  and stays visible to the admin.
- **Subscriptions**: per company, stored as configuration in the database (D4): target URL, secret(s), event
  types. No company-specific logic in code.
- **Outbox**: NTF builds one `OutboxMessage` table in `apps/app/prisma/schema/integrations.prisma`. Every channel,
  mail and Teams included, goes through it: an event writes rows in the same transaction as the state change, a
  worker delivers and records `attempt`, status and the next try.

## Consequences

- Changes to state and the notification are atomic; a crash cannot lose a message.
- Receivers must be idempotent. Ordering across events is not guaranteed; `occurredAt` orders them.
- Secret rotation needs no downtime: sign with old and new secret, then drop the old one.
- Nothing is built by ARC: no route, no outbox, no signing code (D10).

## Gaps

none
