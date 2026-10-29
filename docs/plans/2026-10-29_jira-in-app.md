# Plan: Jira for every NextUp company, synced from inside the app

> **Plan · 2026-10-29 · decided by Kevin the same day. WP0 (the contract) built; the engine, the admin page and the lead UI not yet.**
> Approved projects and their steps go out to Jira, and progress comes back. Replaces the n8n workflow
> `ops/n8n/jira-projects.json` (step 6 B of `docs/plans/2026-10-15_idea-to-project.md`). The contract in
> one place: `docs/INTEGRATIONS.md`, "Jira in the app".

## Context

**What exists today** (merged in #207, #208, #213 and #215):

- one n8n workflow, `ops/n8n/jira-projects.json`, which creates an epic on "Yes, do it" and a task for each
  step, then pulls status and comments back through Jira Automation rules;
- an app side that only offers the generic events API and an allow-list.

**Its gaps:**

- It has never run against a real Jira.
- Its settings and token are hand-made inside n8n, so no company can switch it on from the app.
- The issue↔step map lives only in n8n static data, so re-importing creates duplicate epics.
- A NextUp board move never reaches Jira.
- Manually linked issues never sync.
- On Jira Free, the Automation rules run out after about 100 runs a month.
- The UI says "Jira syncs both ways" for every company, even where nothing runs.

**Decisions Kevin took (29 Oct 2026):**

- full two-way sync;
- the epic is created automatically on "Yes, do it", plus a "Send to Jira" button and "link an existing issue";
- Jira Cloud now, with a seam for Data Center later;
- **the sync moves out of n8n and into the app** (the same move the case-notice mails made).

## Phase 0: Kevin, with no purchase

You don't need to buy anything to test:

- **Jira Cloud Free** has up to 10 users. The REST API and API tokens work on it.
- The **Atlassian developer instance** (go.atlassian.com/cloud-dev) is also free: Jira with 5 users, for
  development and testing only.
- Use Free for `nextup-test.atlassian.net`, as `stack/nginx/RUNBOOK.md` already plans.

Steps:

1. Create the site at atlassian.com → Jira → Free, called `nextup-test`. Make a Kanban project with key `NUP`.
2. Add a spare user, for example `jira-bot@…`, as the integration account. As that user, go to
   id.atlassian.com → Security → API tokens and make a classic token. Tokens expire within a year, so put a
   renewal date in the calendar.
3. Later, for each pilot: the customer creates the same integration account in their own Jira. No NextUp
   subscription is involved. The customer pays Atlassian for their own seats as usual.

The gate redeploy is **no longer needed for Jira**. Inbound goes to the app's `/api` (polling, plus an
optional webhook), not to `/webhook/` in n8n.

## Architecture

**Settings: a new Prisma model `Integration`** (`apps/app/prisma/schema.prisma` plus the migration
`20261029100000_integrations`; helpers in `src/lib/db/integrations.ts`):

- `@@unique([companyId, system])`, cascade delete with the company;
- `settings Json`, holding `JiraSettings` (`src/features/integrations/jira/types.ts`):
  - `flavor` (`cloud`, or `dc` for later)
  - `siteUrl`, `email`, `projectKey`
  - `epicTypeId` and `stepTypeId`, stored as ids because "Epic" is "Epos" on a German site
  - `autoEpic`, `pullNewIssues`, `pullComments`
  - optional `statusFor` overrides (column → Jira status id)
- `secretSealed` and `webhookSecretSealed`, sealed with `features/connectors/vault.ts` under a new context
  `integration:<companyId>:<system>` (`integrationContext`). This is a second exception to "no credentials
  in the app database" (the first is a person's Microsoft 365 refresh token); it is written down in
  `docs/INTEGRATIONS.md`, "n8n";
