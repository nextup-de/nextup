# NextUp API v1

Read cases, decisions, projects and the org chart, raise a case from another system, and receive events as webhooks.
The machine-readable description is [`openapi.json`](./openapi.json) (OpenAPI 3.1); the running app serves the same
document without a token at `GET /api/v1/openapi.json`. Design: `docs/adr/0003-api-v1.md`.

Base path: `/api/v1/{company}`, where `{company}` is your company slug. Every query is scoped to that company.

## Authenticate

Send a company bearer token (created in the company's API token settings):

```
Authorization: Bearer <token>
```

A missing, unknown or revoked token answers `401`. A token that lacks the scope of the operation answers `403`.

## Scopes

| Scope | Operations |
|---|---|
| `cases:read` | `cases.list`, `cases.get` |
| `cases:write` | `cases.create` |
| `decisions:read` | `decisions.list` |
| `projects:read` | `projects.list`, `projects.get` |
| `org:read` | `org.get` |

Each operation names its scope in `x-nextup-scope`. A token holds any set of scopes.

## Paging

Lists take `cursor` (optional) and `limit` (1-200, default 50) and answer `{ "data": [...], "page": { "nextCursor": "..." } }`.
`nextCursor` is `null` on the last page; pass it as `cursor` to get the next one.

## Errors

Every error has the same body, with the status codes 400, 401, 403, 404, 429 and 500:

```json
{ "error": { "code": "not_found", "message": "...", "requestId": "..." } }
```

`code` is one of `bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `internal`.
Quote `requestId` when you ask for support.

## Rate limit

600 requests per minute per token. Over the limit the API answers `429`; wait and retry.

## Idempotency

`cases.create` takes `externalId`, your own key for the case. A second create with the same `externalId` returns the
first case instead of making another, so a retry after a timeout is safe. Send `null` for no key.

## Webhooks

NextUp posts a signed JSON body (`WebhookEnvelope`: `specVersion`, `deliveryId`, `attempt`, `sentAt`, `event`) to your
endpoint. Headers:

- `x-nextup-delivery`: the delivery id (the same across retries).
- `x-nextup-signature`: `t=<unix seconds>,v1=<hex>`. During a secret rotation there are several `v1` values; accept the
  body if any matches.

The signature is HMAC-SHA256, keyed with your webhook secret, over `<t>.<raw body>`, hex-encoded. Verify the **raw**
body before parsing it, compare in constant time, and reject old timestamps (for example older than five minutes).
Answer with a 2xx status once you have stored the delivery; deduplicate on `deliveryId`.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody, header, secret, toleranceSeconds = 300) {
  let t = null;
  const candidates = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") t = Number(value);
    if (key === "v1") candidates.push(value);
  }
  if (!Number.isInteger(t) || candidates.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return candidates.some((hex) => {
    const given = Buffer.from(hex, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
```

## Regenerate `openapi.json`

`docs/api/openapi.json` is generated from the `ApiV1` table in `@nextup/contracts/public`. Do not edit it by hand.
When the contract changes, the test `apps/app/tests/unit/api/openapi.test.ts` fails and prints the expected file;
replace `docs/api/openapi.json` with that output (two-space JSON, final newline) and run the test again.
