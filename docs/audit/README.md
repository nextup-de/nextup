# Gap register

The gap register lists every gap between `main` and the PILOT pilot target (see
`docs/plans/2026-11-01_pilot-readiness.md`). It is written by plan AUD and read by the phase plans that close the gaps.

## Files

| File | Content | Ids |
|---|---|---|
| `docs/audit/gaps/product.md` | product gaps | `G-001` to `G-199` |
| `docs/audit/gaps/platform.md` | platform gaps | `G-200` to `G-399` |
| `docs/audit/gap-register.md` | index over both files | none |
| `docs/audit/phases.json` | allowed phase ids | none |

Ids are never reused. The parser and checks live in `apps/app/tests/unit/docs/register.ts`.

## Format

One Markdown table per gap file, columns in this order:

```
| id | area | gap | evidence | severity | phase | owner |
```

- **id**: `G-<3 digits>`, inside the range of the file.
- **area**: short topic, free text.
- **gap**: one sentence, what is missing or wrong. Not empty.
- **evidence**: at least one item, several separated by ` · `. An item is a path from the repo root that exists on
  `main`, optionally followed by `:<line>`; a PR number `#<n>`; or a path in another repo written
  `nextup-admin:<path>` or `nextup-infra:<path>` (those are not checked).
- **severity**: `high` blocks a pilot with real data; `medium` is needed before the pilot ends; `low` is nice to have
  or corporate later.
- **phase**: one entry of `phases.json`.
- **owner**: `K`, `S` or `V`.

Example row (shape only, not a real gap):

```
| G-001 | cases | The inbox count ignores handed-over cases. | apps/app/package.json:1 · #245 · nextup-infra:main.tf | high | TST | K |
```
