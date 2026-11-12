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

`project.done` becomes `{ note?, openSteps? }` (D13, D28): `openSteps` is `{ stepId, end: "done" | "dropped", why? }[]`, one entry
for every step not in Done. It is not called `open`: `case.checkin` already carries `open?: string[]`, and one payload type cannot hold both. `project.measure.confirmed` and `project.measured` (a re-entry) also take `measureEventId?`.
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

A result closes in one short loop. Everything below is an event on the project; nothing is edited. The acceptance is
`apps/app/tests/e2e/db/res.spec.ts`.

1. **The baseline's second person (D16, D29, D30).** Where a reward is possible (measure and recognition on, a reward other than
   none) and the baseline is a number, the project cannot start until a second person confirms it (`project.baseline.confirmed`): the
   accepted sponsor or a holder of the route's deputy role; a manager when there is no accepted sponsor and the deputy seat has no holder
   who may confirm. Never the lead, never who typed the number; a new baseline clears the confirmation, and a confirmation names the
   baseline it confirms. A project already started is never touched. Who may confirm finds an item "baseline" in `/inbox`.
2. **Done with open steps (D13).** The Done sheet makes the lead finish or drop every step that is not done, each drop with a reason
   (1 to 400 characters), and shows the goal's done-when. The server takes `project.done` only with every open step listed once in
   `openSteps`. A dropped step stays on the board, struck through, and counts in no "x of y" anywhere (D31): not in the overview, the project line, the summary or the raiser panel.
3. **Send it back (D14, D15).** Whoever may confirm a typed result (the sponsor, the route's deputy, a manager; never the lead or who
   typed it) may send it back with a reason (`project.measure.questioned`). The first time the check counts as not measured, the lead is
   told and enters it again once (`project.measured` for the same check); the old number stays in the history. A second questioning of
   the re-entered number makes it manager-only and tells the managers; a third is refused. A confirmation of a number that was replaced
   is refused: it names the revision it confirms.
4. **Confirm and close (D15, D17).** The sponsor confirms like a manager or the deputy (`project.measure.confirmed`). The lead and the
   raiser are told every time. The confirmation makes the reward due; ten working days later every manager is reminded (below) and the
   raiser sees "Recognition due by {date}". A manager records the reward (`project.rewarded`): the project is recognised and the
   reminder is over. The claim (`project.claimed`) tells the managers without naming who claimed.
5. **Ask the sponsor (D19).** The lead or a member asks the sponsor for help on a step (`project.help.asked`, 1 to 1000 characters),
   or the route owner's role when there is no sponsor (the deputy's when the lead holds the owner role). It is an item "help" in
   `/inbox` until the asked person comments or the step is done or dropped.
6. **The raiser panel (D21).** After the start a raiser who is not on the team sees the title and status, the steps done of the steps
   that count, the latest weekly update, a pause and why, the results with their verdict and whether a second person confirmed them,
   the recognition date and a stop with its reason. No board, team, links, comments or buttons. This narrows the page only: the
   browser still receives the project's events (Q1), so the panel is a presentation, not a privacy measure.
7. **The stop choice (D24).** Stopping a project asks "Keep the idea archived" (default) or "Return the idea to its desk". Returning
   reopens every source case whose latest decision is still the yes that opened this project (`case.reopened { why: "stopped" }`);
   the stop and the reopenings are written together or not at all (`server/actions/project-stop.ts`).

The acceptance's one test follows steps 1 to 4 and 6 with a sandbox company, AI, Teams, Jira and Microsoft 365 off, and one measure
check. The UI works out "today" from the real clock, so the test moves the project's history back by the check's days once it is
marked done; the clock steps use a later `now`.

## Clock

