# @nextup/contracts

Zod schemas and TypeScript types that two sides agree on. Schemas only, no secrets.

## Two export paths

| Path | For | Files |
|---|---|---|
| `@nextup/contracts` | the message formats between a company stack and admin.sellux.ch (tickets, logins, health, flags, errors) | `src/*.ts` |
| `@nextup/contracts/public` | PILOT's public contracts: the canonical model, the connector interfaces, and later events, webhook and API v1 | `src/public/**` |

The root export is not touched by the public one. Names do not overlap: the root does not export `Person`.

## The rule for public contracts (D3)

Public contracts are only extended, never broken. Allowed: a new optional field, a new export, a new optional
interface member. Anything else (rename, remove, make required, narrow a type) is a new version that runs next to
the old one. Every file under `src/public/` says so in its first comment.

Other rules for `src/public/`: `import { z } from "zod"`, a schema and its inferred type share one name, every
exported name is unique across all public modules, no `node:*`, no `next/*`, no imports from `apps/`.

## Fixtures (D12)

`fixtures/<area>/<Schema>.<case>.json`, where `<area>` is one of `base`, `model`, `connectors`, `events`,
`webhook`, `api-v1`, `<Schema>` is the exact name of a zod schema exported from `@nextup/contracts/public` and
`<case>` is lowercase letters, digits and hyphens. Made-up data only.

- Every fixture is accepted by its schema.
- Every zod schema exported from `@nextup/contracts/public` has at least one fixture.
- Inputs that must be rejected are written inline in the test, never as fixture files.
- `apps/app/tests/unit/contracts/fixtures.ts` loads them.

## Decisions

Architecture decisions live in [`docs/adr/`](../../docs/adr/README.md); the canonical model is
[ADR 0001](../../docs/adr/0001-canonical-model.md).
