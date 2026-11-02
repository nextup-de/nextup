---
id: ADM-G1
title: Settings frame - company-admin guard, the section list and the message namespaces
wp: G
needs: [ IDN-Z1, LNG-Z1, CLK-G1 ]
host: any
owns:
  - apps/app/src/server/actions/settings/guard.ts
  - apps/app/src/features/settings/sections.ts
  - apps/app/src/app/[company]/(app)/settings/layout.tsx
  - apps/app/src/app/[company]/(app)/settings/page.tsx
  - apps/app/src/i18n/de.ts
  - apps/app/src/i18n/en.ts
  - apps/app/src/i18n/messages/settingsCompany.ts
  - apps/app/src/i18n/messages/settingsOrg.ts
  - apps/app/src/i18n/messages/settingsConnectors.ts
  - apps/app/src/i18n/messages/settingsSetup.ts
  - apps/app/src/i18n/messages/adminAccess.ts
  - apps/app/tests/unit/adm/sections.test.ts
  - apps/app/tests/db/adm-guard.test.ts
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D3, D6, D7, D14, D15, D21 ]
proofs:
  - id: B1
    says: SETTINGS_SECTIONS lists the sections of D7 in order with a message key in
      German and English each, and Setup shows only for a company without units
    run: npm test -w @nextup/app -- tests/unit/adm/sections.test.ts -t 'ADM
      settings sections'
  - id: B2
    says: companyAdminOf gives an active manager of the company and refuses a
      leader, a deactivated manager and a manager of another company
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-guard.test.ts -t 'ADM company admin guard'
status: open
---

Plan ADM (sub-plan of PILOT): the frame every settings page sits in. Read first: `docs/README.md`,
`apps/app/src/app/[company]/(app)/settings/` (all of it), `apps/app/src/config/roles.ts` (`ROLE_ACCESS`),
`apps/app/src/features/auth/session.ts` (`getViewerFor`), `apps/app/src/server/page-guard.ts`,
`apps/app/src/i18n/{de,en}.ts` and one namespace file such as `i18n/messages/settings.ts`.

## What

- `apps/app/src/server/actions/settings/guard.ts` (new, not "use server"): `companyAdminOf(slug)` exactly as D6
  (active = DIR's `active` flag on User).
- `apps/app/src/features/settings/sections.ts` (new, pure): `SETTINGS_SECTIONS` of D7 (`{ key, path, label:
  MessageKey }`), `setupStep(counts: { named: boolean; units: number; linkedSeats: number; routes: number;
  members: number })` (the first step of D14 not yet done, else `done`) and `visibleSections(setupDone: boolean)`.
- `settings/layout.tsx`: the nav from `visibleSections`, guarded by `companyAdminOf` (not found otherwise); the
  existing "guard arrives with sessions" comment goes. `settings/page.tsx`: redirect to Setup while `setupStep` is not `done`,
  else Company (D7).
- The five namespace files of D3 with the section labels (de and en), registered in `de.ts` and `en.ts`.
- Tests:
  - `apps/app/tests/unit/adm/sections.test.ts`, `describe("ADM settings sections", …)`: order and paths of D7; every
    label exists in both catalogs; `visibleSections(false)` starts with setup, `visibleSections(true)` has none; `setupStep` gives `company` for
    no name, `units` for no unit, `roles` for no linked seat, `routes` for no route, `members` for one member and
    `done` otherwise.
  - `apps/app/tests/db/adm-guard.test.ts`, `describe("ADM company admin guard", …)` (D15): with a mocked viewer, an
    active manager of company A passes for A; a leader of A, a deactivated manager of A and a manager of B do not.

## Not

- No editor and no form (ADM-A1 … ADM-F1). Existing pages under settings/ keep their content.
- No new comparison of display names; no `.prisma` file.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-g1): …`. Leave nothing unsaved. orch pushes and opens the PR.
