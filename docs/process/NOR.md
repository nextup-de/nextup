# NOR: The reasoned no

> Area: case. Written only by this phase (see [README](README.md)).

## Data model

NOR adds four `case.*` events and new fields on two existing ones. All are declared in
`apps/app/src/features/cases/events/case.ts`; an old log has none of the new fields and replays as before.

**New events** (all app events, so a person or the clock may append them subject to the rules below):

| Event | Payload | Written by |
|---|---|---|
| `case.reopened` | `{ why: 'revisit' \| 'stopped', dueDay?, toRoleHolderId? }` | `revisit`: only the clock, on the revisit day of a no (D12). `stopped`: RES, when a stopped project's idea goes back (D16). |
| `case.appealed` | `{ text, toRoleHolderId? }` | The raiser, once per case, within `appeal_days` of the latest no; the server sets the seat (D18). |
| `case.appeal.decided` | `{ uphold, reason }` | The desk the second look went to. `uphold: false` reopens the case (reason `appeal`). |
| `case.invite.declined` | `{ why? }` | An invited person: "Not for me" (D14). |

**`case.decided`, a no:** `{ answer: 'no', category, reason, changeIf?, revisitDay?, duplicateOf? }`. `category` is one of
`not-now`, `no-budget`, `no-fit`, `duplicate`, `risk`, `not-feasible` (`features/cases/no.ts`). An old no carries the picked
id in `reason` and the text in `note`; `noCategoryOf` and `noReasonOf` read both shapes.

**`case.handed`, a pass:** `{ to, toRoleHolderId?, why?, back?, up?, routeId?, dueDay?, keepsQuestion? }`. `back` is Not mine
(to the seat the case came from), `up` is Send up (to the seat above), `routeId` moves the case's route, `dueDay` is the new
desk's answer-date floor, `keepsQuestion` leaves an open question open.

**Reduced case** (`ReducedCase`): `decisions` (oldest first; `decided` is the latest live one), `passes`, `notNowInRow`,
`appeal`, `reopens`, `cycleStartDay`, `dueFloor`, and two event-order boundaries, `reopenSeq` and `decidedSeq`: the place in
`history` of the latest reopen and of the latest decision. Events of one day are ordered by that place, never by their day,
so a no, a second look that reopens the case and a new no on one day stay three distinct things (`decisionKey`).

## Loop

## Clock

## Notices

## Release note
