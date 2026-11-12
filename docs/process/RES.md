# RES: A result that closes properly

> Area: project. Written only by this phase (see [README](README.md)).

## Data model

No Prisma change: the new event types are strings. Everything below is declared by RES-G1 in the project area files
(`features/cases/events/project.ts`, `features/projects/types.ts`, `features/projects/result.ts`).

### Events

All are `project.*` events with the project id as target, listed in `PROJECT_EVENT_TYPES`, and loop templates that
follow `loop.project.measured` (`features/notify/areas/project.ts`).

| Type | Payload | Meaning |
|---|---|---|
| `project.measure.questioned` | `{ check, why, measureEventId? }` | someone who may confirm a typed result sends it back (D14); `why` 1-400 characters |
| `project.baseline.confirmed` | `{ baselineEventId? }` | a second person confirms the current baseline number (D16) |
| `project.help.asked` | `{ stepId, text }` | the lead or a member asks the sponsor for help on a step (D19); `text` 1-1000 characters |

`project.done` becomes `{ note?, open? }` (D13): `open` is `{ stepId, end: "done" | "dropped", why? }[]`, one entry for every
step not in Done. `project.measure.confirmed` and `project.measured` (a re-entry) also take `measureEventId?`.
`project.claimed` becomes a loop notice (Q2.14).

### Revision identity

A baseline and a measure are replaced, not edited, so a confirmation must say which one it confirms. `Baseline.eventId` is the
id of the `project.baseline` event that wrote it and `Measure.eventId` the id of the `project.measured` event. An event that
names a revision (`baselineEventId`, `measureEventId`) is valid only while that revision still stands: a confirmation for
revision A never confirms its replacement B. A missing field is every event stored before RES; it names the revision that
stood when it was written, so old logs replay unchanged. `revisionMatches(named, current)` in `features/projects/result.ts`
is the one place that decides it.

### Reduced fields

| Where | Field | Value |
|---|---|---|
| `Step` | `dropped?` | `{ why, day, byUserId }` once dropped on the Done sheet (D13), else `null` |
| `Measure` | `eventId?` | the revision's identity (above) |
| `Measure` | `sentBack`, `reentered`, `managerOnly` | the questioning state of the check (D14); all `false` on a result nobody questioned |
| `Measure` | `questions` | every questioning, `{ day, why, byUserId }` |
| `Measure` | `previous` | the numbers before each re-entry, `{ value, day, byUserId }` |
| `Baseline` (both variants) | `byUserId?`, `eventId?`, `confirmed?` | who typed it, its identity, and `{ byUserId, day }` once confirmed (D16); a new `project.baseline` clears it |
| `ReducedProject` | `rewardDueDay` | the day the latest confirmation made the reward due while `rewardDue` holds, else `null` (D17) |
| `ReducedProject` | `helpAsks` | every ask, `{ id, stepId, text, day, byUserId, toUserId, toRoleId, answeredDay }` (D19) |

A project nobody touched with the new events has the empty values (`null`, `[]`, `false`).

### Shared helpers

`features/projects/result.ts` (D26): `rewardPossible(rules)`, `baselineNeedsConfirm(p, rules)`, `recognitionDueDay(p)`
(`rewardDueDay + REWARD_REMIND_DAYS`), `openStepsOf(p)`, `revisionMatches(named, current)` and the limits `DROP_WHY_MAX`,
`QUESTION_WHY_MAX` (400) and `HELP_TEXT_MAX` (1000). `REWARD_REMIND_DAYS` (10) and the clock kind `reward` are in
`features/clock/kinds/project.ts`; their logic is RES-E1's.

### Inbox kinds

`InboxKind` gains `help` (an open ask for the asked person or role, D19), `baseline` (a baseline that waits for a second
person, D16) and `suggestion` (AGT's; RES writes none). `projectResultItems` (`features/inbox/sources/project-result.ts`)
is wired into `inboxItems` and returns nothing until RES-E1.

## Loop

## Clock

## Notices

## Release note
