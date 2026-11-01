# 0006 Config, not code

## Status

Accepted · PILOT/ARC · 2026-11

## Context

What differs between companies (routes, goals, rules, calendars, connectors, flags) must not live in code (D4). An
`if (slug === "acme")` works once and then every new customer is a release.

## Decision

Whatever differs per company is data in the database, scoped by company:

- `CompanyConfig` (`apps/app/prisma/schema/integrations.prisma`): per-company settings.
- `Integration.settings` (same file): which connector a company uses and its settings.
- `FeatureFlag` (`apps/app/prisma/schema/ops.prisma`): switches per company.
- The structure tables (`apps/app/prisma/schema/structure.prisma`): org units, roles, routes.

Code never compares a company slug or id with a literal. Behaviour comes from reading these rows.

**Connectors.** The adapter per connector kind (ADR 0002) and its settings are an `Integration` row of the company.
No row means the connector is absent, not an error (D7). AI is chosen with `AiProviderChoice`; `off` is a setting.

**Secrets.** Tokens, keys and client secrets are never stored in plain settings. They are sealed with
`apps/app/src/features/connectors/vault.ts`; the row holds the sealed value only.

**A new phase that needs a per-company setting** adds a field to the settings of an existing row, or a row in the
tables above, with a default that keeps today's behaviour. Schema changes are proposed to Kevin. The phase reads
the setting where it is needed and does not add a branch on the company.

## Consequences

- A new customer is rows, not a release.
- Every setting needs a default so a company without the row still works.
- Reviewers reject any literal company slug in code.

## Gaps

none
