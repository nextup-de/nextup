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

Roles, not people (D3): every count is per desk (a role), shown only to the desk's holders, the holders of the seat above it and the company's admins (app role manager); no list, card or mail sorts or compares people by load, speed or absence.

- **Away (D19, D31).** A person sets their own absence, or the holder of the seat directly above them, or a company admin, sets it for them (Profile → Set someone away). An absence is a span of working days with no reason and no free text; it is at most 120 working days; `person.back` ends it today. While it runs the person is not counted as a holder of their desks, and the clock hands the cases on their seat to a cover (below). The person is told who set it.
- **Take back (D19).** After the absence, the cases the clock handed away from the person's seat that nobody has touched since come back with one click (`system:cover`, `why: "takeback"`, no pass of anybody).
- **The four levels (D18).** A desk's load is its open work divided by the present holders, rounded up: *normal*; *triage* from 10 per holder or 3 late items (the holders triage in bulk); *up* from 20 (the seat above is told and may share the load); *overflow* from 30 (new cases overflow to the deputy desk, and the raiser's sent line says so). Overflow ends when the desk is under 20. The numbers are the company rule `overload_at`.
- **Bulk for holders (D21).** On the inbox a holder whose desk is at triage or above sees the triage banner (with the number of late items). Any holder may press **Select**, tick several cases to decide of one desk and **Pass them on** (one target desk, one why for all) or **Ask the authors** (one question for all). Each case is sent one by one through the path a single pass or ask takes (`appendEventAction`; the demo's `act.pass` and `act.ask`), so every case keeps its own rights, NOR's pass limit and why rule. The bar says how many went and lists each case that was refused with its error. There is **no bulk no** (each needs its reason) and no bulk discussion. No new event exists for bulk.
- **The seat above shares the load (D28).** For a desk at *up* or *overflow*, the holder of the seat directly above it and the company's admins see on the Dashboard (Load per desk) three actions: add a holder (Settings → Org, at that role), **appoint a cover** (a present seat of another role, by its label: `desk.covered`) and **pass cases on in bulk** (`passForDesk`: one `case.handed` per case under their own name, each checked by `mayAppend` with the seat above treated as manager for that one hand-over). Appointing a cover never sets anybody away. A holder of the desk itself, at any load, has none of these. `/dashboard` stays for managers only (D36), so the seat above who is no manager finds the same card at the top of their **Inbox**, with only the desks they may share the load of (`mayShareLoad`); nobody without that right sees it there.
- **Overflow (D24).** While a desk is at overflow, or at up with an appointed cover, every case raised since the episode began that sits on that desk and was never handed by a person goes to the cover, else the first present seat of the route's deputy role, once (one hop: no seat above, no third level). The case stays and is counted when nobody is present.
- **Pinned (D12, D20).** A case the clock handed up on escalation and nobody has acted on for `escalation_days` is pinned: it sits first on the inbox of every holder of the desk it now sits on ("Left alone by the seat above: it stays here until someone acts on it") and is counted on that desk. There is no third level and no more mail.
- **Who sees what (D3).** A holder sees their own desk; the seat above sees the desks below it; an admin sees every desk. A member who is none of these sees no desk row and no count. A row holds a desk's title and its numbers, never a user id or a name.

In the demo (D8) the clock does not run and there is no server: the away card, Take back, Appoint a cover and the seat above's Pass in bulk are hidden. The holders' triage banner, bulk pass and ask, and the Dashboard's desk rows work, because they use the existing acts and the pure `deskLoads`.

## Clock

The clock's four kinds are `away`, `overflow`, `overloaded` and `cleared` (D26). The scheduler computes **every Due of a run from one reduced snapshot** and writes them in order (D29):

- one snapshot per run, with no refresh in between: loads are counted on the snapshot, so a desk that crosses 30 writes its `desk.overloaded` and starts overflowing in the same run (since = today), and its counts drop by the cases handed only on the next run (one run of lag, accepted);
- **one hand-over per case and run**: a case the case area hands over in the same run (a deadline, escalation or vacant hand-over) gets no OVL hand-over, the case area first; within OVL, away comes before overflow for the same case;
- **one hop**: a hand-over goes to the cover or deputy seat, never on from there in the same run;
- `away` hands the open cases on a seat whose person is away to the seat `awayCoverSeat` gives (idemKey `ovl:away:<caseId>:<awayId>`); `overflow` hands the cases of D24 (`ovl:overflow:<caseId>:<since>`); `overloaded` writes `desk.overloaded` with the load numbers when a desk reaches up or overflow with no open episode at that level; `cleared` writes `desk.cleared` when a desk with an open episode is under up. A hand-over to a seat that is gone is skipped.
- the clock's `away` and `overflow` hand-overs send no case notice of their own, as the deadline hand-over today.

## Notices

All notices are in the existing opt-out group `loop` (the templates `loop.person.away`, `loop.desk.overloaded`, `loop.desk.covered` and `loop.desk.cleared` follow `loop.case.decided`), so no new group, profile switch or preference value exists (D22):

- `person.away` set by someone else tells the person; it also tells the holders of every seat `awayCoverSeat` gives for the seats the person holds alone (who covers, from, to; never why);
- `desk.overloaded` at 20 tells the holders of the seat above; at 30 it tells the seat above and the holders of the deputy seat that new cases now come to them;
- `desk.covered` tells the holders of the cover seat; `desk.cleared` tells the same people once the desk is over it;
- `org.seat.vacant` (a holder left, D30) tells the company's admins at once and is a **duty** template: it cannot be switched off.

Pinning sends no mail.

## Release note: OVL

> **Overload and absence (OVL).** On the first clock run after this release, a live company's desk that has **more than 20 open items per holder** tells the **seat above it**, and a desk over **30** overflows new cases to its deputy desk, with the raiser's sent line saying who answers. The seat above may **pass that desk's cases on and appoint a cover** while it is over 20; nobody is ranked, and counts are per desk, never per person. **Away spans hold no reason**: a person, the seat above them or an admin sets only the days. The floor now **accepts a raise to a vacant desk**: it waits there, and the raiser's line says so. The limits are the company rule `overload_at`; a pilot tunes them through support.
