---
id: CNX-B1
title: Jira Data Center client, fake Jira in Data Center mode, flavor chosen in
  one place
wp: B
needs: [ ARC-Z1 ]
host: any
owns:
  - apps/app/src/server/jira/dc.ts
  - apps/app/src/server/jira/flavors.ts
  - apps/app/src/server/jira/test.ts
  - apps/app/src/server/jira-sync.ts
  - apps/app/src/features/admin/jira-admin.ts
  - apps/app/tests/fake-jira/**
  - apps/app/tests/unit/jira-dc.test.ts
  - apps/app/tests/unit/admin-jira.test.ts
  - apps/app/tests/unit/jira-sync.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D5, D6, D7, D10 ]
proofs:
  - id: B1
    says: createDcApi talks Jira Data Center REST v2 with a Bearer token and
      plain-text bodies, and every JiraApi method works against the fake Jira in
      Data Center mode
    run: npm test -w @nextup/app -- tests/unit/jira-dc.test.ts -t 'CNX Jira Data
      Center client'
  - id: B2
    says: jiraApiFor picks the client by flavor, and the admin form logic, the
      connection test and the sync accept a Data Center site
    run: npm test -w @nextup/app -- tests/unit/jira-dc.test.ts -t 'CNX Jira flavor
      dc accepted'
status: merged
lane: pc/a
branch: orch/cnx-b1
pr: 268
merge: "ef09452"
---

Plan CNX (sub-plan of PILOT): the in-app Jira sync works with Jira Cloud only; `server/jira/dc.ts` is a seam that
throws. Write the Data Center client behind the existing `JiraApi`, teach the fake Jira the Data Center dialect, and
choose the client by flavor in one place. Read first: `AGENTS.md`, `docs/plans/2026-10-29_jira-in-app.md`,
`apps/app/src/features/integrations/jira/types.ts` (`JiraApi`, `JiraError`, `JiraSettings`), `settings.ts`,
`apps/app/src/server/jira/cloud.ts` (the client to mirror), `dc.ts`, `test.ts`, `round.ts`,
`apps/app/src/server/jira-sync.ts`, `apps/app/src/features/admin/jira-admin.ts`, `apps/app/tests/fake-jira/fake-jira.ts`,
`server.mjs`, `apps/app/tests/unit/jira-sync.test.ts`, `apps/app/tests/unit/admin-jira.test.ts`.

## What

- `apps/app/src/server/jira/dc.ts`: `createDcApi(settings, token, opts?)` implementing every `JiraApi` method by
  D10, and `export const dcApi: JiraApiFactory = (settings, token) => createDcApi(settings, token)`. Same structure,
  timeouts, retry and error messages as `cloud.ts`; share nothing by import from `cloud.ts` except what is already
  exported. Replace the file's header comment.
- `apps/app/src/server/jira/flavors.ts`: `jiraApiFor(settings: JiraSettings, token: string): JiraApi` (D7). Use it
  in `apps/app/src/server/jira-sync.ts` (instead of `FACTORIES`) and in `apps/app/src/server/jira/test.ts` (the
  connection test builds the client for the settings' flavor when no `api` is passed). Nothing else in those two
  files changes.
- `apps/app/src/features/admin/jira-admin.ts`: `settingsFromForm` accepts `flavor: "dc"` (no email needed, D10) and
  passes it to `parseJiraSettings`; any other flavor is still refused. Update the doc comment. In
  `apps/app/tests/unit/admin-jira.test.ts` change only the assertion that Data Center is refused (now accepted with
  an empty email, and an unknown flavor is refused).
- `apps/app/tests/fake-jira/fake-jira.ts`: option `flavor?: "cloud" | "dc"` (default `"cloud"`, so every existing
  test is unchanged). In `"dc"` mode: paths under `/rest/api/2`, `Authorization: Bearer <token>` instead of Basic,
  comment bodies are plain strings, `/myself` answers `{ key, name, displayName }`, history and comment authors carry
  `key` and `name` instead of `accountId`, search is GET `/rest/api/2/search` paged by `startAt`/`maxResults`/`total`,
  issue types from `/rest/api/2/issue/createmeta/<projectKey>/issuetypes`. `server.mjs` takes `--flavor dc`. Keep the
  file importable by Node's type stripping (no enums, no parameter properties).
- `apps/app/tests/unit/jira-dc.test.ts`:
  - `describe("CNX Jira Data Center client", …)` against `startFakeJira({ flavor: "dc" })`: `myself` gives the
    account `key` as id; `project`, `issueTypes`, `permissions`; `createIssue` of an epic and of a child with labels;
    `search` with paging over more than one page and with `changelog`; `issue` (null when gone); `comments` and
    `addComment` as plain text; `setSummary`, `addLabel`, `transitions`, `transition`; a wrong token gives a
    `JiraError` with status 401 and a message starting with `401`; a 429 with a short `Retry-After` is waited out once.
    Every request the fake logged used `/rest/api/2` and a Bearer header.
  - `describe("CNX Jira flavor dc accepted", …)`: `jiraApiFor` returns a working client for `cloud` and for `dc`
    against the matching fake; `settingsFromForm` accepts a Data Center form; the connection test (`server/jira/test.ts`)
    passes all checks against the Data Center fake; one `runRound` of `server/jira/round.ts` with the Data Center client
    and the in-memory store of `tests/unit/jira-sync.test.ts` creates the epic for a synced project in the fake.

## Not

- No change to `features/integrations/jira/*.ts` (the contract and the engine's pure parts), `server/jira/cloud.ts`
  or `round.ts`; if one blocks you, report `blocked` with the path.
- No change to `apps/app/src/components/admin/JiraAdmin.tsx` (the Data Center option in the screen is ADM's, Q3), to
  any schema file or to `apps/app/src/lib/db/` (D6).
- No call to a real Jira.

## Done when

The proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(con-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
