# 0005 Event versioning

## Status

Accepted · PILOT/ARC · 2026-11

## Context

Internally, `CaseEvent.type` (`CaseEventType` in `apps/app/src/features/cases/events.ts`) has many types and
payloads that serve the reducer and change with the product. Customers' systems must not break when that happens
(D3). The public event therefore needs its own small vocabulary and version.

## Decision

- **Two vocabularies**: internal `CaseEvent.type` is private and may change. Public `PublicEventType`
  (`PUBLIC_EVENT_TYPES` in `packages/contracts/src/public/events.ts`) is `case.raised`, `case.handed`,
  `case.answered`, `case.decided`, `project.started`, `project.done`, `project.stopped`.
- **Derivation**: a `PublicEvent` is a projection of an internal `CaseEvent`, never the raw row. A mapper picks the
  internal types that have a public counterpart (for example a `case.decided` with `projectId` also yields
  `project.started`), copies only the fields of the public `data` for that `typeVersion`, and replaces names with
  ids: `actor` is `{ userId, roleId }` and `subject` is `{ kind, id }`. Display names never appear (D9), and no
  per-person count, score or rank (D6).
- **Extension (allowed, same `typeVersion`)**: a new optional field in `data`; a new event type. Receivers ignore
  unknown fields and unknown types.
- **New version (`typeVersion` + 1)**: renaming, removing or retyping a `data` field, making an optional field
  required, or changing the meaning of a type. The event is delivered in both versions next to each other until the
  old one is retired (D3).
- **Choosing a version**: a subscription (ADR 0004) states the version per event type it wants; default is the
  lowest. `typeVersion` is on every `PublicEvent` so a receiver can branch.

## Consequences

- The internal reducer and event types can change without a customer notice, as long as the mapper keeps each
  public version stable.
- Every new `typeVersion` costs a mapper and a fixture per version; this is deliberate friction.
- A new envelope shape is a new `specVersion` (ADR 0004), not a new `typeVersion`.

## Gaps

none
