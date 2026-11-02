---
id: TRUTH-F2
title: Admin sign-in and break-glass are audit events
phase: TRUTH
needs: [ TRUTH-F1, ADM-E1 ]
owns:
  - apps/app/src/server/actions/admin.ts
  - apps/app/tests/db/truth-audit-admin.test.ts
risk: high
budget: { minutes: 60 }
executor: codex-local
uses: [ DO1 ]
proofs:
  - id: B1
    says: a named stack admin's sign-in and a break-glass use of the shared code each append one AuditEvent (audit.access.signin, audit.access.breakglass) with no code or password in changes
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/truth-audit-admin.test.ts -t 'TRUTH audit admin access'
    expect: '[1-9]\d* passed'
pr_title: "feat(audit): admin sign-in and break-glass are audited"
---

# TRUTH-F2 Admin sign-in and break-glass are audit events

## Goal

After ADM-E1, `/admin` opens for named admins with a second factor and the shared code is a logged break-glass; the
log is still a console line. After this task both are `AuditEvent` rows, so the company's audit log shows every time
someone opened its admin.

## Context (read first)

- `AGENTS.md`; TRUTH-F1's `server/audit/record.ts`, `features/audit/index.ts`.
- `apps/app/src/server/actions/admin.ts` as ADM-E1 left it (sign-in, break-glass, `console.info`).
- [ADM-E1](../2026-11-02_pilot-pages/build-plans/ADM/tasks/ADM-E1.md) for the names it introduced.

## What

- In `admin.ts`, next to each sign-in and break-glass log line, `recordAudit` with `actorKind` `stack-admin` or
  `break-glass`, action `audit.access.signin` or `audit.access.breakglass`, `source: "admin"`, the company the admin
  opened (or one row per company for a stack-wide sign-in, whichever ADM-E1's model gives; ask if neither fits).
- New DB test `tests/db/truth-audit-admin.test.ts`, `describe("TRUTH audit admin access", …)`.

## Not

- No change to how sign-in works (ADM-E1), no page.

## Constraints

- Edit only the paths in `owns`. If ADM-E1 is not merged, stop with `status: "blocked"`.
- No `git commit`, no installs, no network.

## Verify before you finish

- `npm run lint && npm run typecheck && npm test -w @nextup/app`

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
