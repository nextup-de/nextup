# NextHub - integrations, AI, tenants, phases

> **Updated 2026-10-29** · reference + plan. Written as a proposal on 21 Sep 2026; since then the events API, tokens, stages and tenant guard are built and the code points here as the contract. Jira moved from n8n into the app on 29 Oct 2026 (*Jira in the app* below: the contract is in, the engine follows); deadline and digests are still a plan.

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
- **For projects, five events and no more** (`SYSTEM_EVENT_TYPES`): `project.step.added`,
  `project.step.moved`, `project.step.edited` (the step's text only), `project.linked`,
  `project.commented`, so a connector can mirror the board (Jira). Never the start, done,
  baseline, measure, reward, stop, team, lead or sync. They need the company's `projects` flag (403 without it) and a project, and a move or a
  step link needs its step (409 otherwise: `maySystemAppend`). Links and `external.url` must be
  http(s).
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
  **One exception** (docs/plans/2026-10-22_sso-and-data-access.md, phase 2): a person's own
  Microsoft 365 connection is a refresh token that only works as that person, so n8n cannot hold
  it. It lives in the app database, sealed with `CONNECTOR_VAULT_KEY` and bound to company and
  person (`Connection`, `features/connectors/vault.ts`). App-only credentials stay in n8n.
  **A second exception** (docs/plans/2026-10-29_jira-in-app.md): the Jira sync runs in the app, so
  the integration account's API token and the webhook secret live in the app database too
  (`Integration.secretSealed`, `webhookSecretSealed`), sealed with the same key and bound to company
  and system (`integrationContext`). Write-only: the admin page never shows them again.
- **Every workflow is exported as JSON into `ops/n8n/<name>.json`** and imported per
  environment with the n8n CLI. Otherwise n8n is untracked state nobody can reproduce.
- The first workflow, and the only one until it runs end to end in the sandbox: deadline
  expiry -> hand to deputy -> notify both.

## Jira in the app

Decided 29 Oct 2026, plan in `docs/plans/2026-10-29_jira-in-app.md`: the Jira sync moves out of n8n
into the app, as the case-notice mails did. Settings and the sealed token are stored per company, a
once-a-minute loop pushes NextUp's changes to Jira and pulls Jira's back. This section is the
**contract** the pieces are built against; the plan says how and in what order.

**Settings: the `Integration` table** (`prisma/schema.prisma`, `src/lib/db/integrations.ts`), one row
per `(companyId, system)`, system `"jira"`:

| Column | Holds |
|---|---|
| `on`, `enabledAt` | the admin's switch; `enabledAt` is the moment it was last switched on |
| `settings` (Json) | `JiraSettings` (`features/integrations/jira/types.ts`), checked by `parseJiraSettings` (`settings.ts`) |
| `secretSealed`, `webhookSecretSealed` | the API token and the webhook secret, sealed (below); never read back by a page |
| `account` (Json) | `{id, name}` of the integration account (`/myself`), to tell its own changes from a person's |
| `pushedSeq`, `pulledAt` | the cursors: the last event sequence pushed out, and when Jira was last read |
| `leaseUntil`, `lastRunAt`, `lastOkAt`, `lastError` | one runner per company; what the admin page shows |

`JiraSettings`: `flavor` (`cloud`, or `dc` as a seam only), `siteUrl`, `email`, `projectKey`,
`epicTypeId` and `stepTypeId` (ids, because "Epic" is "Epos" on a German site), `autoEpic`,
`pullNewIssues`, `pullComments`, and optional `statusFor` (column → Jira status id).

**Secrets: the second exception to "no credentials in the app database".** The token is sealed with
`CONNECTOR_VAULT_KEY` under the context `integration:<companyId>:<system>` (`integrationContext`
in `features/connectors/vault.ts`): a value copied into another company's row, or into a person's
`Connection`, does not open. `getIntegration` and `jiraStatusView` return only "has a token";
`integrationSecrets` hands the sealed values to the sync, which opens them just before the call.

**Events.**

- New human event **`project.sync {system:"jira", on}`**: "Send to Jira" / "Stop syncing". The lead or
  a manager may send it, only while the project is open (`features/projects/permissions.ts`). The
  reducer puts the latest one on the project as `ReducedProject.sync = {system, on, day, by}` (`null`
  = never). A system actor may not send it.
- **Link an existing issue** is the human `project.linked {system:"jira", key, url, stepId}`; the url
  comes from `jiraIssueUrl(settings, key)`.
- The allow-list gains **`project.step.edited {stepId, text}`**: the step's text, nothing else
  (`projectPayloadProblem` refuses `owner`, `dueDay`, `note`, `removed`).
- The sync's actor is **`JIRA_ACTOR = "system:jira"`** and its `CaseEvent.source` **`JIRA_SOURCE =
  "jira"`**. It appends in the app, not through the HTTP endpoint, but checks everything with
  `parseInbound` and `maySystemAppend` first: the allow-list is the same.

**What syncs.** A project is sent to Jira when its latest `project.sync` is `on`, or when `autoEpic`
is on and its `case.decided` came after `enabledAt` (older projects are never swept in on their own).
Out: epic, one issue per step, a board move → a transition by status category (`CATEGORY_FOR`: To do
→ new, Doing and Blocked → indeterminate, Done → done, or `statusFor`), a text edit → the summary, a
removed step → a comment and the label `nextup-removed` (never a delete). In: a person's status
change → `project.step.moved`, a summary change → `project.step.edited`, a new child of the epic →
`project.step.added` (if `pullNewIssues`), a comment → `project.commented` (if `pullComments`,
2000 characters, no author, works council). If both sides change a step within one round, NextUp wins.

**Echo loops** are broken four ways: the push acts only on human actors (`isSystemActor`); the pull
skips changes by the integration account; both directions compare states before acting; every
write has an idempotency key (`jira:epic:<projectId>`, `jira:issue:<stepId>`,
`jira:<KEY>:status:<historyId>`, `jira:comment:<id>`). Creating is safe to repeat: the issue carries
the label `nextup-<projectId>` or `nextup-step-<stepId>`, and the sync searches for it before it
creates.

**The seam in code.** `JiraApi` (`features/integrations/jira/types.ts`) is the only way anything talks
to Jira; `Job` is what the push plans; `JiraStatusView` is what the screens read; `TestJira` is the
admin's connection test. The implementations (`server/jira/cloud.ts`, the planner, the loop) are the
engine's.

The sections below describe the n8n workflow this replaces. It stays in `ops/n8n/` until the live
test on `nextup-test.atlassian.net` passes.

## Jira through n8n (replaced by the app, 29 Oct 2026)

Step 6 B of `docs/plans/2026-10-15_idea-to-project.md`: a project's epic and steps live in Jira as
well, and Jira's progress comes back. The workflow is `ops/n8n/jira-projects.json`, one copy per
company and Jira site. It runs on automation.sellux.ch with fake data; in production it runs in
the company's own n8n. Jira never talks to NextUp, and n8n never touches the database.

**Out, NextUp → Jira.** Every minute n8n reads `GET /api/<slug>/events?since=<cursor>`, as
`events-pull.json` does, with the `<slug>-nextup` token:

| Event in the log | In Jira | Written back (target = projectId) |
|---|---|---|
| `case.decided {answer:"yes", projectId, title}` | an Epic named after `title`, once per project | `project.linked {system:"jira", key, url}` |
| `project.step.added {stepId, text}` without `external` | an issue under the project's epic | `project.linked {system:"jira", key, url, stepId}` |

An idea that joins a project already in Jira makes no second epic. A step with `external` lives in
another tool already. A step of a project with no epic (opened before the workflow ran) gets no
issue. If Jira fails, the cursor stays before that event and n8n tries again each minute, five
times.

**In, Jira → NextUp.** Two Jira automation rules POST to the workflow's webhook,
`https://automation.sellux.ch/webhook/jira-<slug>`, with the header `X-NextUp-Jira: <secret>`,
which n8n's Header Auth checks. The body carries the issue key, and for a comment its id and text.
n8n reads the status from Jira itself, never from the body.

| In Jira | Posted to NextUp (target = projectId) |
|---|---|
| a step's issue moves to a status in the category Done | `project.step.moved {stepId, to:"done"}` |
| … In Progress | `project.step.moved {stepId, to:"doing"}` |
| … To Do (reopened) | `project.step.moved {stepId, to:"todo"}` |
| a comment on the epic or a step's issue | `project.commented {text:"Jira <KEY>: <comment>"}` |

The issue ↔ step and epic ↔ project map lives in the workflow's static data. Only the poll writes
it, so a webhook run never overwrites it. Issues the workflow didn't create are ignored. Every POST
has an idempotency key: `jira:epic:<projectId>`, `jira:issue:<stepId>`,
`jira:<KEY>:<to>:<statuscategorychangedate>`, `jira:comment:<commentId>`. A move inside one
category (In Progress → In Review) repeats its key, so NextUp records it once.

**What n8n may never send.** The allow-list (`SYSTEM_EVENT_TYPES`) has exactly five project
events: `project.step.added`, `project.step.moved`, `project.linked`, `project.commented` and
`project.step.edited` (text only; this workflow does not use it). It
never gets `case.decided`, `project.started`, `project.done`, `project.baseline`,
`project.measured`, `project.rewarded`, `project.stopped`, `project.member`, `project.handed` or `project.sync`:
people decide those. An issue in Done moves one step, and never finishes the project.

**The webhook and the login page.** automation.sellux.ch sits behind the NextUp login page
(`stack/automation/gate/`). Jira can't sign in, so the gate lets exactly `POST /webhook/<letters,
digits, - and _>` through, checked on the raw path n8n receives. `/webhook-test/`, the editor and
everything else still need the login. So every *active* production webhook there is open to the
internet and needs Header Auth. Self-check: `node --test stack/automation/gate/server.test.mjs`.
A company's own n8n gets the same exception, off until its `.env` says `N8N_WEBHOOKS=public`: the
stack's Caddy passes `POST /webhook/<…>` to n8n on the company's own host (Jira then calls
`https://<slug>.sellux.ch/webhook/jira-<slug>`), and the older `ops/` deployment lets it skip the
`basic_auth` on `n8n.<domain>`. Everything else stays where it was. The hosts and the box steps:
`stack/nginx/RUNBOOK.md`, "n8n webhooks for a company stack". Self-check:
`node --test stack/caddy/webhook.test.mjs` (docker).

**Test with a free Jira Cloud site.** Fake data only. Kevin creates the site and the API token
(`stack/nginx/RUNBOOK.md`, "Jira test site"); the workflow's setup, with the two automation rules,
is in `ops/n8n/README.md`. Then, on a demo company with the `projects` flag on:

1. "Yes, do it" on an idea. Within a minute the epic is in Jira, and the project shows the link.
2. Add a step. Within a minute it is an issue under the epic.
3. Move the issue to Done in Jira. Within a minute the step is in Done on the board.
4. Comment on the issue. The project's timeline shows "Jira NUP-2: …".

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
  default unless admin.sellux.ch set it for the company). Every flag is on for `demo` companies,
  our test stacks; a unit test refuses one that isn't. The company never sees those.
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
