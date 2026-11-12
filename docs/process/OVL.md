# OVL: Overload and absence

> Area: overload. Written only by this phase (see [README](README.md)).

## Data model

What OVL-G1 puts in place; the behaviour (the clock's facts, the server actions, the screens, the notice texts) comes with OVL-C1, A1, U1 and N1. Decisions are cited by their number in the plan (D15, D16, ...). Roles, not people (D3): every count is per desk (a role), and nothing here ranks or compares people. No migration (D7).

### The six events

All six are declared in `features/cases/events/overload.ts`. The first three are app types (`OVERLOAD_EVENT_TYPES`): OVL's own server actions append them, and the generic append path refuses them (D15). The other three are internal: the clock and the directory write them.

| Event | Target | Payload | Written by |
|---|---|---|---|
| `person.away` | none | `userId`, `from`, `to`, `awayId`, `setBy` | a server action; `awayId` is the event's own id and `setBy` the viewer's user id, both set by the server; no reason, no text |
| `person.back` | none | `userId`, `awayId` | a server action; ends that span today |
| `desk.covered` | the role id | `roleId`, `seatId` | the seat above appoints a cover seat for the desk (D28) |
| `desk.overloaded` | the role id | `roleId`, `level` (20 or 30), `perHolder`, `holders` | the clock (D26) |
| `desk.cleared` | the role id | `roleId` | the clock; also ends the cover |
| `org.seat.vacant` | the seat id | `seatId`, `roleId`, `userId` (the leaver) | the directory, when a holder leaves (D30) |

`from` and `to` are working-day numbers of the State (the same numbers as a case's due day); `from <= to`. `to` is also the core payload's `to` (a hand-over's label, a string), so it is not declared in `OverloadAreaPayload`; the reducer reads it as an unknown value and accepts only a whole number, and a writer builds the payload with a cast.

`case.handed` gains three `why` values, written only by OVL: `away` and `overflow` by the clock (actor `system:clock`), and `takeback` by the take-back action with the actor `system:cover` and the person's user id in the new payload field `takenBy`. They are not a person's pass, so a case's `passes` does not count them; the seat above's bulk pass (D28) is a person's pass. `why` is a free string in the reducer, so the case reducer has no branch for the new values.

### OverloadState

`features/overload/types.ts`, reduced by `features/overload/reduce.ts` (`emptyOverload`, `applyOverload`, `overloadOf`):

- `away: AwaySpan[]`, each `{ awayId, userId, from, to, setBy, endedDay }`. A second span of the same person that overlaps one still open replaces it. `person.back` sets `endedDay` on the span with that `awayId` and that `userId`; a pair that does not match changes nothing. A span whose last day is before its first, or whose days are not whole numbers, is no span.
- `desks: DeskEpisode[]`, each `{ roleId, since, level, coverSeatId, clearedDay }`. `desk.overloaded` opens an episode for the role or raises the open one to 30 (never lowers it); `desk.covered` sets the cover seat of the open episode (none open: nothing); `desk.cleared` closes it. `org.seat.vacant` changes no state.

The only change to the case reducer is one hook: `State` gains the optional `overload` (absent means empty, read it through `overloadOf(state)`, so State literals in tests stay valid), `reduce` starts it with `emptyOverload()` and calls `applyOverload` for the six types before its switch, so they reach no other branch. A log written before OVL reduces to the same State apart from the empty field (`tests/unit/ovl/replay.test.ts`, golden committed before the change).

### What a work item is (D18)

`features/overload/load.ts` `deskWork(state, today)` lists every open work item once, `{ key, roleId, late }`, deduplicated by key:

| Item | Counted when | Key | Desk |
|---|---|---|---|
| decide | a case on a desk, open or in a discussion; a case that is asked waits for the raiser and is not counted | `case:<id>` | the case's role |
| approve | only the current step of the case's active approval run, not the later steps | `approval:<runId>:<stepId>` | the role of the seat a late hand-over named, else the step's role, for a council step its secretary's role |
| confirm | a project result that waits for a second person | `confirm:<projectId>` | the route's deputy role, or the role of the seat the clock passed it up to |

An item is late when its due day is before today. `deskLoads(state, today)` gives one `DeskLoad` per role with at least one item or one open episode: `open`, `late`, `pinned` (the items whose case is pinned), `holders` (distinct user ids on a seat of the role who are not away today, so a person on two seats counts once), `perHolder = ceil(open / max(1, holders))` and `level`. The level is `overflow` from `overload_at.overflow` per holder, or while the open episode is at 30 and the desk is still at `up`; `up` from `overload_at.up`; `triage` from `overload_at.triage` or from `overload_at.late` late items; else `normal`. Overflow ends when the desk drops under `up`. A result carries no user id and no name.

### Away, cover and overflow (D19, D24)

`features/overload/away.ts`: `awayOn` (a span with `from <= day <= to` that no `person.back` ended on or before that day), `awayCoverSeat` (another present holder of the seat's role, then the first present seat of the route's deputy role, then the seat above, one hop, then nobody), `overflowSeat` (the open episode's cover seat while someone present sits there, else the first present seat of the route's deputy role when that desk is not at overflow itself; never a seat of the source role) and `takeBackable` (the open cases the clock handed away from the person's seat during an absence that is over, with no event by a person since). A seat is present when it has a user who is not away today. All of them return seat ids or cases, never a name. A comment is not part of a case's history, so it does not count as a touch.

### The pinned case (D12, D20)

`features/overload/pinned.ts`: `isPinned(c, state, today)` is the one predicate. A case is pinned when it is open or in a discussion, its last `case.handed` is the clock's with `why: "escalation"`, at least `escalationDays` working days have passed since (the seat above had as long as the deputy) and no person wrote an event on it since; never with escalation switched off. `pinItems(items, input)` sets `pinned` on every inbox item of such a case, so every holder of the desk it now sits on sees it first (`inboxItems` applies it after the de-duplication and before `markDue` and `orderItems`), and `deskLoads` counts it on that desk. No mail: pinning writes no event.

### The rule `overload_at` (D17)

A company rule next to `escalation_days`: `{ triage, up, overflow, late }`, whole numbers, `1 <= triage < up < overflow <= 200` and `1 <= late <= 50`; anything else is ignored. `CompanyRules.overloadAt` and `LoopRules.overloadAt` are optional and read through `overloadAtOf(rules)`, default `{ triage: 10, up: 20, overflow: 30, late: 3 }`; `companySeed` carries it into `loop`. There is no Settings field in OVL: a pilot tunes it through support.

### Lists the registries compose

The clock kinds are `away`, `overflow`, `overloaded` and `cleared` (`features/clock/kinds/overload.ts`; the Dues are OVL-C1's). The notices (`features/notify/areas/overload.ts`): loop types `person.away`, `desk.overloaded`, `desk.covered`, `desk.cleared` and `org.seat.vacant`; the templates `loop.<type>` of the first four join the `loop` group and follow `loop.case.decided`, so no new group, profile switch or preference value exists; `loop.org.seat.vacant` is a duty template (it cannot be switched off); the audiences and texts are OVL-N1's. The strings are the namespace `overload`, English and German.

## Loop

## Clock

## Notices

## Release note
