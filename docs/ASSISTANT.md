# The raise-page assistant

> **Updated 2026-09-24, provider and gate sections 2026-11-04, monthly budget and prices 2026-11-10** · reference: how the raise-page assistant works. Live on Musterwerk: Azure OpenAI (gpt-4.1-mini, Sweden Central) with a signed data-processing agreement; Bedrock is built but not measured. The plan it came from: `docs/plans/2026-09-24_raise-assistant.md`.

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
| Abuse / cost | Throttles `assistAsk` (20 per 10 min per person) and `assistAskAll` (600 per 10 min per company); a monthly budget per company closes the gate when it is used up (see "The monthly budget") |

For the customer's records: the processing record names AWS (Bedrock, EU regions per the chosen routing) as sub-processor
for redacted question text and knowledge snippets, and for the redacted whole text of short company documents (see
Documents below). The DPA date in `/admin` is the switch that
allows model calls for real people.

## Operating it

- **Turn on** in `/admin/knowledge` → Assistant: On, ceiling, DPA date, rules, extra patterns.
- **Budget**: `/admin/assistant` → "AI budget per month (EUR)", 50 by default, and "Token limit per month for models
  without a price", 20 million by default. The page shows what the month has cost and warns from 70 %; the console
  admins also get a mail at 70, 90, 100 and 120 % (see "The monthly budget").
- **Prices**: `/admin/connectors` → AI provider → "Prices per model", one line per model: name, EUR per million input
  tokens, EUR per million output tokens. The form lists the models called this month that have no price yet.
- **Model**: set `LLM_PROVIDER=bedrock`, `LLM_MODEL` (default `anthropic.claude-opus-5`),
  `LLM_REGION`, and AWS credentials in the stack's `.env`. Enable the model in the AWS account's
  Bedrock console for that region first.
- **Documents**: `ops/n8n/erp-knowledge-sync.json`, described in `ops/n8n/README.md`. Tokens made in `/admin` carry
  `knowledge:write`. A company document of at most 4,000 characters reaches the model whole (redacted, up to 8,000
  characters per search, `WHOLE_DOC_CHARS` and `WHOLE_TEXT_BUDGET` in `features/assist/tools.ts`), unless its text is
  marked above the ceiling; longer ones and Microsoft 365 files as a short excerpt. Nothing of it is stored.
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
| any stage with a database, the month's budget or the token limit of models without a price used up (for the raise path, `assist`, `routing` and `coach`: 120 % of it), unless the assistant is answered by the mock (choice mock, or off in the demo stage) or the choice is off outside the demo stage |  off ("This month's AI budget for this company is used up.") |

Every "no" carries a `why` in plain words. With the gate closed no request leaves, not to the brain and not to the model.

The idea studio calls the gate with purpose `coach` (`api/[company]/ideas/turn`). Like `brain` and `coach`, that
purpose has no switch of its own in the gate, so a real stage needs the choice not off and the agreement on record. The
route adds two conditions before the brain reads or coaches: the stack has a brain (`BRAIN_URL`, `BRAIN_API_KEY`), and the
stage is a demo stage or the viewer's company has the assistant switched on (`CompanyConfig.assistant`).

### The monthly budget

Each company has a budget for model calls per calendar month (decision Q7.3 of 10 Nov 2026):
`CompanyConfig.aiMonthlyCapEur`, whole euros, 50 when the column is empty (`DEFAULT_MONTHLY_CAP_EUR` in
`features/ai/budget.ts`). The console admin sets it on `/admin/assistant`; the change is audited with the other
assistant settings. 0 stops every model call.

