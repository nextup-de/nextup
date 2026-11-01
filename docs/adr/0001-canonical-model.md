# 0001 Canonical model

## Status

Accepted · PILOT/ARC · 2026-11

## Context

NextUp integrates into the customer's systems instead of building a parallel one (D2). Entra ID, SCIM
directories, Jira, Teams and the rest each describe people, units and work in their own words. Every adapter
that maps straight onto NextUp's tables would tie the core to one system. We need one small vocabulary that
every connector, the API and the webhooks speak, independent of Prisma and of any vendor.

Two rules shape it. Roles, not people (D6): routing goes to roles and no public schema carries a per-person
count, score or rank. People are identified by user id and role holder only (D9): `Person.displayName` and
`RoleHolder.label` are for display and are never compared or used as keys.

## Decision

The canonical model is exported from `@nextup/contracts/public` (`packages/contracts/src/public/model.ts`) as zod
schemas, each with an inferred type of the same name. Every object has `id` and `companyId`; every field is
required, optional values are `| null`. Ids are `PublicId`. It changes only by D3.

| Schema | Fields (besides `id`, `companyId`) |
|---|---|
| `Person` | `displayName` 1-120, `email` (or null), `locale` (`Locale` or null), `active`, `managerId` (or null), `orgUnitIds`, `externalIds` |
| `OrgUnit` | `key` 1-32, `name` 1-120, `kind` board/dept/team/site, `parentId` (or null), `externalIds` |
| `Role` | `key` 1-64, `title` 1-120, `orgUnitId` (or null), `reportsToRoleId` (or null) |
| `RoleHolder` | `roleId`, `userId` (or null), `label` 1-120, `kind` holder/deputy, `validFrom`, `validTo` (`IsoDateTime` or null) |
| `CaseRef` | `kind` problem/idea, `title` 1-200, `state` open/decided/closed, `ownerRoleId` (or null), `routeKey` (or null), `raisedAt`, `url` (or null) |
| `Decision` | `caseId`, `answer` yes/no, `reason` max 2000 (or null), `decidedAt`, `decidedByRoleId` (or null), `decidedByUserId` (or null), `projectId` (or null) |
| `ProjectRef` | `caseId` (or null), `title` 1-200, `state` planned/running/done/stopped, `leadRoleId` (or null), `links`: list of `{ system, key (or null), url }` |

Shared primitives (`primitives.ts`): `PUBLIC_CONTRACT_VERSION`, `PublicId`, `IsoDateTime`, `Url`, `Locale`,
`ExternalIds` (the id of the same thing in another system, e.g. `{ "entra": "<object id>" }`), `CLASSIFICATIONS`
and `Classification` (same values as `apps/app/src/features/assist/classify.ts` `LEVELS`).

### Mapping to today's code

| Canonical | Today |
|---|---|
| `Person` | Prisma `User` (someone who can sign in) |
| `OrgUnit` | Prisma `OrgUnit` |
| `Role` | Prisma `OrgRole` (`reportsToId` becomes `reportsToRoleId`) |
| `RoleHolder` | Prisma `OrgRoleHolder` (`name` becomes `label`; `userId` null = a seat without login) |
| `CaseRef` | the `case.*` events of `CaseEvent` (`apps/app/src/features/cases/events.ts`); `state` is `decided` after `case.decided`, `closed` after `case.shipped` or `project.stopped` |
| `Decision` | `case.decided` |
| `ProjectRef` | the `project.*` events and `project.linked` (`links`) |

The mapping is conceptual: nothing in `apps/app/src` imports the public module yet (D10).

### Check against real directories

- **Microsoft Entra ID (Graph)**: `user` gives `displayName`, `mail`, `preferredLanguage`, `accountEnabled`
  (`active`), `manager` (`managerId`) and the object id (`externalIds.entra`); `group` maps to `OrgUnit` and
  `memberOf` to `Person.orgUnitIds`. Entra has no role-holder concept; roles come from NextUp's org chart.
- **SCIM 2.0 core (RFC 7643)**: `User` gives `displayName`, `emails`, `locale`, `active` and `externalId`; `Group`
  maps to `OrgUnit`; the enterprise extension gives `manager` (`managerId`) and `department` (an `OrgUnit` key).
  Multi-valued `emails` is reduced to the primary one.

Both fit without a new field.

## Consequences

- Adapters translate to and from these schemas; the core never sees a vendor shape.
- Extending is cheap (optional fields), changing is a new version (D3).
- Not modelled yet: the STR tables (areas and the split of the schema, ARC-S1 and phase STR) and the IDN ids
  (stable user and role-holder ids across sign-in providers, phase IDN). `Decision` carries no outcome measures and
  `ProjectRef` no steps; events, webhook and API v1 arrive with ARC-C1.
- Display names must never be matched; consumers use `id`, `userId` and `roleId`.

## Gaps

none
