# API v1 and webhooks

> **Updated 2026-11-03.** Plan API. Reference for integrators: [`docs/api/README.md`](api/README.md) and
> [`docs/api/openapi.json`](api/openapi.json). Design: [`adr/0003-api-v1.md`](adr/0003-api-v1.md),
> [`adr/0004-webhook-and-outbox.md`](adr/0004-webhook-and-outbox.md).

## What v1 offers

Base path `/api/v1/{company}`, company bearer token, JSON in and out.

| Operation | Scope | What it does |
|---|---|---|
| `cases.list`, `cases.get` | `cases:read` | Read cases. Private cases never appear. |
| `cases.create` | `cases:write` | Raise a case from another system, idempotent on `externalId`. |
| `decisions.list` | `decisions:read` | Read decisions. |
| `projects.list`, `projects.get` | `projects:read` | Read projects. |
| `org.get` | `org:read` | Units, roles and role holders. |

- The OpenAPI 3.1 document is served without a token at `GET /api/v1/openapi.json` and committed as `docs/api/openapi.json`.
- A v1 token acts for the company system, never as a person. Responses carry ids, never names, handles or emails.
- Limit: 600 requests per minute per token. Every response has `x-request-id`; every error is an `ApiV1Error`.
- Outbound webhooks: signed `WebhookEnvelope` posts for the public event types (`case.raised`, `case.handed`,
  `case.answered`, `case.decided`, `project.started`, `project.done`, `project.stopped`).

## Who manages what, and where

Company admins (role `manager`) only:

- API tokens: `/{company}/settings/api-tokens`. Pick scopes and expiry; the token is shown once.
- Webhooks: `/{company}/settings/webhooks`. The send switch, subscriptions (https URL, event types, on/off), secrets
  (shown once; rotate, then remove the old one), and the latest deliveries with "Retry now" on failed rows.

Each change is audited. Nothing is sent while the send switch is off.

## Not in v1

- **User tokens.** Tokens belong to the company; no call acts as a person.
- **Test send.** There is no "send a test event" button; trigger a real event instead.
- **Event versions.** v1 sends each event at its current `typeVersion`; there is no way to subscribe to an older shape.

## Proof

`apps/app/tests/db/api-v1.test.ts` ("API acceptance") calls every endpoint with a valid, unauthorised and invalid
request, checks that no body names a member, validates the OpenAPI document, and receives a signed `case.raised` at a
local receiver.
