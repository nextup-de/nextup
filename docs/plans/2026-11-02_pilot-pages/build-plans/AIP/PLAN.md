---
id: AIP
project: nextup
title: AI provider and quality
state: active
level: 2
approved:
  [
    { level: 0, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 1, by: kevin, at: 2026-11-02, note: Workbench Control },
    { level: 2, by: kevin, at: 2026-11-02, note: Workbench Control }
  ]
milestone: PILOT AIP
summary: "AIP lets each company choose its AI - Bedrock in Frankfurt, Azure
  OpenAI, its own OpenAI-compatible endpoint, or off - and puts every model call
  (assistant, coach, brain) behind one seam with the data-processing gate, which
  the brain calls lack today. With AI off, raise and routing work by keywords.
  The routing proposal is made on the server when a case is raised, and an
  override rate per company is recorded. An eval set of 84 cases, a third in
  German, runs in CI with a threshold. No schema change and no new package; 6
  tasks, 85 % of a window."
phases:
  - { id: G, title: AI settings and the gate, wps: [ G ], gate: auto }
  - {
      id: W1,
      title: Adapters,
      brain behind the gate,
      eval set,
      wps: [ A, B, E ],
      gate: auto
    }
  - { id: W2, title: Proposal on the server, wps: [ C ], gate: auto }
  - { id: Z, title: Acceptance, wps: [ Z ], gate: auto }
