---
id: IDN-B1
title: Projects on ids - lead, team, authors, step owners, permissions, pages
  and loop mails
wp: B
needs: [ IDN-G1, IDN-D1 ]
host: any
owns:
  - apps/app/src/features/projects/reduce.ts
  - apps/app/src/features/projects/permissions.ts
  - apps/app/src/features/projects/permissions.test.ts
  - apps/app/src/features/projects/selectors.ts
  - apps/app/src/features/projects/views.ts
  - apps/app/src/features/projects/views.test.ts
  - apps/app/src/components/projects/**
  - apps/app/src/features/loop/notice.ts
  - apps/app/src/server/loop-notice.ts
  - apps/app/src/i18n/messages/projects.ts
  - apps/app/tests/unit/projects.test.ts
  - apps/app/tests/unit/project-board.test.ts
  - apps/app/tests/unit/project-views.test.ts
  - apps/app/tests/unit/loop-notice.test.ts
  - apps/app/tests/unit/idn/projects-ids.test.ts
  - apps/app/src/features/projects/types.ts
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/tests/unit/i18n/strings-cases.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D3, D4, D5, D6, D8, D15, D18 ]
proofs:
  - id: B1
    says: a project's lead, members, authors and step owners are user ids from the
      events, it escalates by the route owner's seat, and mayAppendProject
      decides lead and team rights by user id only
    run: npm test -w @nextup/app -- tests/unit/idn/projects-ids.test.ts -t 'IDN
      projects on ids'
  - id: B2
    says: the loop mails go to the invited users, the lead and the author by user
      id, never to someone who only shares a label, and never to the actor
    run: npm test -w @nextup/app -- tests/unit/idn/projects-ids.test.ts -t 'IDN loop
      mails by id'
status: merged
lane: pc/b
branch: orch/idn-b1
last_failure: "blocked: I need `apps/app/src/features/projects/types.ts` and
  `apps/app/src/components/dashboard/DemoProvider.tsx`, and neither is in my
  Besitz list. I've made no edits, so the tree is clean."
pr: 304
merge: "cdfa286"
---

Plan IDN (sub-plan of PILOT): projects. After this task a project knows its lead, team, authors and step owners by
user id, its rights are decided by those ids, the project pages ask "is this mine" by id, and the discussion and
project mails find their recipients by id. IDN-G1 put `Source.fromUserId` and the seats into the project hooks;
IDN-A1 (running next to this task) passes `fromUserId` from the reducer. Read first: `docs/IDENTITY.md`,
`apps/app/src/features/auth/identity.ts`, `apps/app/src/features/projects/{types,reduce,permissions,selectors,views}.ts`,
`apps/app/src/components/projects/parts.tsx`, `ProjectView.tsx`, `ProjectBoard.tsx`,
`apps/app/src/features/loop/notice.ts`, `apps/app/src/server/loop-notice.ts`, and the tests named in `owns`.

## What

- `apps/app/src/features/projects/reduce.ts`: the project fields of D6. `openOrJoin`: `leadUserId =
  pl.leadUserId ?? ev.actorUserId ?? null`, `authorUserIds` from `source.fromUserId` (none when null);
  project.member adds or removes `pl.userId`; project.handed sets `leadUserId = pl.toUserId ?? null` (the old lead
  joins the team by id); step owners from `pl.ownerUserId` (null clears); seed projects from the optional ids of
  D7. Escalation in `finishProjects` as D8: the route owner's seat's user equal to `leadUserId` → deputy seat and
  role, else owner seat and role (from `seats`). Labels stay.
- `apps/app/src/features/projects/permissions.ts`: `isMe` by `actor.userId` against `leadUserId` and
  `memberUserIds`; project.member requires a `userId` string, project.handed a `toUserId` string (same messages as
  today for a missing one). Managers unchanged.
- `apps/app/src/features/projects/selectors.ts` and `views.ts`: the id functions of D18 next to the old ones, each
  old one with the `@deprecated` line.
- `apps/app/src/components/projects/**`: every "is this me / mine / my move / escalated to me" uses `ctx.me` and
  `ctx.actorUserId` (`parts.tsx` builds the `Actor` from them; `ProjectView.tsx`, `ProjectBoard.tsx` step owner by
  `ownerUserId`); the team and hand-over pickers send `userId` / `toUserId` with the label (the people they offer:
  seats with a user, from `seed.seats`); new strings through `t()` in `i18n/messages/projects.ts`.
- `apps/app/src/features/loop/notice.ts`: `Person` gains `id`; recipients by `invitedUserIds`, `leadUserId`,
  `fromUserId` of the case and the projects' `authorUserIds`; the actor is skipped by `ev.actorUserId`.
  `apps/app/src/server/loop-notice.ts` selects users with `id` and passes `actorUserId` through.
- Existing tests updated to the new rules and nothing else: the five test files in `owns`.
- `apps/app/tests/unit/idn/projects-ids.test.ts`:
  - `describe("IDN projects on ids", …)`: a yes with `leadUserId` opens a project whose `leadUserId` is it and
    `authorUserIds` the raiser's id; project.member with `userId` adds them; project.handed with `toUserId` makes them
    lead and keeps the old lead on the team; a user with the lead's label but another id may not start the project,
    the lead may; past the start date the project escalates to the deputy seat when the lead is the route owner's
    user, else to the owner seat; a step added with `ownerUserId` has it.
  - `describe("IDN loop mails by id", …)`: an invite with `invitedUserIds` mails exactly those users' addresses; a
    person who shares an invitee's name but not the id gets nothing; the actor gets nothing.

## Not

- No case reducer, selector or permission (IDN-A1); no dashboard, shell or `CollaborationView` (IDN-P1, IDN-S1);
  `features/projects/brain.ts` is IDN-S1's. The deprecated functions are not deleted (IDN-S1).
- No `.prisma` file (D3). No new comparison of display names (D2).

## Done when

Both proofs are green and lint, typecheck, test, build stay green; the demo e2e suite `tests/e2e/demo/projects.spec.ts`
still passes.

Commit everything; an unfinished state as `wip(idn-b1): …`. Leave nothing unsaved. orch pushes and opens the PR.
