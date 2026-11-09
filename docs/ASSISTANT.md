# The raise-page assistant

> **Updated 2026-09-24** · reference: how the raise-page assistant works. The plan it came from: `docs/plans/2026-09-24_raise-assistant.md`.

An employee with a problem or an idea types one line on the raise page. Before anything is raised,
NextUp answers from the company's own knowledge: who handles this, what already exists, which goal
it touches. If that solves it, nothing is raised. If it does not, **Raise it anyway** turns the
conversation into a normal raise, with the question as the title and the answer as context, and the
usual 8-step evaluation runs.

The knowledge comes from the tables in `docs/COMPANY_KNOWLEDGE.md` (units, roles, routing, goals,
profile) plus **documents** that n8n pushes from the ERP and other systems.

## Data flow

```
browser ── POST /api/<company>/assist (same origin, session cookie) ──▶ route handler
                                                                        │
  features/assist  ─ 1 redact question + history (names → roles, secrets/PII → [masks])
                   ─ 2 marked above the ceiling? → refuse, nothing sent
                   ─ 3 provider.run(system prompt, tools)   ◀── the only outside call
                        tools: list_routes · get_role · get_goals · get_company_profile ·
                               search_documents  (read-only, company from the session)
                        tool output redacted again before the model sees it
                   ─ 4 checkAnswer: mask again, keep only citations handed out by the tools
                        and under the ceiling, flag "unsourced"
                                                                        │
◀── server-sent events: finished sentences only, already checked ───────┘
     AssistTurn rows: redacted question + answer, sources, counts of what was masked

n8n ── POST /api/<company>/knowledge/documents (Bearer, knowledge:write) ──▶ Document (tsvector)
```

- **Provider** (`src/server/assist/provider.ts`): `bedrock` is Claude on Amazon Bedrock through the
  `AnthropicBedrockMantle` client in `LLM_REGION` (default `eu-central-1`). `mock` has no model. It
  strings the tool results into an answer, and it is what demo, e2e and local dev use. The mock is
  chosen whenever `LLM_PROVIDER`/`LLM_MODEL` are unset.
- **Gate** (`features/assist/gate.ts`), which fails closed:

  | Situation | What answers |
  |---|---|
  | demo stage | configured provider |
  | real stage, assistant switched off | nobody (the page raises directly, as before) |
  | real stage, on, no DPA date | mock only, no model call |
  | real stage, on, DPA date recorded | configured provider |
  | no database (no audit trail) | mock only |

- **Streaming** shows only finished sentences, each already through `checkAnswer`, so a
  half-streamed name or number is never on screen.

## TISAX / compliance controls

These controls **support** a customer's security and privacy review; they do not make the feature
TISAX-compliant by themselves, and using Bedrock is not proof of any retention setting. Before real
employee traffic, the customer's compliance owner signs off purpose, data categories, access,
retention, sub-processors and incident handling (see *Before a pilot*).

| Control | Where |
|---|---|
| Information classification (public · internal · confidential · strictly confidential) | `features/assist/classify.ts`. Every document carries one; a document without a label is stored as confidential |
| Ceiling on what the assistant may read (default internal; strictly confidential never) | `CompanyConfig.classificationCeiling`, enforced in SQL (`searchDocuments`) **and** again in the tool |
| Questions marked "streng vertraulich" / "confidential" above the ceiling are not sent | `redact.ts markerOf` + `assist()` |
| Data minimisation: known names, personal data and secrets are masked before the model | `redact.ts`: names become roles; email, phone, IBAN, card, VIN, keys and passwords are masked; company patterns come from `redactPatterns`. **Risk reduction, not a guarantee**: pattern matching misses free-text context ("the colleague who was off sick in May"). If a customer needs a guarantee, the assistant stays off for them |
| EU processing | Bedrock called in `eu-central-1`. With an EU geographic inference profile the request can be served by other EU regions; Frankfurt-only needs a single-region model. The browser never talks to a third party (CSP `connect-src 'self'` unchanged) |
| Company rules | `CompanyProfile.complianceRules`, put into the system prompt after the fixed guardrails |
| No decisions about people | Guardrails in `prompt.ts`. The assistant points to roles; it proposes, never decides |
| Audit trail | `AssistTurn`: redacted text, cited sources, masked-item counts, model, prompt version, tokens, latency |
| Retention | `CompanyConfig.retentionDays` (default 90). The assist route purges hourly per company |
| Kill switch | `/admin/knowledge` → Assistant → Off |
| Works council (BetrVG §87) | Admin sees counts only (answers, solved, raised anyway, unsourced, blocked). There is no per-person view |
| Abuse / cost | Throttles `assistAsk` (20 per 10 min per person) and `assistAskAll` (600 per 10 min per company) |

