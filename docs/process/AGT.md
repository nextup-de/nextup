# AGT: Orchestrator v1

> Area: agent. Written only by this phase (see [README](README.md)).

## Data model

One new table, `AgentText` (AGT-S1, decision D23), holds the words of a suggestion; AGT-G1 itself changes no schema. Everything below is
declared by AGT-G1 in the agent area files (`features/cases/events/agent.ts`, `features/agent/`, `features/notify/areas/agent.ts`).

### Events

The six `agent.*` events are app events (`AGENT_EVENT_TYPES`). They are appended by AGT's own server actions (`server/agent/*.ts`) after AGT's
own rights check, never through `appendEventAction`. The target is a project, except `agent.planned` (a case) and `agent.ran` (none).

| Type | Payload | Who writes it |
|---|---|---|
| `agent.switched` | `{ on }` | the lead or a manager, while the flag `agent` is on for the company |
| `agent.suggested` | `{ suggestionKind, textId, ridesOn?, stepId?, week?, refs, brainModel, brainVersion, subjectKey?, inputMark? }` | `system:agent`, idemKey `agt:sug:<projectId>:<day>:<suggestionKind>` |
| `agent.accepted` | `{ suggestionId, suggestionKind, edited, text?, toUserIds?, followUpId? }` | a person, idemKey `agt:acc:<suggestionId>`; the follow-up of a Report or Plan has `agt:acc:<suggestionId>:<kind>` |
| `agent.dismissed` | `{ suggestionId, why? }` | a person (`why` up to 400 characters), or `system:agent` with `why: "expired"`, idemKey `agt:exp:<suggestionId>` |
| `agent.planned` | `{ textId, brainModel, brainVersion }` | the person who asked for a planning draft, target a case |
| `agent.ran` | `{ runDay, projectsRun, suggestionsMade, projectRuns? }` | `system:agent`, idemKey `agt:ran:<runDay>` |

New payload fields: `suggestionKind`, `textId`, `ridesOn`, `refs`, `suggestionId`, `edited`, `toUserIds`, `brainModel`, `brainVersion`, `aiDrafted`,
`runDay`, `projectsRun`, `suggestionsMade`, and, from the review of 12 Nov, `subjectKey`, `inputMark`, `projectRuns` and `followUpId`. `on`,
`stepId`, `week`, `text` and `why` are reused. `refs` holds at most 10 step or event ids.

### What is in an event and what is not

An event carries references and numbers, never words: a suggestion's title, reason, draft and proposed step are in `AgentText` only
(`SuggestionText`, `PlanDraft` in `features/agent/types.ts`), so the retention job can remove them without touching the log. An id in an event
(`textId`, `suggestionId`, `followUpId`) is a reference and **grants no access**: reading a text goes through the rights of the project it belongs to.

### Occurrence, acceptance and run progress (review, 12 Nov)

- **Occurrence.** A suggestion is the `agent.suggested` event: its id is its identity (`AgentSuggestion.id`) and is never reused. `subjectKey` is what
  it is about as the repeat rule keys it (the step for an Unblock, the check-in week for a Report, the project for a Plan), so a dismissal of one step
  does not silence another.
- **Atomic acceptance.** An accept writes `agent.accepted` (idemKey `agt:acc:<suggestionId>`) and, for a Report or a Plan, its follow-up event
  (idemKey `agt:acc:<suggestionId>:<kind>`), whose id the acceptance names in `followUpId`. A retried accept finds both keys, completes what is missing
  and writes nothing twice.
- **Run progress per project.** The company-wide `agent.ran` counts are a summary and prove nothing about one project. Each project's turn is an entry
  of `projectRuns`: `{ projectId, inputMark, outcome, suggestions }`. `inputMark` is the watermark of what the run showed the model;
  `outcome` is `suggested` or `none` (the turn finished and the project's watermark moves to that mark), or `failed`, `refused` or `skipped` (it does
  not move, so the project is tried again at the next change). `AgentProject.lastRun` is the latest finished turn.

### Contract with the brain

