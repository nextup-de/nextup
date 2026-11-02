---
id: AIP-A1
title: Bedrock, Azure OpenAI and OpenAI-compatible adapters, and the assistant
  and coach use the company's choice
wp: A
needs: [ AIP-G1, IDN-Z1 ]
host: any
owns:
  - apps/app/src/server/ai/**
  - apps/app/src/server/assist/provider.ts
  - apps/app/src/app/api/[company]/assist/route.ts
  - apps/app/src/app/api/[company]/ideas/turn/route.ts
  - apps/app/src/server/admin-insight.ts
  - apps/app/tests/unit/aip/adapters.test.ts
  - apps/app/src/features/assist/index.ts
  - apps/app/src/components/admin/AssistantAdmin.tsx
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D4, D5, D6, D7, D12, D13 ]
proofs:
  - id: B1
    says: the openai-compatible and azure-openai adapters send the right URL,
      headers and model and return text and token counts, off has no adapter,
      and a timeout or an error answer becomes an error the caller can fall back
      from
    run: npm test -w @nextup/app -- tests/unit/aip/adapters.test.ts -t 'AIP
      adapters'
status: merged
lane: pc/a
branch: orch/aip-a1
pr: 318
merge: "118baee"
---

Plan AIP (sub-plan of PILOT): the adapters. After this task the assistant and the studio coach call the model the
company chose (AIP-G1), through the contract's `AiProvider`. Read first: D7 of the plan,
`packages/contracts/src/public/connectors/ai-provider.ts`, `apps/app/src/features/ai/{settings,gate}.ts`,
`apps/app/src/server/assist/provider.ts`, `apps/app/src/features/assist/index.ts` (`Provider`, `ProviderRun`),
`apps/app/src/app/api/[company]/assist/route.ts`, `apps/app/src/app/api/[company]/ideas/turn/route.ts`,
`apps/app/src/server/admin-insight.ts`.

## What

- `apps/app/src/server/ai/bedrock.ts`, `openai.ts`, `index.ts` (new) exactly as D7: `aiProviderFor(settings, key)`
  returns an `AiProvider` (`info.kind` "AiProvider", `info.id` the choice, `complete`) or null for off; `streamingFor
  (settings, key): Provider` for the assistant (the mock for "mock"). The OpenAI kinds stream with server-sent
  events and support the assistant's tool calls in the OpenAI `tools` format.
- `apps/app/src/server/assist/provider.ts`: keeps `providerConfig` for the environment default only and delegates
  to `server/ai`; the Bedrock SDK import moves to `server/ai/bedrock.ts`.
- `apps/app/src/app/api/[company]/assist/route.ts` and `ideas/turn/route.ts`: read `loadAiSettings` for the company,
  ask `aiGate` (purpose assist or coach) and use `streamingFor(settings, key)`; with the gate closed the coach uses
  its offline answer as today.
- `apps/app/src/server/admin-insight.ts`: shows the company's choice and model instead of the environment's.
- `apps/app/tests/unit/aip/adapters.test.ts`, `describe("AIP adapters", …)` with an injected `fetch`: openai-compatible
  posts to `<endpoint>/chat/completions` with `Authorization: Bearer k` and the model; azure-openai posts to
  `https://res.openai.azure.com/openai/v1/chat/completions` with `api-key: k` and the deployment as the model; both
  map `choices[0].message.content` and `usage` to `AiResponse`; a 500 and a timeout throw; `aiProviderFor` of off is
  null; a streamed answer with a tool call runs the tool and continues.

## Not

- No brain call (AIP-B1), no routing proposal (AIP-C1), no settings screen (ADM).
- No package (D4); none of the paths of D13.

## Done when

The proof is green and lint, typecheck, test, build stay green; the demo e2e suite still passes (the mock answers
there).

Commit everything; an unfinished state as `wip(aip-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