For the customer's records: the processing record names AWS (Bedrock, EU regions per the chosen routing) as sub-processor
for redacted question text and knowledge snippets. The DPA date in `/admin` is the switch that
allows model calls for real people.

## Operating it

- **Turn on** in `/admin/knowledge` → Assistant: On, ceiling, DPA date, rules, extra patterns.
- **Model**: set `LLM_PROVIDER=bedrock`, `LLM_MODEL` (default `anthropic.claude-opus-5`),
  `LLM_REGION`, and AWS credentials in the stack's `.env`. Enable the model in the AWS account's
  Bedrock console for that region first.
- **Documents**: `ops/n8n/erp-knowledge-sync.json`, described in `ops/n8n/README.md`. Tokens made in `/admin` carry
  `knowledge:write`.
- **Prompt changes**: bump `ASSIST_PROMPT_VERSION`. It is stored on every turn.

## Before a pilot

In order: mock provider → a sandbox company on a controlled Bedrock test → a customer pilot.

- [ ] Bedrock account: model enabled, **exact model / inference-profile ID** in `LLM_MODEL`, EU
      geographic vs single-region routing agreed with the customer.
- [ ] Bedrock data retention and logging settings of that AWS account checked and written down.
- [ ] Customer compliance owner has approved the processing (purpose, data categories, access,
      retention, sub-processor AWS, incidents); DPA date recorded in `/admin`.
- [ ] Audit rows reviewed on the sandbox: redacted text only, blocked turns recorded without the original.

## Not done yet

- Embeddings (pgvector). Search is Postgres full-text (`simple` config). `searchDocuments` is the one place to
  change.
- Editing a single document in `/admin`. Removing one works (`/admin/knowledge` → Documents →
  Remove); n8n re-adds it on its next run if the source still has it.
- n8n follow-up actions (e.g. open an ERP ticket) after the employee confirms. The model never
  triggers n8n itself.
- Refusal fallback to a second model. A refusal today ends the answer with "raise it".

## The AI choice per company

Each company picks its own provider in `/admin` (its Integration row with system `ai`, `features/ai/settings.ts`):
`off`, `bedrock`, `azure-openai` or `openai-compatible`. Demo companies without a row use the mock. The API key
of azure-openai and openai-compatible is sealed with the vault and bound to the company; it leaves the vault only
to be sent to the brain with one request (`lib/db/ai.ts`, `server/brain.ts llmFor`).

### The gate

One pure, fail-closed function decides every model call: `aiGate` in `features/ai/gate.ts`. `assistGate` is a thin
wrapper over it for the assistant.

| Situation | Answer |
|---|---|
| no database | mock only, and only in a demo stage |
| demo stage | on, with the settings |
| real stage, choice off | off |
| real stage, any choice other than mock, no `dpaSignedAt` | off ("waits for the data-processing agreement") |
| purpose `assist`, `CompanyConfig.assistant` off | off |
| purpose `routing`, `CompanyConfig.aiRouting` off | off |

Every "no" carries a `why` in plain words. With the gate closed no request leaves, not to the brain and not to the model.

The idea studio calls the gate with purpose `coach` (`api/[company]/ideas/turn`). Like `brain` and `coach`, that
purpose has no switch of its own in the gate, so a real stage needs the choice not off and the agreement on record. The
route adds two conditions before the brain reads or coaches: the stack has a brain (`BRAIN_URL`, `BRAIN_API_KEY`), and the
stage is a demo stage or the viewer's company has the assistant switched on (`CompanyConfig.assistant`).

### The proposal at raise

At `case.raised`, `appendEventAction` replaces whatever proposal the browser sent with `proposeOnRaise`
(`server/routing.ts`): the brain's proposal when the gate (purpose `routing`) holds and the brain answers within
`BRAIN_RAISE_TIMEOUT_MS` (default 8000), else the keyword proposal (`source: "keywords"`, `ROUTER_VERSION`). The
route the person chose is never changed. The AI being off therefore never stops a raise (HD7).

