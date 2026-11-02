---
id: PROOF-B1
title: A typed measure counts only after a second person confirms it
phase: PROOF
needs: [ PROOF-A1 ]
owns:
  - apps/app/src/features/cases/events.ts                         # project.measure.confirmed
  - apps/app/src/features/cases/persist.ts
  - apps/app/src/features/projects/reduce.ts
  - apps/app/src/features/projects/permissions.ts
  - apps/app/tests/unit/proof/confirm-measure.test.ts
risk: high
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO2, DO4, HD5, HD10 ]
proofs:
  - id: B1
    says: a typed measure gives a verdict marked unconfirmed and no reward due until someone other than the lead and the person who typed it confirms it; import and system measures count at once; the lead cannot confirm their own number
    run: npm test -w @nextup/app -- tests/unit/proof/confirm-measure.test.ts -t 'PROOF second-person confirmation'
    expect: '[1-9]\d* passed'
pr_title: "feat(projects): second-person confirmation of typed results"
---

# PROOF-B1 A typed measure counts only after a second person confirms it

## Goal

The person who benefits from a good verdict should not be the only one who vouches for the number. After this task a
typed measure produces a verdict marked "not confirmed" that makes no reward due, until a second person (a manager,
the lead's deputy or a holder of the company's controller role) confirms it. Imported and system measures count at
once, with their source shown.

## Context (read first)

- `AGENTS.md`; DO4 (new event type: risk high); PROOF-A1's `measure-source.ts`.
- `apps/app/src/features/projects/reduce.ts` (`verdict`, `rewardDue` after TRUTH-G1), `permissions.ts`,
  `features/cases/events.ts` and `persist.ts` (`APP_EVENT_TYPES`), `features/auth/identity.ts` (seats, deputy role).
- `CompanyRule` key `measure_confirmer_role_id` (optional controller role).

## What

- Event `project.measure.confirmed { check }`; actor by id.
- `permissions.ts`: confirm allowed for a manager, the deputy role of the lead's seat, or a holder of
  `measure_confirmer_role_id`; refused for the lead, for whoever appended the measure, and for an import or system
  measure (nothing to confirm).
- `reduce.ts`: each check gets `confirmed: boolean` and `confirmedBy` (user id); the project's `verdict` gains
  `confirmed`; `rewardDue` also needs `confirmed` (or a non-typed source).
- Test `tests/unit/proof/confirm-measure.test.ts`, `describe("PROOF second-person confirmation", …)`.

## Not

- No page (Sam), no notification (NTF picks the event up later).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/proof/confirm-measure.test.ts -t 'PROOF second-person confirmation'`
  (≥ 1 passed)
- `npm test -w @nextup/app` (project tests stay green)

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
