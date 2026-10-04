# Company knowledge

> **Updated 2026-09-24** · reference + plan: the tables are built, the later sections are still a plan.

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

**Moving off `seedJson`.** `reduce(seed, log)` needs the `Seed` shape, so the tables are laid
over it rather than replacing it.

- `loadSeed()` returns `seedJson` with `depts`, `people` and `routes` rebuilt from the tables,
  once the company has at least one `OrgUnit`.
- A company without rows reads exactly as before.
- `npm run db:seed` and the admin "demo" template both write the rows.
- `tests/unit/knowledge.test.ts` proves that acme's rows give back the seed's depts, people and
  routes unchanged, and that the rebuilt seed reduces to the same cases.

**What stays in `seedJson` for now:** problems, ideas, initiatives, seed cases and metrics. That
is demo content, not company structure.

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
