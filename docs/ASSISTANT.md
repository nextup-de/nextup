# The raise-page assistant

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
  chosen whenever `LLM_PROVIDER`/`LLM_MODEL` are unset. `anthropic` (`LLM_PROVIDER=anthropic` +
  `ANTHROPIC_API_KEY`) calls the Anthropic API directly, which processes in the US - so the gate
  allows it for demo-stage companies (made-up data) only; real companies get the mock instead.
- **Gate** (`features/assist/gate.ts`), which fails closed:

  | Situation | What answers |
  |---|---|
  | demo stage | configured provider (bedrock, anthropic or mock) |
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

## Demo data

`src/features/demo/knowledge.ts` is Acme's made-up company knowledge beyond the org chart: profile
and vision, compliance rules, KPIs and targets for the goals, decision rights and spending limits
per role, and 12 documents an ERP import would bring (ordering, spare parts, rig booking,
changeover, tolerances, IT onboarding, overtime, safety, change notes, facilities, goals - and one
confidential supplier price list the assistant must never cite). `npm run db:seed` writes it all
into the database; without a database the assist route searches the same documents in memory.
Only demo-stage companies ever get these facts.

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
