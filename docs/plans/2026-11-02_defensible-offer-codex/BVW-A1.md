---
id: BVW-A1
title: The review model - assessment form, review state and who may review, all pure
phase: BVW
needs: [ CORE-S1 ]
owns:
  - apps/app/src/features/review/form.ts                          # new
  - apps/app/src/features/review/events.ts                        # new: payload types only
  - apps/app/src/features/review/reduce.ts                        # new
  - apps/app/src/features/review/permissions.ts                   # new
  - apps/app/src/features/review/index.ts                         # new
  - apps/app/tests/unit/bvw/review-model.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO2, DO4, HD4, HD5, HD10 ]
proofs:
  - id: B1
    says: a review form validates criteria and weights, reduceReviews folds requested, submitted and withdrawn reviews into per-case state with a due day, the weighted result is arithmetic over the reviewers' marks, and nobody may review a case they raised or hold
    run: npm test -w @nextup/app -- tests/unit/bvw/review-model.test.ts -t 'BVW review model'
    expect: '[1-9]\d* passed'
pr_title: "feat(review): assessment form and review state"
---

# BVW-A1 The review model: assessment form, review state and who may review, all pure

## Goal

German BVW tenders ask for a Gutachter's assessment before a committee decides. NextUp has no reviewer, form or
committee. This task defines the model in pure code (no database, no event registration): the assessment form a works
agreement sets, the state of the reviews of one case, and who may review. BVW-B1 wires it to events and actions,
BVW-C1 adds the committee.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/projects/reduce.ts` and `permissions.ts` (the pattern: a feature folds its own
  events from the log, permissions return `OK` or `no(key)`).
- `apps/app/src/features/cases/events.ts` (event shape), `apps/app/src/features/auth/identity.ts` (seats, roles).
- CORE-S1's `features/cases/promise.ts` (working-day due dates).
- Spec: [11, "Review request" and "Gutachter review"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#gutachter-review).

## What

- `form.ts`: `ReviewForm = { criteria: { key: string; label: { en: string; de: string }; weight: number; scale: 0 |
  4 | 10 }[]; needsSaving: boolean; reviewDays: number }`, `DEFAULT_FORM` (benefit, feasibility, cost to
  implement, safety and quality, scope; scale 4; weights 30/20/20/20/10; reviewDays 10), `validateForm(f)` (2-10
  criteria, weights sum to 100, keys unique).
- `events.ts`: payload types for `review.requested { caseId, reviewerSeatId, dueDay }`, `review.submitted { caseId,
  marks: Record<string, number>, savingEur?: number, recommendation: "yes" | "no" | "rework", note }`,
  `review.withdrawn { caseId, reviewerSeatId, why }`. Types only; BVW-B1 registers them.
- `reduce.ts`: `reduceReviews(log, form): Map<caseId, CaseReviews>` with each review's state (open, submitted,
  withdrawn, late by `dueDay`), `result` = weighted mean of submitted marks (0-100) and the recommendations;
  computed, never stored.
- `permissions.ts`: request (the case's desk or a manager), submit (only the holder of `reviewerSeatId`; never the
  raiser, never the desk holding the case), withdraw (whoever requested).
- `index.ts` re-exports. Strings as catalog keys, not text.
- Test `tests/unit/bvw/review-model.test.ts`, `describe("BVW review model", …)`.

## Not

- No event registration, server action, page or committee (BVW-B1, BVW-C1). No AI in any mark (DO2). No per-reviewer
  statistics (HD5).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/review-model.test.ts -t 'BVW review model'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
