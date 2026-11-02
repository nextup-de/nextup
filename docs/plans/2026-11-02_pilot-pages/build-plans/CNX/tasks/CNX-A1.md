---
id: CNX-A1
title: Microsoft 365 behind KnowledgeSource, with Graph fixtures for the 21
  ground-truth questions
wp: A
needs: [ ARC-Z1 ]
host: any
owns:
  - apps/app/src/server/connectors/m365.ts
  - apps/app/src/server/connectors/knowledge.ts
  - apps/app/src/server/m365-search.ts
  - apps/app/src/server/assist-search.ts
  - apps/app/tests/fixtures/graph/README.md
  - apps/app/tests/fixtures/graph/fixtures.ts
  - apps/app/tests/fixtures/graph/synthesize.mjs
  - apps/app/tests/fixtures/graph/record.mjs
  - apps/app/tests/fixtures/graph/responses/**
  - apps/app/tests/unit/connectors/m365-knowledge.test.ts
  - apps/app/tests/unit/connectors/graph-fixtures.test.ts
  - apps/app/tests/unit/assist-m365.test.ts
risk: normal
profile: orch
budget: { minutes: 105, window_pct: 17 }
uses: [ D1, D2, D3, D4, D5, D6, D7, D8, D9 ]
proofs:
  - id: B1
    says: The m365 KnowledgeSource searches Microsoft 365 as the asking user only,
      maps hits to KnowledgeHit with source m365, never returns a hit above the
      ceiling and gives [] on any failure
    run: npm test -w @nextup/app -- tests/unit/connectors/m365-knowledge.test.ts -t
      'CNX m365 knowledge source'
  - id: B2
    says: Every ground-truth question has a response fixture in the recorder's
      format, the fixtures follow D8, and the recorder writes that format
      without a token
    run: npm test -w @nextup/app -- tests/unit/connectors/graph-fixtures.test.ts -t
      'CNX graph fixtures'
  - id: B3
    says: knowledgeSourcesFor gives the m365 adapter only when the company has
      Microsoft 365 search on, and the assistant's search goes through it
    run: npm test -w @nextup/app -- tests/unit/connectors/m365-knowledge.test.ts -t
      'CNX knowledge sources per company'
status: merged
lane: pc/a
branch: orch/cnx-a1
pr: 266
merge: "944208c"
---

First task of plan CNX (sub-plan of PILOT): put the live Microsoft 365 search that is already on main behind the
`KnowledgeSource` interface of `@nextup/contracts/public`, chosen per company, and give the 21 ground-truth questions of
the Acme test pack a Graph response fixture each, so later phases and the acceptance test can check retrieval without
calling Microsoft. Read first: `AGENTS.md`, `docs/README.md`, `docs/adr/0002-connector-interfaces.md` (section
`KnowledgeSource`), `packages/contracts/src/public/connectors/knowledge-source.ts`,
`docs/plans/2026-10-22_sso-and-data-access.md` (phase 2), `apps/app/src/server/m365-search.ts`,
`apps/app/src/features/m365/search.ts`, `apps/app/src/server/graph-token.ts`, `apps/app/src/server/assist-search.ts`,
`apps/app/src/features/assist/classify.ts`, `apps/app/src/features/assist/redact.ts` (`markerOf`),
`apps/app/src/lib/db/connections.ts`, `apps/app/tests/unit/m365-search.test.ts`, `apps/app/tests/unit/assist-m365.test.ts`,
and `apps/app/tests/fixtures/graph/ground-truth/queries.json` and `files.json`.

`apps/app/tests/fixtures/graph/ground-truth/` is on main before this task (Q1). If it is missing, report `blocked`
with that path; never write those files yourself.

## What

- `apps/app/src/server/connectors/m365.ts`: `m365KnowledgeSource(): KnowledgeSource` exactly as D7 says (info,
  ceiling clamp to `confidential`, mapping to `KnowledgeHit` with `id` `"m365:" + hit.id` and `source` `"m365"`,
  search as `query.userId` only, `[]` on any failure). The file starts with a comment saying what it is and that the
  interface comes from ADR 0002. Not a "use server" module.
- `apps/app/src/server/connectors/knowledge.ts`: `knowledgeSourcesFor(companyId)` (D7): `[m365KnowledgeSource()]`
  when `m365SearchOn(companyId)`, else `[]`; a failing read gives `[]` (D4).
- `apps/app/src/server/m365-search.ts`: change only if the adapter needs it (for example to accept a `size` above 5,
  which `searchRequest` caps at 10); keep its behaviour and its logging rule (counts and timings only).
- `apps/app/src/server/assist-search.ts`: `searchDocumentsFor` asks `knowledgeSourcesFor(v.companyId)` and searches
  each source with `{ companyId, userId, text: query, size: limit, ceiling }`, mapping `KnowledgeHit` to `DocHit`
  (`id`, `title`, `snippet`, `classification`, `source`, `url`) and merging with the local hits through `mergeHits`
  as today. Signature, result and timing behaviour stay the same (Microsoft slow or down costs at most its 3 s, never
  the local hits). Keep `apps/app/tests/unit/assist-m365.test.ts` green; adjust its mocks only where the call path
  moved.
- `apps/app/tests/fixtures/graph/fixtures.ts` (pure, no test-runner imports, syntax Node's type stripping can run
  like `tests/fake-jira/fake-jira.ts`): types for a question, a file row and a response fixture (D8);
  `PERSONA_GROUPS` (D8); `loadQuestions()`, `loadFiles()`, `loadResponse(qid)`; `ceilingFor(question)` (D9);
  `synthesizeResponse(question, files): ResponseFixture` (D8, `source: "synthetic"`, `recordedAt: null`, `status`
  200, `request` = `searchRequest(question.question, 10)` of `features/m365/search.ts` copied as plain data, no import
  from `src/`); `toRecordedFixture(question, persona, request, status, body, at)`; `checkGroundTruth(question, hits,
  tokenUsers)` returning `{ id, pass, missing: string[], leaked: string[], aboveCeiling: string[], foreignToken:
  boolean }` by D9 (a hit maps to a file by `webUrl` ending in the file's path, URL-decoded).
- `apps/app/tests/fixtures/graph/synthesize.mjs`: writes `responses/<qid>.json` for every question with
  `synthesizeResponse`; run it once and commit the 21 files. Made-up data only.
- `apps/app/tests/fixtures/graph/record.mjs` (`node tests/fixtures/graph/record.mjs <persona> [--ids q01,q05]`):
  reads a Graph access token for the persona from the environment variable `GRAPH_TOKEN_<PERSONA>` (upper case),
  sends each question's `request` to `POST https://graph.microsoft.com/v1.0/search/query`, and writes the answer with
  `toRecordedFixture`. It never prints or writes the token or any header. You do not run it (no tenant in a lane).
- `apps/app/tests/fixtures/graph/README.md`: what is here, D8, D9, how to synthesize and how Kevin records against
  the test tenant, and that recorded files replace synthetic ones one by one.
- `apps/app/tests/unit/connectors/m365-knowledge.test.ts`:
  - `describe("CNX m365 knowledge source", …)`: with `@/server/graph-token` mocked (a token per user, recording which
    user was asked) and `fetch` stubbed to answer from a response fixture: `info` is `{ kind: "KnowledgeSource", id:
    "m365", contractVersion: 1 }` and the adapter `satisfies KnowledgeSource`; every returned hit is accepted by
    `KnowledgeHit` from `@nextup/contracts/public`; only `query.userId` was asked for a token; a `Streng vertraulich`
    hit never comes back, a `Vertraulich` hit only with ceiling `confidential`; ceiling `strictly_confidential` is
    treated as `confidential`; a 500, a timeout and no token each give `[]`; q01 and q06 pass `checkGroundTruth`.
  - `describe("CNX knowledge sources per company", …)`: with `@/lib/db/connections` mocked: `m365SearchOn` true gives
    one source with id `m365`, false gives `[]`, a throwing read gives `[]`; `searchDocumentsFor` with the switch off
    calls no Microsoft code and returns the local hits.
- `apps/app/tests/unit/connectors/graph-fixtures.test.ts`, `describe("CNX graph fixtures", …)`: 21 questions q01-q21
  and a response file for each; every response has the D8 fields, `question` and `persona` matching its question,
  a body that `readSearchResponse` of `features/m365/search.ts` reads without throwing, and no hit for a file the
  persona cannot read (synthetic only); every file a question names is in `files.json`; `toRecordedFixture` output
  has `source: "recorded"` and contains no string `Bearer` and no key `authorization`; `record.mjs` contains no
  `console.log` of the token variable (read the file as text).

## Not

- No schema change, no route, no page, no change under `apps/app/src/lib/db/` or `apps/app/src/server/assist/` (D6).
- No change to `apps/app/tests/fixtures/graph/ground-truth/` (Q1) or to `features/m365/search.ts` and `token.ts`
  (they work; if one blocks you, report `blocked` with the path).
- No live call to Microsoft in any test.

## Done when

The proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(con-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
