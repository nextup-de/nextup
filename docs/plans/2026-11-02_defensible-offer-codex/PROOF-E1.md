---
id: PROOF-E1
title: A calibration table of score parts against decisions and +90-day verdicts
phase: PROOF
needs: [ PROOF-D1 ]
owns:
  - apps/app/src/features/outcomes/calibration.ts                 # new, pure
  - apps/app/tests/unit/proof/calibration.test.ts
risk: normal
budget: { minutes: 90 }
executor: codex-local
uses: [ DO1, DO2, DO3 ]
proofs:
  - id: B1
    says: calibrationTable gives, per score part, how often cases with and without it were decided yes and turned out better at +90 days, with counts, hides parts with fewer than 5 cases on either side, and never changes a weight
    run: npm test -w @nextup/app -- tests/unit/proof/calibration.test.ts -t 'PROOF calibration table'
    expect: '[1-9]\d* passed'
pr_title: "feat(outcomes): score calibration table"
---

# PROOF-E1 A calibration table of score parts against decisions and +90-day verdicts

## Goal

The regex is easy to copy; the calibration is not. After this task the outcome records give a table that says, for
each score part, whether cases with it were decided "yes" more often and turned out "better" at +90 days. It informs a
person who changes the weights; it never changes them itself (DO2).

## Context (read first)

- `AGENTS.md`; PROOF-D1's `OutcomeRecord` (`scoreParts`, `answer`, `verdict`), TRUTH-D1's part names.

## What

- `features/outcomes/calibration.ts`: `calibrationTable(records): { part: string; withN: number; withoutN: number;
  yesWith: number | null; yesWithout: number | null; betterWith: number | null; betterWithout: number | null;
  hidden: boolean }[]` (shares 0-1; `hidden` and nulls when either side has fewer than 5 cases); records of
  unconfirmed typed measures count for "yes" but not for "better".
- Test `tests/unit/proof/calibration.test.ts`, `describe("PROOF calibration table", …)`.

## Not

- No weight change, no page (PACK and Sam show it), no model.

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/proof/calibration.test.ts -t 'PROOF calibration table'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
