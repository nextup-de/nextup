# n8n workflows

Exported as JSON and committed, because otherwise n8n is untracked state nobody can reproduce
(`docs/INTEGRATIONS.md`). One self-hosted instance serves every company; workflows read the
company from the payload.

## Case notices are no longer here

Until 23 Sep 2026 `case-raised-notify-owner.json` emailed the route owner when a case was raised:
the app POSTed a webhook, n8n sent the mail, then wrote *"Route owner notified by email."* back
through the events API. That took three credentials made by hand in the n8n UI, a callback address
that differed per environment, and a failure anywhere in the chain looked the same from `/admin`.

The app now does it itself (`src/server/case-notice.ts`): it sends the mail through `SMTP_URL` and
writes the same note onto the case, with the same idempotency key `notify:<raiseId>`. Notes the
old workflow wrote still count as answered on `/admin` → Connections. If the workflow is still
imported in your instance, deactivate or delete it - nothing calls it any more.

## What n8n is still for

Anything that happens later rather than while someone waits: deadline → deputy, digests,
connectors. A workflow reads and writes the app through the two endpoints in
`docs/INTEGRATIONS.md`:

```
GET  /api/<slug>/events?since=<cursor>   read the event log
POST /api/<slug>/events                  append case.commented / case.handed as system:n8n
```

Both take `Authorization: Bearer <token>`. Issue one per company in `/admin` → Companies → **API
token**, and store it in n8n as a Header Auth credential named `<slug>-nextup`. A token used
against another company answers 403, by design. Send an `Idempotency-Key` header on every POST so
a re-run answers `200 {"duplicate": true}` and writes no second row.

## Importing and exporting

Open n8n at `n8n.<domain>` (behind the ops login from `OPS_USER` / `OPS_PASSWORD_HASH`) or on the
published port. The first visit asks you to create the owner account - do it right after the first
deploy; that account is yours and lives only in the `n8ndata` volume.

`./ops/n8n` is mounted read-only at `/data/workflows`, so a `git pull` is enough to update it.

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/<name>.json
docker compose exec n8n n8n export:workflow --id=<id> --pretty --output=/data/workflows/out.json
```

An imported workflow is inactive, and an inactive workflow's production webhook answers **404**.
Activate it in the UI, or with `n8n update:workflow --id=<id> --active=true` followed by
`docker compose restart n8n`.

**Strip credential ids and data before committing.** gitleaks runs on every PR, and n8n exports
carry a `credentials` block on every node - attach credentials by hand after importing.

## `connection-test.json`

Run it first on every new n8n, before any real workflow. It asks the company's event log for five
events and says PASS (200) or FAIL with the app's error. It only reads, so it is safe on any stack.

1. Set `slug` and `apiBase` in *Which company*: `https://<slug>.sellux.ch` from
   automation.sellux.ch, `http://app:3000` from the n8n inside that company's stack.
2. Attach the `<slug>-nextup` credential to *Read events*, then **Execute workflow**.

| Status | Cause |
|---|---|
| 401 | Token wrong, expired, or the value lacks the `Bearer ` prefix |
| 403 | Token belongs to another company, or lacks `events:read` |
| 503 | The app has no database configured |
| *Read events* turns red | n8n can't reach `apiBase` (timeout, DNS, certificate) |

First run, 28 Sep 2026: automation.sellux.ch → acme answered 200.

## `events-pull.json`

The starting point for any workflow that reacts to what happens in a company. It **polls**; the app
never pushes. Every minute it asks `GET /api/<slug>/events?since=<cursor>`, remembers the cursor in
the workflow's own static data, and emits **one item per new event**, oldest first, split by type.
A Webhook trigger would need a hole in the login page in front of automation.sellux.ch
(`stack/nginx/RUNBOOK.md`) and code in the app that does not exist; a poll needs neither.

Each item looks like this - `target` is the case id, `payload` is what the event type carries
(`src/features/cases/events.ts`):

```json
{ "slug": "acme", "apiBase": "https://acme.sellux.ch",
  "seq": 4711, "id": "e_…", "when": "2026-09-29T09:12:03.000Z", "day": 3,
  "type": "case.raised", "actor": "u_…", "target": "c_…", "payload": { "title": "…" } }
```

To build on it:

1. Import it, open *Which company*, set `slug` and `apiBase`. One copy per company.
2. Attach the `<slug>-nextup` credential to *Read events* (and to the write-back node if you use it).
3. Add an output to *By event type* for each type you need, and hang your nodes off it. *Build from
   here* is a placeholder on the `case.raised` branch - replace it.
4. **Activate** the workflow. Static data - and with it the cursor - is only kept for an active
   workflow; a manual *Execute workflow* always reads from `since=0`, which is fine for looking at
   the shape of the data (the read is side-effect free).

Two things to know:

- The cursor advances when *One item per event* runs. If a node after it fails, those events are not
  delivered a second time: set *Retry On Fail* on nodes that talk to the outside, or an Error Workflow.
- *Write a note back (example)* is disabled. It shows the only way a workflow may change a case:
  `POST /api/<slug>/events` with `case.commented { text }` or `case.handed { to, why? }`, an
  `Idempotency-Key`, and the token's `events:write` scope. The note appears on the case timeline as
  `system:n8n`. Nothing else is accepted, and `case.decided` never will be.

### Links for building on automation.sellux.ch

| What | Where |
|---|---|
| n8n editor | `https://automation.sellux.ch` - first the NextUp login page (user `nextup`, password from Kevin), then your own n8n account |
| Test company | `https://acme.sellux.ch` - demo data, safe to write notes to |
| Read the log by hand | `https://acme.sellux.ch/api/acme/events?since=0&limit=20` with `Authorization: Bearer <token>` |
| Write back | `POST https://acme.sellux.ch/api/acme/events` - body and headers as in the disabled example node |
| Token | `https://acme.sellux.ch/admin` → Companies → **API token** (Kevin issues it; scopes `events:read`, `events:write`). Store it in n8n as a Header Auth credential named `acme-nextup`, header `Authorization`, value `Bearer <token>` |
| Contract | `docs/INTEGRATIONS.md` in this repo; the validation rules are in `src/features/integrations/index.ts` |
| Workflows to import | `ops/n8n/connection-test.json` (run first), `ops/n8n/events-pull.json` (build on it), `ops/n8n/erp-knowledge-sync.json` |

Run `connection-test.json` before anything else: a 200 there means the URL, the token and the scope
are right, and every other failure is in the workflow itself.

## `erp-knowledge-sync.json`

Feeds the raise-page assistant (`docs/ASSISTANT.md`). Nightly: read the customer's ERP export, map
each record to `{source, externalId, title, body, classification}`, and `POST` the batch (≤ 100) to
`/api/<slug>/knowledge/documents` with the `<slug>-nextup` credential. The token needs the
`knowledge:write` scope; tokens made in `/admin` include it (older ones do not - make a new one).

- **The ERP node is a placeholder.** Point it at the real export (SAP OData, a database node, a
  file share) with a `<slug>-erp` credential. Export process and master-data texts, not personal data.
- **Label every record.** Without `classification` the app stores it as `confidential`, which the
  assistant cannot read under the default ceiling. `strictly_confidential` is refused outright.
- **Re-running is safe.** Documents upsert by `(source, externalId)`.
- The app answers the assistant itself; n8n never sees a question or an answer.
