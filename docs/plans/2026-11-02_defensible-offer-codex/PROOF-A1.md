---
id: PROOF-A1
title: A measured value carries its source, and KPI exports are imported as measures
phase: PROOF
needs: [ TRUTH-G1 ]
owns:
  - apps/app/src/features/projects/measure-source.ts              # new, pure
  - apps/app/src/features/projects/measure-import.ts              # new, pure
  - apps/app/src/features/projects/reduce.ts                      # measures keep their source
  - apps/app/src/server/actions/measures.ts                       # new
  - apps/app/tests/unit/proof/measure-source.test.ts
  - apps/app/tests/db/proof-measure-import.test.ts
risk: normal
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2 ]
proofs:
  - id: B1
    says: a measure's source is typed, import or system (old string sources read as typed), parseKpiCsv reads date, metric and value with decimal comma or point and reports bad lines by number, and the latest value per check is picked from an import
    run: npm test -w @nextup/app -- tests/unit/proof/measure-source.test.ts -t 'PROOF measure source'
    expect: '[1-9]\d* passed'
  - id: B2
    says: importMeasures by the project lead or a manager appends project.measured with source import, the file name and a hash, for an open check only, and refuses a metric that is not the project's baseline metric
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/proof-measure-import.test.ts -t 'PROOF measure import'
    expect: '[1-9]\d* passed'
pr_title: "feat(projects): measures carry their source; KPI import"
---

# PROOF-A1 A measured value carries its source, and KPI exports are imported as measures

## Goal

Measured impact today is a number the project lead types, with a free-text "source". After this task every measure
records where it came from (`typed`, `import` with file name and hash, or `system` for a connector), and a KPI export
(CSV from MES, a scrap report, an energy meter) can be imported as the measure of an open check. PROOF-B1 then makes
typed values count only after a second person confirms them.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/projects/reduce.ts` (`measures`, `checks`, `verdict`),
  `features/projects/verdict.ts`, `features/projects/permissions.ts` (`project.measured`),
  `apps/app/src/components/projects/ProjectMeasure.tsx` (read only: what the page sends today).
- `apps/app/src/features/cases/events.ts`: `project.measured { check, value, source, note? }`.
- Spec: [11, "Measurement from data sources"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#measurement-from-data-sources).

## What

- `measure-source.ts`: `MeasureSource = { kind: "typed" } | { kind: "import"; file: string; sha256: string; rows:
  number } | { kind: "system"; system: string; ref: string }`, `readSource(payload.source)` (a string → typed with
  the string as note).
- `measure-import.ts`: `parseKpiCsv(text): { rows: { date: string; metric: string; value: number }[]; errors: {
  line: number; reason: string }[] }` (separator `;` or `,`, header names in German or English), `pickForCheck(rows,
  metric, window)`.
- `reduce.ts`: each measure keeps its `source` (read with `readSource`); no rule changes here.
- `server/actions/measures.ts`: `importMeasures(slug, projectId, check, file: { name: string; text: string })`
  (≤ 1 MB): permission as `project.measured`, appends with `source: { kind: "import", … }`.
- Tests: `tests/unit/proof/measure-source.test.ts`, `tests/db/proof-measure-import.test.ts`.

## Not

- No confirmation rule (PROOF-B1), no new metric presets (PROOF-C1), no Jira metric reader (later, through CNX's
  WorkTracker), no page (Sam).

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/proof/measure-source.test.ts -t 'PROOF measure source'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
