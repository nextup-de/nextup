# Graph fixtures for the ground-truth questions

Microsoft Graph answers for the 21 ground-truth questions of the Acme test pack, so retrieval can be checked
without calling Microsoft (plan CNX).

- `ground-truth/queries.json`, `files.json`: the questions and the files they name. Made-up data; do not edit here.
- `responses/<qid>.json`: one Graph answer per question (D8):
  `{ question, persona, source: "synthetic" | "recorded", recordedAt, request, status, body }`.
  `request` is what `searchRequest(question, 10)` of `src/features/m365/search.ts` builds; `body` is the answer of
  `POST /v1.0/search/query`. A recorded file never holds a token or an Authorization header.
- `fixtures.ts`: loaders, `PERSONA_GROUPS`, `ceilingFor`, `synthesizeResponse`, `toRecordedFixture`, `checkGroundTruth`.
  Pure; no imports from `src/`. The two scripts take the request from the app's own `searchRequest`, so they run with
  `npx tsx`.

## D8: synthetic bodies

One hit per file of `shouldFind` and `mustNotFind` that the persona can read (a reader group shared with the
persona: lena G-ALL G-PRD; ben G-ALL G-HIT; fiona G-ALL G-FIN; erik G-ALL G-OPS G-EXEC G-MGR). The summary carries the
file's marker: confidential `Vertraulich`, strict `Streng vertraulich`, public and internal none.

## D9: what "21 of 21" means

The company ceiling is `needsCeiling` when it is internal or confidential, `internal` when it is null and
`confidential` when it is `never`. The m365 KnowledgeSource, searched as the persona's user with that ceiling and
size 10 against the question's response, must return every `shouldFind` file at or below the ceiling, no
`mustNotFind` file, no hit above the ceiling, and ask for a Graph token of that user only. `checkGroundTruth` checks
the four. The answer text and Microsoft's own permission trimming are checked live in TST.

## Commands (from `apps/app`)

```
npx tsx tests/fixtures/graph/synthesize.mjs          # (re)write the synthetic files; recorded ones are kept
GRAPH_TOKEN_LENA=... npx tsx tests/fixtures/graph/record.mjs lena [--ids q01,q05]
```

Recording (Kevin, against `nextuptest.onmicrosoft.com`): get a Graph access token per persona with the
`Files.Read.All`/`Sites.Read.All` scopes, put it in `GRAPH_TOKEN_<PERSONA>` (upper case) in the shell only, run
`record.mjs <persona>`. It writes `source: "recorded"` over the synthetic file of each of that persona's questions, so
recorded files replace synthetic ones one by one. Commit the result after reading it; it is Microsoft's real answer.
