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

## Clock

## Notices

## Release note
