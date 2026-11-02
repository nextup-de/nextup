---
id: ADM-H1
title: Company goals are edited on the Rules page
wp: H
needs: [ ADM-A1, ADM-B1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/rules/page.tsx
  - apps/app/src/components/settings/GoalsEditor.tsx
  - apps/app/src/lib/db/goals-edit.ts
  - apps/app/src/features/org-edit/goals.ts
  - apps/app/src/server/actions/settings/goals.ts
  - apps/app/src/i18n/messages/settingsGoals.ts
  - apps/app/src/i18n/de.ts
  - apps/app/src/i18n/en.ts
  - apps/app/tests/unit/adm/goals.test.ts
  - apps/app/tests/db/adm-goals.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D2, D3, D6, D15, D17, D21 ]
proofs:
  - id: B1
    says: the goal rules refuse an empty or too long title, too many keywords and a
      unit of another company, each with its message key, and accept a good goal
    run: npm test -w @nextup/app -- tests/unit/adm/goals.test.ts -t 'ADM goal rules'
  - id: B2
    says: the goal actions add, change and remove goals of the admin's company only,
      `companySeed` reads them back, and a leader's call writes nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-goals.test.ts -t 'ADM goals editor'
status: ready
---

Plan ADM (sub-plan of PILOT): the goals editor (D17). Read first: `apps/app/prisma/schema/structure.prisma` (model
`Goal`), `apps/app/src/lib/db/knowledge.ts` (how goals are read), `features/org-edit/` and `lib/db/org-edit.ts`
(ADM-B1, the pattern to copy), the Rules page of ADM-A1, and the Nextup page spec
`docs/plans/2026-11-02_pilot-pages/01-settings-and-structure.md` § Rules (the Goals card).

## What

- `features/org-edit/goals.ts` (pure): the rules of D17, each returning `null` or a message key.
- `lib/db/goals-edit.ts`: `addGoal`, `updateGoal`, `removeGoal`, the company id from the caller, `updatedBy` set.
- `server/actions/settings/goals.ts` ("use server"): one action per change, `companyAdminOf` → rule → write →
  revalidate the rules path.
- `GoalsEditor.tsx` rendered on the Rules page as its last card: goals company-wide first, then by unit in tree
  order; a drawer with title, KPI, target, period, applies to (company-wide or a unit), keywords; delete with a
  confirm. Test ids `settings-rules-goal-<thing>`. Strings in `settingsGoals.ts` (registered in `de.ts`, `en.ts`).
- Tests: the two proofs.

## Not

- No `.prisma` file. No change to how ideas are scored (they read `Goal` as today).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-h1): …`. Leave nothing unsaved. orch pushes and opens the PR.
