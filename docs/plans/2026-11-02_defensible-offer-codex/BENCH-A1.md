---
id: BENCH-A1
title: Anonymised benchmark cells from outcome records, suppressed below 5 companies or 5 cases
phase: BENCH
needs: [ PROOF-D1 ]
owns:
  - apps/app/src/features/bench/contribution.ts                   # new, pure
  - apps/app/src/features/bench/aggregate.ts                      # new, pure
  - apps/app/tests/unit/bench/aggregate.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO3, HD5 ]
proofs:
  - id: B1
    says: contributionFrom keeps only consented, class-mapped, id-free fields and coarsens days to whole weeks; aggregate gives per decision class the companies, cases, median days to first answer, on-time share and confirmed-better share, and suppresses any cell with fewer than 5 companies or 5 cases
    run: npm test -w @nextup/app -- tests/unit/bench/aggregate.test.ts -t 'BENCH aggregate'
    expect: '[1-9]\d* passed'
pr_title: "feat(bench): anonymised benchmark cells"
---

# BENCH-A1 Anonymised benchmark cells from outcome records, suppressed below 5 companies or 5 cases

## Goal

From customer three to five on, a cross-company benchmark (answer time, on-time share, verified outcomes per kind of
decision) is the data moat. After this task the two pure halves exist: what one company contributes (anonymised,
consented) and how contributions combine into cells nobody can trace back.

## Context (read first)

- `AGENTS.md`; PROOF-D1 `OutcomeRecord` and `outcome_consent`; DO3.
- Decision classes are a shared vocabulary: `quality`, `safety`, `cost`, `process`, `maintenance`, `logistics`,
  `people`, `other`; each company maps its routes to them (BENCH-B1).

## What

- `contribution.ts`: `contributionFrom(records, consent, classOf: (routeId) => DecisionClass, period)` →
  `{ version: 1; period; companyKey: string /* random per period, not the slug */; rows: { class; firstAnswerWeeks;
  onTime; decided; betterConfirmed }[] }`; empty when `consent.benchmark` is false.
- `aggregate.ts`: `aggregate(contributions)` → cells per class `{ class; companies; cases; medianFirstAnswerDays;
  onTimeShare; betterShare; suppressed }`; suppressed when companies < 5 or cases < 5; `compare(own, cells)` for one
  company's position (above, at, below the median) without revealing others.
- Test `tests/unit/bench/aggregate.test.ts`, `describe("BENCH aggregate", …)`.

## Not

- No storage, no upload, no page (BENCH-B1, Sam), no central service (outside this repo).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bench/aggregate.test.ts -t 'BENCH aggregate'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
