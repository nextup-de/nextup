---
id: TRUTH-G1
title: A reward falls due only on a "better" verdict
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/src/features/projects/reduce.ts
  - apps/app/tests/unit/truth/reward-better.test.ts
risk: normal
budget: { minutes: 60 }
executor: codex-local
uses: [ DO1, DO2 ]
proofs:
  - id: B1
    says: rewardDue is true after a measured check with verdict better and false with same, worse or "no number possible"
    run: npm test -w @nextup/app -- tests/unit/truth/reward-better.test.ts -t 'TRUTH reward only on better'
    expect: '[1-9]\d* passed'
pr_title: "fix(projects): a reward is due only on a better verdict"
---

# TRUTH-G1 A reward falls due only on a "better" verdict

## Goal

NextUp says recognition follows measured improvement. Today `rewardDue` is true as soon as a project's status is
`measured` and the company's reward rule is not `none`, whatever the verdict was. After this task a reward falls due
only when the latest verdict is `better`.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/projects/reduce.ts` (`rewardDue`, `verdict`, `checks`),
  `apps/app/src/features/projects/verdict.ts` (`VerdictWord`), `apps/app/src/features/projects/permissions.ts`
  (`project.rewarded` refuses without `rewardDue`; read only).
- Existing project tests in `apps/app/tests/unit/` (search for `rewardDue`) for how a project log is built.

## What

- `rewardDue = status === "measured" && rules.reward.kind !== "none" && verdict?.verdict === "better"` (use the
  field names the file has).
- New test `tests/unit/truth/reward-better.test.ts`, `describe("TRUTH reward only on better", …)`: better → due;
  same, worse, "no number possible" → not due; reward rule `none` → not due.
- Update an existing test only where it asserted the old behaviour, and say so in the summary.

## Not

- No premium formula (BVW-D1), no copy change (the page says "after a better result" once Sam builds spec 11).

## Constraints

- Edit only the paths in `owns` (plus an existing test that asserted the old rule; report it). No `git commit`.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/reward-better.test.ts -t 'TRUTH reward only on better'` (≥ 1 passed)
- `npm test -w @nextup/app`

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
