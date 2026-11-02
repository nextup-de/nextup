---
id: BVW-F1
title: A payroll CSV for SAP HCM, SuccessFactors or DATEV is built from the due premiums
phase: BVW
needs: [ BVW-E1, DIR-Z1 ]
owns:
  - apps/app/src/features/premium/payroll.ts                      # new, pure
  - apps/app/src/features/cases/events.ts                         # project.paid
  - apps/app/src/features/cases/persist.ts
  - apps/app/src/features/projects/reduce.ts                      # paid state only
  - apps/app/src/server/actions/payroll.ts                        # new
  - apps/app/tests/unit/bvw/payroll.test.ts
  - apps/app/tests/db/bvw-payroll.test.ts
risk: high
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO4, HD5, HD14, DQ2 ]
proofs:
  - id: B1
    says: payrollCsv writes one line per author and premium in the SAP HCM (infotype 0015), SuccessFactors and DATEV profiles with the company's wage type, decimal comma or point per profile, and refuses an author without a personnel number by listing them instead
    run: npm test -w @nextup/app -- tests/unit/bvw/payroll.test.ts -t 'BVW payroll file'
    expect: '[1-9]\d* passed'
  - id: B2
    says: exportPayroll by the payroll role returns the file for rewarded and unpaid projects in the period, appends project.paid with the batch id so the next export skips them, and writes an audit event; any other role is refused
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bvw-payroll.test.ts -t 'BVW payroll export'
    expect: '[1-9]\d* passed'
pr_title: "feat(premium): payroll CSV export"
---

# BVW-F1 A payroll CSV for SAP HCM, SuccessFactors or DATEV is built from the due premiums

## Goal

target's benchmark is "rewards go straight to payroll". NextUp will not write into SAP (HD14), but it can hand payroll
a file in the format its system imports. After this task a company's payroll role downloads one CSV per period with
every premium not paid yet, and those premiums are marked paid.

## Context (read first)

- `AGENTS.md`; **HD14** and open question **DQ2** in [the Codex plan](../2026-11-02_defensible-offer-codex.md#open-questions):
  the personnel number is never shown; the default answer lets it appear in this file only. Stop with
  `status: "question"` if Kevin has not answered DQ2 in the PR thread or the plans repo.
- DIR's directory fields on `User` (the external id / personnel number, DIR-G1), BVW-E1's stamped reward payload
  (`lines` per author), TRUTH-F1 `recordAudit`.
- `CompanyRule` keys `payroll_profile` (`sap-hcm-0015` | `successfactors` | `datev-lodas`), `payroll_wage_type`
  (string), `payroll_role_id` (the org role allowed to export).
- Spec: [11, "Payroll export"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#payroll-export).

## What

- `features/premium/payroll.ts` (pure): `payrollCsv(profile, rows, opts)`; columns per profile (SAP 0015: PERNR,
  LGART, BETRG, WAERS, BEGDA; SuccessFactors one-time payment: userId/personIdExternal, payComponent, amount,
  currency, issueDate; DATEV: Personalnummer, Lohnart, Betrag, Abrechnungsmonat); CRLF line ends, UTF-8 with BOM for
  DATEV; `missing` = authors without a personnel number (never silently dropped).
- Event `project.paid { batchId, period }` (registered like BVW-B1's); `reduce.ts` sets `paid` on the project.
- `server/actions/payroll.ts`: `exportPayroll(slug, { from, to })` (holders of `payroll_role_id` only), audit
  `audit.privacy.payroll` with the batch id and the count, never the numbers.
- Tests: `tests/unit/bvw/payroll.test.ts`, `tests/db/bvw-payroll.test.ts`.

## Not

- No preview of the file in any page (HD14), no API push to SAP, no tax logic, no page (Sam).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/payroll.test.ts -t 'BVW payroll file'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
