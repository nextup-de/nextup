---
id: TRUTH-A1
title: The contributor ranking and every per-person tally on Progress are gone
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/src/features/metrics/index.ts
  - apps/app/src/components/dashboard/shared/ProgressView.tsx
  - apps/app/src/components/dashboard/shared/ProgressView.module.css
  - apps/app/src/i18n/messages/dashboard.ts
  - apps/app/tests/unit/truth/no-ranking.test.ts
risk: normal
budget: { minutes: 90 }
executor: codex-local
uses: [ DO1, HD5 ]
proofs:
  - id: B1
    says: features/metrics exports no contributors() and no Contributor type, and the dashboard catalog has no ranking keys in either language
    run: npm test -w @nextup/app -- tests/unit/truth/no-ranking.test.ts -t 'TRUTH no person ranking'
    expect: '[1-9]\d* passed'
pr_title: "fix(metrics): remove the contributor ranking"
---

# TRUTH-A1 The contributor ranking and every per-person tally on Progress are gone

## Goal

NextUp says "It measures cases. Never people." Today `/progress` shows "Most relied-on contributors": each person's
signals, ideas, shipped and building counts, sorted. After this task no screen ranks or counts people (PILOT HD5,
gap G-045). Plan: [defensible offer, Codex plan](../2026-11-02_defensible-offer-codex.md), phase TRUTH.

## Context (read first)

- `AGENTS.md`, then `apps/app/src/features/metrics/index.ts` (`Contributor`, `contributors()`; check `people()` and
  `Person` for other callers before touching them).
- `apps/app/src/components/dashboard/shared/ProgressView.tsx` (the "Did anyone answer them" card renders the list).
- `apps/app/src/i18n/messages/dashboard.ts`, keys `progReliedOn`, `progNobody`, `progSignals_*`, `progIdeas_*`,
  `progShipped`, `progBuilding`, `progAwaiting`, `progNoTeam`, `progAnonNote`, `progCredited` and `progReplied`
  ("by name"): both the English and the German block.
- Spec: [10-existing-pages.md, Progress](../2026-11-02_pilot-pages/10-existing-pages.md#progress). Sam redesigns
  the page later; this task only removes.

## What

- `features/metrics/index.ts`: delete `Contributor` and `contributors()`. Fix the header comment. Keep every other
  export; if `people()` is used only by the ranking, delete it too, else leave it.
- `ProgressView.tsx`: remove the list and every per-person count in the "Did anyone answer them" card ("by name",
  "people credited on shipped work"); the company-level tiles stay. Remove now-unused CSS classes in its module.
- `dashboard.ts`: delete the keys that only the removed parts used, in both languages, so the catalogs stay in step.
- New test `apps/app/tests/unit/truth/no-ranking.test.ts`, `describe("TRUTH no person ranking", …)`:
  - `import * as metrics from "@/features/metrics"`: `"contributors" in metrics` is false;
  - the dashboard catalog (import it as the other catalog tests do) has no key `progReliedOn` and no key
    `progAnonNote`, in English and German.

## Not

- No other page, no route change (`/people/[name]` is TRUTH-B1's), no change to the funnel or the wait ledger
  (MET decides them).

## Constraints

- Edit only the paths in `owns`. If another file still imports `contributors`, stop with `status: "blocked"` and
  name it.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/no-ranking.test.ts -t 'TRUTH no person ranking'` shows at least 1
  passed.
- `npm test -w @nextup/app` stays green.

## Done when

- B1 is red on `main` and green on the branch; lint, typecheck, test and build stay green; `git status` shows only
  owned paths.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
