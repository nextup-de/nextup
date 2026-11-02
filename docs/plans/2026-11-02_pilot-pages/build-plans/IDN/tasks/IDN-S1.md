---
id: IDN-S1
title: Hand-over by seat, shell, profile and search on ids; the label selectors
  are gone
wp: S
needs: [ IDN-P1 ]
host: any
owns:
  - apps/app/src/components/dashboard/DemoProvider.tsx
  - apps/app/src/components/dashboard/shared/CollaborationView.tsx
  - apps/app/src/components/shell/InputSheet.tsx
  - apps/app/src/components/shell/LoopSheets.tsx
  - apps/app/src/components/shell/SimpleShell.tsx
  - apps/app/src/components/shell/DemoControls.tsx
  - apps/app/src/components/profile/ProfileView.tsx
  - apps/app/src/features/search/navbar.ts
  - apps/app/src/features/ideas/company-read.ts
  - apps/app/src/features/ideas/demo-loop.ts
  - apps/app/src/features/projects/brain.ts
  - apps/app/src/features/cases/selectors.ts
  - apps/app/src/features/projects/selectors.ts
  - apps/app/src/features/projects/views.ts
  - apps/app/src/i18n/messages/shell.ts
  - apps/app/tests/unit/search.test.ts
  - apps/app/tests/unit/demo-loop.test.ts
  - apps/app/tests/unit/ideas-company-read.test.ts
  - apps/app/tests/unit/projects-brain.test.ts
  - apps/app/tests/unit/idn/no-names.test.ts
  - apps/app/tests/unit/idn/handover.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D4, D5, D8, D13, D14, D15, D18 ]
proofs:
  - id: B1
    says: no source file under features/cases or features/projects compares a
      person's label, and the deprecated label selectors are gone
    run: npm test -w @nextup/app -- tests/unit/idn/no-names.test.ts -t 'IDN no
      display-name identity'
  - id: B2
    says: the hand-over picker offers seats with their labels and a hand-over sends
      toRoleHolderId, and the search marks your move by the desk rule
    run: npm test -w @nextup/app -- tests/unit/idn/handover.test.ts -t 'IDN
      hand-over by seat'
status: ready
---

Plan IDN (sub-plan of PILOT): the rest of the pages and the clean-up. After this task no page and no file of
`features/cases` or `features/projects` decides who someone is by a label, and the deprecated label functions of
D18 are deleted. Read first: `docs/IDENTITY.md`, `apps/app/src/features/auth/identity.ts`,
`apps/app/src/features/cases/selectors.ts`, `apps/app/src/features/projects/selectors.ts` and `views.ts` (the
deprecated functions and their id replacements), `components/dashboard/DemoProvider.tsx` (`hand`),
`components/shell/InputSheet.tsx`, and the files in `owns`.

## What

- Hand-over: `DemoProvider.tsx` `hand(id, seatId, why)` sends `{ to: <seat label>, toRoleHolderId: seatId, why }`
  (D5, D13); `components/shell/InputSheet.tsx` and `LoopSheets.tsx` offer seats (`seed.seats` and the route's
  `ownerSeatId` / `deputySeatId`), excluding the seats of `me`, with today's sub-lines, and pass the seat id.
- `SimpleShell.tsx` (decided count by `byUserId`), `DemoControls.tsx`, `ProfileView.tsx` ("own" profile and "my
  cases" by user id), `CollaborationView.tsx` (project lead and team, "mine", by the id functions of IDN-B1),
  `features/search/navbar.ts` ("your move" by `onDeskOf`, "you" by user id),
  `features/ideas/company-read.ts` (a desk's cases by `assigneeSeatId`), `features/ideas/demo-loop.ts`,
  `features/projects/brain.ts` (the author of a comment by `byUserId` against the case's `fromUserId`): move to ids.
  Label lookups that only show org data stay (D14).
- Delete the deprecated functions of D18 from `features/cases/selectors.ts`, `features/projects/selectors.ts` and
  `features/projects/views.ts`; no file under `apps/app/src` imports them any more.
- Existing tests updated to the new signatures and nothing else: the four test files in `owns`.
- Tests:
  - `apps/app/tests/unit/idn/no-names.test.ts`, `describe("IDN no display-name identity", …)`: reads every `.ts`
    file under `apps/app/src/features/cases/` and `apps/app/src/features/projects/` (not `*.test.ts`) and fails on
    any line that compares (`===`, `!==`, `.includes(`, `.indexOf(`, `.some(`/`.find(` with `===`) one of the person
    labels `.name`, `.actor`, `.assignee`, `.from`, `.lead`, `.by`, `.to`, `.deputy`, `.handle`, `.owner.name`,
    `.members`, `.authors`, `.invited`, `.team`, or the bare identifiers `name`, `actor`, `who`, `handle`, `lead`.
    Exceptions are an explicit list in the test of `{ file, line text, reason }` for comparisons that are not about
    a person (for example a problem's `owner !== "trial"` status, the `"—"` placeholder) - each one written out, no
    patterns. `features/cases/visibility.ts` is the one excepted file (D14, VIS). It also asserts that
    `selectors.ts` exports none of `onDesk`, `inboxFor`, `mineFor`, `cosignedBy`, `actedBy`, `deskFor`, `clearedBy`,
    `deskHolders`.
  - `apps/app/tests/unit/idn/handover.test.ts`, `describe("IDN hand-over by seat", …)` on `LOCAL_SEED`: the picker's
    candidates (export the pure candidate builder from `InputSheet.tsx` or a helper next to it that this task owns)
    for the r1 owner are seats, include the deputy's seat with the deputy sub-line and exclude the leader's own
    seats; the event a hand-over sends carries `toRoleHolderId` and the seat's label as `to`; the navbar marks a
    case as your move for a second holder of the owner role.

## Not

- No reducer, permission or project-domain logic change (IDN-A1, IDN-B1). No dashboard view IDN-P1 owns beyond
  `DemoProvider.tsx` and `LoopSheets.tsx`.
- No label lookups of D14. No `.prisma` file (D3). No new comparison of display names (D2).

## Done when

Both proofs are green, lint, typecheck, test, build stay green, and the whole demo e2e suite
(`npm run e2e -w @nextup/app -- tests/e2e/demo`) passes.

Commit everything; an unfinished state as `wip(idn-s1): …`. Leave nothing unsaved. orch pushes and opens the PR.
