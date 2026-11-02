---
id: AIP-B1
title: The brain is asked only through the gate and uses the company's endpoint
wp: B
needs: [ AIP-G1, IDN-Z1 ]
host: any
owns:
  - apps/app/src/server/brain.ts
  - apps/app/src/server/actions/brain.ts
  - services/brain/brain/**
  - services/brain/tests/**
  - services/brain/README.md
  - apps/app/tests/unit/aip/brain-gate.test.ts
  - apps/app/src/lib/db/assist.ts
  - apps/app/src/app/api/[company]/ideas/turn/route.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D3, D5, D6, D8, D12, D13 ]
proofs:
  - id: B1
    says: a real company without a DPA, with off or (for routing) without aiRouting
      never reaches the brain and gets the offline answer, and an azure or
      openai-compatible company's request carries its llm endpoint
    run: npm test -w @nextup/app -- tests/unit/aip/brain-gate.test.ts -t 'AIP brain
      gate'
  - id: B2
    says: the brain answers a request with an llm block through that endpoint and
      model, falls back to its own settings without one, and never logs the key
    run: tar -C services/brain -c . | docker run --rm -i
      ghcr.io/astral-sh/uv:python3.12-bookworm-slim sh -c "mkdir -p /w && cd /w
      && tar -x && uv sync --frozen && uv run --frozen pytest
      tests/test_llm_override.py"
    expect: '[1-9]\d* passed'
status: merged
lane: pc/b
branch: orch/aip-b1
answers: 1
last_failure: "Du hast gemeldet «blocked: the studio coach is still ungated
  because I need `apps/app/src/app/api/[company]/ideas/turn/route.ts`, and
  `claim` refused it (it belongs to the running task AIP-A1).». Antwort:
  Freigegeben: `apps/app/src/app/api/[company]/ideas/turn/route.ts` gehört jetzt
  zu deinem Besitz. Mach dort weiter und melde am Ende wieder."
pr: 320
merge: "61b7226"
---

Plan AIP (sub-plan of PILOT): the brain. On `main` `brainProposalAction`, the plan and check-in actions and the
studio's coach call the brain whenever `BRAIN_URL` is set, without the data-processing gate the assistant has, and
`CompanyConfig.aiRouting` is read nowhere. Read first: D8 of the plan, `apps/app/src/server/brain.ts`,
`apps/app/src/server/actions/brain.ts`, `apps/app/src/features/ai/{settings,gate}.ts`, `apps/app/src/lib/db/ai.ts`,
`services/brain/README.md`, `services/brain/brain/{main,llm,config,schemas,route,plan,coach}.py`,
`services/brain/tests/conftest.py`.

## What

- `apps/app/src/server/brain.ts`: every `askBrain*` takes the company's gate result first (`aiGate` with purpose
  routing for `askBrain`, brain for plan and check-in, coach for the coach); a closed gate returns null without a
  request. For azure-openai and openai-compatible the request body gets `llm: { base_url, model, api_key }` (azure:
  base_url `https://<endpoint>/openai/v1`, model the deployment). `brainConfigured` stays.
- `apps/app/src/server/actions/brain.ts`: loads the company's settings, `CompanyConfig.assistant`, `aiRouting` and
  `dpaSignedAt` (through `lib/db/ai.ts` and `lib/db/assist.ts`) and passes them in; without a database the demo rule
  of D6.
- `services/brain/brain/schemas.py`: an optional `llm: LlmOverride | None` (`base_url`, `model`, `api_key`) on every
  request model; `llm.py`: a client per request when it is set (no global state, the key never in a log line or an
  error message); `main.py`, `route.py`, `plan.py`, `coach.py` pass it through. `README.md`: the field.
- Tests:
  - `apps/app/tests/unit/aip/brain-gate.test.ts`, `describe("AIP brain gate", …)` with an injected fetch: a sandbox
    company without dpaSignedAt makes no request and `askBrain` gives null; with a DPA and `aiRouting: false` routing
    makes no request but plan does; an openai-compatible company's body has `llm.base_url`, `llm.model`,
    `llm.api_key`; a demo company without a row sends no `llm`.
  - `services/brain/tests/test_llm_override.py`: a route request with `llm` calls a mocked OpenAI client built with
    that base_url, key and model; without `llm` the settings' client; with caplog at DEBUG no record contains the
    key.

## Not

- No adapter in the app (AIP-A1), no proposal at raise (AIP-C1), no eval (AIP-E1, it owns `services/brain/eval/`).
- No package: the brain's `openai` client already takes base_url and key (D4); no change to `pyproject.toml` or
  `uv.lock`. None of the paths of D13.

## Done when

Both proofs are green, lint, typecheck, test, build stay green, and the whole brain suite passes.

Commit everything; an unfinished state as `wip(aip-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
