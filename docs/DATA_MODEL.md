# Data model

> **Updated 2026-10-15** · reference. The source of truth is `apps/app/prisma/schema.prisma`; the "Today (Phase 1)" paragraph below is from 15 Sep and out of date.

Everything is scoped by company. Today (Phase 1) the only store is
`src/features/tenant/demo-companies.ts`: `slug, name, mark, anonymousHandles, users[]` with
users `id, name, email, role (manager|leader|member), dept, handle?`. TypeScript types for the
rest are in `src/types/index.ts`.

Phase 2 target (`prisma/schema.prisma`), each table with `companyId`:

| Demo array (`legacy/demo/js/data.js`) | Table | Notes |
|---|---|---|
| - | `Company` | `id, slug (unique), name, logoUrl, anonymousHandles` |
| - | `User` | `email (unique per company), name, passwordHash, role, handle, deptId` |
| - | `Invite` | `token, email, role, expiresAt, acceptedAt` |
| `DEPTS` | `Department` | |
| `PEOPLE` | `User` | the org chart: `reportsTo` becomes `managerUserId?`; drawn on the collaboration page |
| `ROUTES` | `Route` | the routing table: `label, ownerUserId, deputyUserId, buddyUserId?, keys[]` |
| `CASES` | `Case` | `title, body, fromUserId, routeId, assigneeUserId, raisedAt, reason, upside` - status/assignee/clock are **derived** from events |
| `store.js` log | `CaseEvent` | append-only: `caseId, actorUserId, type, payload, at` |
| - | `IdeaDraft` / `IdeaTurn` | the idea studio (docs/IDEAS.md): a draft per author, its chat turns and score snapshot; private to the author, `caseId` once published |
| - | `FeatureFlag` | NextUp's rollout switches for the company, as admin.sellux.ch set them: `(companyId, key)`, `enabled`, `updatedAt`. A flag with no row gets its stage default from `src/config/flags.ts`. Not `CompanyConfig` - the company never sees these |
| `PROBLEMS` / `IDEAS` / `INITIATIVES` | `Problem` / `Idea` / `Initiative` | |
| `METRICS` | - | computed by `features/metrics`; baseline values become `Company.baseline` |

Not every table is a company's. **`ErrorGroup`** belongs to the stack: one row per kind of error
the stack ran into by itself (`fingerprint` unique; `source, name, message, frame, route, count,
firstSeenAt, lastSeenAt, appCommit`, plus `pending`/`forwardedAt` for the send to admin.sellux.ch).
It holds no company data by construction - scrubbed message, route pattern - so it has no
`companyId` and is not in the tenant guard. Written by `src/server/errors.ts`, pruned after 30
days (`src/lib/db/errors.ts`).

Event types (`src/features/cases/events.ts`), as in the demo:
  `case.read, case.decided, case.handed, case.asked, case.answered, case.override, case.shipped,
  idea.cosigned, idea.approved, idea.funded` - plus, new here: `member.invited, member.role,
  route.upsert, dept.upsert` so settings pages also store facts, not edited copies of the seed.

After the routing (docs/plans/2026-10-15_idea-to-project.md, 15 Oct 2026), in the same log:
- **The discussion stage**: `case.discussion {invited, missing}`, `case.invited {invited}`,
  `case.revised {body, title?, overall?}` (the reducer numbers the versions) and
  `case.checkin {next: round|decide, open, note}`. The case's status is `discussion`; its due day is
  the next check-in, `CompanyConfig.discussEveryDays` after the last one.
- **Projects**: a `case.decided {answer: "yes", projectId, lead, title}` opens the project, or adds the
  idea to it when it is already open; the idea is archived from then on. Then `project.member`,
  `project.handed`, `project.baseline`, `project.started`, `project.step.added`, `project.step.moved`,
  `project.step.edited`, `project.linked`, `project.commented`, `project.done`, `project.measured`,
  `project.rewarded`, `project.claimed` and `project.stopped`, with the project id as the target. The
  board is a Kanban: `project.step.added {to?}` starts a step in To do, Doing or Done; `project.step.moved
  {before?}` puts it above another card (the steps' order is the board's order); `project.step.edited
  {text?, owner?, dueDay?, note?, removed?}` changes only the fields it sends. There is no project table:
  `reduce()` returns `projects` (`src/features/projects`), and the verdict of a measure is computed
  (`verdict.ts`), never sent. The company's rhythm, measure days and reward rule are `CompanyConfig`
  fields, read into `Seed.loop` (`src/features/loop/rules.ts`).

Pages render `reduceCases(seed, events)` from `features/cases/reducer.ts`. Rule carried over from the demo:
**never store display text as state.** Store who / which day / which route; build the sentence at
render time. A case is one object seen from three sides: `from` = whose "My cases", `assignee` =
whose Inbox (hand-over changes it), managers see all.
