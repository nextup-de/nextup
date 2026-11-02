---
id: CNX-Z1
title: CNX acceptance on the database, ground truth 21 of 21 and Jira Cloud and
  Data Center sync
wp: Z
needs: [ CNX-A1, CNX-B1, CNX-C1 ]
host: kev-pc
owns:
  - apps/app/tests/db/connectors.test.ts
risk: normal
profile: orch
budget: { minutes: 45, window_pct: 8 }
uses: [ D1, D4, D5, D7, D8, D9, D10, D11 ]
proofs:
  - id: B1
    says: On the database, Microsoft 365 search is switchable per company and passes
      all 21 ground-truth questions by D9, and the in-app Jira sync creates and
      pulls issues against the fake Jira for Cloud and for Data Center
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/connectors.test.ts -t 'CNX acceptance'
status: merged
lane: pc/a
branch: orch/cnx-z1
pr: 272
merge: "77bc0f5"
---

Last task of plan CNX (sub-plan of PILOT): the acceptance test of the phase, on the proof database, over everything
CNX-A1, CNX-B1 and CNX-C1 built. You write only the test file. Read first: `apps/app/tests/db/setup.ts`,
`apps/app/tests/db/integrations.test.ts` and `connections.test.ts` (how DB tests create a company, a sealed token and
an Integration row), `ops/test-db.sh`, `apps/app/tests/fixtures/graph/README.md` and `fixtures.ts`,
`apps/app/src/server/connectors/`, `apps/app/src/server/graph-token.ts`, `apps/app/src/server/jira-sync.ts`
(`syncCompany`), `apps/app/tests/fake-jira/fake-jira.ts`, `apps/app/tests/unit/jira-sync.test.ts`.

## What

- `apps/app/tests/db/connectors.test.ts` with
  `describe("CNX acceptance: ground truth 21 of 21 and Jira Cloud and Data Center sync", …)`. It creates its own
  company and users and never depends on rows it did not write. Tests:
  - **switchable:** with `setM365Search(companyId, false)` `knowledgeSourcesFor` gives `[]`; with `true` it gives the
    adapter `m365`. `workTrackerFor` gives `null` before a Jira row exists.
  - **ground truth 21 of 21:** one user per persona of D8, each with a Connection (sealed refresh token through
    `saveConnection`, a test `CONNECTOR_VAULT_KEY` and the Entra env the token helper needs, set in the test).
    `fetch` is stubbed: the Microsoft token endpoint answers an access token `at-<userId>` for that user's refresh
    token; Graph `POST /v1.0/search/query` with `Bearer at-<userId>` answers the response fixture (`loadResponse`) of
    the question being asked, and records which user's token was used. For each of the 21 questions, search
    `knowledgeSourcesFor(companyId)` as the persona's user with `ceilingFor(question)` and size 10, and judge it with
    `checkGroundTruth`. The test asserts that 21 of 21 pass and, on failure, prints each failing question's `missing`,
    `leaked`, `aboveCeiling` and `foreignToken`.
  - **Jira Cloud and Data Center:** for each flavor (`cloud`, `dc`): start `startFakeJira({ flavor })`, save an
    Integration row for system `jira` with settings pointing at the fake (`siteUrl` = the fake's URL, flavor, project
    key, epic and step type ids of the fake) and the sealed token, switch it on; append the events of an idea decided
    "yes" with a project the sync takes on (as `tests/unit/jira-sync.test.ts` does, through the DB event helpers);
    `syncCompany` creates the epic with label `nextup-<projectId>` in the fake and the log gets `project.linked`; a
    human moves the epic's child or comments in the fake, the next `syncCompany` appends the pulled event;
    `workTrackerFor(companyId)` gives an adapter with `info.id` `jira-cloud` or `jira-dc`.

## Not

- No change outside the test file. If something does not behave as D7-D11 say, do not work around it in the test:
  report `blocked` with the path of the file that needs the change.
- No live call to Microsoft or Jira.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(con-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
