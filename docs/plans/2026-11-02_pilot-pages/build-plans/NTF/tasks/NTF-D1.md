---
id: NTF-D1
title: A daily digest for those who want it, and each person chooses their mails
  on the profile page
wp: D
needs: [ NTF-C1 ]
host: any
owns:
  - apps/app/src/features/notify/digest.ts
  - apps/app/src/server/notify/digest.ts
  - apps/app/src/server/notify/loop.ts
  - apps/app/src/server/actions/notify.ts
  - apps/app/src/components/profile/NotifySettings.tsx
  - apps/app/src/components/profile/ProfileView.tsx
  - apps/app/src/i18n/messages/profile.ts
  - apps/app/tests/unit/ntf/digest.test.ts
  - apps/app/tests/db/ntf-digest.test.ts
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D3, D8, D12, D15 ]
proofs:
  - id: B1
    says: the digest lists the cases on the user's desk by seat and role, in their
      language, and is empty for an empty desk
    run: npm test -w @nextup/app -- tests/unit/ntf/digest.test.ts -t 'NTF digest
      content'
  - id: B2
    says: runDigests writes one digest per opted-in user per working day at 07:00
      Berlin, none on a holiday, none for an empty desk or a demo company, and
      setPref through the profile action switches a template off
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/ntf-digest.test.ts -t 'NTF digest and opt-in'
status: ready
---

Plan NTF (sub-plan of PILOT): digests and opt-in. Read first: D8, D12 of the plan, `apps/app/src/features/notify/`
(NTF-A1), `apps/app/src/server/notify/loop.ts` (NTF-C1), `apps/app/src/lib/db/notify-prefs.ts`,
`apps/app/src/features/clock/calendar.ts`, `apps/app/src/components/profile/ProfileView.tsx`.

## What

- `apps/app/src/features/notify/digest.ts` (new, pure): `digestFor(userId, state, seats, locale, baseUrl)` → an
  OutboxDraft (template `digest`, key `digest:<userId>:<workday>`) listing the open cases on `inboxOf(state,
  meFor(userId, seats))` with title, age and link; null for an empty desk.
- `apps/app/src/server/notify/digest.ts` (new): `runDigests(now)` as D12 (non-demo companies, working days of the
  company's calendar, from 07:00 Berlin, users with the `digest` pref on); `server/notify/loop.ts` calls it after
  dispatch.
- `apps/app/src/server/actions/notify.ts` (new, "use server"): `setNotifyPrefAction(slug, template, on)` for the
  signed-in viewer only.
- `apps/app/src/components/profile/NotifySettings.tsx` (new) and `ProfileView.tsx`: on the viewer's own profile, a
  "Mails" section with a switch per group (case raised to me, discussions and projects, reminders, daily digest),
  reading and writing the viewer's prefs; strings in `i18n/messages/profile.ts` (en, de).
- Tests:
  - `apps/app/tests/unit/ntf/digest.test.ts`, `describe("NTF digest content", …)`: on `LOCAL_SEED` a second holder of
    r2's owner role gets r2's open cases; a user without a seat gets null; German locale gives German text.
  - `apps/app/tests/db/ntf-digest.test.ts`, `describe("NTF digest and opt-in", …)` (D15): a pilot
    company with notifications on, DE calendar; a user with the digest on and a case on their desk gets one row at
    2026-05-04 07:05 Berlin and none from a second run that day, none at 06:55, none on 2026-05-14 (Ascension); a
    user without the pref gets none; a demo company gets none; `setNotifyPrefAction` logic (through its pure helper)
    stores the pref for the viewer only.

## Not

- No new channel, no change to planning of other templates (NTF-A1). No settings page for admins (ADM).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-d1): …`. Leave nothing unsaved. orch pushes and opens the PR.