- `account` (the integration account's `{id, name}`, used to filter out echoes);
- `on`, `enabledAt`, `pushedSeq`, `pulledAt`, `leaseUntil`, `lastRunAt`, `lastOkAt`, `lastError`, `updatedBy`.

`CompanyConfig.n8n` (never read) is left alone.

**Sync loop: `server/jira-sync.ts`.** It follows the pattern of `server/tickets-sync.ts`: it starts from
`instrumentation.ts` and runs once a minute for each company that has Jira on
(`companiesWithIntegrationOn`). `claimLease` makes sure only one runner works on a company at a time.
Each round pushes first, then pulls. `kickJira(slug)` can start a round early; it is called from
`server/actions/events.ts` and from the webhook.

**Pure core** in `features/integrations/jira/`:

| File | Job | Status |
|---|---|---|
| `types.ts` | `JiraSettings`, `Job`, `JiraApi`, the raw Jira JSON, `JiraStatusView`, `TestJira` | WP0, built |
| `settings.ts` | the settings parser, labels, issue URLs | WP0, built |
| `view.ts` | `jiraStatusView`: the Integration row for the screens | WP0, built |
| `map.ts` | `jiraIndex(state)`, issue key → {projectId, stepId}, built from `step.external` and `p.links`; replaces the n8n static data | WP-A |
| `plan.ts` | `planPush(state, eventsSince(pushedSeq), settings)` → jobs | WP-A |
| `pull.ts` | Jira issue and changelog JSON → NextUp events | WP-A |
| `status.ts` | picks the transition | WP-A |
| `adf.ts` | text ↔ Atlassian Document Format | WP-A |

**Jira client: the `JiraApi` interface.**

- `server/jira/cloud.ts` uses API v3, Basic auth (email plus token), and `/rest/api/3/search/jql` with `nextPageToken`.
- `server/jira/dc.ts` is a stub only (API v2, Bearer PAT).
- `server/jira/test.ts` is the connection test (`TestJira`).

**Outbound (NextUp → Jira).** A project syncs if it has `project.sync {on:true}`, or if `autoEpic` is on and
its `case.decided` came after `enabledAt`.

| Trigger | Jira call |
|---|---|
| synced project with no epic | create an epic labelled `nextup-<projectId>`, then `project.linked`, idemKey `jira:epic:<projectId>` |
| step with no `external` | create an issue with parent = epic, labelled `nextup-step-<stepId>`, then `project.linked`, idemKey `jira:issue:<stepId>` |
| **human** `project.step.moved` | transition by status category: todo→new, doing and blocked→indeterminate, done→done |
| human `project.step.edited {text}` | `PUT` the summary |
| human step removed | comment plus label `nextup-removed`; never delete |

Creating is safe to repeat: before each create, the app searches for the label and adopts the issue if it
already exists. At most about 20 creates per round, for rate limits.

**Inbound (Jira → NextUp).** The app polls with JQL `project = KEY AND updated >= "-Nm"` plus
`expand=changelog`, where N is the minutes since `pulledAt` plus 2 minutes of overlap.

| In Jira | Written to NextUp |
|---|---|
| status change by a human | `project.step.moved` with idemKey `jira:<key>:status:<historyId>`, only if the mapped column differs |
| summary change | `project.step.edited {stepId, text}` |
| new child of the epic (if `pullNewIssues`) | `project.step.added {stepId:"jira-<KEY>", external}` |
| comment (if `pullComments`) | `project.commented`, idemKey `jira:comment:<id>`, cut to 2000 characters, no author names (works council) |

An hourly reconcile runs `key in (…)` over all linked keys, in batches of 50. If both sides change the same
step within one round, NextUp wins; this gets documented.

**Echo-loop breakers:**

1. Outbound acts only on human actors (`isSystemActor`).
2. Inbound skips changes made by the integration account (`Integration.account`).
3. Both directions compare states before acting.
4. idemKeys.

**Optional fast path:** `POST /api/[company]/integrations/jira/webhook`. It checks the HMAC signature and only
calls `kickJira`; the body is never trusted as data. It uses Jira's admin webhooks (Settings → System →
Webhooks), which have no run limit. The gate, Caddy and `N8N_WEBHOOKS` stay unchanged. The signature header
name must be confirmed on the real site.

