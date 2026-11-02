---
id: AIP-Z1
title: "AIP acceptance: proposal made on the server, off works, DPA gate holds"
wp: Z
needs: [ AIP-G1, AIP-A1, AIP-B1, AIP-E1, AIP-C1 ]
host: any
owns:
  - apps/app/tests/db/ai-provider.test.ts
  - docs/ASSISTANT.md
risk: normal
profile: orch
budget: { minutes: 45, window_pct: 8 }
uses: [ D1, D3, D6, D9, D12, D14 ]
proofs:
  - id: B1
    says: with the provider off a case is raised and routed by keywords, with a fake
      provider the server stores its proposal, and without a DPA no model is
      called for a real company
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ai-provider.test.ts -t 'AIP acceptance'
status: open
---

Plan AIP (sub-plan of PILOT): acceptance. Every other AIP task is merged. Read first: `docs/ASSISTANT.md`,
`apps/app/src/server/routing.ts`, `apps/app/src/server/brain.ts`, `apps/app/src/lib/db/ai.ts`,
`apps/app/tests/db/aip-proposal.test.ts`.

## What

- `apps/app/tests/db/ai-provider.test.ts`, `describe("AIP acceptance: proposal made on the server, off works, DPA
  gate holds", …)` (D12), on sandbox companies from the demo template with a local fake OpenAI-compatible server
  (node `http`, port 0) that counts requests and answers route r2:
  1. Choice off: a raise through the same path the server action takes (`proposeOnRaise` and the stored payload)
     gets the keyword proposal, the case reduces onto its route's seat, the fake got 0 requests.
  2. Choice openai-compatible pointing at the fake, DPA signed, `aiRouting` on, `BRAIN_URL` pointing at a second fake
     brain that forwards to the model fake: the stored proposal is `source: "llm"`, route r2.
  3. The same company with `dpaSignedAt` null: no request reaches either fake, the proposal is keywords, the
     assistant's gate says why.
- `docs/ASSISTANT.md`: a section on the AI choice per company, the gate and the brain's endpoint (D5-D8), and `##
  AIP gaps` (D14).

## Not

- No source file outside the test and the doc. If the acceptance fails because of the code, report `blocked` with
  the path in backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(aip-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
