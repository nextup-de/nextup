---
id: ADM-R1
title: A lost second factor is reset by another manager or a stack admin
wp: R
needs: [ ADM-D1, ADM-E1 ]
host: any
owns:
  - apps/app/src/components/settings/MembersView.tsx
  - apps/app/src/server/actions/settings/totp-reset.ts
  - apps/app/src/app/admin/people/**
  - apps/app/src/i18n/messages/settings.ts
  - apps/app/src/i18n/messages/adminAccess.ts
  - apps/app/tests/db/adm-totp-reset.test.ts
risk: high
profile: orch
budget: { minutes: 60, window_pct: 10 }
uses: [ D1, D3, D6, D12, D13, D15, D19, D21 ]
proofs:
  - id: B1
    says: a manager resets another manager's second factor of the same company and
      that person must enrol again, nobody resets their own or another
      company's, a stack admin resets it in /admin, and one log line without
      personal data is written
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-totp-reset.test.ts -t 'ADM second factor
      reset'
status: ready
---

Plan ADM (sub-plan of PILOT): resetting a lost second factor (D19). Read first: D12, D13, D19,
`features/auth/totp.ts` and the enrol path in `server/actions/auth.ts` (ADM-E1), `MembersView.tsx` (ADM-D1),
`app/admin/people/**` (ADM-E1), and the Nextup page spec `docs/plans/2026-11-02_pilot-pages/08-enterprise-and-sign-in.md`
§ Set up the second factor.

## What

- `server/actions/settings/totp-reset.ts` ("use server"): `resetTotpAction(slug, userId)` after `companyAdminOf`;
  refuses the admin's own id and users of other companies; clears `totpSecretSealed` and `totpEnabledAt`; logs
  `[auth] totp reset <ISO time>`.
- `MembersView.tsx`: "Reset second factor…" in the row menu of other managers who enrolled, with a confirm dialog.
- `/admin/people`: the same reset for a stack admin, next to the stack-admin switch.
- Strings in `settings.ts` and `adminAccess.ts`.

## Not

- No `.prisma` file, no change to the TOTP check itself.

## Done when

The proof is green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-r1): …`. Leave nothing unsaved. orch pushes and opens the PR.
