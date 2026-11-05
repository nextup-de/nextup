# prisma

The database schema, its migrations and the seed scripts. Postgres, Prisma 7.

```
schema/                one .prisma file per area (Prisma reads the whole folder)
  core.prisma            generator, datasource, Company, CaseEvent, IdeaDraft, IdeaTurn, AssistTurn
  structure.prisma       CompanyProfile, CompanyContextRun, OrgUnit, OrgRole, OrgRoleHolder, RoutingRule, Goal
  auth.prisma            User, ApiToken
  integrations.prisma    CompanyConfig, Connection, Integration, Document
  ops.prisma             FeatureFlag, PilotRequest, PilotReply, Ticket, TicketReply, ErrorGroup
migrations/            one folder per migration: <timestamp>_<phase id lower case>_<what>
seed.ts                demo company rows
bootstrap-company.ts   first real company
```

The connection (`DATABASE_URL`) is in `../prisma7.config.ts`, which points at `prisma/schema`.

## Rules

- A phase changes only the area files its brief names (D5). Which phase may change which file:
  `docs/adr/0007-areas.md`. Relations across files work; a model may reference a model of another area.
- A phase that adds a model with a relation to `Company` adds its back-relation field only inside the
  `// -- <area> --` block of its own area in `core.prisma`, and no scalar column to `Company`.
- Every migration is its own folder under `migrations/`. Never edit one that has been merged.
- Check a change with `npx prisma validate` (run it in `apps/app`).

Model docs: `docs/DATA_MODEL.md`.
