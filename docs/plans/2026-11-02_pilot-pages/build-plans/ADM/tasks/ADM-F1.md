---
id: ADM-F1
title: A setup wizard takes an empty company from nothing to its first route
wp: F
needs: [ ADM-A1, ADM-B1, ADM-D1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/setup/**
  - apps/app/src/components/settings/SetupWizard.tsx
  - apps/app/src/server/actions/settings/setup.ts
  - apps/app/src/i18n/messages/settingsSetup.ts
  - apps/app/tests/unit/adm/setup.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D3, D6, D7, D14, D15, D21 ]
proofs:
  - id: B1
    says: the wizard's step follows from what the company has - no unit, no seat, no
      route, no member, done - and each step's form uses the same action as its
      settings page
    run: npm test -w @nextup/app -- tests/unit/adm/setup.test.ts -t 'ADM setup
      steps'
status: ready
---

Plan ADM (sub-plan of PILOT): the setup wizard (D14). Read first: the actions and editors of ADM-A1, ADM-B1 and
ADM-D1, `features/settings/sections.ts`, D7 and D14.

## What

- `server/actions/settings/setup.ts`: `setupCounts(companyId)` loads the counts for ADM-G1's `setupStep`; the page
  and the settings layout read the step on every load (D14).
- `settings/setup` page and `SetupWizard.tsx`: one step at a time with the step's form (it renders the step's editor
  part from ADM-A1, ADM-B1, ADM-D1, calling the same actions), Back and Next, a progress line, test ids
  `setup-step-<key>`; at `done` a link to the inbox. Strings in `settingsSetup.ts`.
- `apps/app/tests/unit/adm/setup.test.ts`, `describe("ADM setup steps", …)`: empty knowledge → `company` until the
  name is set, then `units`; units without a seat → `roles`; a seat and no route → `routes`; a route and only the
  admin as user → `members`; with a second member → `done`; each step key maps to an action exported by ADM-A1,
  ADM-B1 or ADM-D1 (import them).

## Not

- No new write path (D14), no new table. The editors' own pages stay as they are.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-f1): …`. Leave nothing unsaved. orch pushes and opens the PR.