### The idea studio's reading and coach

On every message in the idea studio (`api/[company]/ideas/turn`, docs/IDEAS.md) the brain makes up to two calls, each
through `llmFor` and the gate above: **`read`** (`POST /v1/read`, `askBrainRead` in `server/brain.ts`) and, when that
answered, **`coach`** (`POST /v1/coach`, `askBrainCoach`). Each waits `BRAIN_TIMEOUT_MS` (default 30000) and an error or no
answer is not retried by the app; the studio then falls back as described in docs/IDEAS.md. What the employee wrote
goes out only redacted: the idea's title and body, the author's "not sure" questions (read) or the turns of the
conversation, the coach's own included (coach), go through `redact` with the company's patterns, and nothing goes out
when any of it is marked above the company's classification ceiling. The titles of the earlier cases and known problems
and the company's goals (names only) are redacted the same way, and one marked above the ceiling stays out of the request. So are the
words of a reading going back out: the previous reading's dials (read) and the reading the coach works from (coach). One above the ceiling
is left out of the read call and stops the coach call. Beside that the calls carry company data that is not run through the redaction: the
company's name and its routing rows (owner's role and department, never a name); the read call adds the counts of people marked as
affected and files attached, and the spend limit a team decides alone. The answer is stored on the coach's turn as `IdeaTurn.reading` (docs/DATA_MODEL.md). Unlike the assistant,
neither call writes an `AssistTurn`; each answered call is an `AiCall` (below).

### The brain's endpoint

`BRAIN_URL` (a service name inside the company's stack) and `BRAIN_API_KEY` are the stack's. The brain answers on the
company's own provider: `llmFor` (`server/brain.ts`) puts one `llm` object in the request body.

| Choice | `llm` in the body |
|---|---|
| `bedrock` with a `brainModel` | `{ provider: "bedrock", region, model: brainModel }`, no key; the brain's AWS credentials sign |
| `bedrock` without one | none: the brain uses its stack model |
| `azure-openai` | `{ provider: "azure-openai", base_url, model: brainModel or deployment, api_key }` |
| `openai-compatible` | `{ base_url, model: brainModel or model, api_key }` |

`brainModel` is optional, in the settings JSON. Incomplete settings (no key, no endpoint, no model or deployment) send
nothing. The shapes are pinned by one fixture, `services/brain/tests/fixtures/llm-overrides.json`: the app's test
(`tests/unit/aib/llm-contract.test.ts`) checks that `llmFor` gives exactly it and the brain's test
(`services/brain/tests/test_llm_contract.py`) that its request models accept it.

Each answered call is stored as an `AiCall` (purpose - `routing`, `read`, `coach`, `plan`, `checkin` or `context` -, model,
token counts, latency; no person, no case, no text) and counted in `aiUsage` (see `docs/METRICS.md`).

### Acceptance

`apps/app/tests/db/ai-provider.test.ts` runs the three cases against a real database with a fake
OpenAI-compatible model and a fake brain that forwards to it: choice off gives the keyword proposal and zero
requests; openai-compatible with a DPA and `aiRouting` stores `source: "llm"`, route r2; the same company
without a DPA sends nothing and the gate says why.

`apps/app/tests/db/aib-provider.test.ts` runs a raise through `proposeOnRaise` against a fake brain that records the
bodies it gets and answers with tokens: bedrock and azure-openai companies with a signed agreement send their override
and store the brain's proposal and an `AiCall`; choice off and a missing agreement send nothing and route by keywords; a
brain slower than the timeout gives the keyword proposal in time. No real model is called.

## AIP gaps

Register rows of `docs/audit/gaps` whose phase is AIP:

| Gap | What | Answered by |
|---|---|---|
| G-035 | Routing proposal made in the browser | AIP-C1: the server makes it at raise (`server/routing.ts`); proved by AIP-Z1 |
| G-036 | Idea coach skips the DPA gate | AIP-B1: brain calls, coach included, go through `aiGate` (#318) |
| G-037 | Eval set too small, too little German | #321: an 84-case routing eval, a third German |
| G-038 | Brain eval not in CI | #321: runs in CI with a threshold |
| G-236 | Bedrock off everywhere, no AWS account attached | open: needs an AWS account on a stack, which is hosting, not code |
| G-237 | No AI gateway for keys, quotas, logging | open: the per-company choice and sealed keys exist, but quotas and request logging in front of providers do not |
