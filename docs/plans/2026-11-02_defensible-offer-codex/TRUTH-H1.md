---
id: TRUTH-H1
title: The idea bars understand German, and code and docs say "deterministic and traceable"
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/src/features/ideas/benchmarks.ts
  - docs/IDEAS.md
  - apps/app/tests/unit/truth/benchmarks-de.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, HD9 ]
proofs:
  - id: B1
    says: German sentences find the same parts as their English twins (quantity, measure, reach, first step, why, who, spend), English results are unchanged, and the header no longer claims "never model output"
    run: npm test -w @nextup/app -- tests/unit/truth/benchmarks-de.test.ts -t 'TRUTH German bars'
    expect: '[1-9]\d* passed'
pr_title: "fix(ideas): German patterns for the idea bars"
---

# TRUTH-H1 The idea bars understand German, and code and docs say "deterministic and traceable"

## Goal

The UI is bilingual, the pilot runs in German, and the four idea bars are English regexes (`because`, `pilot`,
`shift`, `per week`). A German idea scores low for no reason. After this task each pattern has German alternations,
and the claims "never model output" and "chatting cannot talk the score up" are replaced by what is true:
deterministic and traceable.

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/ideas/benchmarks.ts` (header comment, `QUANTITY`, `MEASURE`, `REACH`,
  `FIRST_STEP`, `WHY`, `WHO`, `SPEND`, `amountEur`), its existing tests (search `tests/unit` for `benchmark(`).
- `docs/IDEAS.md` (the sentence with "never model output").
- German examples: the routing eval's German cases in `services/brain/eval/routing_cases.json` (read only).

## What

- Add German alternations with word boundaries that work for umlauts (use explicit alternations, not `\b` next to
  `ä ö ü ß`): for example Stück, Teile, Schicht(en), pro Woche/Monat/Schicht/Tag, Ausschuss, Nacharbeit,
  Durchlaufzeit, Stillstand, Minuten, Stunden, Tage; jede/alle/ganze/beide/über alle, Linie(n), Werk(e), Standort(e),
  Abteilung(en); erster Schritt, Pilot, Test, Versuch, Prototyp, für eine Woche/Linie/Schicht; weil, damit, sodass,
  spart, vermeidet, statt; wir, Team, Schicht, Bediener, Werker, Instandhaltung, Kollegen, Kunden, Azubis;
  kaufen, bestellen, Budget, Rechnung, Lizenz. `amountEur` reads "5.000 €", "5 Tsd. €", "5k €".
- Header comment: "Arithmetic over the author's text and the company context: deterministic, and every point names
  the fact behind it." Remove "never model output" and "chatting cannot talk the score up".
- `docs/IDEAS.md`: the same correction in one sentence; mention that suggested answers are marked (TRUTH-E1).
- New test `tests/unit/truth/benchmarks-de.test.ts`, `describe("TRUTH German bars", …)`: at least eight German/English
  sentence pairs give the same found parts; the existing English cases are unchanged; the source of
  `benchmarks.ts` does not contain "never model output".

## Not

- No new bar, no weight change (calibration is PROOF-E1), no French.

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/benchmarks-de.test.ts -t 'TRUTH German bars'` (≥ 1 passed)
- `npm test -w @nextup/app` (the other benchmark tests stay green)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
