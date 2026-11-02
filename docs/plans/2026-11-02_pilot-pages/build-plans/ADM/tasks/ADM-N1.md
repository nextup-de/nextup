---
id: ADM-N1
title: The company's notifications page shows the switch, opt-outs and failed messages
wp: N
needs: [ ADM-G1, ADM-H1, NTF-B1 ]
host: any
owns:
  - apps/app/src/app/[company]/(app)/settings/notifications/**
  - apps/app/src/components/settings/NotificationsSettings.tsx
  - apps/app/src/server/actions/settings/notifications.ts
  - apps/app/src/lib/db/outbox-retry.ts
  - apps/app/src/features/settings/sections.ts
  - apps/app/src/i18n/messages/settingsNotifications.ts
  - apps/app/src/i18n/de.ts
  - apps/app/src/i18n/en.ts
  - apps/app/tests/unit/adm/notifications.test.ts
  - apps/app/tests/db/adm-notifications.test.ts
risk: normal
profile: orch
budget: { minutes: 75, window_pct: 12 }
uses: [ D1, D3, D6, D7, D15, D18, D21 ]
proofs:
  - id: B1
    says: the opt-out counts show "fewer than 5" below five people and the failed
      list carries no message body and no person's address
    run: npm test -w @nextup/app -- tests/unit/adm/notifications.test.ts -t 'ADM notifications view'
  - id: B2
    says: the switch saves for the admin's company only, Retry sets one failed row of
      that company back to pending, and a leader's call changes nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash
      ops/test-db.sh tests/db/adm-notifications.test.ts -t 'ADM notifications settings'
status: open
---

Plan ADM (sub-plan of PILOT): the notifications page (D18). Read first: NTF's `PLAN.md` (D5 outbox and
`NotifyPreference`, D8 gating, D9 retries) and `listOutbox` (NTF-B1), `CompanyConfig.notifications`,
`features/settings/sections.ts` (ADM-G1), and the Nextup page spec
`docs/plans/2026-11-02_pilot-pages/06-notifications-and-teams.md` § Notifications.

## What

- `features/settings/sections.ts`: section `notifications` after `connectors`; its label in
  `settingsNotifications.ts` (registered in `de.ts`, `en.ts`).
- `settings/notifications` page with `NotificationsSettings.tsx`: the company switch, the stage line (a sandbox
  sends nothing), opt-out counts per message kind (pure helper, "fewer than 5" below five), the failed rows of the
  last 14 days from `listOutbox(companyId, { status: "failed" })` with Retry per row. Test ids
  `settings-notifications-<thing>`.
- `lib/db/outbox-retry.ts`: `retryOutboxRow(companyId, id)` sets one failed row of that company to `pending`,
  `attempt` 0, `nextAt` now; nothing else.
- `server/actions/settings/notifications.ts`: save the switch and retry, each after `companyAdminOf`.

## Not

- No webhook subscription editor (API). No change to NTF's files or the outbox schema.

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(adm-n1): …`. Leave nothing unsaved. orch pushes and opens the PR.
