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

A started project (running: started, not done, not stopped) keeps moving in one short loop. Everything below is an event on the
project; nothing is edited. The acceptance is `apps/app/tests/e2e/db/mov.spec.ts`.

1. **The lead keeps it moving.** Steps added, moved or edited, an update, a resume, a hand-over or a new lead count as activity.
   The board shows the done-by date: SET's goal date when it has one, else the start plus 30 working days (`DONE_BY_DEFAULT_DAYS`,
   legacy projects too). The lead may move it once; every further move needs the sponsor, the holder of a standing stalled
   escalation's role, or a manager (`project.doneby.moved`, with a reason).
2. **Late and blocked steps remind their owner** (the lead when a step has none), and the lead later. A step on Blocked tells the lead
   once per block after `blocked_days` working days.
3. **A quiet project reminds the lead, then reaches the sponsor.** After five working days without activity, or past the done-by
   date, the lead is reminded. Three working days later, with still nothing, the project lands on the sponsor's desk: it is on the
   sponsor's `/inbox` as "stalled" and its escalation says so until there is activity, a new done-by date, a pause, a new lead,
   done or stop. A project without an accepted sponsor goes to the route owner's seat, or the deputy's when the lead holds the
   owner role. The sponsor may agree a new date, hand the lead on, or stop it; all three are the sponsor's rights too, besides
   the lead's and a manager's. Commenting stays open to everyone who may read the project.
4. **Pause.** The lead or a manager pauses a running project for at most 20 working days, with a reason
   (`project.paused {why, untilDay}`). While paused the late, blocked, quiet and stalled facts do not fire and the done-by date does
   not move by itself; the weekly update reminder keeps running. The lead, the sponsor or a manager resumes it early
   (`project.resumed`, itself activity: the quiet count starts again from that day); otherwise the pause ends by itself on its last
   day, and quiet counts from the day after. The sponsor is told of both.
5. **The weekly update.** On the check-in day (the weekday of the start unless `project.howwework` set another; the next working
   day of the week when that day is none) the lead has an offline draft built from the board since the previous check-in (steps
   added, moved on, done, blocked; no model call) and a "Weekly update" item in `/inbox`. The lead edits and sends it
   (`project.update`): it goes to the sponsor, the followers and the raiser, never to its writer (legacy projects: the team and the
   raiser). Two working days after the check-in day without an update the lead gets one reminder; an update escalates nowhere.
6. **A lead who leaves.** The leaver path (`deactivateUser` and the directory sources) writes `project.lead.vacated` as
   `system:directory` for every live project the person leads, and takes them off the others as member, sponsor, follower and step
   owner. The page shows **No lead**. The accepted sponsor, a holder of the route's owner or deputy role (the desk that said yes),
   the decider or a manager names a new lead (`project.lead.changed`, the server accepts only an active person of this company);
   so does the holder of the seat the vacant fact went to. A project still without a lead five working days later reaches that
   seat (below). `project.lead.vacated` is refused from every client.

## Clock

Six kinds are written by the project clock (`features/clock/kinds/project.ts`, `projectDues`) as `clock.due` facts by
`system:clock`, in workdays mode only; the demo clock fires nothing. Days are working days of the company calendar. Each fact has an
idempotency key `clk:<kind>:<project>:<dueDay>[:<check>][:<stepId>]`, so it is written once however often the clock runs.

