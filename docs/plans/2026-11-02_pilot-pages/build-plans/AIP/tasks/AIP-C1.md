---
id: AIP-C1
title: The routing proposal is made on the server at raise, and the override
  rate is counted per company
wp: C
needs: [ AIP-B1, CLK-B1 ]
host: any
owns:
  - apps/app/src/server/routing.ts
  - apps/app/src/server/actions/events.ts
  - apps/app/src/features/routing/override.ts
  - apps/app/tests/unit/aip/override.test.ts
  - apps/app/tests/db/aip-proposal.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D3, D6, D9, D10, D12, D13 ]
proofs:
  - id: B1
    says: overrideRate counts proposals and overrides per company from the events
      and gives null without a proposal
    run: npm test -w @nextup/app -- tests/unit/aip/override.test.ts -t 'AIP override
      rate'
  - id: B2
    says: proposeOnRaise gives the keyword proposal when the gate is closed or the
      brain is slow, and the brain's when it answers in time, ignoring what the
      client sent
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/aip-proposal.test.ts -t 'AIP proposal on the
      server'
status: running
lane: pc/d
branch: orch/aip-c1
retries: 1
last_failure: "Beweise rot: B2"
---

Plan AIP (sub-plan of PILOT): the proposal on the server. Today the browser asks for the brain's proposal and sends
it inside `case.raised`; after this task the server makes it. CLK-B1 changed `server/actions/events.ts` last; build
on its version. Read first: D9, D10 of the plan, `apps/app/src/server/actions/events.ts` (and IDN's
`features/cases/stamp.ts`, read only), `apps/app/src/server/brain.ts` (`askBrain`, gated by AIP-B1),
`apps/app/src/features/routing/index.ts`, `apps/app/src/features/cases/events.ts` (`RouteProposal`),
`apps/app/src/lib/db/decisions.ts`.

## What

- `apps/app/src/server/routing.ts` (new, not "use server"): `proposeOnRaise(slug, companyId, payload, opts?: {
  ask?: typeof askBrain; timeoutMs?: number }): Promise<RouteProposal>` exactly as D9 (the keyword proposal from
  the company's seed routes, the brain's within the timeout).
- `apps/app/src/server/actions/events.ts`: for `case.raised`, after the permission check and the stamp, the stored
  payload's `proposal` is `await proposeOnRaise(…)`; nothing else changes.
- `apps/app/src/features/routing/override.ts` (new, pure): `overrideRate` as D10.
- Tests:
  - `apps/app/tests/unit/aip/override.test.ts`, `describe("AIP override rate", …)`: three raises with proposals, one
    raised on another route than proposed and one overridden later → `{ proposed: 3, overridden: 2 }`; a raise
    without a proposal does not count; no raise → rate null; the `from`/`to` day window filters.
  - `apps/app/tests/db/aip-proposal.test.ts`, `describe("AIP proposal on the server", …)` (D12): a sandbox company
    without a DPA gets `source: "keywords"` even when the client sent `source: "llm"`; with a DPA, `aiRouting` and
    an injected `ask` answering r2 it gets `source: "llm"` with r2; an `ask` that waits past `timeoutMs` gives the
    keyword proposal; `payload.routeId` is never changed.

## Not

- No brain change (AIP-B1), no page change: the raise page may keep asking for its preview.
- None of the paths of D13 besides `server/actions/events.ts`.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(aip-c1): …`. Leave nothing unsaved. orch pushes and opens the PR.
