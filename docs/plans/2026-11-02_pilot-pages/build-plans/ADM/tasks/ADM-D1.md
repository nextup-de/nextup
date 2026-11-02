---
id: ADM-D1
title: Members hold seats and can be invited by mail; signup, invite and
  password pages are real
wp: D
needs: [ ADM-B1, DIR-D1 ]
host: any
owns:
  - apps/app/src/components/settings/MembersView.tsx
  - apps/app/src/server/actions/members.ts
  - apps/app/src/app/(auth)/signup/**
  - apps/app/src/app/(auth)/invite/**
  - apps/app/src/app/(auth)/forgot-password/**
  - apps/app/src/i18n/messages/settings.ts
  - apps/app/src/i18n/messages/auth.ts
  - apps/app/tests/unit/adm/invite.test.ts
  - apps/app/tests/db/adm-members.test.ts
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D3, D5, D6, D11, D15 ]
proofs:
  - id: B1
    says: the invite mail names the company's login address and carries the code in
      its body only, in the member's language, and no URL contains the code
    run: npm test -w @nextup/app -- tests/unit/adm/invite.test.ts -t 'ADM invite
      mail'
  - id: B2
    says: an admin links and unlinks a member's seat and invites a member, who then
      signs in with the mailed code, and nothing of another company changes
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-members.test.ts -t 'ADM members'
status: ready
---

Plan ADM (sub-plan of PILOT): members (G-018). DIR-D1 added deactivate and delete; this task adds seats and invites.
Read first: `components/settings/MembersView.tsx`, `server/actions/members.ts`, `server/mail.ts`,
`features/auth/login-code.ts`, `lib/db/org-edit.ts` (`linkSeat`, ADM-B1), the three `(auth)` stub pages, D11.

## What

- `MembersView.tsx`: a Seats column (the seats a member holds, link one from the company's free seats, unlink),
  and an Invite button next to Add (Add + mail).
- `server/actions/members.ts`: `inviteMemberAction` (add as `addMemberAction` does, then `sendMail` with a pure
  `inviteMail(person, company, code, locale)`); seat link and unlink through `linkSeat` after `companyAdminOf`.
- `(auth)/signup` and `(auth)/invite/[token]` redirect to the company login (or the find-company page without a
  company); `(auth)/forgot-password` says to ask the manager for a new code (D11). Strings in `settings.ts` / `auth.ts`.
- Tests:
  - `apps/app/tests/unit/adm/invite.test.ts`, `describe("ADM invite mail", …)`: German and English text; the code
    appears in the body; every URL in it is the login address without the code.
  - `apps/app/tests/db/adm-members.test.ts`, `describe("ADM members", …)` (D15): with a fake mailer, inviting X
    creates the user with a login code and sends one mail to X; `verifyLoginCode` accepts the mailed code; linking a
    seat sets its `userId`, unlinking clears it; B's rows unchanged; a leader's call writes nothing.

## Not

- No deactivate or delete (DIR-D1 did them). No change to sign-in (ADM-E1). No `.prisma` file.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
