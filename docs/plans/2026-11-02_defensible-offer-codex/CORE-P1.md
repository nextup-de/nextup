---
id: CORE-P1
title: A person is pseudonymised - their name appears nowhere, ids stay (GDP)
phase: CORE
needs: [ CORE-X1, DIR-D1 ]
owns:
  - apps/app/src/features/privacy/pseudonymise.ts                 # new, pure
  - apps/app/src/lib/db/privacy.ts
  - apps/app/src/server/actions/privacy.ts
  - apps/app/tests/unit/core/pseudonymise.test.ts
  - apps/app/tests/e2e/db/data-protection.spec.ts                 # GDP's acceptance file name
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, HD5, HD10 ]
proofs:
  - id: B1
    says: pseudonymiseUser replaces the display name, email and department with a stable pseudonym in users, seats and projections, leaves ids and the append-only log's ids untouched, and exact mentions of the name in comments are masked at display
    run: npm test -w @nextup/app -- tests/unit/core/pseudonymise.test.ts -t 'CORE pseudonymise'
    expect: '[1-9]\d* passed'
  - id: B2
    says: after an admin pseudonymises a person, the person's name appears on no page and in no export, and the audit log shows the action
    run: cd apps/app && export DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test
      AUTH_SECRET=<test value, set by the runner> CI=1 && npx prisma migrate deploy
      && npx playwright test -c playwright.db.config.ts tests/e2e/db/data-protection.spec.ts -g 'GDP acceptance'
    expect: 'GDP acceptance[\s\S]*[1-9]\d* passed'
pr_title: "feat(privacy): pseudonymise a person"
---

# CORE-P1 A person is pseudonymised - their name appears nowhere, ids stay

## Goal

"Auf Wunsch gelöscht" is promised and not possible (G-043). The event log is append-only, so deleting a person means
replacing their name everywhere it is shown while ids stay (PILOT brief GDP, Risks). DIR-D1 already deletes an inactive
user (events keep `actorUserId` null); this task covers the case where the history must stay: pseudonymise.

## Context (read first)

- `AGENTS.md`; PILOT brief `### GDP`; [05-data-protection.md](../2026-11-02_pilot-pages/05-data-protection.md)
  "pseudonymise" dialog and open question G4 (default: exact matches of the display name in other people's comments
  are replaced at display).
- [DIR-D1](../2026-11-02_pilot-pages/build-plans/DIR/tasks/DIR-D1.md) (deactivate and delete), VIS projections,
  CORE-X1's `lib/db/privacy.ts` and `server/actions/privacy.ts`.
- `apps/app/src/features/cases/events.ts` (the `actor` display label on events).

## What

- `features/privacy/pseudonymise.ts` (pure): `pseudonymFor(userId)` ("Former member #" + 4 digits, stable),
  `maskMentions(text, names)`.
- `lib/db/privacy.ts`: `pseudonymiseUser(companyId, userId)` in one transaction: user name, email, department and
  handle replaced, sign-in revoked, seats vacated; the `actor` label of the user's events rewritten to the pseudonym
  (the only label rewrite allowed; ids stay, the event stays); projections rebuilt for the user's cases.
- `server/actions/privacy.ts`: `pseudonymisePerson(slug, userId, confirmName)` (company admins; `confirmName` must
  equal the current display name), audit `audit.privacy.pseudonymised`.
- Tests: `tests/unit/core/pseudonymise.test.ts`; the GDP acceptance `tests/e2e/db/data-protection.spec.ts` ›
  `GDP acceptance: audit, export and pseudonymise` (audit row visible, person export holds only their data, name gone
  after pseudonymisation).

## Not

- No page or dialog (Sam, spec 05); no retention (GDP).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run e2e or DB proofs.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/core/pseudonymise.test.ts -t 'CORE pseudonymise'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
