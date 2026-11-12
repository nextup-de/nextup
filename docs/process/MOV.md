# MOV: A project that keeps moving

> Area: project. Written only by this phase (see [README](README.md)).

## Data model

No Prisma change: the new event types are strings and the company values are `CompanyRule` rows (JSON).

### Events

All are `project.*` events with the project id as target, listed in `features/cases/events/project.ts`
(`PROJECT_EVENT_TYPES`), and loop templates that follow `loop.project.member` (`features/notify/areas/project.ts`).

| Type | Payload | Who writes it |
|---|---|---|
| `project.doneby.moved` | `{ doneBy, why }` | the lead once, then the sponsor, a holder of a standing stalled escalation's role, or a manager |
| `project.paused` | `{ why, untilDay }` | the lead or a manager; `untilDay` at most `PAUSE_MAX_DAYS` (20) working days ahead |
| `project.resumed` | `{}` | the lead, the sponsor or a manager |
| `project.howwework` | `{ checkInWeekday, note? }` | the lead or a manager; weekday 1-5, note up to 400 characters |
| `project.update` | `{ text, week }` | the lead; `week` is the check-in day number the update is for |
| `project.lead.vacated` | `{ userId }` | `system:directory` only; every client append is refused |
| `project.lead.changed` | `{ to, toUserId, why? }` | the sponsor, the desk that said yes, the decider or a manager, while the project has no lead |

### Payload fields

- `doneBy` (also from `project.goal`), `untilDay`, `checkInWeekday`, `week`: working-day numbers or weekdays as above.
- `unassign?: boolean` on `project.member` with `on: false`: the reducer also clears owner and ownerUserId of that
  user's open steps and drops them as sponsor and follower. Without it (every old log) `project.member` off keeps its
  old effect.
- `originEventId?: string` on the `clock.due` facts of a project (`Due.originEventId`): the event the occurrence belongs
  to (the block or vacancy cycle), so a new cycle is a new fact. It travels in the payload next to `stepId`.

### Reduced project

`ReducedProject` gains `doneBy`, `doneByMoves`, `pausedUntil`, `pauseWhy`, `lastActivityDay`, `checkInWeekday`,
`howWeWorkNote`, `leadVacatedDay` and `latestUpdate`; a project nobody touched with the new events has the empty values
(`null`, `[]`, `""`). `ProjectEscalation.what` gains `"stalled"` and `toUserId` (the sponsor).

### Company values

| Key | Value | Written by | Read into |
|---|---|---|---|
| `blocked_days` | `{ days }`, whole number 1-10, default 3 | Settings → Rules (`COMPANY_RULE_KEYS`) | `LoopRules.blockedDays` |
| `mov_since_day` | `{ day }`, a working-day number | `ensureMovSinceDay(companyId, day)`, once | `LoopRules.movSinceDay` (no row = 0 = no limit) |

`mov_since_day` is outside `COMPANY_RULE_KEYS` on purpose: saving the company rules never deletes it.
`ensureMovSinceDay` inserts the row if it is absent and never updates it, so the same state and day always give the
same facts.

### Check-in rhythm

`features/projects/rhythm.ts` is the one place that knows which day a week's check-in falls on (`weekdayOfDay`,
`checkInWeekdayOf`, `checkInDayOf`, `previousCheckInDayOf`). A week with no working day has no check-in; the previous
check-in is always asked of `previousCheckInDayOf`, never computed as `checkInDay - 5`.

## Loop

## Clock

## Notices

## Release note
