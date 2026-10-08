# NextHub - integrations, AI, tenants, phases

> **Updated 2026-10-03** · reference + plan. Written as a proposal on 21 Sep 2026; since then the events API, tokens, stages and tenant guard are built and the code points here as the contract. The n8n workflows themselves (deadline, digests, connectors) are still a plan.

The product rule this follows: **AI proposes, never decides** (§11.2, `features/routing`). The
architecture rule it follows: **events, not edits** (`features/cases/events.ts`). Every
integration below reads the event log and writes back only by appending events. Nothing
outside the app ever touches the database.

## Where things live

"If the user waits for it, it lives in NextHub. If it happens later, it lives in n8n."

| In NextHub (`features/`, synchronous, vitest) | In n8n (asynchronous, side effects, connectors) |
|---|---|
| Route proposal in the raise field (LLM behind the same `propose()` shape; keyword matcher is the fallback on timeout) | Deadline expiry: `case.handed { to: deputy, why: "deadline" }`, both told (whiteboard §4) |
| Rescore on `case.commented { rescore: true }` | Slack / Teams / email notifications; weekly manager digest |
| Tenant guard; allow-list of events a system actor may append | Agenda document per case; status pushed back to the submitter |
| | Jira / Confluence / HR-system connectors, per customer |

The core loop (raise -> inbox -> answer) must work with n8n down and the LLM down. Both are
behind per-company flags (see *Stages*), off by default.

> **23 Sep 2026:** the one exception so far is the email to the route owner when a case is raised.
> It is sent by the app (`src/server/case-notice.ts`) through `SMTP_URL`, not by an n8n workflow:
> the app already knows the owner and the relay, and a chain of webhook -> mail -> write-back had
> three places to fail that `/admin` could not tell apart. A raise still never waits on it.

## The two endpoints

Nothing else is exposed. Both live under `src/app/api/[company]/events/route.ts` and are thin:
read params, verify token, call `features/integrations`.

```
GET  /api/[company]/events?since=<cursor>     n8n polls every minute; returns events after the cursor
POST /api/[company]/events                    n8n appends; actor = "system:n8n"
```

- **Pull, not push, for the pilot.** A Vercel function cannot reliably retry a failed webhook; a
  poll with a cursor is idempotent by construction. Push + an `OutboxEvent` table comes later
  if latency matters.
- **Token per company** (`ApiToken`: `companyId, hash, scopes, expiresAt`). An event for
  company A sent with company B's token is a 403, and that is a test.
- **POST is allow-listed.** A system actor may append `case.handed`, `route.proposed`,
  `case.commented` - nothing that decides (`case.decided` stays human). Each carries an
  idempotency key; a replay is a 200 with no new row.
- Validation lives in `src/features/integrations/` (pure, tested): which actor may append
  which type, payload shape (zod), cursor encoding.

## Event types this adds

```
route.proposed   { routeId, confidence, source: "keywords" | "llm", model?, promptVersion? }
```

`case.override { proposed, chosen }` already records the human correction. The pair
(`route.proposed`, `case.override`) is the routing evaluation set - it accrues for free, per
company, from day one. Log model and prompt version on every proposal or the set is useless.

Deadline hand-over reuses `case.handed` with `why: "deadline"` and the system actor. No new
type; the timeline sentence is built at render, as always.

## The LLM

- `src/features/routing/llm.ts`: `proposeRouteLLM(text, routes, ctx) -> Proposal<R>`. Same
  shape as `propose()`; the page never knows which one answered. Timeout 800 ms, then the
  keyword matcher.
- The model sees the case text and the routing table (route label, keys, owner **role**). It
  does not see names, departments' history, or other cases. With `anonymousHandles` on it sees
  the handle only.
- A small fast model for classification; a larger one only for document generation in n8n.
  Provider behind an interface, EU region, data-processing agreement, no training on data.
  This is the works-council story - put it in the deck, not just in the code.
- Prompts are files in `src/features/routing/prompts/` with a version string, reviewed in PRs
  like code.

## n8n

- **One self-hosted instance in the EU** (Docker on Hetzner or Railway), not one per customer.
  Workflows read `companyId` from the event payload and look up what they need via
  `GET /api/[company]/integrations` (which connectors are on, which channel, which deputy rule).
- Per-customer credentials live in n8n credentials named `<slug>-slack`, `<slug>-smtp`, and so
  on. Never in the repo, never in the app database.
