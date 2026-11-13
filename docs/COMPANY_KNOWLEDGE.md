# Company knowledge

> **Updated 2026-11-05** · reference + plan: the tables are built, the later sections are still a plan.

How NextUp stores what a company *is* (vision, structure, who decides what, goals, its public
papers) so that people can edit it and an AI can read it, cite it and never leak it to another
company. The first part (the tables) is built; the rest is the plan.

## Rules this follows

- **Roles, not people.** Hierarchy, decision rights and skills belong to `OrgRole`. A person is
  only an `OrgRoleHolder` name. The model is handed the structure without names
  (`INTEGRATIONS.md`: "the model sees roles, not names"). Per-person profiles such as skills,
  talent or motivation are out of scope because of BetrVG §87(1) Nr. 6 and GDPR
  (`CONCEPT_CHECK_SEP13.md` §4).
- **Small input.** About 15 routing rows, a handful of goals and a short profile, filled in by a
  department head. No mailbox import and no full company map.
- **AI proposes, never decides.** Whatever the model reads, it answers with a proposal plus its
  sources, and the answer is logged as an event.

## Three layers, one Postgres

| Layer | What | Where | Status |
|---|---|---|---|
| 1. Structured facts | profile, org units, roles and holders, routing table, goals | `CompanyProfile`, `OrgUnit`, `OrgRole`, `OrgRoleHolder`, `RoutingRule`, `Goal` | **built** |
| 2. Documents | public business papers, strategy PDFs, policies | `Document` plus `DocumentChunk` with a pgvector embedding | planned |
| 3. AI access | a cached company brief plus server-side tools | `companyBrief` in `src/features/knowledge` (built); `src/features/ai/` | brief built, tools planned |

### Layer 1: tables (built)

- Every table carries `companyId` and is in `TENANT_MODELS` (`src/lib/db/scope.ts`), so an
  unscoped query throws.
- Each table also has `updatedAt` and `updatedBy`.
- `src/features/knowledge` is pure: it converts rows to and from the `Seed` the pages read.
  `src/lib/db/knowledge.ts` loads the rows and replaces them in one transaction.

**The tables are the only source (D5).** `reduce(seed, log)` still needs the `Seed` shape, so
`structureSeed(seed, knowledge, rules)` in `src/features/knowledge` is the bridge until IDN: it
returns the seed with `depts`, `people`, `routes`, `goals`, `promiseDays`, `outcomeDays` and
`spend` taken from the tables and nothing else.

- `loadSeed()` / `companySeed()` load the knowledge rows, the `CompanyRule` rows and the loop
  rules, and apply `structureSeed`. Structure, goals and rules inside a stored `seedJson` are
  ignored. A company without rows has no depts, people, routes or goals and the default rules.
- Without a database `seedFor()` still returns the built-in `SEED` for acme and `EMPTY_SEED`
  otherwise. `EMPTY_SEED` carries no acme content.
- `rowsFromSeed` goes the other way: it writes the demo structure into the tables when a company
  is created from the demo template. `npm run db:seed` and the admin "demo" template use it.
- `holdersOfRole(knowledge, roleId)` / `loadHoldersOfRole(companyId, roleId)` give a role's
  holders by `sort`; `[]` for an unknown role.

**`CompanyRule`** (`companyId`, `key`, `value` JSON, primary key `(companyId, key)`) holds the
rules, checked by `src/features/knowledge/rules.ts`; a missing key or an invalid value gives the
default for that key (`DEFAULT_RULES`):

| key | value | default |
|---|---|---|
| `promise_days` | `{ days: int 1-60 }` | 5 |
| `outcome_days` | `{ days: int 1-365 }` | 14 |
| `spend` | `{ limitEur: int >= 0, text: string 1-200 }` | none |
| `posting` | `{ as: "handle" \| "name" }`: who a member's idea is preselected as on the last look (decision Q1.7) | `handle` |

**What `seedJson` still holds:** demo content only - problems, ideas, initiatives, outcomes,
cases, waitingOn, stall, ledger, metrics, views, briefs, projects, personas, leaders, buddies.

### Layer 2: documents (next)

