---
id: ADM-E1
title: Managers' code logins and stack admins need a second factor; the shared
  admin code is a logged break-glass
wp: E
needs: [ ADM-G1, DIR-G1, CLK-B1, IDN-Z1 ]
host: any
owns:
  - apps/app/prisma/schema/auth.prisma
  - apps/app/prisma/migrations/20261116090000_adm_admin_access/**
  - apps/app/src/features/auth/totp.ts
  - apps/app/src/server/actions/auth.ts
  - apps/app/src/server/actions/admin.ts
  - apps/app/src/server/admin-session.ts
  - apps/app/src/app/[company]/login/**
  - apps/app/src/app/admin/login/**
  - apps/app/src/app/admin/people/**
  - apps/app/src/components/auth/CompanyLoginForm.tsx
  - apps/app/src/components/admin/AdminLoginForm.tsx
  - apps/app/src/i18n/messages/adminAccess.ts
  - apps/app/tests/unit/adm/totp.test.ts
  - apps/app/tests/db/adm-access.test.ts
risk: high
profile: orch
budget: { minutes: 120, window_pct: 20 }
uses: [ D1, D3, D4, D12, D13, D15, D20, D21 ]
proofs:
  - id: B1
    says: totp gives the RFC 6238 test vectors, accepts one step of drift and no
      more, and the base32 codec round-trips
    run: npm test -w @nextup/app -- tests/unit/adm/totp.test.ts -t 'ADM TOTP'
  - id: B2
    says: a manager's code login needs a TOTP once enrolled and enrolment before it,
      a member's does not, /admin opens for a stack admin with code and TOTP,
      and the shared code opens it only as logged break-glass
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-access.test.ts -t 'ADM admin access'
status: ready
---

Plan ADM (sub-plan of PILOT): sign-in security (G-047). Read first: D12, D13, `apps/app/prisma/schema/auth.prisma`,
`features/auth/{login-code,cookie,session}.ts`, `server/actions/auth.ts` (`codeLogin`), `server/actions/admin.ts`
(`adminSignIn`, `isAdmin`), `server/admin-session.ts`, `features/connectors/vault.ts`, `docs/SECURITY.md`.

## What

- `auth.prisma` model User: the three fields of D13; migration `20261116090000_adm_admin_access/migration.sql`
  (generated with `prisma migrate diff`, checked by hand; only `ALTER TABLE "User" ADD COLUMN`).
- `features/auth/totp.ts` (new, pure): `base32Encode/Decode`, `totpAt(secret, time)`, `verifyTotp(secret, code,
  now)` (D12), `otpauthUrl(issuer, account, secret)`.
- `codeLogin`: a manager with `totpEnabledAt` gets a second step (the TOTP field; the session is issued only after
  it); a manager without it is sent to enrol (key and otpauth link as text, confirm with one code, store sealed);
  members and leaders unchanged. `CompanyLoginForm.tsx` and `app/[company]/login/**` show the steps; the side
  panel with the sample numbers shows only for demo-stage companies (D20).
- `/admin`: `adminSignIn` accepts a stack admin's personal code + TOTP; the shared `ADMIN_ACCESS_CODE` still works,
  logs `[admin] break-glass <ISO>` and marks the cookie so the layout banner shows (D13); `/admin/people` gets a
  "stack admin" switch per person. `AdminLoginForm.tsx` and `app/admin/login/**` updated.
- Strings in `i18n/messages/adminAccess.ts`.
- Tests:
  - `apps/app/tests/unit/adm/totp.test.ts`, `describe("ADM TOTP", …)`: the RFC 6238 SHA-1 vectors (59 s → 94287082
    as 8 digits, truncated rule for 6), drift of ±30 s accepted, ±60 s refused, base32 round-trip.
  - `apps/app/tests/db/adm-access.test.ts`, `describe("ADM admin access", …)` (D15): with a fixed `now`, a manager
    without TOTP gets "enrol" and no session; after enrolling, a wrong code is refused and the right one gives a
    session; a member signs in with the code alone; a stack admin with code + TOTP gets an admin session; the shared
    code gives an admin session flagged break-glass and one log line (spy on `console.info`).

## Not

- No change to Microsoft sign-in (D12). No audit table (GDP). No QR image (Q2). Nothing in auth.prisma besides the
  three User fields (D4).

## Done when

Both proofs are green and lint, typecheck, test, build stay green; `tests/e2e/db/company-login.spec.ts` still passes.

Commit everything; an unfinished state as `wip(adm-e1): …`. Leave nothing unsaved. orch pushes and opens the PR.
