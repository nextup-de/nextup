---
id: BVW-C1
title: The committee sees its agenda and records a decision with minutes
phase: BVW
needs: [ BVW-B1 ]
owns:
  - apps/app/src/features/review/committee.ts                     # new, pure
  - apps/app/src/features/cases/events.ts                         # committee.decided
  - apps/app/src/features/cases/persist.ts
  - apps/app/src/server/actions/committee.ts                      # new
  - apps/app/tests/unit/bvw/committee.test.ts
  - apps/app/tests/db/bvw-committee.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO2, DO4, HD4, HD5, HD10 ]
proofs:
  - id: B1
    says: committeeAgenda lists the cases whose requested reviews are all submitted or withdrawn and that have no decision, ordered by waiting time, and carries each case's weighted review result and recommendations
    run: npm test -w @nextup/app -- tests/unit/bvw/committee.test.ts -t 'BVW committee agenda'
    expect: '[1-9]\d* passed'
  - id: B2
    says: decideInCommittee by a holder of the company's committee role appends committee.decided with minutes and attendees by seat and the case's normal decision event in one go; anyone else is refused
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bvw-committee.test.ts -t 'BVW committee decides'
    expect: '[1-9]\d* passed'
pr_title: "feat(review): committee agenda and decision"
---

# BVW-C1 The committee sees its agenda and records a decision with minutes

## Goal

In a BVW the committee (often with works-council members) decides on the Gutachter's assessment. After this task the
committee has an agenda computed from the log and records its decision with minutes; the decision also becomes the
case's normal decision, so the loop (project, measurement, premium) continues as today.

## Context (read first)

- `AGENTS.md`; BVW-A1/B1 (`features/review/*`, `server/actions/review.ts`).
- How a case is decided today: the decision event in `features/cases/events.ts` and its permission in
  `features/cases/permissions.ts` (read only).
- `CompanyRule` (key `committee_role_id`: the org role whose seats form the committee; set on the Rules page later).
- Spec: [11, "Committee"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#committee).

## What

- `features/review/committee.ts` (pure): `committeeAgenda(log, form, today)` and `canDecideInCommittee(me,
  committeeRoleId)`.
- Event `committee.decided { caseId, answer: "yes" | "no" | "later", minutes: string (≤ 4,000 chars),
  attendeeSeatIds: string[], premiumNote?: string }`, registered like BVW-B1's.
- `server/actions/committee.ts`: `decideInCommittee(slug, caseId, input)`: checks the committee role, appends
  `committee.decided`, then the case's normal decision event with the same answer (yes or no; `later` appends only
  the committee event), both with the same server timestamp.
- Tests: `tests/unit/bvw/committee.test.ts`, `tests/db/bvw-committee.test.ts`.

## Not

- No page, no meeting scheduling, no voting record per person (minutes are one text; attendees are seats, never a
  tally per person, HD5).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/committee.test.ts -t 'BVW committee agenda'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
