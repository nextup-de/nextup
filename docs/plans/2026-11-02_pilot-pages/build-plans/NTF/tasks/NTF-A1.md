---
id: NTF-A1
title: Planner, gate and public events decide what message each event becomes
wp: A
needs: [ NTF-G1, CLK-Z1, AIP-Z1 ]
host: any
owns:
  - apps/app/src/features/notify/plan.ts
  - apps/app/src/features/notify/gate.ts
  - apps/app/src/features/notify/public-events.ts
  - apps/app/src/features/notify/templates.ts
  - apps/app/src/i18n/messages/mail.ts
  - apps/app/tests/unit/ntf/plan.test.ts
  - apps/app/tests/unit/ntf/public-events.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D3, D7, D8, D10, D15 ]
proofs:
  - id: B1
    says: planNotices turns a raise, a loop event and each clock.due kind into rows
      for exactly the right users with stable keys, never for the actor, and
      gateOf skips sandbox, switched-off kinds and opted-out users
    run: npm test -w @nextup/app -- tests/unit/ntf/plan.test.ts -t 'NTF planner'
  - id: B2
    says: toPublicEvents maps the internal events to v1 public events with ids only,
      and every result parses with PublicEvent
    run: npm test -w @nextup/app -- tests/unit/ntf/public-events.test.ts -t 'NTF
      public events'
status: ready
---

Plan NTF (sub-plan of PILOT): the pure half. Read first: D7, D8, D10 of the plan, `docs/adr/0005-event-versioning.md`,
`packages/contracts/src/public/{events,webhook}.ts` and `connectors/notify-channel.ts`,
`apps/app/src/features/cases/notice.ts` (`composeNoticeMail`, `noticeKey`), `apps/app/src/features/loop/notice.ts`
(`loopMails`), `apps/app/src/features/auth/identity.ts`, the `clock.due` payload in
`apps/app/src/features/cases/events.ts`.

## What

- `apps/app/src/features/notify/gate.ts` (new): `gateOf` exactly as D8 (returns `{ send: true } | { send: false;
  reason: "sandbox" | "switched off" | "opted out" }`).
- `apps/app/src/features/notify/templates.ts` (new): subject, text and link for `reminder.deadline`,
  `reminder.checkin`, `reminder.start`, `reminder.measure` and `digest`, in the recipient's locale through `t()`; the
  `raised` and `loop.*` texts come from `composeNoticeMail` and `loopMails` unchanged.
- `apps/app/src/features/notify/plan.ts` (new): `planNotices(ev, ctx): OutboxDraft[]` exactly as D7, each draft
  already gated (a skipped draft has status `skipped` and its reason in lastError).
- `apps/app/src/features/notify/public-events.ts` (new): `toPublicEvents` exactly as D10.
- `apps/app/src/i18n/messages/mail.ts`: the new texts in English and German.
- Tests:
  - `apps/app/tests/unit/ntf/plan.test.ts`, `describe("NTF planner", …)` on `LOCAL_SEED` with two holders of route
    r2's owner role: a raise on r2 gives one `raised` row per holder with keys `notify:<id>` and
    `notify:<id>:<userId>`; the raiser gets none; a `clock.due` deadline gives `reminder.deadline` to the deputy
    seat's users and the current seat's users, key `rem:<eventId>:<userId>`, the same draft twice for the same event
    has the same key; checkin, start and measure go to the case seat's users and the project lead; with stage sandbox
    every draft is `skipped` "sandbox"; with notifications false the reminders are skipped and the raise is not; a
    `digest` or `*` opt-out skips only that user; a user without email gets no mail row.
  - `apps/app/tests/unit/ntf/public-events.test.ts`, `describe("NTF public events", …)`: a raise, a hand-over, an
    answer, a decision that opens a project (two public events), project done and stopped map with typeVersion 1;
    `case.commented` maps to nothing; each result passes `PublicEvent.parse`; `JSON.stringify` of every result
    contains no label of the seed (names, handles).

## Not

- No database, no channel, no loop (NTF-B1, NTF-C1). No digest content (NTF-D1). No change to
  features/cases/notice.ts or features/loop/notice.ts (reused as they are).

## Done when

Both proofs are green and lint, typecheck, test, build stay green.

Commit everything; an unfinished state as `wip(ntf-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
