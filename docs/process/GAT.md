# GAT: Review and approvals

> Area: approval. Written only by this phase (see [README](README.md)).

## Data model

What GAT-G1 puts in place; the behaviour (reducer branches, rights, Dues, notice builders, screens) comes with GAT-A1, B1, C1, R1, S1 and the UI tasks. Decisions are cited by their number in the plan (D6, D12, ...). People are user ids and roles, never names (D3).

### The four events

All four are declared in `features/cases/events/approval.ts` (`APPROVAL_EVENT_TYPES`) and are app types: the server may append them, a system actor may not except where the plan says so. The fields are in `ApprovalAreaPayload`; the fields of the core and the case area are reused where they mean the same (`note`, `reason`, `routeId`, `toRoleHolderId`, `lead`, `leadUserId`, `projectId`, `stepId`, `category`, `changeIf`, `revisitDay`, `outcome`).

| Event | Payload | Meaning |
|---|---|---|
| `case.reviewed` | `outcome: "forward"`, `routeId?`, `auto?` | The review seat forwards a new idea to its desk (D12, D13); `auto`: the clock did, as `system:clock`, after the review days (D14). Sending back is `case.asked`. |
| `case.costed` | `eur`, `basis` | The cost estimate: whole euros 0 to 100,000,000, how it was estimated up to 300 characters; the latest one counts (D18). |
| `case.provisional` | `approvals`, `supplement?`, `decidingRoleId`, `costEur`, plus a yes's `projectId`, `lead`, `leadUserId`, `title`, `draft`, `raiserNote` | A yes that waits for approval; it starts an approval run (D21, D32). `supplement`: the decision stands and only the missing approvals are asked (D33). |
| `case.approval` | `runId`, `stepId`, `dueRev`, `step`, `approvalAnswer`, `reason?`, `conditions?`, `present?`, a no's `category`, `changeIf`, `revisitDay`, `stepDueDay`, `nextStepDueDay` | One answer of the current step. Written only by the settle operation (D22, D32); the generic append path refuses it. |

`case.raised` also carries two fields GAT stamps on the server: `review: true` and `reviewDueDay` = raise day + the review days (D14). The final yes and a refused approval's no are ordinary `case.decided` events written by the actor `system:approvals` (D6, D21, D22).

### The approval run

Every `case.provisional` starts a run; its `runId` is that event's id and never changes. The steps of a run have the immutable ids `<runId>:<index>`, a `dueRev` (0, plus one on each send-back) and a due day the server stamps when the step becomes current (D23). Every answer, Due, fact and settle key is scoped to its run (`approvals:<runId>`, `approvals-no:<runId>`, `approvals-stop:<runId>`). A step is `budget` (the approver role of the cost, with the limit it covers, `coversUpToEur`, null = any cost), `council` (a council's secretary answers) or `role` (an approval rule or a role added by hand, `byHand`). The run freezes the deciding role (`decidingRoleId`) and the cost (`costEur`) it was computed with, so a later change of the settings never changes a run, started or done (D33).

`ReducedCase` carries `approvals` (the active run or null) and `approvalRuns` (every finished run, oldest first); a successful second look (`case.reopened`) moves the active run into `approvalRuns`. `openingRunId` is the run whose final yes decided the case. Types: `features/approvals/types.ts` (`CaseApprovals`, `ApprovalStep`, `StepAnswer`).

### Settings (CompanyRule rows)

The configuration is stored as CompanyRule rows under keys outside `COMPANY_RULE_KEYS` (D7, D27), so saving Settings -> Rules never deletes them, as with `mov_since_day`. No migration. `parseApprovalConfig(rows)` in `features/approvals/config.ts` reads them and `approvalConfigRows(config)` writes them back, every key. A missing key or a bad value gives the default of that key (a bad field inside a key its own default, a bad list entry is dropped); an unknown role id is kept and ignored where it is used.

| Key | Value | Default |
|---|---|---|
| `review` | `{ on, roleId, days, deputyRoleId, routes: { <route key>: "company" \| "always" \| "never" } }` | off, no role, 2 days (1 to 4), no deputy, no routes |
| `triage_role` | `{ roleId }` | none (the manager role, D16) |
| `fallback_role` | `{ roleId }` | none (the review role, else the first manager role, D16) |
| `approval_days` | `{ days }` | 5 (1 to 30) |
| `approval_rules` | `[{ id, kind: "council" \| "role", councilId?, roleId?, routeKey, minEur }]` | none |
| `councils` | `[{ id, name, memberRoleIds, secretaryRoleId, everyDays, firstDay }]`, `everyDays` 5 to 60 | none |

`companySeed` loads them (`lib/db/approvals-config.ts`) into `Seed.approvals`, the roles' title and `spendLimitEur` into `Seed.roles`, and the user ids with the app role manager into `Seed.managerUserIds`. `reduce()` copies them into `State.approvals` (the config plus `roles`). The demo seed has none of them: the empty config, review off (D8). A change of the settings never changes a run already started.