**Events and allow-list** (WP0, built):

- **New human event `project.sync {system:"jira", on}`**: "Send to Jira" or "Stop syncing". Lead or manager
  only, and only while the project is open. It touches `features/cases/events.ts`, `persist.ts`
  (`APP_EVENT_TYPES`) and `features/projects/{types,reduce,permissions}.ts`; the reducer puts the latest one
  on the project as `ReducedProject.sync`. The project timeline says "sent it to Jira" / "stopped syncing
  with Jira".
- **Link an existing issue** reuses the human `project.linked {system:"jira", key, url, stepId}`. The URL is
  built from `siteUrl` (`jiraIssueUrl`). The first pull takes Jira's status.
- **`features/integrations/index.ts`:**
  - `project.step.edited` is in `SYSTEM_EVENT_TYPES`, text only (checked in `projectPayloadProblem`);
  - `JIRA_ACTOR = "system:jira"`, source `JIRA_SOURCE = "jira"`, and `isSystemActor`.
- `features/projects/brain.ts` reads only case comments and skips every `system:*` author, so nothing the
  sync writes reaches the AI check-in (tested in `projects-brain.test.ts`).

## UI

**Admin page `/admin/integrations`** (new, company scope, linked in `features/admin/nav.ts`, following the
company-picking pattern of `/admin/assistant`). It has:

- a Cloud/DC choice, with DC disabled and marked "later";
- site URL, email, and the token (write-only);
- project key;
- epic and step issue types, chosen from dropdowns filled by `createmeta`;
- a status mapping row for each column;
- toggles: auto-epic, pull new issues, pull comments;
- **Test connection**: `/myself`, the project, the issue types, `/mypermissions` (browse, create, edit,
  transition, comment), and whether labels can be set;
- on/off (sets `enabledAt`) and "Sync now";
- status (`JiraStatusView`): last round, last error (401 means the token expired), how many projects and
  steps are linked, problems per step;
- the webhook URL and secret, shown once.

**Lead UI** (the Jira row in `components/projects/ProjectTeam.tsx`'s ToolsPanel, from a server-side
`jiraRowOf` view in `features/projects/views.ts`):

- **Jira off:** label "Link", plus "Your admin can switch the Jira sync on". This fixes the false "Two-way
  sync" claim.
- **On, project not synced:** **Send to Jira** ("creates an epic in NUP and N issues").
- **Synced:** chips for "Sending…", "Synced · NUP-1 · checked 1 min ago", or "Sync problem: …", and a "Stop
  syncing" link.
- **Link an existing issue:** a key field plus a step picker.
- **Step cards:** a chip with the key, or "waiting for Jira".
- **Demo** (`DemoProvider.tsx`): `act.project.sync` simulated, with no network.

## Work packages

Kevin's pattern applies: the contract first, then disjoint files in parallel sessions, then an integration
pass. Branch from fresh `origin/main`, with `git -c safe.directory=*`.

**WP0, the contract** (`feat/jira-contract`, one PR, first) - built:

- the schema and migration, `lib/db/integrations.ts`
- the vault context
- `project.sync` in `events.ts`, `persist.ts`, `types.ts`, `reduce.ts` and `permissions.ts`
- the allow-list and `JIRA_ACTOR`
- `features/integrations/jira/{types,settings,view}.ts`
- this plan and the contract section in `docs/INTEGRATIONS.md`

Then three packages in parallel:

- **WP-A, the engine:**
  - the other `features/integrations/jira/*` modules
  - `server/jira/*` and `server/jira-sync.ts`
  - the one-line hooks in `instrumentation.ts` and `server/actions/events.ts`
  - the webhook route
  - the unit tests
  - `tests/fake-jira/*`
