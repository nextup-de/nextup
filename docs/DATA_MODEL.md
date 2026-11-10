# Data model

> **Updated 2026-11-06** · reference. The source of truth is `apps/app/prisma/schema/` (one file per area, see `adr/0007-areas.md`); the "Today (Phase 1)" paragraph below is from 15 Sep and out of date.

Everything is scoped by company. Today (Phase 1) the only store is
`src/features/tenant/demo-companies.ts`: `slug, name, mark, anonymousHandles, users[]` with
users `id, name, email, role (manager|leader|member), dept, handle?`. TypeScript types for the
rest are in `src/types/index.ts`.

Phase 2 target (`apps/app/prisma/schema/`: `Company` in `core.prisma`, the rest in the area file its model sits in), each table with `companyId`:

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
| - | `IdeaDraft` / `IdeaTurn` | the idea studio (docs/IDEAS.md): a draft per author, its chat turns and score snapshot; private to the author, `caseId` once published. A turn has `role`, `text`, `overall`, `model`, `promptVersion` and, on a coach (assistant) turn, `reading` (below) |
| - | `AiCall` | one call of the brain to the company's model (plan AIB D9): `purpose` (routing, read, coach, plan, checkin, context), `model`, `tokensIn`, `tokensOut`, `latencyMs`, `createdAt`; index `(companyId, createdAt)`. No user id, no case id, no text |
| - | `CompanyContextRun` | the latest background draft of the company profile, one row per company (`docs/COMPANY_KNOWLEDGE.md`, "The context draft"): `status` (running, ready, failed), `startedById`, `startedAt`, `finishedAt`, `error` (a code), `draft` (file names, links and proposed text), `reviewedAt`, `mailedAt`, and its lease `leaseUntil`, `attempts`; index `status`. The draft is emptied after review and after 30 days at most |
| - | `FeatureFlag` | NextUp's rollout switches for the company, as admin.sellux.ch set them: `(companyId, key)`, `enabled`, `updatedAt`. A flag with no row gets its stage default from `src/config/flags.ts`. Not `CompanyConfig` - the company never sees these |
| `PROBLEMS` / `IDEAS` / `INITIATIVES` | `Problem` / `Idea` / `Initiative` | |
| `METRICS` | - | computed by `features/metrics`; baseline values become `Company.baseline` |

**`IdeaTurn.reading`** (`Json?`, migration `idea_turn_reading`): the model's reading of the idea that
the coach's reply was written from (`features/ideas/reading.ts`, docs/IDEAS.md "The reading"). Only on
assistant turns, and `null` when the keyword benchmark answered, on every user turn, and on turns from
before the column existed. When there is one it holds: `dials` (five: `key` value, feasibility, cost,
fit or risk; `score` 0-100; `note`; `basis`), `overall` (the mean of the five, computed by the brain),
`summary`, `advice` (`approve`, `pilot` or `info`) and `advice_why`, `pattern`, `route_id` (a routing
row of the company, or null) and `route_reason`, `same_as` and `related` (an earlier item or null),
`open` (the questions still open), `model`, `version` (the reading prompt's), and two the app adds
before it is stored: `similar` (the earlier items it named, as `id`, `title`, `status`, `same`) and
`checked` (how many earlier items it was compared with). Read through `readingOf`: a row that does not
parse as this shape reads as no reading, so the shape can change without a migration of old rows. It is
model output written from redacted text (names reach the model as roles, as far as the redaction
catches them), and it is not a score the app computes.
`IdeaTurn.overall` is the reading's `overall` when there is one. The draft's `scores` snapshot stays
the keyword benchmark's four bars.

Not every table is a company's. **`ErrorGroup`** belongs to the stack: one row per kind of error
the stack ran into by itself (`fingerprint` unique; `source, name, message, frame, route, count,
firstSeenAt, lastSeenAt, appCommit`, plus `pending`/`forwardedAt` for the send to admin.sellux.ch).
It holds no company data by construction - scrubbed message, route pattern - so it has no
`companyId` and is not in the tenant guard. Written by `src/server/errors.ts`, pruned after 30
days (`src/lib/db/errors.ts`).

Event types (`src/features/cases/events.ts`), as in the demo:
  `case.read, case.decided, case.handed, case.asked, case.answered, case.unanswered` (the clock's own, when a
  question got no answer in time), `case.withdrawn` (the raiser takes back an idea nobody decided; status
  `withdrawn`, archived, no decision), `case.override, case.shipped,
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
  `project.step.edited`, `project.linked`, `project.sync` (send to Jira or stop; `ReducedProject.sync`, and the company's `Integration` row, `docs/plans/2026-10-29_jira-in-app.md`), `project.commented`, `project.done`, `project.measured`,
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
