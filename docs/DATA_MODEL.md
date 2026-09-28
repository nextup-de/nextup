# Data model

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
| `PROBLEMS` / `IDEAS` / `INITIATIVES` | `Problem` / `Idea` / `Initiative` | |
| `METRICS` | - | computed by `features/metrics`; baseline values become `Company.baseline` |

Event types (`src/features/cases/events.ts`), as in the demo:
  `case.read, case.decided, case.handed, case.asked, case.answered, case.override, case.shipped,
  idea.cosigned, idea.approved, idea.funded` - plus, new here: `member.invited, member.role,
  route.upsert, dept.upsert` so settings pages also store facts, not edited copies of the seed.

Pages render `reduceCases(seed, events)` from `features/cases/reducer.ts`. Rule carried over from the demo:
**never store display text as state.** Store who / which day / which route; build the sentence at
render time. A case is one object seen from three sides: `from` = whose "My cases", `assignee` =
whose Inbox (hand-over changes it), managers see all.