- **Pipeline:** upload to EU object storage, extract text, split into chunks of about 800
  tokens, embed, then store the chunk and its vector.
- **Query:** similarity search runs through `$queryRaw`, which **bypasses the tenant guard**.
  There must be exactly one helper, `searchChunks(companyId, query, k)`, that writes
  `WHERE "companyId" = $1` itself, plus a DB test showing company B never gets company A's
  chunks.
- **Visibility:** documents are `internal` by default. Only `public` ones are used in answers
  to people raising a case.

### Layer 3: how the model reads it (next)

1. **Brief.** `buildCompanyBrief(companyId)` renders the profile, the role tree, the routing
   table and the goals as 2–4k tokens of text, with no names.
   - It is rebuilt only when Layer 1 changes, and stored with its hash.
   - It is sent as a cached system block.
2. **Tools.**
   - The model gets `list_routes`, `get_role`, `get_goals` and `search_documents`.
   - These run server-side, and each takes the company from the session, never from the model.
3. **Output.** The model's answer is `route.proposed` with `source: "llm"`, `confidence`,
   `promptVersion` and `citations[]`. There is a keyword fallback after 800 ms
   (`INTEGRATIONS.md`).

## The context draft (built)

Vision, mission and similar fields are not typed in setup. A background run drafts them from the connected
sources, people review the draft, and only what they accept and save is stored. Documents are not imported.

1. **Start.** A company admin presses the button on the setup's Company step (`startContextRunAction`). It needs a
   source (`knowledgeSourcesFor`), the AI gate (`aiGate`, purpose `brain`: the choice is not off and the agreement
   is signed) and that person's own connected Microsoft account. Without a source or the agreement the status is
   `notUsed`, the panel says the fields can be filled in under Settings → Company, and setup still finishes.
2. **Run.** `server/scheduler/context-run.ts`, every 15 seconds (`CONTEXT_RUN_INTERVAL_MS`), under a lease on the
   company's `CompanyContextRun` row. It searches `CONTEXT_QUERIES` **as the person who started it**, so it finds only
   what they may open, at most at level `internal` (a stricter company ceiling wins) and at most 24 hits. Titles and
   snippets go through `redact`, and text marked above the ceiling is left out. Then one call to the company's
   provider (`aiProviderFor`, plain `complete`). The mock answers in the demo stage.
3. **Parse.** `parseContextAnswer` in `features/settings/context-draft.ts` (pure, unit tested). A proposal survives
   only with a source that was really found, and within what the company form accepts. The answer is redacted too.
4. **Mail.** The starter gets one mail in their language when the draft is ready or has failed, with a link and without
   any of the draft. A mail the relay refused is tried again for a day.
5. **Review.** The Company step shows each proposal with its sources, to accept or edit. `saveCompanyAction` replaces the
   whole profile, so the form sends the accepted text for accepted fields and the current value for all others.
   Nothing reaches `CompanyProfile` before that. What was saved leaves the draft; the rest stays to decide later.

| Status (`loadContextStatus`) | Meaning |
|---|---|
| `notUsed` | no source, or no AI with its agreement, and no draft to show |
| `idle` | can be started |
| `running` | waiting for the scheduler or in progress |
| `ready` | a draft to review, or it has been reviewed, or it expired |
| `failed` | ended without a draft: `error` is a code, never text from a provider or a file |

**What this changes about "nothing is copied".** The assistant still copies nothing. The draft does store text:

- `CompanyContextRun.draft` holds file names, links and the model's proposed wording, which can repeat a file closely.
  It is emptied when the review is finished or discarded, replaced by a new run, and cleared after 30 days without a
  review. The snippets themselves are sent to the provider and not stored.
- **A saved field is text that came from a file**, kept in `CompanyProfile` like anything else typed there, and from then
  on it goes to the assistant's model with the company brief. Saving it is a person's decision.
- **Every company admin sees the draft and its sources**, also for files only the starter may open. The panel says so.
- `complianceRules` goes into the assistant's system prompt as written (`docs/ASSISTANT.md`), so a reviewer should read
  that proposal with particular care: it was written by a model from a file.

**What is logged.** An audit row when a run starts, finishes (status, counts or an error code) or is discarded; one
`AiCall` with purpose `context`; console lines with counts and timings. Never a query's result, a snippet, a file name or
the model's text.