- **WP-B, admin:**
  - `app/admin/integrations/page.tsx` and `components/admin/JiraAdmin.tsx`
  - `server/actions/jira-admin.ts` and `server/jira-admin.ts`
  - `nav.ts` and its test, and `admin.module.css`
- **WP-C, the lead UI:**
  - `components/projects/{ProjectTeam,StepDetail,ProjectBoard,ProjectView}.tsx` and `Projects.module.css`
  - `DemoProvider.tsx`
  - `views.ts` (`jiraRowOf`)
  - the project `page.tsx` files
  - the demo e2e

**Integration pass:** the e2e-db spec, the live test, and the doc rewrites:

- `ops/n8n/README.md`: mark `jira-projects.json` as replaced; delete it after the live test passes.
- `stack/nginx/RUNBOOK.md`: the Jira steps.
- `docs/plans/2026-10-15_idea-to-project.md`: step 6.
- the admin `roadmap.ts` entry `jira` (nextup-admin repo): update it.

**Fixed along the way:**

- **Comments over 2000 characters are lost.** n8n cuts at 4000 but the app refuses anything over 2000; the
  new pull cuts to 2000.
- **Old projects get epics when the old workflow is first switched on.** The new rule uses `enabledAt`.
- **INTEGRATIONS.md had a stale "allow-list lacks the four" line.** Removed in WP0.

## Verification

**Unit tests (vitest, `apps/app/tests/unit/`):**

- `jira-settings` (WP0, built: settings parser, labels, status view)
- `jira-plan`: auto-epic after `enabledAt`, backfill on Send, system moves ignored, blocked→In Progress,
  edit→summary, replaying after linking gives no jobs
- `jira-pull`: the integration account is skipped, no event when the column is the same, child→step,
  comments cut
- `jira-status`: transition picking and the case with no direct transition
- `jira-adf`
- `jira-webhook`: HMAC
- additions to `integrations.test.ts` and `projects.test.ts` (WP0, built), `connector-vault.test.ts` (WP0, built)
- `jira-sync`: the whole round against the fake Jira; 5 extra rounds produce no changes

**DB tests** (`tests/db/integrations.test.ts`, WP0, built): one row per company and system, secrets out only
through `integrationSecrets`, the lease (one claimant, expiry, release), cursors.

**Fake Jira** (`tests/fake-jira/`, node:http):

- the endpoints above, a JQL subset, a changelog with accountIds, and a workflow graph;
- 429 injection;
- `node tests/fake-jira/server.mjs --port 4010` for local work (`siteUrl` accepts plain `http://127.0.0.1`).

**e2e-db** (`tests/e2e/db/jira-sync.spec.ts`, with the fake as a second Playwright webServer and
`JIRA_SYNC_INTERVAL_MS=2000`). It sets Jira up in `/admin/integrations`, then checks:

1. "Yes, do it" creates an epic.
2. Adding a step creates an issue.
3. Dragging the step to Done changes its status in the fake.
4. A human change in the fake moves the step.
5. No echo.

`.github/ci.yml` stays untouched; that file is Kevin's.

**Live test on `nextup-test.atlassian.net`:**

1. Enter the token and run Test.
2. "Yes, do it" → an epic.
3. Send to Jira on an older project → its steps backfill.
4. Link an existing issue → its status pulls in.
5. Board move → status changes in Jira.
6. Change in Jira → the board follows within a minute.
7. Summary edits both ways.
8. A comment comes in.
9. Blocked shows as In Progress.
10. Switch off and on again → no duplicates.
11. Optional: the webhook nudge, and confirm the signature header name.

**After the merge:**

- Update the vault notes "nextup – Integrationen & n8n" and "Handbook – Roadmap Items" (Jira now runs in the
  app, the Phase 0 steps), plus the memory note.
