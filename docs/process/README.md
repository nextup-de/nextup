# Process: one registry file per area

> **Plan REG, 12 Nov 2026** (REG-A1 wrote this; REG-Z1 links it from the other docs). Read this before you add an
> event type, a payload field or a check to the append action.

## The rule

The shared registries are split into one file per **area**, so that phases that write different areas never edit the
same file and can run at the same time. A phase adds to **its area file**, its i18n namespace and its own docs
file, and never to a composer. REG-Z1's guard fails when a composer gains an area entry.

## The five areas

Always composed in this order: `case`, `project`, `agent`, `approval`, `overload`.

| Area | Written by | What it holds |
|---|---|---|
| `case` | NOR (The reasoned no), SEE (The raiser sees the whole way) | `case.*` events, and a `case.decided` yes that opens a project (it is a case event) |
| `project` | MOV (A project that keeps moving), RES (A result that closes properly) | `project.*` events |
| `agent` | AGT (Orchestrator v1) | stub until AGT |
| `approval` | GAT (Review and approvals) | stub until GAT |
| `overload` | OVL (Overload and absence) | stub until OVL |

An entry belongs to an area by what it is about: event types by prefix (`case.*` is case, `project.*` is project);
clock kinds, reminder kinds and templates by their subject (cases: deadline, checkin, escalation, handover,
question, unanswered, triage; projects: start, measure, confirm, lead, invite, draft). Everything else stays core:
`idea.*`, `day.advanced`, `clock.due`, the raised notice, the digest, webhooks, channels, the in-app list and the
inbox. A field or helper used by more than one file stays with the composer.

An area file imports only **types** from its composer, never a value: a composer builds its lists from the area
files at module load, so a value import back would be a cycle. Shared values live in the `shared.ts` next to the
area files.

## Composer files (closed)

A later phase adds nothing area-specific to these:

- `apps/app/src/features/cases/events.ts`, `features/cases/persist.ts`
- `features/clock/due.ts`, `server/scheduler/clock.ts`
- `features/notify/plan.ts`, `digest.ts`, `templates.ts`, `channels.ts`
- `server/loop-notice.ts`, `features/loop/notice.ts`
- `i18n/de.ts`, `i18n/en.ts`
- `components/dashboard/DemoProvider.tsx`
- `server/actions/events.ts`

The rule-key files (`features/knowledge/rules.ts`, `features/loop/rules.ts`) and the inbox files
(`features/inbox/`) are **pre-declared, not split**: REG declares what MOV and NOR need. A phase that needs another
rule key or inbox kind adds it in its own scaffold task, never while another phase does.

## Where a phase writes instead

### Event types and payload fields (REG-A1)

`apps/app/src/features/cases/events/<area>.ts`, one per area (`case.ts`, `project.ts`, `agent.ts`, `approval.ts`,
`overload.ts`). Each exports:

- `<AREA>_EVENT_TYPES` (`CASE_EVENT_TYPES`, `PROJECT_EVENT_TYPES`, `AGENT_EVENT_TYPES`, `APPROVAL_EVENT_TYPES`,
  `OVERLOAD_EVENT_TYPES`): the types the app may append, as an `as const` tuple.
- `<Area>AreaEventType` (`CaseAreaEventType`, `ProjectAreaEventType`, ...): the app types plus the area's internal and
  seed-only types (`case.unanswered`, `case.building`, `case.shipped` are not app types), each with a one-line
  payload comment.
- `<Area>AreaPayload` (`CaseAreaPayload`, `ProjectAreaPayload`, ...): the `EventPayload` fields only that area's
  events carry.

`features/cases/events.ts` keeps the core types (`idea.*`, `day.advanced`, `clock.due`) and `CorePayload`, and
composes `CaseEventType` and `EventPayload`. `features/cases/persist.ts` composes `APP_EVENT_TYPES` from
`CORE_APP_EVENT_TYPES` and the five area lists (nothing may depend on its order). A field lives in exactly one
file; reuse an existing field and declare only new ones, in your area file. A field two areas need goes to
`CorePayload` in `events.ts`; that is the only edit a composer takes.

### Checks and stamps in the append action (REG-A1)

`apps/app/src/server/actions/append/<area>.ts` exports `prepare<Area>Append(c: AppendCtx): Promise<AppendHook>`
(`prepareCaseAppend`, `prepareProjectAppend`, `prepareAgentAppend`, `prepareApprovalAppend`,
`prepareOverloadAppend`). `append/shared.ts` holds `AppendCtx` and `AppendHook` (types only). `appendEventAction`
runs the five in area order after it has reduced the state and before `mayAppend`, each with the payload the
previous one returned; the first `{ ok: false, error }` is the action's refusal. MOV writes `append/project.ts`, NOR
writes `append/case.ts`. A hook is a no-op until its phase fills it.

### The other registries

REG-B1 to REG-E1 split the clock kinds and the scheduler's writers, the notices, the loop notices and the demo acts
the same way (`shared.ts` next to the area files, the composer re-exports it). Each of those tasks lists its files
here when it merges.

## Tests

`apps/app/tests/unit/reg/` holds what proves a split: a snapshot of each registry taken before the split and a
golden of each pure output, compared after it. They come from fixed fixtures only (never `reduce()`), so a later
change to a reducer cannot break them. Moving an entry between files must leave them green; adding an entry
changes the snapshot in the same PR as the entry.

## Where a phase documents

A phase documents its data model, loop, clock, notices and release note **only in its own
`docs/process/<ID>.md`**: [MOV](MOV.md), [NOR](NOR.md), [AGT](AGT.md), [SEE](SEE.md), [RES](RES.md), [GAT](GAT.md),
[OVL](OVL.md). It does not edit `docs/DATA_MODEL.md`, `docs/LOOP.md`, `docs/CLOCK.md` or `docs/NOTIFICATIONS.md`.
