---
id: AIP-G1
title: Each company has an AI choice, and one gate answers for every model call
wp: G
needs: [ IDN-Z1, CNX-Z1, CLK-G1 ]
host: any
owns:
  - apps/app/src/features/ai/settings.ts
  - apps/app/src/features/ai/gate.ts
  - apps/app/src/features/assist/gate.ts
  - apps/app/src/lib/db/ai.ts
  - apps/app/tests/unit/aip/gate.test.ts
  - apps/app/tests/db/aip-settings.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D2, D3, D4, D5, D6, D12, D13 ]
proofs:
  - id: B1
    says: aiSettings falls back to the environment only for a demo company and to
      off otherwise, and aiGate refuses every model call of a real company
      without a DPA or with off, routing without aiRouting and assist without
      the assistant switch
    run: npm test -w @nextup/app -- tests/unit/aip/gate.test.ts -t 'AIP gate'
  - id: B2
    says: saveAiSettings stores the choice in the company's ai Integration row with
      the key sealed, and loadAiSettings reads it back for that company only
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/aip-settings.test.ts -t 'AIP settings'
status: open
---

Plan AIP (sub-plan of PILOT): the settings and the gate. Read first: `docs/ASSISTANT.md`,
`docs/adr/0002-connector-interfaces.md`, `docs/adr/0006-config-not-code.md`,
`packages/contracts/src/public/connectors/ai-provider.ts`, `apps/app/src/features/assist/gate.ts`,
`apps/app/src/server/assist/provider.ts` (`providerConfig`), `apps/app/src/features/connectors/vault.ts`,
`apps/app/src/lib/db/integrations.ts`, `apps/app/src/lib/db/assist.ts`.

## What

- `apps/app/src/features/ai/settings.ts` (new, pure): `AiSettings`, `aiSettings(row, env, stage)` exactly as D5,
  checking the row's `settings` (unknown choice → off; region default eu-central-1).
- `apps/app/src/features/ai/gate.ts` (new, pure): `aiGate` exactly as D6; every refusal has a `why` in plain words
  like today's assistant gate.
- `apps/app/src/features/assist/gate.ts`: `assistGate` keeps its signature and its answers for purpose assist,
  built on `aiGate`.
- `apps/app/src/lib/db/ai.ts` (new): `loadAiSettings(companyId, stage)` (the Integration row system "ai", the key
  opened with the vault; no vault key → no key) and `saveAiSettings(companyId, settings, key, by)` (upsert, key
  sealed with `integrationContext(companyId, "ai")`; `key: null` keeps the stored one).
- Tests:
  - `apps/app/tests/unit/aip/gate.test.ts`, `describe("AIP gate", …)`: demo without a row and LLM_PROVIDER=bedrock +
    LLM_MODEL gives bedrock, without them the mock; sandbox without a row gives off; aiGate: no database and demo →
    mock only; sandbox + bedrock without dpaSignedAt → off with a why; with it → on; off → off for every purpose;
    routing with `aiRouting: false` → off; assist with `assistantOn: false` → off; `assistGate` gives the same as
    on main for the cases of `tests/unit/assist.test.ts` that cover it (copy their inputs, do not edit that file).
  - `apps/app/tests/db/aip-settings.test.ts`, `describe("AIP settings", …)` (D12): save an azure-openai choice with a
    key for company A; `loadAiSettings(A)` returns it and the key; the row's `secretSealed` does not contain the key
    in clear; company B has off.

## Not

- No adapter, no model call (AIP-A1), no brain change (AIP-B1). No admin screen (ADM).
- No .prisma file, no package (D4); none of the paths of D13.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(aip-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
