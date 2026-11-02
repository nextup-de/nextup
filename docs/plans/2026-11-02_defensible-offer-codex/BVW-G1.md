---
id: BVW-G1
title: ZI KPIs per org unit with a minimum group of 5, pure
phase: BVW
needs: [ VIS-Z1 ]
owns:
  - apps/app/src/features/metrics/zi.ts                           # new
  - apps/app/tests/unit/bvw/zi-kpis.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO3, HD5 ]
proofs:
  - id: B1
    says: ziKpis gives participation rate, ideas per 100 employees, implementation rate, median working days to decision, realised net savings and premiums per unit and for the company in a period, and hides every unit cell with fewer than 5 people behind it
    run: npm test -w @nextup/app -- tests/unit/bvw/zi-kpis.test.ts -t 'BVW ZI KPIs'
    expect: '[1-9]\d* passed'
pr_title: "feat(metrics): ZI KPIs per unit"
---

# BVW-G1 ZI KPIs per org unit with a minimum group of 5, pure

## Goal

Ideas managers report the Zentrum Ideenmanagement (ZI) figures: participation rate, ideas per 100 employees,
implementation rate, time to decision, savings and premiums. NextUp's KPIs are answer times only. After this task
one pure function computes the ZI set per unit and for the company, from VIS's `metricInputs`, with small groups
hidden (DO3). MET's dashboards and the pilot report read it; this task builds no page.

## Context (read first)

- `AGENTS.md`; the PILOT brief `### MET` (min group 5, no person metrics) in
  [build-plans/PILOT.md](../2026-11-02_pilot-pages/build-plans/PILOT.md); VIS's `metricInputs` and `CaseView`
  (`firstAnswerDay`), `OrgUnit.headcount` in `structure.prisma`; `features/metrics/index.ts` (`median`,
  `pctWithin`).
- Project data: `features/projects/reduce.ts` (done, verdict, reward with BVW-E1's amount).
- Spec: [11, "ZI KPI report"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#zi-kpi-report).

## What

- `features/metrics/zi.ts`: `ziKpis(input: { cases: MetricInput[]; projects: ProjectSummary[]; units: { id: string;
  parentId: string | null; headcount: number }[]; from: number; to: number }): { company: ZiRow; units: ZiRow[] }`
  with `ZiRow = { unitId: string | null; headcount: number; participationPct: number | null; ideasPer100: number |
  null; implementationPct: number | null; medianDaysToDecision: number | null; netSavingsEur: number | null;
  premiumsEur: number | null; hidden: boolean }`.
- Participation = distinct raisers by unit (counted by user id, never listed) / headcount. A raiser's unit is the
  unit of their seat at raise time. Units roll up to parents.
- `hidden: true` and every number null when headcount < 5 or distinct raisers < 5; the company row is hidden too
  when the company has fewer than 5 raisers in the period.
- Test `tests/unit/bvw/zi-kpis.test.ts`, `describe("BVW ZI KPIs", …)`.

## Not

- No page, no CSV (MET), no per-person output of any kind (HD5).

## Constraints

- Edit only the paths in `owns`. If VIS's names differ from the ones above, use VIS's and say so.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/zi-kpis.test.ts -t 'BVW ZI KPIs'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
