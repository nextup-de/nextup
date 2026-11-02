---
id: IDN-Z1
title: "IDN acceptance: a just-in-time user holding a role gets its cases"
wp: Z
needs: [ IDN-G1, IDN-D1, IDN-C1, IDN-M1, IDN-A1, IDN-B1, IDN-P1, IDN-S1 ]
host: any
owns:
  - apps/app/tests/e2e/db/identity.spec.ts
  - docs/IDENTITY.md
risk: normal
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D2, D8, D12, D14, D15, D16 ]
proofs:
  - id: B1
    says: in a demo-template company, a leader created by the Microsoft just-in-time
      path with department Engineering sees a case raised on the test-rig route
      in their inbox, and a JIT leader of an unknown department does not
    run: cd apps/app && export
      DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test
      AUTH_SECRET=<test value, see the plans repo>
      ADMIN_ACCESS_CODE=idn-proof-admin-code CI=1 && npx prisma migrate deploy
      && npx playwright test -c playwright.db.config.ts
      tests/e2e/db/identity.spec.ts -g 'IDN acceptance'
    expect: 'IDN acceptance[\s\S]*[1-9]\d* passed'
status: ready
---

Plan IDN (sub-plan of PILOT): acceptance. Every other IDN task is merged; this task proves the phase's result end
to end and writes the gaps list. Read first: `docs/IDENTITY.md`, `apps/app/tests/e2e/db/structure.spec.ts` and
`company-login.spec.ts` (the pattern: own companies through `/admin`, login codes, `publishIdea` in
`tests/e2e/helpers.ts`, cleanup), `apps/app/src/lib/db/accounts.ts` (`createMicrosoftUser`, IDN-C1),
`apps/app/src/features/auth/login-code.ts`, and `playwright.db.config.ts`.

## What

- `apps/app/tests/e2e/db/identity.spec.ts`, `test.describe("IDN acceptance: a JIT user holding a role gets its
  cases", …)`, skipped without `DATABASE_URL` and `ADMIN_ACCESS_CODE` like `structure.spec.ts`:
  1. Create a company from the demo template in stage demo through `/admin` with the people `B. Hartmann`
     (manager), `J. Schmidt` (member).
  2. Create two users through `createMicrosoftUser` (relative import of `src/lib/db/accounts.ts`, the code the
     Microsoft sign-in calls): a leader `Jana Neumann` with department `Engineering`, and a leader `Olaf Brenner`
     with department `Marketing`. Give each a login code by writing `hashLoginCode(code)` the way `/admin`'s new
     login code does.
  3. As `J. Schmidt`, raise a case whose text routes it to r2 (test-rig time) with `publishIdea`.
  4. Sign in as `Jana Neumann` with her code: her inbox shows the case's title. Sign in as `Olaf Brenner`: his
     inbox does not.
  5. Delete the company at the end.
  The test asserts nothing about names except the visible title; who sees what follows from the seat (D8, D12).
- `docs/IDENTITY.md`:
  - `## IDN gaps`: G-003, G-004, G-005, G-046 with the task that answers each (D16).
  - `## Name lookups left`: every label lookup D14 names, as file and the phase that owns it, found with a grep over
    `apps/app/src` for comparisons of `.name`, `.from`, `.assignee`, `.lead`, `.by` outside `features/cases` and
    `features/projects`.

## Not

- No source file outside the test and the doc. If the acceptance fails because of a page or the domain, report
  `blocked` with the path in backticks.
- No real Microsoft sign-in in the test (IDN-C1 proves the token parsing).

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(idn-z1): …`. Leave nothing unsaved. orch pushes and opens the PR.