### State, status and clock

- `ReducedCase`: `review` (state, seat, since, due day, `forwardFrom`, `waitsOn`, `auto`; D14), `cost` (D18), `approvals`, `approvalRuns`, `openingRunId`. All null, null, null, `[]` and null for every case until GAT's events are reduced; an old log reduces as before (`tests/unit/gat/replay.test.ts`).
- Status `approval` ("Waits for approval"): the case is off the desk and its promise clock stops (no deadline, escalation or handover Dues), not archived, not yet in the decision log (D21).
- `ReducedProject.waitsForApproval?` (read as `?? false`): the draft waits for an approval run (D21).
- Clock kinds `review`, `approval` and `council` (`features/clock/kinds/approval.ts`); `approvalDues` still gives nothing (GAT-C1). `REVIEW_REMIND_DAYS = 1`.
- Notices: loop types `case.reviewed`, `case.provisional`, `case.approval` (templates `loop.<type>`, a person's switch for case notices covers them) and the duty reminders `reminder.review`, `reminder.approval`, `reminder.council` (they cannot be switched off). The approval reminders reach nobody until GAT-C1 gives them their audiences.

### What a council stores, and what it never stores

A council step stores the answer, the reason, the conditions and how many were present (`present`, 0 to 200), with the secretary as the author of the answer. It never stores who voted how, and nothing anywhere counts reviews or approvals per person (D3).

## Loop

A new idea may be reviewed before the desk sees it, and a yes may wait for approvals before a project can start. Everything is an event on the case; nothing is edited. Roles and councils hold the steps, people are user ids, and nothing counts reviews or approvals per person (D3).

1. **Review (D12 to D14).** Where the company switch is on (or the route says always, and never for a route that says never), a new raise is placed on the review seat with `review: true` and a review due day (raise day + `review.days`, default 2). The review seat's role holders and managers may forward it to its desk (`case.reviewed`), send it back to the author with a question (`case.asked`; the review stays pending), merge or link it, record a cost, move it to a desk, give a reasoned no, or hand it over. They may not say yes, say "Yes, if approved" or start a discussion, and never for their own idea. The raiser's answer date does not move: it reads "With {role} · answer by {date}". When nobody forwards it, the clock does on the due day (below). A second look at a no goes to the review seat while review applies to the route (D17).
2. **The cost (D18).** `case.costed` records whole euros and how they were estimated. The latest estimate counts. A cost above the fast lane only flags "Approvals are likely after a yes"; a case without a cost has no budget step, and the yes sheet says "No budget check: no cost estimate".
3. **The yes sheet (D19, D20).** `approvalsFor` gives the ordered steps for the deciding role, the route and the cost: the budget approver (the first role above the deciding role whose spend limit covers the cost), one step per matching council rule, one per matching role rule, then the roles the desk added by hand. Where steps apply the sheet offers only "Yes, if approved" and names the approvers in order; otherwise both answers, and the desk may still choose "Yes, if approved" with roles it added. The sheet keeps who sets the project up, new draft or join, and the line to the raiser. It writes `case.provisional`; the server recomputes the steps and keeps only the hand-added roles from the client, and refuses a plain `case.decided` yes where a rule applies, from the app, Teams or API v1.
4. **The provisional yes and the run (D21, D32).** `case.provisional` starts an approval run whose id is that event's id. For a new draft it opens the draft like a yes does and the draft "Waits for approval": it has no start day and `project.started` is refused. For a join it opens nothing and leaves the target project as it is; the case joins only with the final yes, and a refused approval decides the case no and writes no `project.stopped`. The case gets the status "Waits for approval": off the desk, its promise clock stopped, not yet in the decision log.
5. **Answers (D22).** The holders of the current step's role, of a council's secretary role, or the seat a late hand-over named, answer the current step, never the person who said the yes: yes, yes with conditions (the conditions go into the project's brief), send back (a reason of at least 8 characters; the step stays current with a new revision), or no. The answer is written only by the settle operation (`server/actions/approvals.ts`, under a lock per case): it checks the run, the step and its revision, and writes the answer and, on the last yes, the final `case.decided` yes by `system:approvals`, or on a no the no and the stop of a draft it opened, in one transaction. A form opened before a send-back is stale and refused.
6. **Councils (D23).** A council is a standing meeting of roles; its secretary records one outcome per idea at the meeting (`present` is how many were there). A council step is due on the council's next meeting day; if nobody answered on that day it moves to the next meeting and the lead and the decider are told. What is stored of a council is the answer, the reason, the conditions and how many were present: never who voted how, and no count per person.
7. **Reopen and supplements (D32, D33).** A refused run stays in the history; after a successful second look the case can be decided again and a new run starts, also on the same day. The cost and the rules are frozen for a run. At Start the requirements are recomputed from today's cost, rules and roles; while one is unmet (a higher cost, a changed spend limit, a new rule or approver, a refused supplement) Start is held with "Needs a new approval", and the lead or the decider may "Ask for the missing approval": a supplement run for exactly what is missing, which leaves the decision as it is and makes the draft wait again. A rule that names a role or council that no longer exists holds Start until an admin fixes it.
8. **What people see.** The draft shows the badge "Waits for approval" and every run with its steps (who approves, by when, the answer, a late hand-over). My cases shows the journey with a review stage ("With {role}") between the raise and the desk, and an approval stage between the decision and the project, one per run, oldest first: a refused run stays before the run after a reopen and a supplement run is a later approval. A company without review or approvals keeps today's stages. Approvers find their step in the inbox (below).

## Clock

Three kinds are written by the approval area of the clock (`features/clock/kinds/approval.ts`, GAT-C1) as `clock.due` facts by `system:clock`, in workdays mode only. Every fact carries the run's id as `originEventId` and the step as `<step id>@<dueRev>`, so two steps due on the same day, a send-back and a re-answer on the same day, and a second run each keep their own reminders and escalations.

| Kind | When | To | Notes |
|---|---|---|---|
| `review` | `REVIEW_REMIND_DAYS` (1) working day after the raise | the review seat (`reminder.review`) | on the review's due day the clock also writes `case.reviewed` with `auto: true` for the proposed route |
| `approval` | on a budget or role step's due day; `check: 2` after the company's escalation days | the step's holders (`reminder.approval`); then the seat above the step's role | the late hand-over names the seat, the step's due day does not move, and nothing follows after it |
| `council` | the working day after a council's meeting day with no answer | the lead and the decider (`reminder.council`) | the step moves to the council's next meeting |

**The auto forward and when it waits.** The review is forwarded on the later of its due day and the working day after the raiser's last answer or the clock's unanswered fact, but never while the case is asked: an open question to the raiser waits, and a due day that falls while the case is asked writes nothing. Without a proposed route the clock writes no forward; such a raise sits on the review seat because that is its triage seat (D16), and the normal answer deadline applies. The forward's idempotency key carries the review's since day and the event the forward day was computed from.

**Due days.** A budget or role step is due `approval_days` (default 5, 1 to 30) working days after it becomes current; a council step on the council's next meeting on or after that day (`firstDay + k · everyDays`). The server stamps the day when a step becomes current: on `case.provisional` for the first step, on the answer that moves on for the next.

**Revision keys.** A run's idempotency keys are scoped to it: `approvals:<runId>`, `approvals-no:<runId>`, `approvals-stop:<runId>`. A fact counts only for the current step at its current revision.

## Notices

| Template | Event | Recipients |
|---|---|---|
| `loop.case.reviewed` | a forward | the raiser ("now with {desk}") and the new desk's holders (a duty notice) |
| `loop.case.provisional` | the provisional yes | the raiser ("Yes, if approved by {approvers}") and the first step's holders ("Approval asked", a duty notice) |
| `loop.case.approval` | an answer | the lead and the decider ("{approver}: yes / with conditions / sent back / no"); on yes or conditions also the next step's holders |
| `reminder.review`, `reminder.approval`, `reminder.council` | the clock | as in the table above |

The reminders are duty notices and cannot be switched off. A send-back of a review reaches the raiser through the existing question notice; a merge stays silent. The final yes and an approval's no are told by the existing `case.decided` notices. In the inbox (`features/inbox/sources/approvals.ts`) one item of kind `approval` waits for the people who may answer the current step: its role's holders (a council step: its secretary), and the seat a late hand-over named; due on the step's day, late the day after; never the person who said the yes. Its title is the case's title and the page says what is asked. A case on the review seat is an ordinary desk item. No count of reviews or approvals per person exists anywhere.

## Settings

The configuration is a set of company rules outside the rules form, so saving Rules never deletes it (D27). Company admins edit it:

- **Approvals** (new page): the review switch, the review role, the days for the review (1 to 4), the review's deputy role, the days for an approval (1 to 30), the approval rules (role or council, a route or all routes, from which cost) and the councils (members, secretary, every 5 to 60 working days, first meeting).
- **Routing**: the triage role (who takes raises no route fits; the review role while review is on, else the manager role) and a review column per route: as company, always, never.
- **Rules**: the fallback role (who takes raises whose route has nobody; the review role while review is on, else the first manager role), in a form of its own beside the rules.

A change never changes a run already started (D33). Without a database the pages show sample values and saving is off.

## Release note

**GAT: review and approvals.** Use this text in the release mail.

A live company sees nothing new until an admin sets a review role or an approval rule, with one exception: a raise without a route, or onto a route without an owner seat, now lands on the first manager role's seat instead of the head of the org chart. Where the head of the org chart holds the manager app role, nothing moves. Review is off and there are no rules. A plain yes is refused only where a rule applies. Old cases replay unchanged, and cases raised before review was switched on are not reviewed.
