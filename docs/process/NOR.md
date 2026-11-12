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

**A no is a reasoned no** (D17). The desk's No sheet asks for a category (`NO_CATEGORIES`), a reason of at least `no_reason_min`
characters (company rule, default 40, at most 2000), optionally what would make it a yes (up to 400), and, for some
categories, a date or a link. The sheet says what is missing on its main button, and the server (`mayDecide`, for the app
and the Teams card alike) refuses the same things: no category, a short reason, a `not-now` without a date, a date on a
category that takes none, a date that is no working day or more than 250 working days ahead, a third not-now in a row on one
case, a `duplicate` without a case or project to link. `wrong department` and `nobody owns this` are no noes: the sheet
sends the desk to Pass. An old no (no category) is read by `noCategoryOf` and `noReasonOf` and keeps its old labels.

- **Not now** (and, if the desk gives one, **no budget**) carries `revisitDay`. On that day the case comes back (see Clock).
  The reducer opens it again on the route owner's seat with a new answer date; the old decision stays in `decisions`, and a
  new decision is allowed in the new cycle.
- **Already solved or in work** (`duplicate`) links the case or project that covers it; the raiser sees the link.

**The second look** (D18). Within `appeal_days` (default 10) of the latest no the raiser may ask once for a second look
(`case.appealed`, 20 to 1000 characters). The server sends it to the first occupied seat of the route's deputy role, unless the
person who said no holds that role or nobody does; then to the seat above that role. The holders of that role, a manager and
the seat a later escalation names may answer; the person who said no never may, by user id, whatever role they hold now. The
answer (`case.appeal.decided`, a reason of at least `no_reason_min`) keeps the no for good, or reopens the case on the route
owner's desk with a new answer date. A decision after that reopen is a new one; the second look is used up.

**Passes** (D13). Every pass by a person needs a reason of at least 8 characters, on the app and on the Teams card.
*Not mine* sends the case back to the seat it came from, once per received pass, only for the holder of the seat the last
pass went to. A pass can move the route (`routeId`), so later deadlines go to the new route's deputy, and gives the new desk at
least 2 working days. From the third pass on (`passes` of 2 or more), a non-manager can only **Send up**: the server sets the seat
above the desk's role and refuses when nobody is above ("ask a manager"). Managers pass freely.

**RES** can send a stopped project's idea back: `case.reopened { why: 'stopped' }` is declared, reduced and allowed (to the
stopper and managers while the case's latest decision is still the yes of that project). NOR builds no UI for it.

## Clock

All in `features/clock/kinds/case.ts` and `server/scheduler/writers/case.ts`; workdays mode only, as everything on the clock.

| Kind | What | Written as |
|---|---|---|
| `revisit` | A not-now (or no budget) whose `revisitDay` has come and that was not reopened since that decision. | The event itself: `case.reopened { why: 'revisit', dueDay: today + promise days, toRoleHolderId }` as `system:clock`; the seat is the route owner's first occupied seat, else the company's fallback desk. Key `clk:revisit:<case>:<decision's place in the history>:<cycle>`. |
| `appeal` | The second look is due `promise` working days after it was asked: a reminder to the desk it went to. `escalation_days` later, `check: 2`, to the seat above that desk (skipping the roles the person who said no holds). | A `clock.due` fact each, once. |
| `view` | An invitee has neither commented in the round nor declined: one fact on the working day before the check-in day. | A `clock.due` fact per check-in day. |
| `deadline` for a check-in | No check-in came `escalation_days` after the check-in day: the case is handled like a late answer. | The existing path: the `deadline` fact, the deputy's hand-over when `deadline_handover` is on, the `escalation` fact and hand-over to the seat above. |

**Cycles** (D24). A reopen starts a new cycle. The once-per-case rules (the deadline fact, the deputy's hand-over, the
escalation and its hand-over) look only at the events after the case's last reopen, by their place in the history, so a fact
written on the day of the reopen does not stand for the new cycle. Their keys get `:<cycle>` appended from cycle 1 on; cycle 0
keeps today's keys, so a live company writes nothing twice. The question's return day is the company's `question_days`
(default 5, reminder at 3 working days or one before the return when that is earlier).

## Notices

| Template | When | Who gets it |
|---|---|---|
| `loop.case.decided` | A no | The raiser: the reason, what would make it a yes, the date it comes back, the link or the second look. |
| `loop.case.reopened` | The case came back (revisit, second look not upheld, a stopped project's idea) | The desk it is on, the raiser; on the fallback desk also the managers. |
| `loop.case.appealed` | The raiser asked for a second look | The holders of the roles that may answer it, never the person who said no. |
| `loop.case.appeal.decided` | The second look was answered | Kept: the raiser. Not upheld: as `loop.case.reopened`. |
| `loop.case.handed` | A pass, Not mine, Send up | As before: the new desk, the raiser. |
| `reminder.appeal` | The second look is due; `check: 2` the seat above | The desk, then the seat above, never the person who said no. A duty notice (it can move between mail and Teams, not be switched off). |
| `reminder.view` | The day before a check-in | The invitees with no view yet. |

The new loop templates follow `loop.case.decided` and `reminder.appeal` follows `reminder.deadline` (a person who switched
those off stays off); `reminder.view` follows `reminder.checkin`. The company's notice channels decide mail or Teams per
group as for every notice; a sandbox company writes every outside row as `skipped`, and the in-app copy as `sent`.

## Release note: NOR

For the support owner's release mail (Q10.1): on the first clock run after NOR, open discussions on live companies whose
check-in is more than `escalation_days` late are handled like a late answer (deputy hand-over, then the seat above), and
nothing more can be added to a discussion past its last day; passes written from then on move the route; noes need a
category and a reason of 40 or more characters.

Acceptance: `apps/app/tests/e2e/db/nor.spec.ts` (one story on a sandbox company with the AI, Teams, Jira and Microsoft 365
off).