Before a model call the caller loads the budget (`loadAiBudget` in `lib/db/ai-usage.ts`) and hands it to the gate:
the cap, and the estimated cost of the company's assistant turns (`AssistTurn`) and brain calls (`AiCall`) since the
first of the month (UTC). Once the cost reaches the cap the gate answers off in every stage, the demo stage included,
because a real model costs the same there: at 100 % for `brain` (first steps, the check-in draft, the context draft),
at 120 % (`GRACE_PCT`) for the raise path, so ideas can still be raised with AI help past the cap (decision Q7.4 of
10 Nov 2026). The raise path is `RAISE_PATH_PURPOSES` in `features/ai/budget.ts`: `routing` (the proposal at the raise
step), `assist` (the raise page's assistant) and `coach` (the idea studio). The token limit of models without a price
works the same way. The callers then do what they do for any closed gate: the assistant says why, a raise is routed by keywords, the idea studio scores by rules, first steps and the
check-in draft fall back to the page's own suggestion, the context draft does not run. The mock assistant is never
stopped, it costs nothing; but with the mock chosen (or, in the demo stage, the AI off) the brain's purposes (`routing`, `coach`, `brain`) still call the
brain's own model and are capped like any other, so a cap of 0 stops them too. On the first of the next month the sum
starts at zero; raising the cap opens the gate at once.

The form always shows a cap, the default when none is stored. Saving the default unchanged keeps the column empty, so
a company that never chose a cap follows the default if it changes, and a save of another setting audits no budget
change.

`/admin/assistant` shows "AI budget this month: spent of cap (share)" and a banner from 70 % and from 90 % of the cap,
and an error banner from 100 % ("AI paused; ideas can still be raised with AI help up to 120 %") and from 120 % ("All
AI paused until" the 1st of next month) (`budgetLevel`, `tokenLevel`, `monthLevel`).

When the month first reaches 70, 90, 100 or 120 % of a cap, the company's console admins get one mail (decision Q7.6,
template `ai.budget`, docs/NOTIFICATIONS.md): the level, spent against the cap, what pauses, and a link to
`/admin/assistant`. Recipients are the active users with `isStackAdmin` and a mail address; a company without one
mails its active managers. It is checked after each `AiCall` is written (`recordAiCall` in `lib/db/ai-usage.ts` runs
`warnAiBudget` in `server/notify/ai-budget.ts`); neither is awaited, so the request that made the call does not wait
for it. The outbox key `ai.budget:<companyId>:<YYYY-MM>:<level>` stops a second mail for the level in the month,
also after the cap was raised and crossed again. A month that jumps past a level in one call gets the mail of the level
it stands at. The euro budget and the token limit share the four levels: whichever is further used names the level.
A demo company gets no mail (its people are ours); a sandbox's rows are written as `skipped`. Not built: the ntfy line to NextUp support that Q7.6 also names. The app sends nothing to ntfy; the health report to
admin.sellux.ch does not carry the budget yet (a follow-up for nextup-admin).

#### Prices per model, and a token limit for the rest

How a usage row is priced (decision Q7.5, `spendOf` in `features/ai/budget.ts`):

1. **The company's own price**, typed on `/admin/connectors` → AI provider → "Prices per model" and stored in the AI
   settings (`settings.prices` of the Integration row `ai`, `features/ai/prices.ts`), in euros per million input and
   output tokens. It wins over the list price, because it is what the company pays. A price of 0 makes a model free
   (a model on the company's own server), which is not the same as no price.
2. Else **the built-in list price** (`features/ai/usage.ts`, Claude models only), in US dollars counted one dollar as
   one euro (`EUR_PER_USD`).
3. Else the model has **no price**: its input and output tokens are summed, and the gate closes when they reach the
   company's token limit, `CompanyConfig.aiMonthlyTokenCap` (20 million when empty, `DEFAULT_MONTHLY_TOKEN_CAP`). The
   limit is set on `/admin/assistant` next to the euro budget, with the same rules: the default saved back unchanged
   keeps the column empty, and the change is audited. Only tokens of a model without a price count, so a limit of 0
   lets the first such call through and stops the next. When it closes, it closes for every call of the company, as
   the euro budget does; a price for the model, or a higher limit, opens it again at once.

The name a price is typed under is the one **the model reports**, which is what the usage rows carry: on Azure the
model version (`gpt-4.1-mini-2025-04-14`), not the deployment name. A typed name covers every recorded name that
contains it, so `gpt-4.1-mini` prices the dated versions too; where two typed names fit, the longer one wins. Names
are lower case and may hold any character but a space (paths such as `/models/mistral-nemo`, tags, ARNs). An amount
takes a decimal point or comma and up to four decimals; "1.000" or "1,000" is refused, because it reads as a thousand
to some and as one to others. The connectors form lists the models called this month that have no price yet, and `/admin/assistant`
shows their tokens against the limit with a link to it. Prices are not secret and are audited with the AI choice
(`audit.connector.saved`). The settings JSON is written whole, so the prices must be typed on that form; a save
without them removes them. Changing a price re-prices the whole month at once.

What the number is, and is not:

- An estimate: list prices, or the prices the company typed.
- Only answered calls are stored. A call the app gave up on after its timeout may still have been billed by the
  provider, so the sum reads low. The idea studio's own model answer (when the brain gave none) is stored as an
  `AiCall` with purpose `coach`, because the idea turn keeps no tokens.
- Assistant turns are deleted by retention (7 days at the least) and when a person is pseudonymised, so each answer is
  also stored as an `AiCall` with purpose `assist` (no person, no text, never purged), stamped with the time the call
  started. The sum takes the turns only up to the company's first such call and the calls from then on, so nothing
  is counted twice and nothing deleted is lost. Answers before this release exist only as turns and still shrink with
  retention until the month they fall in has passed.
- The raise path's grace to 120 % (Q7.4) and the warning mails (Q7.6) are built; the ntfy line to NextUp support is
  not (see above). Q7.4 also names the agent (daily run, ask box, planning run) as what pauses at 100 %; there is no
  agent yet, so today `brain` is what pauses.

- A call whose provider reports no token counts is stored with 0 tokens and counts neither in euros nor against the
  token limit (some OpenAI-compatible servers when streaming, an old brain image). A row whose model name is empty
  counts as free.

Proof: `apps/app/tests/unit/aip/budget.test.ts` (cap, month, levels, the gate), `apps/app/tests/unit/aip/prices.test.ts`
(the form's lines, which price a recorded name gets, the spend with company prices, the token limit and its levels),
`apps/app/tests/db/aib-budget.test.ts` (the sum from stored calls, last month and other companies left out, a stored
price and token limit, a raise at the cap still asking the brain and one at 120 % routed by keywords),
`apps/app/tests/unit/aip/budget-grace.test.ts` (each purpose at 99, 100, 119 and 120 % of either cap, the mail's
levels, key, text and gate), `apps/app/tests/db/aib-budget-mail.test.ts` (one row per level and month, none for a
second crossing, the recipients, sandbox and demo) and `apps/app/tests/db/itc-connectors.test.ts` (prices saved,
refused by line, shown back).

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

Each answered call is stored as an `AiCall` (purpose - `routing`, `read`, `coach`, `plan`, `checkin`, `context`, or
`assist` for each answer of the raise-page assistant beside its `AssistTurn` -, model,
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
| G-237 | No AI gateway for keys, quotas, logging | open: the per-company choice, sealed keys and a monthly budget per company in the gate, with a price per model and a token limit for models without one, exist; request logging in front of providers does not |
