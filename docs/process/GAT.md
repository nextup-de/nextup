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

## Clock

## Notices

## Release note