## Where the team can look

All of these views are read-only and sit behind the admin code.

| Question | Where | What it shows |
|---|---|---|
| What does the app know about a company? | `/admin/knowledge?company=<slug>` | units, the role tree, the routing table, goals, and **the exact brief a model would be given** (`companyBrief`, no names) |
| How good are the routing proposals? | `/admin/decisions` | one row per raise. Each row has the proposed route, confidence and router version, the route the case ended on, a verdict, the hand-offs, and whether n8n wrote back |
| What does a new matcher or prompt score? | `/admin/decisions/export` | a JSON-lines file of settled cases: `{text, expected, proposed, confidence, version}`. This is the input for `tests/eval/routing/` |
| Did n8n do its job? | `/admin/connections` → Automation tasks | every raise paired with n8n's write-back through its idempotency key (done, skipped, pending or failed), how long it took, and a retry button |
| Why did an n8n run fail? | n8n itself → Executions (`:5678` locally) | node-by-node input and output. The app cannot see inside n8n and holds no n8n API key (`ops/n8n/README.md`) |
| The raw facts | `CaseEvent` table | every event, including `source = 'n8n'` write-backs and `case.raised` payloads with their `proposal` |

**How a proposal is recorded.**

- Every `case.raised` payload carries `proposal: { routeId, confidence, source, version }`, where `version` is `ROUTER_VERSION` in `features/routing`.
- **Bump the version whenever the matching or the prompt changes.** `/admin/decisions` splits its figures by version, so old and new can be compared on real cases.

**The verdicts** (`features/admin/decisions.ts`) always come from what people did next, never from the model:

| Verdict | Meaning |
|---|---|
| agreed | answered on the proposed route |
| overridden | someone sent `case.override` |
| handed elsewhere | handed to someone other than the first desk and the route's owner or deputy |
| no route | the router found no row |
| open | none of the above has happened yet |

Nothing in the UI emits `case.override` yet. Until something does, "handed elsewhere" is how a wrong proposal shows up.

## Build order

1. ✅ Tables, the `seedJson` overlay, the seed script and the admin template.
2. An editor in `/admin` for profile, roles, routes and goals. `features/evaluate` reads goals
   from the `Goal` rows instead of its `GOALS` constant, and the spend rule from
   `OrgRole.spendLimitEur`.
3. `buildCompanyBrief` plus `routing/llm.ts`, with an eval set at
   `tests/eval/routing/<company>.jsonl`.
4. Documents, pgvector, `search_documents`, and citations in `CaseDetailView`.

## STR gaps

The rows of `docs/audit/gaps/*.md` with phase STR (D13), and the STR task that answers each. Task
ids are the plan's; the PR numbers are in the git log. The acceptance test is
`apps/app/tests/e2e/db/structure.spec.ts` (STR-Z1).

| id | gap | answered by |
|---|---|---|
| G-008 | `seedJson` holds structure, goals and demo cases in one blob | STR-A1/STR-B1: org units, roles, holders, routes, goals and rules are read from their tables only (D5); `seedJson` keeps demo content |
| G-009 | `EMPTY_SEED` leaks acme's routes, personas, leaders, ledger, metrics and view copy | STR-A1 (D8: `EMPTY_SEED` carries no acme content); proved by STR-Z1 |
| G-010 | `GOALS` and `SPEND_RULE` are acme constants used for every company | STR-C1: evaluate, the idea benchmarks and the brain read the company's goals and spend rule; STR-D1: the raise page, components and the assist route do too |
| G-011 | `CompanyConfig.aiRouting`, n8n and notifications are stored but never read | open: STR builds nothing beyond its tasks for it (D13); it needs its own task |
| G-053 | The three roles and the Entra claim names are fixed in code | open: roles stay in `src/config/roles.ts` until IDN (D13, Kevin owns that file) |

**Backfill.** Companies stored before the tables existed get their structure rows with
`cd apps/app && npx tsx prisma/backfill-structure.ts`. It writes units, roles, holders and routes
for every company with no org unit whose stored seed has departments; no rules, no goals.
Idempotent: a second run writes nothing.