| Kind | When | To | Notes |
|---|---|---|---|
| `late` | the day after a step's due day; `check: 2` two working days later | the step's owner (else the lead); then the lead | one pair per due day and step; a done, removed or undated step gets none |
| `blocked` | `blocked_days` (default 3, 1-10) working days after a step went to Blocked | the lead | once per block (`originEventId` is the move that blocked it) |
| `quiet` | `QUIET_DAYS` (5) after the latest activity, and the day after the done-by date | the lead | once per day |
| `stalled` | `STALLED_DAYS` (3) after a quiet fact when nothing happened since | the sponsor (`userId`), else the route owner's first occupied seat (`toRoleHolderId`; the deputy's when the lead holds the owner role) | ends with activity, a new done-by date, a pause, a new lead, done or stop |
| `update` | `UPDATE_REMIND_DAYS` (2) after a check-in day with no update | the lead | keeps running while paused |
| `vacant` | `VACANT_DAYS` (5) after `project.lead.vacated`, once per vacancy | with a sponsor: the desk's seat (the route owner role's first occupied seat, else the deputy's); without one: the seat above that desk | a project with no such seat still gets the fact, with no seat, so a manager sees it |

**`mov_since_day`.** The first clock run on a company writes its working day once (`ensureMovSinceDay`, never updated). From then
on the kinds look only at due days and activity on or after it: late only for steps due from that day, blocked from the later of
the block day and that day, quiet from the later of the last activity and that day, the done-by quiet only for dates from that day,
update only for check-in days from that day, vacant only for vacancies from that day. A company that was already live therefore gets
no burst of reminders on the first run. No row means 0, which is no limit (unit tests, the demo). A test that needs older days
writes the row with day 0 first.

**Order.** Inside `projectDues` the facts are: start, measure, SET's draft facts (lead, invite, draft), confirm, then late,
blocked, quiet, stalled, update, vacant (D27). The order across areas (case facts, project facts, written events) is REG's
composition. A pause stops late, blocked, quiet and stalled; a vacant project fires no quiet, blocked or stalled fact.

## Notices

New loop templates, all following `loop.project.member` (a person who switched the project mails off stays off), and who gets them:

| Template | Event | Recipients |
|---|---|---|
| `loop.project.doneby.moved` | a new done-by date | the sponsor and the lead, never the one who moved it |
| `loop.project.paused`, `loop.project.resumed` | a pause, a resume | the sponsor |
| `loop.project.update` | the weekly update | the sponsor, the followers and the raiser (legacy: the team and the raiser); never its writer |
| `loop.project.lead.vacated` | the lead left | the sponsor, else the users of the desk's seat, and the team |
| `loop.project.lead.changed` | a new lead | the new lead, the team, the sponsor and the raiser |
| `loop.project.howwework` | the weekly rhythm | nobody |

Existing notices tell more people: `project.handed` and `project.lead.changed` the sponsor and the raiser besides the new lead and
the team; `project.done` and the close summary the sponsor (the summary also the followers); `project.stopped` the sponsor; a late
start or measure fact also the users of its seat; `project.member` with `unassign` the lead, once.

Reminders (`reminder.late`, `reminder.blocked`, `reminder.quiet`, `reminder.stalled`, `reminder.update`, `reminder.vacant`) go to
the fact's `userId` and the users of its `toRoleHolderId` seat. **`reminder.stalled` and `reminder.vacant` are duty notices:** a
person can move them between Teams and mail but not switch them off; the other four can be switched off in the profile.

The dispatcher plans for active users only, so **a deactivated person gets no notice**. A sandbox company sends no mail: every
outside row is written as `skipped` with the reason `sandbox`, and the in-app copy is `sent`. Nothing counts late, blocked, quiet
or stalled items per person anywhere; counts are per desk, and the Dashboard shows stalled projects per unit only (RES).

## Release note

**MOV: a project that keeps moving.** Use this text in the release mail.

From the first clock run after this release, NextUp counts late steps, blocked steps and quiet projects only from that day on,
so nothing that was already late or quiet sends a reminder at once. A project that is quiet for five working days reminds its
lead; three working days later it reaches its sponsor, who can agree a new done-by date, hand the lead on or stop it. Leads can
pause a project for up to 20 working days, and a lead who leaves the company shows as "No lead" until the sponsor or the desk
names a new one. Every running project gets a weekly update, drafted from the board, which goes to the sponsor and the raiser.

Companies that are already live (Musterwerk) see the first quiet reminders five working days after the release.