`features/agent/contract.ts` (zod) fixes the JSON of `POST /v1/agent` (`AgentRequest`, `AgentReply`: at most 3 suggestions, `title` up to 120,
`why` up to 300, `draft` up to 600, the proposed step with `due_in_days` 1-60), `POST /v1/plan` version 2 (`PlanV2Request` with `templates`,
`PlanV2Reply` with the `plan` object) and `POST /v1/hint` (`HintRequest`, `HintReply`). The brain's `schemas.py` mirrors them (AGT-B1, AGT-P1). A
step's owner in a request is a role or `no owner`, never a name.

### Limits, flag and gate

`features/agent/limits.ts` holds every number (`AGENT_HOUR`, `MAX_SUGGESTIONS`, `SUGGESTION_EXPIRE_DAYS`, `REPEAT_DAYS`, `PLAN_RUNS_MAX`, the timeouts,
`NUDGE_MAX`, `REPORT_MAX`, `STEP_TITLE_MAX`, `DISMISS_WHY_MAX`, `RIDE_KINDS`). The flag `agent` (`config/flags.ts`) defaults to on for demo and
sandbox, off for pilot and live. The AI gate knows the purpose `agent`: it follows the brain's rules, has no company switch of its own and stops at
100 % of the month's budget.

### Notices

