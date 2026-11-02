---
id: VIS-A1
title: One visibility rule as access keys, used by the pages, and the raiser's
  audience by id
wp: A
needs: [ VIS-G1, CLK-Z1 ]
host: any
owns:
  - apps/app/src/features/cases/visibility.ts
  - apps/app/src/features/cases/events.ts
  - apps/app/src/components/dashboard/derive.ts
  - apps/app/src/components/ideas/RaiseMenu.tsx
  - apps/app/src/components/ideas/RaisePublish.tsx
  - apps/app/tests/unit/visibility.test.ts
  - apps/app/tests/unit/vis/rule.test.ts
risk: normal
profile: orch
budget: { minutes: 90, window_pct: 15 }
uses: [ D1, D2, D4, D5, D10, D13 ]
proofs:
  - id: B1
    says: canOpen is true exactly for raiser, desk, invitees, project people, the
      raiser's choice and, without a choice, managers and the raiser's leaders,
      and accessKeys and viewerKeys give the same answer
    run: npm test -w @nextup/app -- tests/unit/vis/rule.test.ts -t 'VIS visibility
      rule'
status: ready
---

Plan VIS (sub-plan of PILOT): the rule. Today the browser decides visibility in `components/dashboard/derive.ts`
(`visibleTo`, `canOpen`) and `features/cases/visibility.ts` only answers the raiser's choice. After this task one pure
rule decides it by ids and can be stored as keys. Read first: D4, D5 and D10 of the plan, `docs/IDENTITY.md`,
`apps/app/src/features/auth/identity.ts`, `apps/app/src/features/cases/visibility.ts`, `selectors.ts` (`onDeskOf`),
`components/dashboard/derive.ts`, the audience picker in `components/ideas/RaiseMenu.tsx` and what `RaisePublish.tsx`
puts into the case.raised payload.

## What

- `apps/app/src/features/cases/visibility.ts`: `type VisCtx = { seats: SeatRow[]; roles: { id: string; orgUnitId:
  string; reportsToId: string | null }[]; projects: ReducedProject[] }`; `canOpen(c, viewer: { me: Me; role: Role;
  unitIds: string[] }, ctx): boolean` exactly as D4; `accessKeys(c, ctx)` and `viewerKeys(me, role, unitIds)` exactly
  as D5; `unitsOf(me, ctx)` (unit ids of the viewer's seats' roles). The header says this file is the only visibility
  rule. The browser builds `ctx.roles` from the seed (`Seed.seats` plus the route and people structure the seed
  already carries by id); if a role's `reportsToId` is not available on the seed, add it to the seed in the smallest
  way and say so in the PR - never by a name lookup.
- `apps/app/src/features/cases/events.ts`: `seenByUserIds?` and `seenByUnitIds?` in EventPayload (D10).
- `apps/app/src/components/dashboard/derive.ts`: `visibleTo` and `canOpen` call the rule (one line each); nothing else
  there decides visibility.
- `RaiseMenu.tsx` / `RaisePublish.tsx`: the audience picker keeps showing people and departments by label and sends
  `seenByUserIds` (seats with a user) and `seenByUnitIds` next to `seenBy`.
- `tests/unit/visibility.test.ts`: updated to the new rule only.
- `apps/app/tests/unit/vis/rule.test.ts`, `describe("VIS visibility rule", …)` on `LOCAL_SEED`: the raiser opens their
  private case, another member does not, its desk does, a manager does not for private and does with no choice; a
  custom case opens for a user in `seenByUserIds` and for a user of a unit in `seenByUnitIds`, and not for someone
  who only shares a label; a leader whose role the raiser's seat reports to opens the raiser's case with no choice,
  another leader does not; an invitee and a project member open it; for every one of these `accessKeys ∩ viewerKeys
  ≠ ∅` equals `canOpen`.

## Not

- No projection code (VIS-B1), no change to what the layout loads (VIS-C1).
- No new comparison of display names (D2).

## Done when

The proof is green and lint, typecheck, test, build stay green; the demo e2e suite still passes.

Commit everything; an unfinished state as `wip(vis-a1): …`. Leave nothing unsaved. orch pushes and opens the PR.
