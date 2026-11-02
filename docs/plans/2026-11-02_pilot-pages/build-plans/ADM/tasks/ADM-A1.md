---
id: ADM-A1
title: Company profile, rules and calendar are edited in settings
wp: A
needs: [ ADM-G1, CLK-G1, CLK-A1, IDN-Z1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/company/**
  - apps/app/src/app/[company]/(app)/settings/rules/**
  - apps/app/src/app/[company]/(app)/settings/calendar/**
  - apps/app/src/components/settings/CompanyForm.tsx
  - apps/app/src/components/settings/RulesForm.tsx
  - apps/app/src/components/settings/CalendarForm.tsx
  - apps/app/src/server/actions/settings/company.ts
  - apps/app/src/i18n/messages/settingsCompany.ts
  - apps/app/tests/unit/adm/company-forms.test.ts
  - apps/app/tests/db/adm-company.test.ts
  - apps/app/src/features/settings/company-forms.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D3, D6, D7, D9, D15 ]
proofs:
  - id: B1
    says: the company, rules and calendar forms parse and check their input into
      profile, CompanyRules, loop rules and CalendarSpec, refusing bad values
      with a message key
    run: npm test -w @nextup/app -- tests/unit/adm/company-forms.test.ts -t 'ADM
      company forms'
  - id: B2
    says: the settings actions save name, profile, rules, loop rules and calendar
      for the admin's company only, and a leader's call changes nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-company.test.ts -t 'ADM company settings'
status: built
lane: pc/a
branch: orch/adm-a1
retries: 1
last_failure: "Beweise rot: B2"
resumes: 0
---

Plan ADM (sub-plan of PILOT): company, rules and calendar (G-014). Read first: `apps/app/src/server/actions/settings/guard.ts`
(ADM-G1), `apps/app/src/lib/db/rules.ts`, `features/knowledge/rules.ts`, `lib/db/loop.ts`, `features/loop/rules.ts`,
`lib/db/calendar.ts` and `features/clock/{index,calendar,holidays}.ts` (CLK), `lib/db/knowledge.ts` (`loadProfile`
and how CompanyProfile is written), `components/admin/LoopRulesAdmin.tsx` (the /admin form to mirror).

## What

- `server/actions/settings/company.ts` ("use server"): `saveCompanyAction` (name, mark; CompanyProfile vision,
  mission, principles, businessModel, complianceRules), `saveRulesAction` (CompanyRules through
  `saveCompanyRules`, loop rules through `saveLoopRules`), `saveCalendarAction` (`saveCalendar`); each starts with
  `companyAdminOf`, parses with pure functions exported from the form files' sibling `parse` helpers in the same
  action file or a pure module it owns, and revalidates the settings path.
- Pages `settings/company`, `settings/rules`, `settings/calendar` with `CompanyForm`, `RulesForm`, `CalendarForm`
  (client components with `useActionState`, test ids of D7). The calendar page lists this and next year's holidays
  of the chosen region.
- Strings in `i18n/messages/settingsCompany.ts`, German and English.
- Tests:
  - `apps/app/tests/unit/adm/company-forms.test.ts`, `describe("ADM company forms", …)`: a name over 120 chars, a
    promise of 0 days, a negative spend limit, a workday 8 and an extra holiday "2026-13-01" are refused with their
    message key; good input gives the expected values.
  - `apps/app/tests/db/adm-company.test.ts`, `describe("ADM company settings", …)` (D15): as a manager of A every
    action saves A's rows and `companySeed` / `loadCalendar` read them back; company B is unchanged; a leader's call
    returns the forbidden message and writes nothing.

## Not

- No org, seat or routing editor (ADM-B1), no connectors (ADM-C1). No per-site calendar (Q1). No `.prisma` file.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
