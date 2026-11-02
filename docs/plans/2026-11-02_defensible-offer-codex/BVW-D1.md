---
id: BVW-D1
title: The premium formula of a works agreement is computed, pure
phase: BVW
needs: [ TRUTH-G1 ]
owns:
  - apps/app/src/features/premium/formula.ts                      # new
  - apps/app/src/features/premium/index.ts                        # new
  - apps/app/tests/unit/bvw/premium-formula.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO2, HD4, HD5 ]
proofs:
  - id: B1
    says: premiumFor computes a share of the first-year net saving with minimum, cap and rounding, a points-based premium for ideas without a number, splits it among co-authors by stated shares or equally, and explains every line
    run: npm test -w @nextup/app -- tests/unit/bvw/premium-formula.test.ts -t 'BVW premium formula'
    expect: '[1-9]\d* passed'
pr_title: "feat(premium): the works-agreement premium formula"
---

# BVW-D1 The premium formula of a works agreement is computed, pure

## Goal

Tenders ask for "calculation of the premium via the software". A classic BVW pays a share of the realised first-year
net saving (10-20 %), with a minimum and a cap, and a points table for ideas whose benefit has no number. Today
`features/loop/rules.ts` has `RewardRule` (`none | thanks | fixed | share`, `sharePct`, `capEur`) and nothing computes
an amount. After this task one pure function computes it and says why.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/loop/rules.ts` (`RewardRule`, `LOOP_DEFAULTS`),
  `apps/app/src/features/projects/reduce.ts` (`reward`, `rewardDue` after TRUTH-G1), `verdict.ts`.
- BVW-A1's review result (the committee's assessed saving or points come from it).
- Spec: [11, "Premium rules"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#premium-rules).

## What

- `features/premium/formula.ts`:
  - `PremiumRule = { kind: "none" | "thanks" | "fixed" | "share" | "points"; sharePct?: number; basis?:
    "gross" | "net"; minEur?: number; capEur?: number; eurPerPoint?: number; pointsTable?: { minResult: number;
    points: number }[]; roundTo?: 1 | 5 | 10 | 50 }`, `validatePremiumRule`.
  - `premiumFor(rule, input: { verdict: "better" | "same" | "worse" | null; firstYearSavingEur: number | null;
    implementationCostEur: number | null; reviewResult: number | null; authors: { userId: string; sharePct?:
    number }[] }): { amountEur: number; lines: { userId: string; amountEur: number }[]; basis: string;
    parts: { key: string; value: number }[] }`. No `better` verdict and a money kind → 0 with part `not-better`.
    Net = saving − implementation cost. Points: the review result maps through `pointsTable`.
  - `fromRewardRule(r: RewardRule): PremiumRule` so today's rules keep working.
- Splits: stated shares must sum to 100, else equal; rounding per line, remainder to the first author by id order
  (deterministic, never by name).
- Test `tests/unit/bvw/premium-formula.test.ts`, `describe("BVW premium formula", …)`: share of net saving with
  cap; minimum; points table; worse verdict → 0; three authors equal and by shares; rounding remainder.

## Not

- No storage, no event change, no page (BVW-E1, Sam). No tax or social-security logic (payroll does that).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/premium-formula.test.ts -t 'BVW premium formula'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
