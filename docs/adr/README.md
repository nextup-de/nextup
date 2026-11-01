# Architecture decision records

> **Updated 2026-11-01** · index of the ADRs of PILOT/ARC.

An ADR is one short file that records one architecture decision: what we faced, what we chose, what follows. It
names the code paths it describes as they exist on `main` and the contract names exactly as exported. Files are
`docs/adr/NNNN-<slug>.md`; the names below are fixed.

## Template

```
# NNNN Title

## Status
Accepted · PILOT/ARC · 2026-11

## Context
## Decision
## Consequences
## Gaps
The register ids it answers (docs/audit/gap-register.md), or "none".
```

## Index

| # | Title | File | Written by |
|---|---|---|---|
| 0001 | Canonical model | [0001-canonical-model.md](0001-canonical-model.md) | ARC-A1 |
| 0002 | Connector interfaces | 0002-connector-interfaces.md | ARC-B1 |
| 0003 | API v1 | 0003-api-v1.md | ARC-C1 |
| 0004 | Webhook and outbox | 0004-webhook-and-outbox.md | ARC-C1 |
| 0005 | Event versioning | 0005-event-versioning.md | ARC-C1 |
| 0006 | Config, not code | 0006-config-not-code.md | ARC-B1 |
| 0007 | Areas | 0007-areas.md | ARC-S1 |

Files for ADRs 0002 to 0007 do not exist yet; their tasks write them.

## ARC gaps

Every row of `docs/audit/gaps/*.md` whose phase column is ARC is listed here with the ADR or task that answers it
(D15). A row that no ARC task covers stays listed as open with a reason.

None: on 2026-11-01 no register row has phase ARC (`docs/audit/gap-register.md`, "Gaps per phase").