An accepted Unblock is the one agent event that sends a notice: `agent.accepted` is a loop type, template `loop.agent.accepted` (it follows
`loop.project.member` in a person's switches) and a loop mail type. The agent has no reminders and no duty notices.

## Loop

The agent drafts and a person decides; it never sends, moves, closes, decides, approves or enters a number (D22).

1. **The switch.** Per project, in the Agent tab (`?tab=agent`): the lead or a manager switches the agent on or off (`agent.switched`), on a draft or a
   running project, only while the flag `agent` is on for the company. With no switch, a template may preset it (none does today, D11). The tab is
   for the lead, the sponsor and managers; a team member and a raiser do not see it, and the demo has none (D8).
2. **The daily run** (`server/agent/daily.ts`, started from `instrumentation.ts`). Every `AGENT_INTERVAL_MS` (10 minutes) it looks at each company that
   is not a demo; from `AGENT_HOUR` (06:00 Europe/Berlin) on a working day of the company's calendar it runs once, under a Postgres advisory lock per
   company so two processes never run it twice. First the expiries (no model needed); then, with the flag on and the AI gate open for purpose `agent`,
   every running project (not paused) that has the agent on and has changed since its last finished turn gets one brain call with the reduced project.
   At most `MAX_SUGGESTIONS` (3) suggestions come back, one per kind, and the run writes `agent.ran` with each project's turn. A failed or refused call
   on one project is logged without its text and the run goes on; that project is tried again at its next change.
3. **A suggestion** is the event `agent.suggested` (kind, references, the id of its words) and its words in `AgentText`, written together. Three kinds:
   *Unblock* (a nudge to the owner of a step, riding on a clock fact), *Report* (the week's update, from the check-in day while that week has none) and
   *Plan* (one proposed step). It waits in the Agent tab and in one inbox row for the lead (kind `suggestion`, ask `part`); nobody is mailed (D18).
4. **Accept, edit, dismiss** (`server/agent/actions.ts`). The lead or a manager accepts; a sponsor may accept or dismiss a Report. The person may edit
   the words first (nudge up to 600 characters, Report 1 to 4000, a Plan's step title 1 to 120). Acceptance is **one transaction under a lock per
   company and project**: the flag, the rights, the suggestion's state, the project, the words and the active people are read again inside it, and the
   `agent.accepted` event, its follow-up (a Report's `project.update`, a Plan's `project.step.added`, each checked with `mayAppend` for the accepting
   person) and the text of an edit commit together or not at all. Two people answering at once have one winner; a retry returns the stored result and
   cannot change what was accepted. A suggestion whose step is gone or done, whose week is no longer the one due, or whose words were removed is
   refused and writes nothing. A dismissal takes an optional reason (up to 400 characters).
5. **Expiry.** An open suggestion five working days old is dismissed as `expired` by `system:agent` on the next run, with the gate open or not.
   No reminder is sent about a suggestion. No new suggestion of a kind for the same step (Unblock) or project (Plan) while one is open or one was
   dismissed in the last ten working days.
6. **The planning run.** On a case that is open or in a discussion, a holder of the case's desk or a manager asks for a planning draft ("Plan it with
   the agent"): the brain's `/v1/plan` version 2 gets the idea, the goals and the three shipped templates and returns the fitting template, steps with
   roles, a metric, an effort range, risks and likely approvals. The draft is stored once per run (words in `AgentText`, `agent.planned` on the case),
   never on a page load, at most three per case, with a 60-second limit; no answer is "No draft this time" and the decision never waits. The desk,
   managers and the people invited to the discussion read the draft, labelled AI; the raiser learns only that one exists. A draft project shows a link to
   it. Applying a draft to the setup is not built.
7. **The hint.** Under the reason field of the No sheet, the desk or a manager can check the reason with AI (`/v1/hint`, purpose `brain`): "Looks clear"
   or one sentence. It stores nothing and never blocks or changes the no; any failure shows nothing.

With the flag off, the AI gate closed or the brain down, every AGT surface shows nothing or its rule fallback and the rest of the app behaves as it did
before (D4). A closed gate shows no error: the tab says "No suggestions today", and a suggestion that is still open stays visible and can be answered
(accepting calls no model).

## Clock

The clock decides when; the agent writes what (Q7.17, D12).

- **The agent writes no clock fact** and never moves, skips or edits one. Its events (`agent.*`) are not activity: MOV's `lastActivityDay` counts none,
  so a suggestion, an acceptance or a switch moves **no escalation date**. The quiet reminder, the stalled fact for the sponsor and the rest come on
  the days they would without the agent; the acceptance (`tests/e2e/db/agt.spec.ts`) checks the stalled fact on its day after an accepted nudge.
- **The rides.** An Unblock exists only riding on a `clock.due` fact MOV wrote on the project since the agent's previous run, of kind `quiet`, `stalled`,
  `late` or `blocked`: `agent.suggested` carries `ridesOn` (the fact's event id) and `stepId`.
- **An accepted nudge is that step's reminder.** MOV reminds each person once per fact, and its next fact for the step or project is an escalation, so
  the agent offers no further Unblock that rides on a fact as old as the one the accepted nudge rode on. Only a newer fact (in the order of the log) can
  ask again. A dismissed Unblock is not offered again for ten working days.
- An accepted Report or Plan writes a person's `project.update` or `project.step.added`, which count as activity like any other.

## Notices

- A suggestion, a dismissal, a switch and an expiry send **nothing**: no mail, no Teams message, no in-app notice (D18). The lead's only notice is the
  clock's own reminder, which already leads to the project, where the Agent tab and the inbox row show the nudge that waits.
- An **accepted Unblock sends one notice**, template `loop.agent.accepted` (it follows `loop.project.member` in a person's switches), to the step's
  owner, else the people of the step's role (`lead`, `sponsor` and `team` are the project's roles, never the org chart's), active people of the company
  only, never the sender. The recipients are read on the server at the moment of acceptance, never taken from the request. The text is the nudge as
  the lead sent it, with the line "Drafted with AI, sent by <name>" and a link to the project.
- An accepted Report or Plan notifies through the update and the step it writes (MOV's notices).
- **The inbox row.** One row per project with open suggestions, for the lead only (kind `suggestion`, ask `part`), linking to the Agent tab, due on
  the expiry day of the oldest open suggestion. The Inbox page and its badge build it from the same rule, so they count the same. There is no badge on
  `/projects` and no digest line.

## What the agent reads and keeps

- **What it reads.** The reduced project and nothing else: steps with id, title, role, column, due day, blocked reason and the owner as a **role or
  "no owner"**, the done-by day, a pause, the latest update (week and day), the last activity day and the riding facts. Never the raw log, never a
  display name, a user id or an address, never a Teams channel (D3). Free text (titles, reasons) goes through the same redaction as every other brain
  call, and a text the company marked above its ceiling means no call.
- **What it keeps.** An event holds references and numbers only: kind, the ids it cites, the id of the words, the model and the version. The words of a
  suggestion and a planning draft are in the table `AgentText` (id, company, kind, text, time), with no user id. The nightly retention run deletes them
  with the company's `assist_turns` rule (the AI-text rule that already exists); a deleted text shows as "Removed after the retention period" and cannot
  be accepted. What a person accepted lives on in the notice, the update or the step, and an edited text is kept for the tab's history until the same
  retention removes it. Every answered call writes one `AiCall` with its purpose (`agent`, `agent-plan`, `hint`).
- **Who may read the words.** An id in an event grants no access: the words are read through the rights of the project (the lead, the sponsor and
  managers) or the case (the desk, managers, the people invited to the discussion), again at every read.
- **No counting people.** No count of suggestions, acceptances or dismissals per person exists anywhere; the share accepted is only ever counted per
  company.
- **For the privacy text and the works council.** The agent is a drafting aid on the project a lead switched it on for. It reads roles and task titles,
  not names; it never sends or decides by itself; its words are deleted with the company's AI-text retention; and it has no Teams channel. This is the
  text PRIVACY.md and the works-council sheet take; neither file is changed by this phase.

## Cost

- **Purpose `agent`** (the daily run and the planning run) follows the brain's rules and is not on the raise path: it **pauses at 100 % of the month's
  budget**, while the raise path runs on to 120 %. The hint uses purpose `brain`. One model answers every AGT call: the company's brain model, and
  until Kevin decides which one, only a model the company chose itself (the gate is closed on Bedrock without a brain model).
- **One call per changed project and day**, never per page load; a project without a change since its last finished turn is not asked, and a company
  with the flag off or the gate closed makes no call at all.
- **Is the cap hard?** Not by itself. Before a call the ledger reserves the estimated maximum cost under a lock per company, so calls that run side by
  side cannot all pass the check on the rows written so far; when the reservation would use the cap up, no call is made. After the call the reservation
  is settled with the reported usage. If the transport fails (a timeout or a disconnect), the usage is unknown: the estimate **stays** as the month's
  cost and is logged as such, so the app never counts that call as free, but a call the model bills above the estimate's maximum is not capped by it.
  The cap is a ceiling on what is reserved, not a guarantee of the bill. Describe it as that until the budget and concurrency proof
  (`tests/db/agt-daily.test.ts`, "reserves ...") has run on the pilot stack.
- **The recorded brain in CI.** `services/brain/eval/recorded/` (`agent.json`, `plan_v2.json`, `hint.json`) holds recorded cases; the brain's pytest and
  the app's tests, including the acceptance, answer from them without a model. They prove the path and the schema. They say nothing of the quality of
  German plans or of the cost in production.
- **By hand, never a proof.** Layer 2: `eval.run_agent` against Ollama on a Mac. Layer 3: the live eval of about 60 cases under the monthly cap.
- **Measured cost per project per month: not measured yet.** Victor runs the live eval; the figure goes here when he has.

## Release note: AGT

Text for the release mail:

> **The project agent (AGT)** drafts, you decide. It is **off for every pilot and live company** until admin turns the flag `agent` on for the company.
> Once the flag is on, **nothing runs on a project until its lead switches the agent on** for that project in the project's Agent tab. The agent then
> looks at the project each working day and may suggest a nudge to the owner of a step that stands still, a weekly update or one more step; the lead
> accepts, edits or dismisses each suggestion, and the lead's inbox shows that suggestions wait. It **never sends or moves anything by itself**: a nudge
> goes out only when the lead accepts it, to the step's owner, as one notice marked "Drafted with AI". It reads roles and task titles, not names; its
> words are deleted with the company's AI-text retention. With the AI switched off, or the budget used up, the app works exactly as before.
