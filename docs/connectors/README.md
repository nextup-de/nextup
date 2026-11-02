# Adding a connector

How a new system (Azure DevOps, Confluence, …) is added to NextUp. The core never changes: a new system is a new
adapter ([ADR 0002](../adr/0002-connector-interfaces.md), [ADR 0006](../adr/0006-config-not-code.md)). Two adapters
are the worked examples: Microsoft 365 search (`m365.ts`, a `KnowledgeSource`) and Jira (`jira.ts`, a `WorkTracker`).

## 1. Pick the interface

Every system sits behind one of the eight interfaces exported from `@nextup/contracts/public`
(`packages/contracts/src/public/connectors/`): IdentityProvider, DirectorySource, NotifyChannel, CaseSource,
WorkTracker, KnowledgeSource, LogSink, AiProvider. Pick the one that fits; a tracker is a `WorkTracker`, a search is a
`KnowledgeSource`. Public contracts are only extended, never broken (D3): if a member or field is missing, it is added
as an optional field or a new export in its own change, not worked around in the adapter.

## 2. Write the adapter

One file per adapter: `apps/app/src/server/connectors/<id>.ts`, exporting a factory that returns the interface with
`info = { kind, id, contractVersion: PUBLIC_CONTRACT_VERSION }`.

- `m365.ts`: `m365KnowledgeSource()` calls the existing Graph search, maps hits, searches as the asking user only and
  returns `[]` on any failure.
- `jira.ts`: `jiraWorkTracker(api, settings, account)` sits over the `JiraApi` client (`server/jira/cloud.ts` or
  `dc.ts`, picked by `jiraApiFor` in `flavors.ts`), so Cloud and Data Center are one adapter with two ids
  (`jira-cloud`, `jira-dc`). Reuse the pure helpers of the existing feature code; do not change them.

The adapter holds no company-specific logic and is not a `"use server"` module: whoever calls it passes the viewer.

## 3. Choose it per company

Which adapter a company uses is read from the database, never from code (D5): no `if (slug === …)`. Add one
registry function next to the others in `src/server/connectors/`:

- `knowledgeSourcesFor(companyId)` (`knowledge.ts`) gives `[m365KnowledgeSource()]` when the company switched on
  Microsoft 365 search, else `[]`.
- `workTrackerFor(companyId)` (`work.ts`) reads the company's `Integration` row for the system, parses its settings,
  opens the sealed token with the vault (`integrationContext(companyId, system)`, as `server/jira-sync.ts` does) and
  builds the adapter. Secrets only ever travel through the vault; they are never in settings, logs or code.

A connector that is not configured is absent, not an error (D4): the registry gives `[]` or `null` and never throws.
The core loop works with every integration off.

## 4. Fixtures and fakes

Nothing in the tests talks to the real system. Use recorded or synthesized responses, like `tests/fixtures/graph/`
for Microsoft Graph, and for a system with state a small fake server, like `tests/fake-jira/fake-jira.ts` (node:http,
no dependencies, Cloud and Data Center dialects, a request log). Build the fixture so the same adapter test can run
against each dialect.

## 5. Proofs

A new adapter ships with:

1. a test that the adapter satisfies the interface, its `info.id`, and every method against the fake or the fixtures
   (see `tests/unit/connectors/jira-work-tracker.test.ts`, `m365-knowledge.test.ts`);
2. outputs parsed by the contract's own zod schemas;
3. a registry test: configured and valid gives the adapter; off, missing, bad settings, unreadable token and a
   throwing read each give "off" (`[]` / `null`);
4. `npm run lint && npm run typecheck && npm test && npm run build` green.