- **Every workflow is exported as JSON into `ops/n8n/<name>.json`** and imported per
  environment with the n8n CLI. Otherwise n8n is untracked state nobody can reproduce.
- The first workflow, and the only one until it runs end to end in the sandbox: deadline
  expiry -> hand to deputy -> notify both.

## Tenancy

Already decided: the `[company]` segment, `companyId` on every table, `lib/db` enforces it.
What Phase 2 adds so many companies can share one deployment:

- **The guard is in `lib/db`, not in pages.** A Prisma client extension that refuses any query
  on a tenant table without `companyId`; Postgres row-level security on top once the database
  is Neon or Supabase. One unit test seeds two companies and asserts that no list, count, or
  detail leaks across.
- `Company.stage` and a `CompanyConfig` row: `{ aiRouting, n8n, notifications, demoData }`,
  each a boolean, changed only through an event (`company.flag { key, value, by }`).
  `CompanyConfig` holds what a **company** decides for itself. NextUp's own rollout switches -
  a half-finished feature on for staging and one customer, off for the rest - are feature flags:
  `src/config/flags.ts` (the list, with owner and remove-by date), `src/features/flags` (stage
  default unless admin.sellux.ch set it for the company). The company never sees those.
- **One codebase, one database, one n8n.** A customer who demands their own deployment is a
  later, priced exception - not the default.

## Stages - a customer's phase is a flag set, not a branch

| `stage` | On | Off | Who |
|---|---|---|---|
| `demo` | demo data, day-advance, reset | AI, n8n, notifications | `acme`, sales calls |
| `sandbox` | real org chart, real routing table, real people, consented test cases; AI proposals | notifications | pilot, week 1-2 |
| `pilot` | notifications for opted-in users; baseline metrics captured ("measured in pilot") | - | pilot, week 3+ |
| `live` | everything | - | paying customer |

Promotion is a flag flip in the dev/admin panel (Phase 2), logged as an event. Rolling back is
the same flip the other way. No deploy, no branch, no migration.

## Environments

| Env | Deploys from | Database | n8n | Purpose |
|---|---|---|---|---|
| `local` | working tree | local Postgres, seed `acme` | off | development |
| `preview` | every PR (Vercel) | a database branch per PR (Neon) | off | review |
| `staging` | `main` | staging, synthetic companies at every stage | `n8n-staging` | prove workflows |
| `production` | tagged release, Kevin merges | production | `n8n` | customers |

Only `DATABASE_URL`, `N8N_BASE_URL`, `LLM_API_KEY`, `LLM_REGION` differ between environments.
If anything else does, that is a bug.

## Testing

- **Unit** (have it): reducer, selectors, `propose()`, metrics. Stays pure.
- **Routing eval set**: `tests/eval/routing/<company>.jsonl`, lines of
  `{ text, expected: routeId }`, seeded from `case.override` history and hand-written cases.
  CI runs it against recorded model responses (deterministic, no network); a nightly job runs
  it against the live model. A prompt change that drops accuracy below the last run fails.
- **Contract tests** for the two endpoints: token scope (cross-tenant 403), allow-list, payload
  validation, idempotent replay, cursor monotonicity.
- **Isolation test**: two seeded companies, every list and count asserted per company.
- **e2e** (Phase 3, Playwright): the inbox loop with a stub receiver standing in for n8n -
  asserts the events n8n would see, not n8n itself.

## Order

1. Phase 2 as planned: Prisma, tenant guard in `lib/db`, seed.
2. `Company.stage` + `CompanyConfig` flags + the toggle in the dev panel.
3. `GET`/`POST /api/[company]/events`, system actor, allow-list, `ApiToken`.
4. **One** n8n workflow: deadline -> deputy -> both told. Prove the loop in staging.
5. `features/routing/llm.ts` behind `aiRouting`, with the eval set and recorded fixtures.
6. Notifications, digest, connectors - each one a JSON in `ops/n8n/`, one PR each.

## Decisions to make before step 3

1. n8n cloud or self-hosted? (default: self-hosted in the EU - the works-council story)
2. Does the first pilot customer get `aiRouting` on, or keywords only until their override
   data exists? (default: keywords in `sandbox`, LLM on at `pilot`)
3. Database host: Neon (branch per PR) or Supabase (RLS, auth later)? (default: Neon)
4. Which LLM provider first? Decide by EU region + DPA, not by benchmark; it sits behind
   an interface either way.