One kind, `reward`, is written by `projectDues` (`features/clock/kinds/project.ts`, logic RES-E1's) as a `clock.due` fact by
`system:clock`, in workdays mode only. It is the last of the project kinds, after MOV's `late`, `blocked`, `quiet`, `stalled`, `update`
and `vacant`, so the order of the facts is: start, measure, SET's draft facts, confirm, MOV's six, reward.

- **When.** `REWARD_REMIND_DAYS` (10) working days after the day the reward fell due (`rewardDueDay`, the later of the result's day and
  its confirmation), while the reward is still due and the project is neither stopped nor recognised.
- **Once per episode.** The episode is the result event that made the reward due: a replacement measure, or a result sent back and
  entered again, is another episode with its own fact; a fact for an episode that has ended is not mailed. The idempotency key is
  `clk:reward:<project>:<dueDay>` with the episode, so the fact is written once however often the clock runs.
- **To.** No seat and no person: every active manager (`reminder.reward`).
- **`mov_since_day`.** A reward that fell due before MOV's release day (`movSinceDay`, written once by the first clock run) sends no
  reminder, so a company that is already live gets no burst. No row means 0, which is no limit (unit tests, the demo).

## Notices

| Template | Event | Recipients |
|---|---|---|
| `loop.project.measure.confirmed` | a confirmed result | the lead and the raiser, every time; besides the close summary when it closes the project |
| `loop.project.measure.questioned` | a result sent back | the lead (first time: enter it again, with the reason); the second time every active manager |
| `loop.project.baseline.confirmed` | the baseline confirmed | the lead |
| `loop.project.help.asked` | help asked on a step | the asked person (the sponsor) or the users of the asked seat |
| `loop.project.claimed` | the reward claimed | every active manager, without naming who claimed |
| `reminder.reward` | the reward still due after 10 working days | every active manager |

The loop templates follow `loop.project.measured`, `reminder.reward` follows `reminder.confirm`: a person who switched those off stays
off. Nobody is told of their own event. A sandbox company sends no mail: every outside row is written as `skipped` with the reason
`sandbox`, and the in-app copy is `sent`. A deactivated person gets none.

## Dashboard

The unit breakdown has a column "Stalled projects" (D22): the projects whose escalation with what `stalled` (MOV) stands today, counted in
the unit of the desk that said yes and rolled up like the other columns. Unit rows only, the current period only, and a hidden row
(the minimum group, complementary suppression) hides it. The server path (`lib/db/metrics.ts`) and the demo path
(`features/metrics/from-state.ts`) give the same numbers. No list names a project or a lead, and nothing is counted per person.

## Members

A company admin edits the name and the email of a member who does not come from the directory and is not pseudonymised (D23): name 1 to
120 characters, email empty or valid and unique in the company; one audit row `audit.member.saved` with the before and after is
written in the same transaction. Directory fields stay read-only ("Comes from the directory. Correct it there."). Old events keep the
name they were written with, and the dialog says so. The pseudonymise and delete dialogs name what stays (D25): free text others wrote,
the append-only events with the pseudonym, copies outside NextUp (mails, Jira, Teams, earlier exports) and backups for up to about
6 months, where a restore repeats the erasure; the delete dialog of a person who comes from the directory warns that a later directory
sync creates them again. The Members action messages go through the settings catalog in German and English.

## Hand-over

- The sponsor's right to confirm a result (D15) is RES's. The sponsor's right to accept an agent **Report** is AGT-K1's, and AGT-K1
  proves it through `mayAppend`, not through the page.
- A baseline or a result is replaced, never edited: every confirmation names the revision it confirms (see "Revision identity"). A
  stale confirmation after a replacement is covered by `tests/unit/res/reduce.test.ts` and `permissions.test.ts` and, for the server's
  refusal, by the acceptance; a reward reminder that ends when the reward is recorded or the result is replaced by
  `tests/unit/res/clock.test.ts` (and the acceptance for the recorded case); a source case decided again while the stop form was open
  by `tests/db/res-stop-return.test.ts`.
- The raiser panel is not the cut of the data (Q1, a later release). The acceptance records that the raiser's browser still receives the
  project's events and does not count the panel as a privacy check.
- Not in RES (D27): claim reminders and how long a claim stays valid per country (Q6.19, Kevin's), payout to payroll, a later return
  of a stopped idea from the case page, the raiser's journey on the case page (SEE).

## Release note

**RES: a result that closes properly.** Use this text in the release mail.

A project in planning where a reward is possible now needs the sponsor or the route's deputy to confirm its baseline before it
starts. This also applies to companies that are already live (Musterwerk). When a project is marked done, the lead finishes every open
step or drops it with a reason. Someone who may confirm a result can send it back with a reason; the lead enters it again, and the sponsor
can confirm it. A confirmation tells the lead and the raiser, and ten working days after a reward falls due the managers are reminded.

A raiser who is not on a project's team now sees a raiser panel instead of the whole project page. The data their browser receives is
cut in a later release; the panel changes what is shown, not what is sent.

Rewards that fell due before MOV's release day send no reminder. The delete and pseudonymise dialogs now say that backups keep a
person for up to about 6 months.