max_parallel: 2
decisions:
  - {
      id: D1,
      text: "(from PILOT/HD13) Plans, code, comments and PRs are in English."
    }
  - {
      id: D2,
      text: "(from PILOT/HD2 and HD8) Every model call goes through the `AiProvider`
        interface of @nextup/contracts/public
        (packages/contracts/src/public/connectors/ai-provider.ts, choices
        bedrock, azure-openai, openai-compatible, off). The provider is chosen
        per company; off is a supported choice, not an error."
    }
  - {
      id: D3,
      text: "(from PILOT/HD7) The core loop works with the AI off: raise and routing
        fall back to the keyword router (features/routing `propose`,
        ROUTER_VERSION keywords-v1) whenever no model may or can answer."
    }
  - {
      id: D4,
      text: "(from PILOT/HD11, HD12 and HQ3) AIP changes no .prisma file (the settings
        live in an Integration row, D5) and no package.json: Bedrock uses
        @anthropic-ai/bedrock-sdk, which is already a dependency; Azure OpenAI
        and OpenAI-compatible endpoints use fetch. The pilot default is Bedrock
        eu-central-1 once a DPA is signed and off until then (HQ3)."
    }
  - {
      id: D5,
      text: "Settings (ADR 0006). The company's AI choice is its `Integration` row
        with system \"ai\": `on` = a model may be called, `settings` = `{
        choice: AiProviderChoice; region: string; model: string; endpoint:
        string | null; deployment: string | null }`, `secretSealed` = the API
        key for azure-openai and openai-compatible, sealed with
        features/connectors/vault.ts and `integrationContext(companyId,
        \"ai\")`. `aiSettings(row, env, stage)` in
        apps/app/src/features/ai/settings.ts (pure): a row wins; without a row a
        demo company gets today's environment rule (LLM_PROVIDER=bedrock with
        LLM_MODEL → bedrock in LLM_REGION, else the mock) and any other stage
        gets off. `type AiSettings = { choice: AiProviderChoice | \"mock\"; …
        }`. DB access in apps/app/src/lib/db/ai.ts: `loadAiSettings(companyId,
        stage)`, `saveAiSettings(companyId, settings, key | null, by)`."
    }
  - {
      id: D6,
      text: "The gate. `aiGate(a: { stage; hasDatabase; settings: AiSettings;
        dpaSignedAt: Date | null; purpose: \"assist\" | \"routing\" | \"coach\"
        | \"brain\"; assistantOn: boolean; aiRouting: boolean }): { on: true;
        settings } | { on: false; why }` in apps/app/src/features/ai/gate.ts
        (pure, fail closed): no database → only the mock, and only in a demo
        stage; demo stage → on with the settings; real stage: choice off → off;
        any choice other than mock needs dpaSignedAt; purpose assist also needs
        `assistantOn` (CompanyConfig.assistant); purpose routing also needs
        `aiRouting` (CompanyConfig.aiRouting, read for the first time here).
        `assistGate` in features/assist/gate.ts becomes a thin wrapper over it
        with the same answers it gives today for assist."
    }
  - {
      id: D7,
      text: "Adapters in apps/app/src/server/ai/: `bedrock.ts` (the
        AnthropicBedrockMantle code moved from server/assist/provider.ts),
        `openai.ts` (POST <endpoint>/chat/completions with fetch; openai-
        compatible sends `Authorization: Bearer <key>`, azure-openai sends
        `api-key: <key>` to `https://<endpoint>/openai/v1/chat/completions` with
        the deployment as the model), `index.ts` with `aiProviderFor(settings,
        key): AiProvider | null` (null for off) implementing `complete` of the
        contract, and the assistant's streaming `Provider` (features/assist) for
        bedrock and both OpenAI kinds. Timeouts 30 s, one retry. Nothing else in
        the app imports the Bedrock SDK."
    }
  - {
      id: D8,
      text: "The brain behind the gate. server/brain.ts asks the brain only when
        `aiGate` with the call's purpose holds (routing for askBrain, brain for
        plan and check-in, coach for the studio coach); otherwise it returns
        null at once and the caller uses its offline answer, as today. For
        azure-openai and openai-compatible companies every brain request carries
        `llm: { base_url, model, api_key }`; services/brain uses it for that
        request instead of LLM_* (never logged); without it the brain uses its
        stack model (Q1)."
    }
  - {
      id: D9,
      text: "Proposal on the server. At case.raised, appendEventAction replaces the
        client's `payload.proposal` with `await proposeOnRaise(slug, companyId,
        payload)` from apps/app/src/server/routing.ts: the brain's proposal when
        the gate (purpose routing) holds and it answers within
        BRAIN_RAISE_TIMEOUT_MS (default 8000), else the keyword proposal
        (`source: \"keywords\"`, ROUTER_VERSION). The route the person chose
        (payload.routeId) is not changed. The reducer still never reads
        `proposal`."
    }
  - {
      id: D10,
      text: "Override rate. `overrideRate(events, from?, to?): { proposed: number;
        overridden: number; rate: number | null }` in
        apps/app/src/features/routing/override.ts (pure): a case counts as
        proposed when its case.raised carries a proposal with a routeId, and as
        overridden when its routeId differs from the proposal's or a
        case.override follows; rate null below 1 proposal. Per company only, no
        per-person number (PILOT/HD5). MET shows it."
    }
  - {
      id: D11,
      text: "Eval set. services/brain/eval/routing_cases.json: at least 84 labelled
        cases `{ id, lang: \"de\" | \"en\", text, route_id }` on acme's routes
        (eval/acme.json), at least a third German, every route at least 6 times,
        no real person or customer name. eval/run_eval.py reads it (as well as
        test_ideas.json) and, with `--recorded <file>`, scores recorded answers
        instead of calling a model; it exits non-zero below the file's
        `threshold` (or `--threshold`). The recorded answers of the last live
        run live in services/brain/eval/recorded/routing.json (route id per case
        id, the model and the prompt version)."
    }
  - {
      id: D12,
      text: "Tests and proofs. App unit tests in apps/app/tests/unit/aip/ (`npm test
        -w @nextup/app -- tests/unit/aip/<file> -t '<title>'`); never edit a
        test directly under apps/app/tests/unit/ (vitest only runs
        tests/unit/**; AIP-G1 waits for CLK-G1, whose task owns
        tests/unit/*.test.ts). DB tests in apps/app/tests/db/aip-*.test.ts and
        the acceptance ai-provider.test.ts, run from the repo root with
        `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
        ops/test-db.sh tests/db/<file> -t '<title>'`. Brain tests run in the uv
        image without a mount: `tar -C services/brain -c . | docker run --rm -i
        ghcr.io/astral-sh/uv:python3.12-bookworm-slim sh -c \"mkdir -p /w && cd
        /w && tar -x && uv sync --frozen && uv run --frozen pytest <file>\"`. No
        test calls a real model: model HTTP is a local fake server or an
        injected fetch."
    }
  - {
      id: D13,
      text: "AIP runs next to CLK and DIR and owns none of their paths. It never
        changes core.prisma, features/clock/**, features/cases/{events,reducer,
        rows}.ts, features/projects/reduce.ts, features/demo/**, lib/db/
        {calendar,companies,events,clock-lease,clock-backfill}.ts,
        server/actions/admin.ts, server/connections.ts, server/jira-sync.ts,
        server/scheduler/**, apps/app/instrumentation.ts (CLK), or
        server/directory/, features/directory/, features/auth/, auth.prisma,
        server/microsoft-login.ts, lib/db/accounts.ts (DIR).
        server/actions/events.ts is changed only by AIP-C1, after CLK-B1. A task
        that needs another of these paths reports `blocked` with the path in
        backticks."
    }
  - {
      id: D14,
      text: "Register rows of docs/audit/gaps whose phase is AIP are listed by AIP-Z1
        in docs/ASSISTANT.md under `## AIP gaps` with the task that answers
        each, or 'open' with a one-line reason."
    }
questions:
  - {
      id: Q1,
      text: "The Python brain speaks only the OpenAI API. Which model does it use for
        a company on Bedrock?",
      default: "The stack's own brain model (LLM_* of the brain container), as today:
        with one stack per company (HD6) that is the company's choice. Bedrock
        for the brain itself (its OpenAI-compatible endpoint or a port of the
        prompts into the app) is a follow-up after the pilot customer's choice
        is known."
    }
  - {
      id: Q2,
      text: "CI has no model. How does the eval run in CI with a threshold?",
      default: "CI job `brain-eval` scores the recorded answers of the last live run
        (eval/recorded/routing.json) against the labels with threshold 0.80, and
        the keyword router against them as the baseline; a live run is by hand
        (`uv run python -m eval.run_eval`) and refreshes the recorded file. The
        threshold is set again after the first live run (PILOT brief)."
    }
  - {
      id: Q3,
      text: "The brief says Victor writes the German cases in wave 1. Does AIP wait
        for him?",
      default: "No: AIP-E1 writes all 84 cases, Victor reviews the German ones
        afterwards and corrects labels in a normal PR."
    }
autonomy:
  merge: [ low, normal ]
  start_high: true
  replan: none
  budget_window_pct: 85 # tasks 70 % + 20 %
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

# AIP AI provider and quality

Sub-plan of PILOT.

## Goal

After AIP, each company chooses its AI provider or none, the routing proposal is made on the server, and routing
quality is measured in CI. On `main` the assistant reads its provider from the environment (`LLM_PROVIDER`), the
brain's calls (routing, plan, check-in, coach) have no data-processing gate at all, `CompanyConfig.aiRouting` is
read nowhere, and the routing proposal is computed in the browser and sent with `case.raised`.

## Scope

- One AI choice per company in an `Integration` row "ai" with a sealed key (D5); the gate for every purpose (D6).
- Adapters bedrock, azure-openai, openai-compatible behind the contract's `AiProvider`; off has none (D7).
- The brain asked only through the gate, with the company's endpoint per request (D8).
- The routing proposal computed on the server at `case.raised` (D9); the override rate per company (D10).
- An eval set of 84 cases, a third German, in CI with a threshold (D11, Q2).

**Takes from:** IDN: seats and `assigneeRoleHolderId` on the raise (unchanged by AIP). STR: `RoutingRule` through
`companySeed`. CNX: `KnowledgeSource` adapter `m365` (the assistant keeps calling it through its tools; AIP changes
only the model behind it). ARC: `AiProvider`, `AiProviderChoice`.

**Hands to:** TST: the provider switch per company (`saveAiSettings`), CI job `brain-eval` (AIP-A1, AIP-E1). MET:
`overrideRate` (AIP-C1). ADM: the AI provider on the connectors page (`loadAiSettings` / `saveAiSettings`).

**Not in scope:** a GPU server; the admin screen for the AI choice (ADM); moving the brain's prompts into the app
(Q1).

## Done when

All proofs are green on `main` and all tasks are merged (work 6/6). That covers the brief: with the provider off,
raise and routing work by keywords; with a fake provider the server stores the proposal; the CI eval reports
accuracy above the threshold (AIP-E1). The acceptance test `apps/app/tests/db/ai-provider.test.ts` › `AIP
acceptance: proposal made on the server, off works, DPA gate holds` is green.

## Phases

- **G AI settings and the gate:** the settings shape and the gate every other task asks; one task.
- **W1 Adapters, brain behind the gate, eval set:** A builds the adapters and moves the assistant and the coach
  onto them, B puts the brain behind the gate and hands it the company's endpoint, E writes the eval set and the CI
  job. Disjoint files (B owns `services/brain/brain` and `tests`, E owns `services/brain/eval` and CI).
- **W2 Proposal on the server:** C needs B's gated brain and CLK-B1's `server/actions/events.ts`.
- **Z Acceptance:** proposal on the server, off, and the DPA gate.

## Work packages

| WP | Content | Tasks | depends on | Owns |
|---|---|---|---|---|
| G | `aiSettings`, `aiGate`, `loadAiSettings` / `saveAiSettings`, `assistGate` as a wrapper | AIP-G1 | IDN-G1, CLK-G1 | `features/ai/{settings,gate}.ts`, `features/assist/gate.ts`, `lib/db/ai.ts` |
| A | Adapters; assistant, coach and admin insight on them | AIP-A1 | G | `server/ai/**`, `server/assist/provider.ts`, `app/api/[company]/assist/route.ts`, `app/api/[company]/ideas/turn/route.ts`, `server/admin-insight.ts` |
| B | Brain behind the gate, `llm` per request | AIP-B1 | G | `server/brain.ts`, `server/actions/brain.ts`, `services/brain/brain/**`, `services/brain/tests/**` |
| E | Eval set, recorded scoring, CI job `brain-eval` | AIP-E1 | G | `services/brain/eval/**`, `.github/workflows/ci.yml` |
| C | Proposal at raise; override rate | AIP-C1 | B, CLK-B1 | `server/routing.ts`, `server/actions/events.ts`, `features/routing/override.ts` |
| Z | Acceptance and gaps | AIP-Z1 | all | `tests/db/ai-provider.test.ts`, `docs/ASSISTANT.md` |

Paths under `apps/app/src/` unless they start with `services/`, `.github/`, `tests/` (under `apps/app/`) or `docs/`.

## Risks

- **AIP runs next to CLK and DIR.** → D13 lists their paths; the only shared file, `server/actions/events.ts`, is
  ordered by `needs` (AIP-C1 after CLK-B1). `max_parallel: 2` since the project has five lanes (2026-11-02).
- **The raise waits for the brain.** On a CPU-only stack the brain takes tens of seconds. → 8 s timeout at raise,
  then the keyword proposal (D9); the case is never refused because of the model.
- **The brain on Bedrock** has no per-company endpoint (Q1). → It keeps the stack's model; Kevin decides the
  follow-up when the pilot customer's provider is known.
- **The eval in CI checks recorded answers, not a live model** (Q2). → It still catches a broken label set, a
  scoring change and a regression of the keyword baseline; the live run refreshes the record by hand.
- **API keys.** → Sealed in the vault (ADR 0006), never logged, never sent to the browser; the brain gets them only
  inside the stack (D8).
- **CI file** (`.github/workflows/ci.yml`, Kevin's, risk_guard) → AIP-E1 is `risk: high`.
- **Budget:** 85 % against 60 % in PILOT (6 tasks, 70 %): the brain's missing gate and the per-request endpoint
  were not in the brief.
