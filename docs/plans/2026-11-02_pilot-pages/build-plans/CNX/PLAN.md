---
id: CNX
project: nextup
title: Knowledge and work connectors
state: archived
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-01, note: Telegram },
    { level: 1, by: kevin, at: 2026-11-01, note: Workbench Control },
    { level: 2, by: kevin, at: 2026-11-01, note: Telegram }
  ]
milestone: PILOT CNX
phases:
  - {
      id: W1,
      title: Microsoft 365 knowledge source and Jira Data Center,
      wps: [ A, B ],
      gate: auto
    }
  - {
      id: W2,
      title: Jira work tracker and connector template,
      wps: [ C ],
      gate: auto
    }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 1
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD2) NextUp integrates into the customer's systems instead of
        building a parallel one. Every external system sits behind one of the
        connector interfaces exported from @nextup/contracts/public
        (IdentityProvider, DirectorySource, NotifyChannel, CaseSource,
        WorkTracker, KnowledgeSource, LogSink, AiProvider). A new system is a
        new adapter; the core does not change."
    }
  - {
      id: D3,
      text: "(from PILOT/HD3) Public contracts (API v1, webhook envelope, connector
        interfaces, event schemas) are only extended, never broken. CNX
        implements KnowledgeSource and WorkTracker exactly as exported by
        @nextup/contracts/public (ARC-B1) and changes nothing under
        packages/contracts/. If a member or field is missing, report `blocked`
        with the path."
    }
  - {
      id: D4,
      text: "(from PILOT/HD7) The core loop (raise, route, answer, decide) works with
        the AI and every integration switched off. A connector that is not
        configured is absent, not an error: knowledgeSourcesFor gives [],
        workTrackerFor gives null, neither throws."
    }
  - {
      id: D5,
      text: "(from PILOT/HD4) No company-specific logic in code. Which connector a
        company uses is read from the database: Microsoft 365 search from
        CompanyConfig.m365Search (read with m365SearchOn from
        apps/app/src/lib/db/connections.ts), Jira from the company's Integration
        row for system \"jira\" (getIntegration, integrationSecrets from
        apps/app/src/lib/db/integrations.ts, settings parsed with
        parseJiraSettings, token opened with the vault exactly as
        apps/app/src/server/jira-sync.ts does)."
    }
  - {
      id: D6,
      text: "CNX changes no file under apps/app/prisma/, apps/app/src/app/,
        apps/app/src/components/, apps/app/src/lib/db/,
        apps/app/src/server/assist/, apps/app/src/features/routing/, packages/,
        nor package.json or package-lock.json. It may import from
        apps/app/src/lib/db/ but not change it. These paths belong to phases
        that run next to CNX (STR, LNG) or after it (AIP, ADM). A change there
        is a `blocked` report with the path, never a workaround."
    }
  - {
      id: D7,
      text: "Adapters and the registry (apps/app/src/server/connectors/, a new
        folder). m365.ts: `m365KnowledgeSource(): KnowledgeSource` with `info =
        { kind: \"KnowledgeSource\", id: \"m365\", contractVersion:
        PUBLIC_CONTRACT_VERSION }`; `search(query)` calls searchM365({
        companyId: query.companyId, userId: query.userId, ceiling }, query.text,
        query.size) from apps/app/src/server/m365-search.ts, where ceiling is
        query.ceiling clamped to \"confidential\" (strictly_confidential is
        never read, as classify.ts ceilingOf), and maps each M365Hit to
        KnowledgeHit `{ id: \"m365:\" + hit.id, source: \"m365\", title,
        snippet, url, classification }`; it searches as query.userId only and
        returns [] on any failure. knowledge.ts: `knowledgeSourcesFor(companyId:
        string): Promise<KnowledgeSource[]>` = [m365KnowledgeSource()] when
        m365SearchOn(companyId), else []. jira.ts: `jiraWorkTracker(api:
        JiraApi, settings: JiraSettings, account: JiraAccount | null):
        WorkTracker` with info id \"jira-cloud\" or \"jira-dc\" by
        settings.flavor. work.ts: `workTrackerFor(companyId: string):
        Promise<WorkTracker | null>`: null unless the Integration row exists and
        is on, its settings parse and its token opens; otherwise
        jiraWorkTracker(jiraApiFor(settings, token), settings, account of the
        row). apps/app/src/server/jira/flavors.ts: `jiraApiFor(settings:
        JiraSettings, token: string): JiraApi` picks cloudApi or dcApi by
        settings.flavor; jira-sync.ts and server/jira/test.ts use it instead of
        their own choice."
    }
  - {
      id: D8,
      text: "Graph fixtures (apps/app/tests/fixtures/graph/).
        ground-truth/queries.json (21 questions q01-q21: id, asPersona,
        question, shouldFind, mustNotFind, answerShouldContain, note,
        needsCeiling) and ground-truth/files.json (one row per file a question
        names: path, file, classification public|internal|confidential|strict,
        lang, readers = group names) come from the Acme SharePoint test pack and
        are on main before CNX starts (Q1); no task changes them. Personas and
        their groups: lena G-ALL G-PRD; ben G-ALL G-HIT; fiona G-ALL G-FIN; erik
        G-ALL G-OPS G-EXEC G-MGR. responses/<qid>.json, one per question: `{
        question: <qid>, persona, source: \"synthetic\" | \"recorded\",
        recordedAt: <ISO> | null, request: <SearchRequest of
        features/m365/search.ts for the question>, status: <HTTP status>, body:
        <Graph POST /v1.0/search/query response> }`. A synthetic body holds, in
        Graph's shape (value[0].hitsContainers[0].hits[], resource with
        @odata.type #microsoft.graph.driveItem, id, name, webUrl
        https://nextuptest.sharepoint.com/sites/<site>/<path>, summary with <c0>
        highlights), one hit per file of the question's shouldFind and
        mustNotFind that the persona can read (readers share a group with the
        persona), and a summary that carries the file's marker: confidential
        `Vertraulich`, strict `Streng vertraulich`, public and internal none. A
        recorded body is Microsoft's real answer, written by record.mjs; it
        never contains a token or an Authorization header."
    }
  - {
      id: D9,
      text: "What \"ground truth 21 of 21\" means in CNX (the retrieval part; the
        answer text and Microsoft's own permission trimming are checked live in
        TST against the test tenant nextuptest.onmicrosoft.com). For each
        question: the company ceiling is needsCeiling when it is internal or
        confidential, \"internal\" when it is null, and \"confidential\" when it
        is \"never\". The m365 KnowledgeSource, searched as the persona's user
        with that ceiling and size 10 against the question's response fixture,
        returns every shouldFind file whose classification is at or below the
        ceiling, no mustNotFind file, no hit above the ceiling, and asks for a
        Graph token of the asking user only. A question passes when all four
        hold; 21 of 21 must pass."
    }
  - {
      id: D10,
      text: "Jira Data Center client (apps/app/src/server/jira/dc.ts,
        `createDcApi(settings, token, opts?: { fetch?, sleep? }): JiraApi` and
        `dcApi: JiraApiFactory`), for Jira Data Center 9.x: base
        `<siteUrl>/rest/api/2`; `Authorization: Bearer <personal access token>`;
        plain-text bodies for comments and descriptions (no ADF); search with
        GET `/search` and `jql`, `fields`, `startAt`, `maxResults`,
        `expand=changelog`, paged by startAt until total, at most the page
        limits of cloud.ts; users identified by `key` (Data Center has no
        accountId): JiraAccount.id = /myself `key`, JiraAccount.name =
        displayName, and JiraUserRef.accountId = the author's `key`; issue types
        from `/issue/createmeta/<projectKey>/issuetypes`; permissions from
        `/mypermissions?projectKey=<key>`; errors, timeouts and 429 handling
        exactly as cloud.ts (JiraError whose message starts with the HTTP
        status). settings.flavor \"dc\" has an empty email."
    }
  - {
      id: D11,
      text: "Jira behind WorkTracker (jiraWorkTracker, D7). ensureContainer: the epic
        with label `label` (search `project = <key> AND labels = \"<label>\"`),
        adopted when it exists, else created with settings.epicTypeId and
        summary `title`. ensureItem: the issue with label `label` under
        containerKey, adopted or created with settings.stepTypeId. setSummary,
        moveItem and markRemoved behave as the jobs `summary`, `transition` and
        `remove` of features/integrations/jira/types.ts (transition by
        statusFor, else by status category as
        features/integrations/jira/status.ts; markRemoved = a comment and the
        label `nextup-removed`, never a delete). changes: issues of the project
        (or with label `nextup-<projectId>` and its children when projectId is
        set) updated since the cursor, with changelog: a status change gives
        kind \"state\" with state todo (category new), doing (indeterminate) or
        done (done); a summary change kind \"summary\"; a comment kind
        \"comment\"; changes authored by the integration account are skipped;
        cursor = ISO time of the newest change returned, null when nothing
        changed; delivery is at least once. ensure* return WorkItemRef { system:
        \"jira\", key, url } with url from jiraIssueUrl. The sync engine
        (server/jira/round.ts, features/integrations/jira/plan.ts, pull.ts)
        keeps using JiraApi directly; CNX does not rewire it (Q2)."
    }
questions:
  - {
      id: Q1,
      text: "The 21 ground-truth questions live only in the Acme SharePoint test pack
        on Kevin's laptop (not in the repo; its README says not to commit the
        pack because directory/users.csv holds passwords). Lane sessions on
        kev-pc cannot read it. How do they get into the repo?",
      default: "Before L2 the main chat opens PR `data/CNX` that adds only
        apps/app/tests/fixtures/graph/ground-truth/queries.json (the 21
        questions without the asUser e-mail addresses) and
        ground-truth/files.json (the 14 manifest rows the questions name), both
        made-up test data; Kevin merges it. CNX-A1 reports `blocked` if they are
        missing.",
      blocks: [ CNX-A1 ]
    }
  - {
      id: Q2,
      text: "Should CNX rewire the existing Jira sync engine (round.ts, plan.ts,
        pull.ts) onto WorkTracker?",
      default: "No. The engine already sits behind JiraApi with Cloud and Data Center
        clients and is tested; CNX adds the WorkTracker adapter over the same
        client, proves it, and makes it the public face for later phases (D11).
        A rewrite would change a tested engine for no visible gain."
    }
  - {
      id: Q3,
      text: "The Jira admin form (apps/app/src/components/admin/JiraAdmin.tsx) shows
        Data Center as 'later'. That file is under src/components, which LNG
        owns while CNX runs. Who switches the option on?",
      default: "CNX makes Data Center accepted everywhere below the screen
        (settingsFromForm in features/admin/jira-admin.ts, the connection test,
        the sync); the one select option in JiraAdmin.tsx is switched on by ADM,
        whose brief owns connector settings. Until then a Data Center site is
        configured through /admin by Kevin."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 60
talk:
  telegram:
    [
      question_open,
      blocked_twice,
      proof_red_twice,
      budget_over,
      gate_kevin,
      merge_waiting,
      start_high,
      other_repo,
      plan_done
    ]
  pane: [ blocked, task_merged, phase_done ]
  none: [ task_started ]
---

# CNX Knowledge and work connectors

Sub-plan of PILOT. (Called CON in PILOT's first draft and in ADR 0007; renamed because `CON` is a reserved file name
on Windows.)

## Goal

After CNX, the assistant's Microsoft 365 search sits behind the `KnowledgeSource` interface as the adapter `m365`, and
Jira (Cloud and Data Center) sits behind `WorkTracker`, both chosen per company from the database. The 21 ground-truth
questions of the Acme test pack pass the retrieval check on Graph fixtures (D9), and the Jira sync runs against the fake
Jira for Cloud and for Data Center. The next system (Confluence, Azure DevOps) is a new adapter by a written template.

## Scope

- `apps/app/src/server/connectors/`: `m365.ts`, `knowledge.ts`, `jira.ts`, `work.ts` (D7); the assistant's search
  (`apps/app/src/server/assist-search.ts`) asks `knowledgeSourcesFor` instead of calling Microsoft 365 directly.
- Graph fixtures and a recorder in `apps/app/tests/fixtures/graph/` (D8): one response per ground-truth question,
  synthetic now, replaceable by `record.mjs` with real answers from the test tenant.
- Jira Data Center client (`apps/app/src/server/jira/dc.ts`, D10), the fake Jira in a Data Center mode, flavor choice
  in one place (`server/jira/flavors.ts`), Data Center accepted by the admin form logic and the connection test.
- Jira `WorkTracker` adapter (D11) and a connector template `docs/connectors/README.md`; `docs/INTEGRATIONS.md`
  brought in line.

**Takes from:** ARC: `KnowledgeSource`, `KnowledgeQuery`, `KnowledgeHit`, `WorkTracker`, `WorkItemRef`, `WorkChange`,
`WorkChangePage`, `WORK_ITEM_STATES`, `PUBLIC_CONTRACT_VERSION` from `@nextup/contracts/public`;
`apps/app/prisma/schema/integrations.prisma` (read only, D6).

**Hands to:** AIP: the `KnowledgeSource` adapter `m365` and `knowledgeSourcesFor` (proof CNX-A1/B1, B3). TST: both
adapters switchable per company (CNX-A1/B3, CNX-C1/B2) and the fixture recorder `tests/fixtures/graph/` (CNX-A1/B2).

**Not in scope:** Confluence, file shares, ServiceNow; any schema change (D6); the Microsoft 365 data page (step 2.7
of `docs/plans/2026-10-22_sso-and-data-access.md`, a page under `src/app`, goes to ADM); the Data Center option in the
admin screen (Q3, ADM); rewiring the Jira engine onto `WorkTracker` (Q2); live Graph or Jira calls in any proof (TST
does the live run).

## Done when

All proofs of the tasks are green on `main` (proof 8/8) and all tasks are merged (work 4/4). In particular
`apps/app/tests/db/connectors.test.ts` › `CNX acceptance: ground truth 21 of 21 and Jira Cloud and Data Center sync`
is green: 21 of 21 questions pass D9, no document reaches a person above the ceiling or through another person's
token, and the in-app sync creates and pulls Jira issues against the fake Jira for Cloud and for Data Center. Every
"Hands to" item has its own green proof.

## Waves

- **W1:** the Microsoft 365 knowledge source (A) and the Jira Data Center client (B) share no file. `max_parallel: 1`
  because STR and LNG run next to CNX on the project's other two lanes, so they run one after the other.
- **W2:** the Jira work tracker (C) builds on `jiraApiFor` and the Data Center client from B, and the connector
  template describes both adapters.
- **Z Acceptance:** one DB test over the registry, both adapters and the sync with both flavors. It owns only its
  test file.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| A | `m365` KnowledgeSource, `knowledgeSourcesFor`, assistant search through it, Graph fixtures and recorder | CNX-A1 | ARC-Z1 | `src/server/connectors/m365.ts`, `knowledge.ts`, `src/server/m365-search.ts`, `src/server/assist-search.ts`, `tests/fixtures/graph/**` (not `ground-truth/`), `tests/unit/connectors/m365-knowledge.test.ts`, `graph-fixtures.test.ts`, `tests/unit/assist-m365.test.ts` |
| B | Jira Data Center client, fake Jira DC mode, `jiraApiFor`, DC accepted by admin logic and connection test | CNX-B1 | ARC-Z1 | `src/server/jira/dc.ts`, `flavors.ts`, `test.ts`, `src/server/jira-sync.ts`, `src/features/admin/jira-admin.ts`, `tests/fake-jira/**`, `tests/unit/jira-dc.test.ts`, `tests/unit/admin-jira.test.ts` |
| C | Jira `WorkTracker`, `workTrackerFor`, connector template, INTEGRATIONS.md | CNX-C1 | B | `src/server/connectors/jira.ts`, `work.ts`, `tests/unit/connectors/jira-work-tracker.test.ts`, `docs/connectors/README.md`, `docs/INTEGRATIONS.md` |
| Z | Acceptance | CNX-Z1 | A, B, C | `tests/db/connectors.test.ts` |

(Paths under `apps/app/` unless they start with `docs/`.)

## Risks

- **The brief is older than main.** Microsoft 365 PR A-C (#236, #243, #244: sealed tokens, token helper, Graph search
  in `searchDocuments`) and the in-app Jira engine (#245-#249) are already merged. What is left is the seam
  (`KnowledgeSource`, `WorkTracker`), the Data Center client, and the ground-truth check. → CNX is cut to 4 tasks; the
  data page of PR D goes to ADM, the docs of PR D are in CNX-C1.
- **"21 of 21" cannot be live in a lane.** Lanes have no tenant credentials and proofs never call Microsoft. → D9
  checks the retrieval part on fixtures; the answer text and Microsoft's own trimming are TST's live run.
  `record.mjs` replaces the synthetic responses with recorded ones when Kevin runs it against the test tenant.
- **The ground-truth data is not in the repo** (Q1). → Prerequisite PR `data/CNX` before L2; without it CNX-A1 is
  blocked by Q1 and reports `blocked`.
- **Data Center differs from Cloud in auth, paging, users and bodies.** → D10 fixes the differences; the fake Jira
  gets a Data Center mode and the same behaviour tests run against both.
- **The shared proof database.** CNX-Z1 runs `ops/test-db.sh` on `localhost:5442`, which truncates tables; STR and LNG
  may run DB proofs on the same database at the same time. → Flagged for the main chat (one DB proof at a time, or a
  database per lane); CNX-Z1 creates its own company and never depends on rows it did not write.
- **CNX touches the assistant's search** (`server/assist-search.ts`, not `server/assist/`). → Its signature and
  results stay the same; `tests/unit/assist-m365.test.ts` stays green; AIP later owns the assistant itself.
