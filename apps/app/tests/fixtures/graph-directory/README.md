# Graph directory fixtures

Recorded-shape pages of `GET /v1.0/users/delta` for a made-up tenant (`11111111-2222-4333-8444-555555555555`,
contoso-fixture). No real person, no real address, no real token (plan DIR, D14). Tests inject `fetch` and serve
these; nothing here is ever fetched live.

- `token.json`: the client-credentials token response (`access_token` is a placeholder).
- `full-1.json`, `full-2.json`: a full round. Page 1 ends in `@odata.nextLink`, page 2 in `@odata.deltaLink`.
  Five users: one with an `employeeId` (Mira), one with a `manager` (Noel), one disabled (Quin), one without
  `mail` (Olga, so her address is the userPrincipalName), and Pia.
- `delta.json`: the next round, from the stored deltaLink: one moved user (Pia, Finance to Engineering, now under
  Mira), one `@removed` (Olga) and one new user (Rune).

To re-record against a test tenant, call the delta URL of `src/server/directory/graph.ts` with an app-only token and
replace names, ids, addresses and tokens with made-up ones before committing.
