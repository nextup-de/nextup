---
id: BVW-H1
title: Idea content is translated through the AI gate, the original kept
phase: BVW
needs: [ AIP-Z1 ]
owns:
  - apps/app/prisma/schema/core.prisma                            # CaseTranslation only (core block)
  - apps/app/prisma/migrations/20261201090000_bvw_case_translation/**
  - apps/app/src/features/ai/gate.ts                              # purpose "translate"
  - apps/app/src/features/translate/index.ts                      # new, pure
  - apps/app/src/server/translate.ts                              # new
  - apps/app/src/server/actions/translate.ts                      # new
  - apps/app/tests/unit/bvw/translate.test.ts
  - apps/app/tests/db/bvw-translate.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, HD7, HD8, HD9 ]
proofs:
  - id: B1
    says: the gate allows purpose translate only with a DPA and the AI on, the text is masked before it leaves, and translationFor returns the original with reason ai-off when the gate is closed
    run: npm test -w @nextup/app -- tests/unit/bvw/translate.test.ts -t 'BVW translation'
    expect: '[1-9]\d* passed'
  - id: B2
    says: translateCase stores one CaseTranslation per case, language and source hash, reuses it, and never changes the case's events or score
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bvw-translate.test.ts -t 'BVW translation stored'
    expect: '[1-9]\d* passed'
pr_title: "feat(translate): idea content in the reader's language"
---

# BVW-H1 Idea content is translated through the AI gate, the original kept

## Goal

Multi-plant groups (CZ, HU, PL) and tenders (DE/EN/FR) need idea content in the reader's language. The interface is
translated; the content is not. After this task a reader can see a case's title and text in their language, through
the company's AI provider and its gate, with the original always one click away. A translation is display only: it
never feeds a score, a route or a decision (DO2).

## Context (read first)

- `AGENTS.md`; AIP: `apps/app/src/features/ai/gate.ts` (`aiGate`, purposes), `features/ai/settings.ts`, the adapters
  from #318, `features/assist/redact.ts` (masking before a model).
- `prisma/schema/core.prisma` (HD11: only the core block); HD7 (off is normal).
- Spec: [11, "Idea content in your language"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#idea-content-in-your-language).

## What

- `CaseTranslation { id, companyId, caseId, lang, sourceHash, title, body, provider, model, createdAt; @@unique(
  [companyId, caseId, lang, sourceHash]) }` and its migration.
- `gate.ts`: purpose `translate`, allowed like `coach` (DPA signed, AI on); off → closed with reason.
- `features/translate/index.ts`: `sourceHash(title, body)`, `translationFor(row | null, gate)` →
  `{ text, translated: boolean, reason?: "ai-off" | "no-dpa" | "same-language" }`, supported languages de, en, fr,
  cs, hu, pl.
- `server/translate.ts`: `translateCase(companyId, caseId, lang)` (mask, call the provider through the gate, store);
  `server/actions/translate.ts`: `showTranslation(slug, caseId, lang)` for anyone who may see the case (VIS rule).
- Tests: `tests/unit/bvw/translate.test.ts`, `tests/db/bvw-translate.test.ts` with an injected fake provider (no
  network).

## Not

- No translation of comments or projects (later), no page (Sam), no automatic translation on raise.

## Constraints

- Edit only the paths in `owns`. Kevin approves the start (schema).
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/translate.test.ts -t 'BVW translation'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/aip`

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
