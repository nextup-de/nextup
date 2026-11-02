---
id: TRUTH-D1
title: A route proposed by the AI earns no score points; only a keyword or a person's route does
phase: TRUTH
needs: [ AIP-C1 ]
owns:
  - apps/app/src/features/scoring/index.ts
  - apps/app/src/features/scoring/route-source.ts                 # new, pure
  - apps/app/src/features/evaluate/index.ts
  - apps/app/src/features/cases/rows.ts
  - apps/app/src/features/ideas/brief.ts
  - apps/app/src/components/dashboard/shared/CaseDetailView.tsx
  - apps/app/tests/unit/truth/score-route.test.ts
risk: normal
budget: { minutes: 90 }
executor: codex-local
uses: [ DO1, DO2, HD7 ]
proofs:
  - id: B1
    says: scoreCase gives +20 for a keyword or person route, 0 points and the part "Route proposed by AI" for an llm route, and routeSourceOf reads the source from case.raised and later re-routes
    run: npm test -w @nextup/app -- tests/unit/truth/score-route.test.ts -t 'TRUTH no model points'
    expect: '[1-9]\d* passed'
pr_title: "fix(scoring): a model's route adds no points to the case score"
---

# TRUTH-D1 A route proposed by the AI earns no score points; only a keyword or a person's route does

## Goal

The case score says it is built from facts, never from model output. Today `scoreCase` adds +20 ("Fits a decision
type on the map") whenever the case has a `routeId`, and that route can be the LLM's pick. After AIP-C1 the proposal
is made on the server and stored as `case.raised.payload.proposal` with `source: "keywords" | "llm"`. After this
task, a route counts only when keywords found it or a person chose it; an AI route shows as its own fact with 0
points.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/scoring/index.ts` (`Scorable`, `scoreCase`), `tests/unit/scoring.test.ts`.
- `apps/app/src/features/cases/events.ts` (`RouteProposal`), AIP-C1's `apps/app/src/server/routing.ts` and
  `apps/app/src/features/routing/override.ts` (what counts as an override).
- Callers: `features/evaluate/index.ts` (the raise preview), `features/cases/rows.ts` (`dashboardRow`),
  `features/ideas/brief.ts`, `components/dashboard/shared/CaseDetailView.tsx`.
- Spec: [11, "Why this score"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#why-this-score).

## What

- `Scorable` gains `routeSource?: "keywords" | "person" | "llm" | null`.
- `scoreCase`: with a `routeId` and `routeSource` `keywords` or `person` (or missing, for seed and demo cases):
  "Fits a decision type on the map" +20 as today. With `routeSource: "llm"`: a part "Route proposed by AI" with
  0 points instead; the +20 is not given.
- `features/scoring/route-source.ts`: `routeSourceOf(log: EventLog, caseId: string): "keywords" | "person" | "llm"
  | null`: from the `case.raised` payload: no proposal → `null`; `payload.routeId !== proposal.routeId` → `person`;
  else `proposal.source`. Any later event that moves the case to another route (use the same events
  `overrideRate` counts) → `person`.
- Pass `routeSource` from every caller: rows.ts, brief.ts and CaseDetailView.tsx through `routeSourceOf` with the
  log they already have; evaluate/index.ts from the proposal it builds (`brain` → `llm`, keywords → `keywords`).
- New test `tests/unit/truth/score-route.test.ts`, `describe("TRUTH no model points", …)`: keywords route +20;
  llm route 0 points and the "Route proposed by AI" part; person route (raised on another route than proposed)
  +20; a later re-route turns llm into person; no proposal → +20 as today.

## Not

- No change to how the route is proposed (AIP), to the bars in `features/ideas/benchmarks.ts` (TRUTH-H1), or to the
  score labels' language (they move to the catalog with Sam's "why this score" panel).

## Constraints

- Edit only the paths in `owns`; if `rows.ts` changed under you (VIS), stop with `status: "blocked"`.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/score-route.test.ts -t 'TRUTH no model points'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/scoring.test.ts tests/unit/evaluate.test.ts`

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
