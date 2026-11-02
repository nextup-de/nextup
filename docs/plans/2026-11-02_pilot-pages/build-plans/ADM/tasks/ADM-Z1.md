---
id: ADM-Z1
title: "ADM acceptance: an empty company is configured in the app and its first
  case is routed"
wp: Z
needs:
  [
    ADM-G1,
    ADM-A1,
    ADM-B1,
    ADM-C1,
    ADM-D1,
    ADM-E1,
    ADM-F1,
    ADM-H1,
    ADM-N1,
    ADM-R1,
    IDN-Z1
  ]
host: any
owns:
  - apps/app/tests/e2e/db/admin-setup.spec.ts
  - docs/SETTINGS.md
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D7, D12, D14, D15, D16 ]
proofs:
  - id: B1
    says: a manager of a company created empty sets it up through the wizard, and
      the first case a member raises reaches the inbox of the leader who holds
      the route's owner seat, without /admin after creation
    run: cd apps/app && export
      DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test
      AUTH_SECRET=<test value, see the plans repo>
      ADMIN_ACCESS_CODE=adm-proof-admin-code
      CONNECTOR_VAULT_KEY=<test value, see the plans repo> CI=1 &&
      npx prisma migrate deploy && npx playwright test -c
      playwright.db.config.ts tests/e2e/db/admin-setup.spec.ts -g 'ADM
      acceptance'
    expect: 'ADM acceptance[\s\S]*[1-9]\d* passed'
status: ready
---

Plan ADM (sub-plan of PILOT): acceptance. Every other ADM task is merged. Read first:
`apps/app/tests/e2e/db/structure.spec.ts` and `identity.spec.ts` (company creation, login codes, cleanup),
`features/auth/totp.ts`, `features/connectors/vault.ts`, the wizard's test ids (D7, D14).

## What

- `apps/app/tests/e2e/db/admin-setup.spec.ts`, `test.describe("ADM acceptance: an empty company is configured in the
  app and its first case is routed", …)`: create a company from the empty template in stage sandbox through /admin
  with one manager (the last /admin step). The manager signs in with the code, enrols TOTP (the test reads the shown
  key and computes codes with `totpAt`), lands on Setup, and through the wizard sets the name, adds unit `ENG`, role
  "Engineering lead" with a seat, a route "Test rig time" with keywords `rig`, `test` owned by that role, and invites
  a leader and a member. The leader is linked to the seat on the Members page. The member signs in and raises a case
  with "rig"; the leader signs in and sees it in the inbox. Delete the company at the end.
- `docs/SETTINGS.md` (new): the settings sections, who may use them, the second factor and break-glass, and `## ADM
  gaps` with G-012, G-013, G-014, G-018, G-047 (D16) plus the open items of Q1-Q3.

## Not

- No source file outside the test and the doc. If the acceptance fails because of a page, report `blocked` with the
  path in backticks.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
