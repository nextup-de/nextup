# Plan: raise-page assistant ("ask first, then raise")

> **Plan · 2026-09-24 · built and merged (#70-#73).** Kept for the "Open" list at the end. How it works today: `docs/ASSISTANT.md`.

This is the plan approved on 24 Sep 2026, with the status of each step as built on
`feat/raise-assistant`. How it works today is in `docs/ASSISTANT.md`; this file records what was
decided, what changed on the way, and what is still open.

## Context

Employees bring problems and ideas to the raise page. Until now the page ran `evaluate()`, which is
keyword arithmetic in the browser, and turned every input into a case.

The goal is a fast answer first. An assistant answers from the company's own knowledge: ERP
extracts, vision, goals, departments, roles and routing. If the answer doesn't solve it, one click
turns the conversation into a normal raise.

It has to respect the company's compliance rules and TISAX:

- data stays in the EU
- a ceiling on the information classes it may read
- no personal data or secrets sent to the model
- an audit trail
- a kill switch

## Decisions

| Question | Decision |
|---|---|
| Which model, and where it runs | Claude on AWS Bedrock, eu-central-1 |
| What n8n does | The app calls the model directly and streams the answer. n8n imports knowledge (ERP) and runs follow-up actions |
| Knowledge source | Our own tables (`docs/COMPANY_KNOWLEDGE.md`) plus a documents table |
| Where it sits on the page | The one-line box asks first. "Raise it anyway" turns the conversation into a raise |

## Where

- Worktree `Startup_speed/Nextup-assist`, branch `feat/raise-assistant`.
- Stacked on `feat/company-knowledge-admin` (#67).
- Dev server `nextup-assist` on :3009, database `nextup_assist`.
- Planned as four PRs of about 300 lines each.

## PR 1: assistant core (pure, no I/O)

Status: **done.**

- `src/features/assist/classify.ts`
  - TISAX levels: public < internal < confidential < strictly confidential.
  - `canUse(level, ceiling)`.
  - `ceilingOf()`: the ceiling can never be strictly confidential, and an unknown value falls back to internal (fail closed).
- `redact.ts`
  - Masks email, phone, IBAN, card numbers (Luhn-checked), VINs, API keys, passwords, private keys and the company's own patterns.
  - Replaces the names of known people with their role.
  - Detects classification markers in the text (DE and EN).
- `prompt.ts`
  - Builds the system prompt: fixed guardrails, the classification ceiling, the company's compliance rules, and `companyBrief()`.
  - Deterministic, so the same input always gives the same prompt. `ASSIST_PROMPT_VERSION = "assist-v1"`.
- `tools.ts`
  - Five read-only tools: `list_routes`, `get_role`, `get_goals`, `get_company_profile`, `search_documents`.
  - The tools return roles, never names.
  - Every fact gets a source tag `[S1]`, `[S2]`, … handed out by the tools.
- `check.ts`
  - Masks the answer again.
  - Keeps only tags the tools handed out, and only below the ceiling.
  - Flags an answer with no citation as unsourced.
- `draft.ts`: turns the conversation into a raise title and context.
- `index.ts` (`assist()`): runs the steps in this order:
  1. Redact the question.
  2. Refuse if it is marked above the ceiling.
  3. Run the provider with the tools; tool output is redacted too.
  4. Check the answer.

  While streaming, only finished sentences are shown.
- `mock.ts`: a deterministic provider with no network call.
- Tests: `tests/unit/assist.test.ts`, 17 tests.

## PR 2: server, provider, storage

Status: **done.**

- Dependencies: `@anthropic-ai/bedrock-sdk` and `@anthropic-ai/sdk` (Kevin's call).
- `src/server/assist/provider.ts`
  - `bedrock` uses `AnthropicBedrockMantle` in `LLM_REGION`.
  - It streams, runs the tool loop (up to 4 rounds) and caches the system prompt.
  - It uses low effort.
  - If the model refuses, the answer becomes "raise it".
  - `mock` is used whenever `LLM_*` is unset.
- `features/assist/gate.ts` (**changed from the plan**: its own function, not a field in `policyFor`):

  | Situation | What answers |
  |---|---|
  | demo stage | the configured provider |
  | real stage | only if the admin switch is on |
  | real stage, switch on, no DPA date | mock only |
  | no database, so no audit trail | mock only |

- Schema and migration `20260924180000_raise_assistant`:
  - `Document`, with a generated `tsvector` column and a GIN index.
  - `AssistTurn`, which stores only redacted text.
  - `CompanyConfig` gets `assistant`, `classificationCeiling`, `retentionDays`, `dpaSignedAt` and `redactPatterns`.
  - `CompanyProfile` gets `complianceRules`.
  - Both new tables are added to `TENANT_MODELS`.
- `src/lib/db/assist.ts`
  - `searchDocuments` is raw SQL. It names the company and the allowed classes in the SQL itself, because raw queries bypass the tenant guard.
  - Also: `upsertDocuments`, `recordTurns`, `rateTurn`, `linkRaise`, `purgeAssistTurns`, `assistStats`.
- `POST /api/[company]/assist` streams server-sent events.
  - It uses the session viewer; the body never names a company or a person.
  - Throttles: `assistAsk` is 20 per 10 minutes per person, `assistAskAll` is 600 per 10 minutes per company.
- Retention (**changed from the plan**): the assist route purges each company's old turns, at most once an hour. The planned maintenance endpoint was not built.
- `CLAUDE.md`: the no-outside-requests rule now names the one Bedrock call as an exception.
- Tests: `tests/db/assist.test.ts` covers:
  - tenant isolation
  - the classification ceiling in SQL
  - tsquery sanitising
  - upserts
  - stats
  - retention

## PR 3: raise page UI

Status: **done.**

- `RaiseView.tsx`: Enter and ↑ ask first. If the assistant is off for the company (403 `off`), the page raises directly, as before.
- `AssistAnswer.tsx` shows the answer as it streams, source markers numbered 1…n, source chips with their class badge, and a note on what is stored.
- It offers three buttons:
  - That solved it
  - Ask more
  - Raise it anyway
- `src/lib/use-assist.ts` is the client hook that reads the stream. It lives in `lib/`, not `components/`, because components don't fetch.
- `src/server/actions/assist.ts` holds `rateAssistAction` and `linkAssistRaiseAction`.
- **Changed from the plan**: the case.raised payload does not get `assistSessionId`. The link is `AssistTurn.raisedCaseId`, so no event type changes.
- e2e: `tests/e2e/demo/assist.spec.ts`. The shared `raiseProblem` helper now clicks "Raise it anyway".

## PR 4: n8n and admin

Status: **done, with the ERP node as a placeholder.**

- `POST /api/[company]/knowledge/documents`
  - Bearer token with the `knowledge:write` scope (new; tokens made in `/admin` carry it).
  - Upserts by source and externalId, up to 100 documents per request.
  - A document without a class is stored as confidential; strictly confidential is refused.
- `ops/n8n/erp-knowledge-sync.json`: a nightly workflow (schedule → company → ERP placeholder → map → POST). The setup is in `ops/n8n/README.md`.
- `/admin/knowledge` has an Assistant card:
  - the settings form: switch, ceiling, DPA date, retention, rules, patterns
  - 30-day counts, no per-person view (BetrVG §87)
  - the document list with classes
- `compose.yml` and `.env.example` get `LLM_PROVIDER`, `LLM_REGION`, `LLM_MODEL` and the AWS keys. The misplaced n8n env lines were removed.
- `docs/ASSISTANT.md` covers the data flow, the TISAX controls and how to operate it.

## Verification done

- lint, typecheck, `npm test` (307), database suite (32), Playwright demo suite (all green, including a production build).
- Browser checks on :3009:
  - ask, answer and sources
  - the audit rows contain redacted text only
  - "Raise it anyway" creates the case and links it
  - a blocked question on phone width
  - document import, then an answer citing that document
  - the admin form saves

## External review (GPT feasibility feedback, 24 Sep 2026)

The review was written from the plan without access to the code. Its acceptance criteria all
hold as built. Three points led to changes:
- EU wording: a geographic inference profile can process in any EU region, not only Frankfurt.
- Redaction is risk reduction, not a guarantee.
- The controls support TISAX review; they are not compliance on their own.

All three are now in docs/ASSISTANT.md ("Before a pilot"), the provider comment and .env.example.

## Open

- [ ] Test against a real Bedrock account: exact model / inference-profile ID, EU geographic vs Frankfurt-only routing, the account's retention settings (see "Before a pilot" in docs/ASSISTANT.md).
- [ ] Customer compliance owner signs off before real employee traffic (the controls support TISAX review; they are not TISAX alignment by themselves).
- [ ] Choose the model and effort level. The default is `anthropic.claude-opus-5` at low effort; a cheaper model is Kevin's call.
- [ ] Refusal fallback to a second model (client-side middleware on Bedrock).
- [ ] Point the ERP node in the n8n workflow at the real export.
- [x] Admin: remove single documents (editing stays with the source system and n8n).
- [ ] Embeddings (pgvector) behind `searchDocuments`, if full-text search is not good enough.
- [ ] n8n follow-up actions, run only after the employee confirms.
- [x] Run the database e2e suite (`npm run e2e:db`): 5/5 green.
- [ ] Split into the four stacked PRs.
