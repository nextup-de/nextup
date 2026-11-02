# 0007 · Areas and file ownership per phase

## Status

Accepted · PILOT/ARC · 2026-11

## Context

The Prisma schema was one file, `apps/app/prisma/schema.prisma`. Every phase of PILOT that adds a
table would have edited it, so parallel phases collide on one file. Prisma 7.10 reads every `.prisma`
file of a folder given as `schema` (`apps/app/prisma7.config.ts`), and relations work across files.

## Decision

The schema is split into one file per area under `apps/app/prisma/schema/`, with no model change
(`prisma migrate diff` from the old file to the folder is empty). A phase changes only the area files
its brief names (PILOT/HD11).

| File | Models | Phases that may change it |
|---|---|---|
| `core.prisma` | `generator client`, `datasource db`, `Company`, `CaseEvent`, `IdeaDraft`, `IdeaTurn`, `AssistTurn` | IDN, CLK, VIS |
| `structure.prisma` | `CompanyProfile`, `OrgUnit`, `OrgRole`, `OrgRoleHolder`, `RoutingRule`, `Goal` | STR |
| `auth.prisma` | `User`, `ApiToken` | DIR |
| `integrations.prisma` | `CompanyConfig`, `Connection`, `Integration`, `Document` | CON, NTF |
| `ops.prisma` | `FeatureFlag`, `PilotRequest`, `PilotReply`, `Ticket`, `TicketReply`, `ErrorGroup` | GDP |
| `support.prisma` | `SupportGrant` | ITC |

Rules:

1. A phase changes only the area files its brief names.
2. Every migration is its own folder under `apps/app/prisma/migrations/`, named
   `<timestamp>_<phase id lower case>_<what>`.
3. A phase that needs a field in another area's file first gets the Hauptplan changed.
4. `Company` back-relations: `Company` (in `core.prisma`) lists its relation fields in one block per area,
   each led by a comment `// -- <area> --`. A phase that adds a model with a relation to `Company` adds
   its back-relation field only inside the `// -- <area> --` block of its own area, and adds no scalar
   column to `Company`; new per-company settings go to a table in its own area. This is the only edit of
   `core.prisma` allowed to a phase that does not own it.

### File ownership per phase

Paths are under `apps/app/` unless they start at the repo root (`docs/`, `.github/`).

| Phase | Owns |
|---|---|
| AUD | `docs/audit/`, `.github/workflows/ci.yml`, `tests/unit/docs/` |
| ARC | `packages/contracts/`, `docs/adr/`, `prisma/schema/` (split only), `prisma7.config.ts` |
| OPS | `stack/`, `ops/`, `.github/workflows/images.yml`, `.github/workflows/deploy.yml`, `docs/ops/` |
| STR | `prisma/schema/structure.prisma`, its migration folders, `src/features/demo/`, `src/features/evaluate/`, `src/lib/db/`, `prisma/seed.ts`, `prisma/bootstrap-company.ts` |
| LNG | `src/i18n/`, strings in `src/components/` and `src/app/`, templates in `src/server/*-notice.ts`, `eslint.config.*` |
| CON | `src/features/m365/`, `src/server/jira/`, `src/server/jira-sync.ts`, `src/server/connectors/`, `tests/fake-jira/`, `prisma/schema/integrations.prisma` |
| IDN | `src/features/cases/`, `src/features/projects/`, `src/features/auth/`, `src/server/actions/`, `prisma/schema/core.prisma`, its migration folders |
| CLK | `src/server/scheduler/`, `src/features/clock/`, `src/features/cases/reducer.ts`, `instrumentation.ts`, `prisma/schema/core.prisma` |
| DIR | `src/server/directory/`, `src/features/directory/`, `prisma/schema/auth.prisma` |
| AIP | `src/server/assist/`, `src/server/brain.ts`, `src/features/routing/`, `services/brain/` |
| ADM | `src/app/(app)/settings/`, `src/components/settings/`, `src/server/actions/settings/` |
| VIS | `src/lib/db/projections/`, `src/features/cases/visibility.ts`, `src/app/(app)/layout.tsx`, `src/app/api/[company]/events/`, `src/server/throttle.ts`, `prisma/schema/core.prisma` |
| NTF | `src/server/notify/`, `src/server/case-notice.ts`, `src/server/loop-notice.ts`, `prisma/schema/integrations.prisma` |
| GDP | `src/features/privacy/`, `src/server/audit/`, `src/features/metrics/` (ranking removal only), `src/app/(app)/admin/audit/`, `prisma/schema/ops.prisma` |
| LOOP | `src/components/ideas/`, `src/components/cases/`, `src/features/ideas/`, `src/config/flags.ts` |
| MET | `src/features/metrics/`, `src/components/dashboard/`, `src/components/feed/` |
| TMS | `src/server/teams/`, `src/app/api/[company]/teams/`, `ops/teams/`, `tests/fake-botframework/` |
| FLR | `src/app/(floor)/`, `src/features/floor/`, `public/manifest.webmanifest` |
| API | `src/app/api/v1/`, `src/server/api/`, `docs/api/` |
| EID | `src/server/identity/`, `src/app/api/scim/`, `src/server/logsink/` |
| SEC | `stack/provision/`, `stack/`, `.github/workflows/`, `docs/compliance/`, `docs/customer/` |
| TST | `tests/e2e/db/`, `tests/load/`, `prisma/generators/musterwerk/` |
| PIL | `src/features/pilot/`, `prisma/generators/`, `docs/pilot/` |
| ITC | `src/features/admin/support-code.ts`, `src/server/actions/support-access.ts`, `prisma/schema/support.prisma` |

### Known overlaps

For the Baupläne of these phases. Each pair has no order between them in PILOT, so their Baupläne must
not run at the same time or must split the files.

- GDP and MET both name `src/features/metrics/`.
- LNG and NTF both name `src/server/case-notice.ts` and `src/server/loop-notice.ts`.
- CON and NTF both name `prisma/schema/integrations.prisma`.

## Consequences

- Phases that own different area files can change the schema in parallel; their migrations are separate folders.
- Comments in `apps/app/src` that still say `prisma/schema.prisma` stay until the phase that next touches that file.
- `tests/unit/contracts/schema-split.test.ts` fails if a model moves to another file or the single file returns.

## Gaps

none
