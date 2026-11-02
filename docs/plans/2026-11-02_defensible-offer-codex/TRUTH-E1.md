---
id: TRUTH-E1
title: Suggested answers are no longer ranked by score gain, and a turn sent verbatim from a suggestion is recorded
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/src/features/ideas/replies.ts
  - apps/app/src/features/ideas/brain-coach.ts
  - apps/app/src/features/ideas/provenance.ts                     # new, pure
  - apps/app/src/app/api/[company]/ideas/turn/route.ts
  - apps/app/src/lib/db/ideas.ts
  - apps/app/prisma/schema/core.prisma                            # IdeaTurn only
  - apps/app/prisma/migrations/20261120090000_truth_turn_provenance/**
  - apps/app/tests/unit/truth/provenance.test.ts
  - apps/app/tests/unit/brain-coach.test.ts
  - apps/app/tests/db/truth-turn-provenance.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, HD7, HD11 ]
proofs:
  - id: B1
    says: suggestions are ordered by the bar asked and a fixed bar order, never by gain; a brain answer is offered without a gain check; factProvenance counts the found facts that only suggested turns supplied
    run: npm test -w @nextup/app -- tests/unit/truth/provenance.test.ts -t 'TRUTH suggestion provenance'
    expect: '[1-9]\d* passed'
  - id: B2
    says: a user turn equal to a suggestion offered on the previous assistant turn is stored with fromSuggestion, and the scores event carries fromSuggestions
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/truth-turn-provenance.test.ts -t 'TRUTH turn provenance'
    expect: '[1-9]\d* passed'
pr_title: "fix(ideas): record facts that came from suggested answers"
---

# TRUTH-E1 Suggested answers are no longer ranked by score gain, and a turn sent verbatim from a suggestion is recorded

## Goal

"Chatting cannot talk the score up" is false today: `replies.ts` offers only suggestions that raise the score and
sorts them by gain, and `brain-coach.ts` puts the model's `recommended` answer first only when `gain > 0`. One click
turns generated text into "the author's own words". After this task suggestions are offered for the fact they add,
not for points; the server records which user turns were sent verbatim from a suggestion; and the score can say
"3 of 5 facts came from suggestions".

## Context (read first)

- `AGENTS.md`; `apps/app/src/features/ideas/replies.ts` (`suggestReplies`, `Reply`), `brain-coach.ts`
  (`withRecommended` or the function around the `gain` check), `benchmarks.ts` (`benchmark`, parts with
  `found`/`missing`), `coach.ts` (`ideaFromTurns`), `drafts.ts` (`scoreDraft`).
- `apps/app/src/app/api/[company]/ideas/turn/route.ts` (the `scores` and `replies` events, how turns are stored),
  `apps/app/src/lib/db/ideas.ts` (IdeaTurn reads and writes).
- `apps/app/prisma/schema/core.prisma` model `IdeaTurn`; HD11 (one migration folder, this area file only).
- Spec: [11, "Why this score"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#why-this-score).

## What

- `IdeaTurn` gains `offered Json?` (assistant turns: the suggestion texts and their source `company | ai` that were
  shown with it) and `fromSuggestion String?` (user turns: `company`, `ai` or null). One migration folder
  `20261120090000_truth_turn_provenance` (rename the timestamp to sort after the newest folder on `main`).
- `replies.ts`: keep offering a suggestion only when it fills a part that is still `missing`; order by the bar the
  coach asked, then the fixed bar order; drop the gain sort. Each `Reply` gets `source: "company" | "ai"`. Keep the
  `gain` field only if a component still reads it (do not change components); never sort or filter by it.
- `brain-coach.ts`: offer the brain's `recommended` text (source `ai`) whenever it is non-empty and not a duplicate,
  without a gain check.
- `features/ideas/provenance.ts` (pure): `matchSuggestion(text, offered)` (trimmed, whitespace-collapsed, exact) and
  `factProvenance(turns, ctx)`: benchmark the author's text with and without the `fromSuggestion` turns; facts
  `found` only with them count as from suggestions → `{ facts: number, fromSuggestions: number }`.
- Turn route (server mode): store `offered` on the assistant turn it writes; when storing the user turn, set
  `fromSuggestion` from `matchSuggestion` against the previous assistant turn's `offered`; add `fromSuggestions`
  (`factProvenance`) to the `scores` event. Local demo mode: compute from the history the browser sends, store
  nothing.
- Tests: `tests/unit/truth/provenance.test.ts`, `describe("TRUTH suggestion provenance", …)` (ordering without gain;
  brain answer offered with zero gain; a fact from a suggested turn counted, the same fact typed by the author not);
  update `tests/unit/brain-coach.test.ts` where it asserted the gain rule; `tests/db/truth-turn-provenance.test.ts`,
  `describe("TRUTH turn provenance", …)`.

## Not

- No change to the score arithmetic of the bars (TRUTH-H1), to the raise page components (Sam, spec 11), or to the
  case payload (the case-side line comes with Sam's panel and VIS's `caseView`).

## Constraints

- Edit only the paths in `owns`; in `core.prisma` only `model IdeaTurn`. If the AIP tasks changed the turn route
  since `main`, rebase on it and keep their gate.
- No `git commit`, no installs, no network; do not run `prisma migrate` or the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/provenance.test.ts -t 'TRUTH suggestion provenance'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/brain-coach.test.ts`

## Done when

- B1 and B2 red on `main`, green on the branch; lint, typecheck, test, build green; Kevin approved the migration.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
