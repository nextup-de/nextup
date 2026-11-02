---
id: PROOF-D1
title: One outcome record per decided case, with the company's consent stored
phase: PROOF
needs: [ PROOF-B1, VIS-Z1 ]
owns:
  - apps/app/prisma/schema/ops.prisma                             # OutcomeRecord only
  - apps/app/prisma/schema/core.prisma                            # back-relation in the ops block of model Company only
  - apps/app/prisma/migrations/20261208090000_proof_outcome_record/**
  - apps/app/src/features/outcomes/record.ts                      # new, pure
  - apps/app/src/lib/db/outcomes.ts                               # new
  - apps/app/src/server/actions/outcomes.ts                       # new
  - apps/app/tests/unit/proof/outcome-record.test.ts
  - apps/app/tests/db/proof-outcomes.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, DO3, HD5, HD10, HD14 ]
proofs:
  - id: B1
    says: outcomeRecord builds one row per decided case with decision type, answer and decision days, on-time, answer, project verdict, metric class, change, source kind, confirmation and score parts, and no text, name, user id or seat
    run: npm test -w @nextup/app -- tests/unit/proof/outcome-record.test.ts -t 'PROOF outcome record'
    expect: '[1-9]\d* passed'
  - id: B2
    says: rebuildOutcomes writes the rows for one company idempotently, saveOutcomeConsent stores benchmark and case-study consent with who and when and an audit event, and nothing of another company is touched
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/proof-outcomes.test.ts -t 'PROOF outcome records'
    expect: '[1-9]\d* passed'
pr_title: "feat(outcomes): outcome records and consent"
---

# PROOF-D1 One outcome record per decided case, with the company's consent stored

## Goal

The defensible asset is the outcome dataset: answer times per decision type, share answered on time, and verified
before/after results. After this task each decided case has one anonymous `OutcomeRecord`, rebuilt from the log, and
the company's consent to use it for benchmarks or a case study is stored. Nothing leaves the stack here (BENCH).

## Context (read first)

- `AGENTS.md`; HD11 (GDP owns `ops.prisma`; back-relation rule), HD5, HD14.
- VIS `caseView` (`firstAnswerDay`, decision), CORE-S1 `answerPromise`, project state with PROOF-A1/B1 (source,
  confirmed), PROOF-C1 presets (metric class), TRUTH-D1 score parts.
- `CompanyRule` key `outcome_consent` `{ benchmark: boolean; caseStudy: boolean; at: string; byUserId: string }`.
- FOUND checklist: the pilot contract grants the right to use anonymised outcome data.

## What

- `model OutcomeRecord { id, companyId, caseId, decisionType (route id), raisedDay, firstAnswerDays?, decisionDays?,
  onTime?, answer?, verdict?, metricClass?, changePct?, sourceKind?, confirmed?, scoreParts Json, updatedAt;
  @@unique([companyId, caseId]) }` and the migration.
- `features/outcomes/record.ts` (pure): `outcomeRecord(caseView, project | null, promise)`.
- `lib/db/outcomes.ts`: `rebuildOutcomes(companyId)` (upsert per case), `loadOutcomeConsent`, `saveOutcomeConsent`.
- `server/actions/outcomes.ts`: `saveOutcomeConsentAction(slug, consent)` for company admins, audit
  `audit.privacy.consent`; `rebuildOutcomesAction(slug)` for company admins.
- Tests: `tests/unit/proof/outcome-record.test.ts`, `tests/db/proof-outcomes.test.ts`.

## Not

- No export, no aggregation across companies (BENCH), no scheduled rebuild (a nightly job comes with BENCH-B1), no
  page (Sam).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/proof/outcome-record.test.ts -t 'PROOF outcome record'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
