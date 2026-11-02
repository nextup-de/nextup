---
id: CNX-C1
title: Jira behind WorkTracker, chosen per company, and the connector template
wp: C
needs: [ CNX-B1 ]
host: any
owns:
  - apps/app/src/server/connectors/jira.ts
  - apps/app/src/server/connectors/work.ts
  - apps/app/tests/unit/connectors/jira-work-tracker.test.ts
  - docs/connectors/README.md
  - docs/INTEGRATIONS.md
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D2, D3, D4, D5, D6, D7, D10, D11 ]
proofs:
  - id: B1
    says: jiraWorkTracker implements WorkTracker over JiraApi and behaves the same
      against the fake Jira in Cloud and Data Center mode
    run: npm test -w @nextup/app -- tests/unit/connectors/jira-work-tracker.test.ts
      -t 'CNX Jira work tracker'
  - id: B2
    says: workTrackerFor gives the Jira adapter only for a company whose Jira row is
      on with valid settings and a readable token, and the connector template
      names every step of a new adapter
    run: npm test -w @nextup/app -- tests/unit/connectors/jira-work-tracker.test.ts
      -t 'CNX work tracker per company'
status: merged
lane: pc/a
branch: orch/cnx-c1
pr: 269
merge: "89958f8"
---

Plan CNX (sub-plan of PILOT): put Jira behind the public `WorkTracker` interface, so later phases and the next
system (Azure DevOps) talk to a tracker, not to Jira, and write down how a new connector is added. CNX-B1 already
wrote the Data Center client, the fake's Data Center mode and `jiraApiFor` in `apps/app/src/server/jira/flavors.ts`.
Read first: `docs/adr/0002-connector-interfaces.md` (section `WorkTracker`), `docs/adr/0006-config-not-code.md`,
`packages/contracts/src/public/connectors/work-tracker.ts`, `apps/app/src/features/integrations/jira/types.ts`,
`settings.ts` (`jiraIssueUrl`), `status.ts`, `pull.ts`, `apps/app/src/server/jira/round.ts`, `flavors.ts`,
`apps/app/src/server/jira-sync.ts` (how the token is opened), `apps/app/src/lib/db/integrations.ts`,
`apps/app/src/server/connectors/m365.ts` and `knowledge.ts` (written by CNX-A1), `apps/app/tests/fake-jira/fake-jira.ts`,
`docs/INTEGRATIONS.md`.

## What

- `apps/app/src/server/connectors/jira.ts`: `jiraWorkTracker(api, settings, account): WorkTracker` by D11, with
  `info = { kind: "WorkTracker", id: settings.flavor === "dc" ? "jira-dc" : "jira-cloud", contractVersion:
  PUBLIC_CONTRACT_VERSION }`. Reuse the pure helpers of `features/integrations/jira/` (status picking, labels, issue
  URL, ADF is handled inside the clients); do not change them.
- `apps/app/src/server/connectors/work.ts`: `workTrackerFor(companyId)` by D7 (null when Jira is off, missing, its
  settings do not parse or its token cannot be opened; never throws, D4).
- `apps/app/tests/unit/connectors/jira-work-tracker.test.ts`:
  - `describe("CNX Jira work tracker", …)`, every test run once with `startFakeJira({ flavor: "cloud" })` and once
    with `{ flavor: "dc" }` (`describe.each` or a loop, the outer title stays `CNX Jira work tracker`): the adapter
    `satisfies WorkTracker` and `info.id` is `jira-cloud` or `jira-dc`; `ensureContainer` twice with the same label
    creates one epic and returns the same `WorkItemRef` (accepted by its schema); `ensureItem` creates one child under
    it; `setSummary`; `moveItem` to `doing` and then `done` reaches a done status through the fake's workflow;
    `markRemoved` adds a comment and the label `nextup-removed` and deletes nothing; `changes` after a human moves an
    issue and comments in the fake returns a `WorkChangePage` (accepted by its schema) with a `state` change and a
    `comment` change, skips the integration account's own changes, and a second call with the returned cursor brings
    no new change.
  - `describe("CNX work tracker per company", …)` with `@/lib/db/integrations` mocked and a test vault key: Jira on
    with valid settings and a sealed token gives an adapter (`jira-cloud`, and `jira-dc` for a Data Center row); off,
    missing, bad settings, a token that does not open, and a throwing read each give `null`. Plus a test that
    `docs/connectors/README.md` has the headings `## 1. Pick the interface`, `## 2. Write the adapter`,
    `## 3. Choose it per company`, `## 4. Fixtures and fakes`, `## 5. Proofs`, and names `knowledgeSourcesFor`,
    `workTrackerFor`, `m365.ts` and `jira.ts`.
- `docs/connectors/README.md`: the connector template for the next system, in those five sections: which interface
  of ADR 0002 (and that it is extended only by D3), where the adapter file goes (`src/server/connectors/<id>.ts`),
  how it is chosen per company from the database (D5, ADR 0006, no `if (slug === …)`), secrets through the vault,
  fixtures recorded or synthesized (like `tests/fixtures/graph/`) and a fake server (like `tests/fake-jira/`), the
  proofs it needs, and that a missing adapter is "off" (D4). The two adapters of CNX as worked examples.
- `docs/INTEGRATIONS.md`: Microsoft 365 search as the `KnowledgeSource` adapter `m365` and Jira as the `WorkTracker`
  adapters `jira-cloud` and `jira-dc`; Jira Data Center supported (REST v2, personal access token, D10); a link to
  `docs/connectors/README.md`. Update its `Updated` line if it has one.

## Not

- No change to the sync engine (`server/jira/round.ts`, `features/integrations/jira/plan.ts`, `pull.ts`); it keeps
  using `JiraApi` (Q2).
- No change to `server/jira/cloud.ts`, `dc.ts`, `flavors.ts` (CNX-B1), `server/connectors/m365.ts`, `knowledge.ts`
  (CNX-A1), `apps/app/src/lib/db/` or any schema (D6). If one blocks you, report `blocked` with the path.

## Done when

The proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(con-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
