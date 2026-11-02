---
id: TRUTH-F1
title: Admin actions are written to an append-only audit table instead of the console (GDP's first task)
phase: TRUTH
needs: [ P0 ]
owns:
  - apps/app/prisma/schema/ops.prisma
  - apps/app/prisma/schema/core.prisma                            # back-relation in the ops block of model Company only (HD11)
  - apps/app/prisma/migrations/20261120100000_truth_audit_event/**
  - apps/app/src/features/audit/index.ts                          # new, pure
  - apps/app/src/server/audit/record.ts                           # new
  - apps/app/src/lib/db/audit.ts                                  # new
  - apps/app/src/server/actions/jira-admin.ts
  - apps/app/src/server/actions/m365.ts
  - apps/app/tests/unit/truth/audit.test.ts
  - apps/app/tests/db/truth-audit.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, HD5, HD11, HD14 ]
proofs:
  - id: B1
    says: auditChanges keeps field names with before and after, writes secrets only as set or replaced, and refuses an action outside audit.<area>.<verb>
    run: npm test -w @nextup/app -- tests/unit/truth/audit.test.ts -t 'TRUTH audit shape'
    expect: '[1-9]\d* passed'
  - id: B2
    says: saving the Jira settings, switching M365 search and disconnecting everyone each append one AuditEvent for that company only, and listAudit pages them newest first
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/truth-audit.test.ts -t 'TRUTH audit events'
    expect: '[1-9]\d* passed'
pr_title: "feat(audit): admin actions go to an audit table"
---

# TRUTH-F1 Admin actions are written to an append-only audit table instead of the console

## Goal

Admin actions (Jira settings, sync on/off, webhook secret, removal, M365 search on/off, disconnect everyone) are
logged with `console.info` only, so no company can see who changed what. After this task they are rows in an
append-only `AuditEvent` table, scoped by company, readable by a page later (spec 05 "Audit log"). This is the first
task of PILOT phase GDP pulled forward; the GDP Bauplan adopts it instead of planning it again.

## Context (read first)

- `AGENTS.md`; HD11 and `docs/adr/0007-areas.md` (GDP owns `ops.prisma`; a model with a relation to Company adds its
  back-relation inside the `// -- ops --` block of `model Company` in `core.prisma`, nothing else there).
- `apps/app/src/server/actions/jira-admin.ts` (`who()`, four `console.info` lines), `apps/app/src/server/actions/m365.ts`
  (`adminActor()`, the admin lines; the per-user disconnect line stays a log line).
- The field list in [05-data-protection.md, Audit log](../2026-11-02_pilot-pages/05-data-protection.md#audit-log):
  `id`, `companyId`, `at`, `actorUserId`, `actorKind`, `action`, `targetKind`, `targetId`, `changes`, `source`.
- `apps/app/src/server/actions/admin.ts` is owned by ADM-E1 (personal admins, 2FA): do not edit it here; TRUTH-F2
  wires it later.

## What

- `ops.prisma`: `model AuditEvent` with the fields above (`actorKind`: admin, stack-admin, break-glass, system,
  api-token, directory; `source`: settings, admin, api, directory, scheduler), `@@index([companyId, at])`. No update
  or delete helper anywhere (append-only).
- `features/audit/index.ts` (pure): `AuditAction` type `audit.<area>.<verb>`, `auditChanges(before, after,
  secretFields)` → `{ field: { before, after } }` with secret fields as `"set"` / `"replaced"`, never a value; never
  a personnel number (HD14).
- `lib/db/audit.ts`: `appendAudit(row)` and `listAudit(companyId, { from?, to?, action?, cursor?, take })`.
- `server/audit/record.ts`: `recordAudit(companyId, input)`; a failure to write is logged and never blocks the admin
  action.
- `jira-admin.ts`, `m365.ts`: each admin `console.info` becomes `recordAudit` (`audit.connector.saved`,
  `audit.connector.on` / `off`, `audit.connector.secret`, `audit.connector.removed`, `audit.connector.disconnected`);
  keep a one-line console log without names if the file had one for operations.
- Tests: `tests/unit/truth/audit.test.ts` (`describe("TRUTH audit shape", …)`), `tests/db/truth-audit.test.ts`
  (`describe("TRUTH audit events", …)`).

## Not

- No audit page (Sam, spec 05), no export of the log (EID), no change to `admin.ts` (TRUTH-F2 after ADM-E1), no
  retention run (GDP).

## Constraints

- Edit only the paths in `owns`; in `core.prisma` only the ops block of `model Company`.
- No `git commit`, no installs, no network; do not run `prisma migrate` or the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/truth/audit.test.ts -t 'TRUTH audit shape'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green; Kevin approved the migration.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
