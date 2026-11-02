---
id: BVW-B1
title: A case can be sent to a Gutachter, who submits the assessment on the clock
phase: BVW
needs: [ BVW-A1, VIS-Z1, CORE-H1 ]
owns:
  - apps/app/src/features/cases/events.ts                         # three event types
  - apps/app/src/features/cases/persist.ts                        # APP_EVENT_TYPES
  - apps/app/src/features/clock/due.ts                            # kind "review"
  - apps/app/src/server/actions/review.ts                         # new
  - apps/app/src/lib/db/review.ts                                 # new: the company's form (CompanyRule key review_form)
  - apps/app/tests/unit/bvw/review-due.test.ts
  - apps/app/tests/db/bvw-review.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, DO4, HD4, HD5, HD10, CLK/D10, CLK/D12 ]
proofs:
  - id: B1
    says: dueNow lists an open review past its due day once (kind review, to the reviewer's seat) and nothing for demo mode
    run: npm test -w @nextup/app -- tests/unit/bvw/review-due.test.ts -t 'BVW review due'
    expect: '[1-9]\d* passed'
  - id: B2
    says: requestReview and submitReview append the events with server-set due day and reviewer seat, refuse the raiser and the desk as reviewer, refuse marks outside the company's form, and a member of another company gets nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bvw-review.test.ts -t 'BVW review on the clock'
    expect: '[1-9]\d* passed'
pr_title: "feat(review): Gutachter review on the clock"
---

# BVW-B1 A case can be sent to a Gutachter, who submits the assessment on the clock

## Goal

The desk (or a manager) asks a Gutachter for an assessment; the reviewer fills the company's form; the review is due
in working days and the scheduler writes a due fact when it is late. Uses BVW-A1's model.

## Context (read first)

- `AGENTS.md`; DO4 (new event types need Kevin's approval: this task is `high`).
- BVW-A1 `features/review/*`; `apps/app/src/features/cases/events.ts` and `persist.ts` (`APP_EVENT_TYPES`);
  `apps/app/src/server/actions/events.ts` (how an append is permission-checked and stamped); CLK D10, D12
  (`clock.due`, `dueNow`) and CORE-H1's version of `due.ts`.
- `apps/app/prisma/schema/structure.prisma` `CompanyRule` (key/value JSON; no schema change).

## What

- Register `review.requested`, `review.submitted`, `review.withdrawn` (payloads from BVW-A1) in `events.ts` and
  `APP_EVENT_TYPES`.
- `lib/db/review.ts`: `loadReviewForm(companyId)` / `saveReviewForm(companyId, form, by)` on CompanyRule key
  `review_form`, validated by `validateForm`, falling back to `DEFAULT_FORM`.
- `server/actions/review.ts`: `requestReview(slug, caseId, reviewerSeatId)` (the server sets `dueDay` = today +
  `reviewDays` working days), `submitReview(slug, caseId, input)`, `withdrawReview(slug, caseId, seatId, why)`,
  `saveReviewFormAction(slug, form)` (company admins, audit `audit.settings.review`). Permissions from BVW-A1.
- `due.ts`: `kind: "review"` for an open review past its due day, `toRoleHolderId` = the reviewer's seat, idemKey
  `clk:review:<caseId>:<seat>:<dueDay>`.
- Tests: `tests/unit/bvw/review-due.test.ts` (`describe("BVW review due", …)`), `tests/db/bvw-review.test.ts`
  (`describe("BVW review on the clock", …)`).

## Not

- No committee (BVW-C1), no page (Sam), no NTF message mapping (NTF's planner gets the new types in a one-line
  follow-up Kevin adds to NTF).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/review-due.test.ts -t 'BVW review due'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/clk tests/unit/bvw`

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
