# services/brain — the routing AI

One question, asked when an idea or problem is raised: **which routing row owns this, and was it
raised before?** The app's keyword router (`features/routing`, `keywords-v1`) answers it by
counting words; the brain answers it with a language model. The app keeps the keyword answer as
the fallback, so the brain being off, slow or wrong never stops a raise.

```
app (server side) ── POST /v1/route, X-API-Key ──▶ brain ── /v1/chat/completions ──▶ ollama (or vLLM)
   routing rows (type + owner's role)                 one call, JSON schema,        in the same stack,
   earlier items (id, title, status)                  validated, 2 retries          no ports
   the idea (title, body)
◀── { route_id, confidence, reason, same_as, related, model, version } ──┘
```

- **Stateless.** The app sends the company's rows and earlier items with every request. The brain
  stores nothing, knows no company and needs no database or index.
- **Roles, not people.** A row's owner goes out as a role and department ("Quality lead,
  Quality"), never a name. The brain proposes a row; people decide (the app's rule, §11.2).
- **Offline.** Any OpenAI-compatible server (`LLM_BASE_URL`, `LLM_MODEL`). In a stack that is the
  `ollama` service next to it: it pulls the model once on first start and then works without the
  internet. No telemetry. Idea text is never logged (`LOG_CONTENT=false`).
- **Not reachable from outside.** No published port; only the app, by service name, with
  `BRAIN_API_KEY`.

It came out of a standalone prototype (people-level routing for a fictional company, a grilling
coach). What is here is the part the app needs today: the routing and duplicate check against the
app's own rows. The coach is a later step, inside the app's existing coach.

## API

`POST /v1/route` (header `X-API-Key`)

```json
{
  "company": "Acme Maschinenbau GmbH",
  "idea": { "title": "Gauge on station 7 reads 0.02 off", "body": "Parts get scrapped." },
  "routes": [{ "id": "r3", "type": "Quality data, measurements, tolerances", "owner": "Quality lead, Quality" }],
  "known": [{ "id": "c4", "title": "Tolerance drift on station 7", "status": "open" }]
}
```

```json
{ "route_id": "r3", "confidence": 90, "reason": "…", "same_as": "c4", "related": null,
  "model": "mistral-nemo", "version": "brain-route-v1", "ms": 8400 }
```

`route_id` is `null` when no row covers it. `version` goes into the stored proposal
(`case.raised` → `proposal.version`), so `/admin/decisions` can compare it with `keywords-v1`.
Limits: 50 rows, 80 earlier items. A company with hundreds of earlier items needs a shortlist in
front of the model — `brain/route.py` is the one place for it.

`GET /health` — `ok` when the model server answers and has the model. No key needed.

## Run it on a laptop

```bash
cd services/brain
uv sync
ollama pull mistral-nemo                   # ~7 GB, once
uv run uvicorn brain.main:app --port 8000
uv run pytest                              # mocked model, no Ollama needed
```

Settings come from the environment or a `.env` in this folder (never committed):

| Variable | Default | |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | any OpenAI-compatible server |
| `LLM_MODEL` | `mistral-nemo` | |
| `LLM_TIMEOUT` / `LLM_MAX_RETRIES` | `120` / `2` | retries are for invalid JSON |
| `API_KEY` | empty | when set, `/v1/route` needs header `X-API-Key` |
| `LOG_CONTENT` | `false` | `true` logs idea titles — laptop only |

## Eval

```bash
uv run python -m eval.run_eval
```

32 test ideas written like people write them (short, vague, some German), each with the right
row and the earlier item it repeats, against `eval/acme.json` — a snapshot of the demo company's
rows and items from `apps/app/src/features/demo/seed.ts`. It prints routing accuracy next to the
keyword router's on the same ideas, duplicate accuracy, invalid-JSON retries and seconds per idea,
and saves the run in `eval/results/`. Rerun it after every prompt change and bump
`PROMPT_VERSION` in `brain/route.py`.

## In a stack

```bash
stack/push-images.sh hetzner --build --brain          # from a laptop with Docker
# on the server, for an existing instance:
NEXTUP_INSTANCES=~/nextup/instances stack/install.sh --slug acme --origin https://acme.sellux.ch --brain
stack/ctl.sh acme logs -f ollama                      # first start: watch the model download
```

`--brain` adds `BRAIN_URL`, a fresh `BRAIN_API_KEY`, `BRAIN_MODEL` and the `brain` profile to the
instance's `.env`, once. Change the model with `BRAIN_MODEL` there; point `BRAIN_LLM_URL` at a GPU
server running vLLM or Ollama to use that instead of the stack's own `ollama`.

**Sizing.** `mistral-nemo` (12B) needs about 8 GB of RAM in the `ollama` container. On a CPU-only
server expect tens of seconds per idea; the app waits a bounded time and falls back to the keyword
router. A GPU server brings it to a second or two.
