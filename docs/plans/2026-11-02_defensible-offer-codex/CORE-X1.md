---
id: CORE-X1
title: A company admin exports the company's data, or one person's, as JSON (GDP)
phase: CORE
needs: [ TRUTH-F1, VIS-Z1 ]
owns:
  - apps/app/prisma/schema/ops.prisma                             # DataExport only
  - apps/app/prisma/schema/core.prisma                            # back-relation in the ops block of model Company only
  - apps/app/prisma/migrations/20261124090000_core_data_export/**
  - apps/app/src/features/privacy/export.ts                       # new, pure
  - apps/app/src/lib/db/privacy.ts                                # new
  - apps/app/src/server/actions/privacy.ts                        # new
  - apps/app/tests/unit/core/export.test.ts
  - apps/app/tests/db/core-export.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, HD5, HD10, HD11, HD14 ]
proofs:
  - id: B1
    says: buildCompanyExport and buildPersonExport keep ids, use ISO dates, leave out drafts of others, sign-in codes, keys and personnel numbers, and a person export holds only that person's rows and events
    run: npm test -w @nextup/app -- tests/unit/core/export.test.ts -t 'CORE export shape'
    expect: '[1-9]\d* passed'
  - id: B2
    says: requestExport by a company admin writes a DataExport row, an audit event and a file that expires after 7 days; a member is refused; another company's admin gets nothing
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/core-export.test.ts -t 'CORE export'
    expect: '[1-9]\d* passed'
pr_title: "feat(privacy): company and person export"
---

# CORE-X1 A company admin exports the company's data, or one person's, as JSON

## Goal

The landing page promises "export of everything at any time"; nothing exports today (G-042). After this task a
company admin can export all company data or one person's data as a JSON file. This is PILOT phase GDP's export task
pulled forward; the GDP Bauplan adopts it.

## Context (read first)

- `AGENTS.md`; the PILOT brief `### GDP` in [build-plans/PILOT.md](../2026-11-02_pilot-pages/build-plans/PILOT.md);
  [05-data-protection.md](../2026-11-02_pilot-pages/05-data-protection.md) "Data and privacy" (the `DataExport` row,
  what an export holds, 7-day expiry) and its open question G1 (default: the admin's copy of an active person leaves
  out drafts and assistant questions).
- VIS's `caseView` / `visibleTo` (after VIS-Z1) for what a person may see; TRUTH-F1's `recordAudit`.
- Schemas: `prisma/schema/*.prisma`; `IdeaDraft`/`IdeaTurn` are private to their author.

## What

- `ops.prisma`: `model DataExport { id, companyId, kind ("company" | "person"), subjectUserId?, requestedByUserId,
  deliverTo ("person" | "admin"), status ("preparing" | "ready" | "expired" | "failed"), sizeBytes?, file Bytes?,
  expiresAt, createdAt }` and the back-relation (HD11).
- `features/privacy/export.ts` (pure): `buildCompanyExport(rows)` and `buildPersonExport(rows, userId)` → one object
  per table, ids kept, dates ISO; never `personnelNumber`, sign-in codes, hashed secrets, vault values, other
  people's drafts.
- `lib/db/privacy.ts`: read the rows for one company (scoped by `companyId`), store and read `DataExport`, expire rows
  past `expiresAt` (delete the file, keep the row as `expired`).
- `server/actions/privacy.ts`: `requestExport(slug, { kind, subjectUserId?, deliverTo })` (company admins only, via
  the settings guard ADM-G1 built), `downloadExport(slug, id)`; each writes an audit event
  (`audit.privacy.exported`, `audit.privacy.downloaded`). Small companies: build synchronously; mark `preparing`
  first so the page can show it.
- Tests `tests/unit/core/export.test.ts` (`describe("CORE export shape", …)`) and `tests/db/core-export.test.ts`
  (`describe("CORE export", …)`).

## Not

- No page (Sam, spec 05), no email (NTF delivers "export ready"), no pseudonymisation (CORE-P1), no retention run
  (GDP).

## Constraints

- Edit only the paths in `owns`. Kevin approves the start (schema).
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/core/export.test.ts -t 'CORE export shape'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
