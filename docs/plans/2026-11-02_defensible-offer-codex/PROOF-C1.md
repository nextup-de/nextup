---
id: PROOF-C1
title: CO2, energy and scrap metrics with fixed units and a company emission factor
phase: PROOF
needs: [ PROOF-A1, CORE-H1 ]   # CORE-H1 also edits rules.ts
owns:
  - apps/app/src/features/projects/metric-presets.ts              # new, pure
  - apps/app/src/features/knowledge/rules.ts                      # key emission_factor_kg_per_kwh
  - apps/app/tests/unit/proof/metric-presets.test.ts
risk: normal
budget: { minutes: 90 }
executor: codex-local
uses: [ DO1, HD4 ]
proofs:
  - id: B1
    says: the presets give unit, direction and euro value per metric, kWh converts to kg CO2e with the company factor (default when unset), and a baseline on a preset metric refuses another unit
    run: npm test -w @nextup/app -- tests/unit/proof/metric-presets.test.ts -t 'PROOF metric presets'
    expect: '[1-9]\d* passed'
pr_title: "feat(projects): CO2, energy and scrap metric presets"
---

# PROOF-C1 CO2, energy and scrap metrics with fixed units and a company emission factor

## Goal

Measured outcomes in plants are mostly scrap, rework, downtime, energy and CO₂. Free-text metric names and units make
results incomparable across projects and impossible to benchmark. After this task a project's baseline can use a
preset with a fixed unit and direction; energy savings convert to CO₂e with the company's emission factor.

## Context (read first)

- `AGENTS.md`; `features/projects/reduce.ts` (`project.baseline { metric, unit, value, better }`), PROOF-A1's
  measure source; `features/knowledge/rules.ts` (company rules with defaults and clamps; CORE-H1 added a key, keep it).
- Spec: [11, "Measurement from data sources"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#measurement-from-data-sources).

## What

- `metric-presets.ts`: `METRIC_PRESETS` keyed `scrap_pct` (%, down), `scrap_parts` (parts per week, down),
  `rework_h` (h per week, down), `downtime_min` (min per week, down), `energy_kwh` (kWh per month, down), `co2e_kg`
  (kg CO₂e per month, down), `lead_time_d` (working days, down), `cost_eur` (€ per year, down), each with catalog
  label keys; `co2eFromEnergy(kwh, factor)`; `checkPresetBaseline(baseline)`; `eurPerYear(preset, change, unitCostEur)`
  where the company gives a unit cost (used by BVW-E1 when the metric is not in €).
- `rules.ts`: `emission_factor_kg_per_kwh` (default 0.38 as an **estimate** of the German grid mix; clamp 0-2), and
  `unit_cost_eur` per preset (optional map).
- Test `tests/unit/proof/metric-presets.test.ts`, `describe("PROOF metric presets", …)`.

## Not

- No page, no import change, no benchmark (BENCH).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/proof/metric-presets.test.ts -t 'PROOF metric presets'` (≥ 1 passed)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
