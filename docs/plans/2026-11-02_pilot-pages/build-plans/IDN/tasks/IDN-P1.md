---
id: IDN-P1
title: Dashboards and case helpers decide who you are by ids, and view-as works
  by seat
wp: P
needs: [ IDN-A1, IDN-B1 ]
host: any
owns:
  - apps/app/src/features/cases/rows.ts
  - apps/app/src/features/cases/discussion.ts
  - apps/app/src/features/cases/thread.ts
  - apps/app/src/features/cases/feed.ts
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/src/components/dashboard/derive.ts
  - apps/app/src/components/dashboard/shared/CaseLoop.tsx
  - apps/app/src/components/dashboard/shared/CaseDetailView.tsx
  - apps/app/src/components/dashboard/shared/ArchiveTabs.tsx
  - apps/app/src/components/dashboard/shared/IdeasView.tsx
  - apps/app/src/components/dashboard/leader/InboxView.tsx
  - apps/app/src/components/dashboard/team/DashboardView.tsx
  - apps/app/src/components/dashboard/team/FeedView.tsx
  - apps/app/src/components/dashboard/team/feedPreview.ts
  - apps/app/src/components/dashboard/team/SentView.tsx
  - apps/app/src/components/shell/LoopSheets.tsx
  - apps/app/src/components/shell/DevPanel.tsx
  - apps/app/src/i18n/messages/dashboard.ts
  - apps/app/src/i18n/messages/shell.ts
  - apps/app/tests/unit/rows.test.ts
  - apps/app/tests/unit/thread.test.ts
  - apps/app/tests/unit/feed.test.ts
  - apps/app/tests/unit/discussion.test.ts
  - apps/app/tests/unit/discussion-ui.test.ts
  - apps/app/tests/unit/idn/pages.test.ts
  - apps/app/tests/e2e/demo/inbox-loop.spec.ts
  - apps/app/src/components/dashboard/team/OverviewChats.tsx
  - apps/app/src/components/dashboard/team/OverviewPhone.tsx
  - apps/app/src/features/search/navbar.ts
  - apps/app/tests/unit/static-demo.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D4, D6, D8, D10, D15, D18 ]
proofs:
  - id: B1
    says: the case rows, the discussion helpers, the thread and the feed mark mine,
      invited and you by user id and seat, never by a label
    run: npm test -w @nextup/app -- tests/unit/idn/pages.test.ts -t 'IDN case
      helpers by id'
  - id: B2
    says: in the local demo the leader's inbox shows the cases of their role, and
      viewing as another leader shows that leader's seat's cases
    run: npm run e2e -w @nextup/app -- tests/e2e/demo/inbox-loop.spec.ts -g 'IDN
      inbox by seat'
    expect: 'IDN inbox by seat[\s\S]*[1-9]\d* passed'
status: running
lane: pc/a
branch: orch/idn-p1
retries: 1
last_failure: "Beweise rot: B2"
---

Plan IDN (sub-plan of PILOT): the dashboards. IDN-A1 and IDN-B1 gave the domain id functions (D18); this task moves
the case helpers and the dashboard pages onto them. Read first: `docs/IDENTITY.md`,
`apps/app/src/features/auth/identity.ts`, `apps/app/src/features/cases/selectors.ts` (the new functions),
`rows.ts`, `discussion.ts`, `thread.ts`, `feed.ts`, `components/dashboard/DemoProvider.tsx` (`me`, `actorUserId`,
`leadAs`, `cosign`, `affect`), `derive.ts`, `components/shell/DevPanel.tsx`, and the tests named in `owns`.

## What

- `apps/app/src/features/cases/rows.ts`: `mine` by `c.fromUserId === me.userId` (never true for null); co-sign rows
  by `userId`; every function that took a viewer `{ name, handle }` to decide "mine" takes `me: Me`.
- `apps/app/src/features/cases/discussion.ts`: `invitedTo(c, me)` by `invitedUserIds`; invite suggestions offer
  seats with a user (`seed.seats`), excluding `me.userId` and the raiser's `fromUserId`, and return `{ userId,
  label }`; the head of the raiser's department from the seats' roles (`reportsTo` of the role), not from a name.
- `apps/app/src/features/cases/thread.ts`: participants by `actorUserId`, the raiser excluded by `fromUserId`.
  `apps/app/src/features/cases/feed.ts`: "you" by user id.
- Components: in every file of `owns` under `components/`, each "is this me / mine / on my desk / did I co-sign /
  am I affected / my turn" uses `ctx.me`, `ctx.actorUserId` and the id functions (`onDeskOf`, `inboxOf`,
  `mineOf`, `cosignedOf`, `actedByMe`, `deskOf`, `clearedByMe`, `affectedOn(…).userId`, `byUserId`) instead of
  `persona.who.name`, `actor` or a label. "You" in a list is by id. A label is still what is shown.
- `DemoProvider.tsx`: `cosign` and `affect` decide "already" by `actorUserId`; the leader's `leadAs` preference
  stores a seat id (an old stored name reads as none) and `me` for it is `meOfSeat(leadAs, seed.seats)`; the
  persona shown for it takes that seat's label. `DevPanel.tsx` "inbox of" lists `deskSeats(state)` and the route
  owners' seats, and sets `leadAs` to a seat id; its count is `inboxOf(state, meOfSeat(id, seats))`.
- `LoopSheets.tsx`: the discussion invite sends `invited` labels with `invitedUserIds`; it keeps the hand-over as it
  is (IDN-S1). New strings through `t()` in `i18n/messages/dashboard.ts` or `shell.ts`.
- Existing tests updated to the new signatures and nothing else: `rows`, `thread`, `feed`, `discussion`,
  `discussion-ui`.
- Tests:
  - `apps/app/tests/unit/idn/pages.test.ts`, `describe("IDN case helpers by id", …)` on `LOCAL_SEED`: a row of a case
    raised by the member persona is `mine` for `meFor(member userId)` and not for a `Me` whose user has the same
    handle label but another id; `invitedTo` is true by `invitedUserIds` only; the invite suggestions never contain
    `me.userId` or the raiser; the thread lists a decider once by id; the feed's "you" follows the user id.
  - `apps/app/tests/e2e/demo/inbox-loop.spec.ts`, a new `test("IDN inbox by seat", …)`: as the leader persona the
    inbox lists the open seed cases of route r1; through the dev panel's "inbox of" the other leader's seat shows
    route r2's cases and not r1's; back to the leader shows r1's again.

## Not

- No hand-over picker, shell bar, profile, search or idea feature (IDN-S1); no deletion of the deprecated selectors
  (IDN-S1). No project pages (IDN-B1 did them).
- No label lookup that only shows org data (D14) - leave those as they are.
- No new comparison of display names (D2).

## Done when

Both proofs are green, lint, typecheck, test, build stay green, and the whole demo e2e suite
(`npm run e2e -w @nextup/app -- tests/e2e/demo`) passes.

Commit everything; an unfinished state as `wip(idn-p1): …`. Leave nothing unsaved. orch pushes and opens the PR.
