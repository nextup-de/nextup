---
id: PACK-C1
title: A read-only works-council and DPO role sees aggregates, the audit log and the pack, never case content
phase: PACK
needs: [ PACK-A1, VIS-Z1 ]
owns:
  - apps/app/src/config/roles.ts                                  # Kevin's file: one role
  - apps/app/src/config/nav.ts
  - apps/app/src/lib/db/viewer-log.ts                             # VIS-C1's file: this role gets no case events
  - apps/app/src/app/[company]/(app)/oversight/page.tsx           # new: plain route, Sam designs it
  - apps/app/tests/unit/pack/oversight-role.test.ts
  - apps/app/tests/db/pack-oversight.test.ts
risk: high
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO3, DO5, HD5, HD10 ]
proofs:
  - id: B1
    says: the oversight role may open only the oversight page, the audit log and the pack downloads; canAccess refuses every case, inbox, project and settings route
    run: npm test -w @nextup/app -- tests/unit/pack/oversight-role.test.ts -t 'PACK oversight role'
    expect: '[1-9]\d* passed'
  - id: B2
    says: a member with the oversight role receives no case event from the viewer log and the events endpoint, and can download the pack
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/pack-oversight.test.ts -t 'PACK oversight sees no cases'
    expect: '[1-9]\d* passed'
pr_title: "feat(roles): read-only works-council and DPO role"
---

# PACK-C1 A read-only works-council and DPO role sees aggregates, the audit log and the pack, never case content

## Goal

A works council and a data protection officer need to check the system without reading anyone's ideas. After this
task a company admin can give a member the app role `oversight`, which opens one page with the ZI KPIs and the
answer-time ledger (aggregates with the minimum group of 5), the audit log and the pack downloads, and nothing else.

## Context (read first)

- `AGENTS.md`; CLAUDE.md "Ownership" (`roles.ts` is Kevin's: add one role, do not restructure; risk high).
- `apps/app/src/config/roles.ts` (`ROLE_HOME`, `ROLE_ACCESS`), `config/nav.ts`, `canAccess()`.
- VIS-C1's `lib/db/viewer-log.ts` (what a viewer receives), TRUTH-F1 `listAudit`, BVW-G1 `ziKpis`, PACK-A1/B1
  routes.
- Spec: [11, "Oversight"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#oversight).

## What

- `roles.ts`: role `oversight` with home `/oversight` and access only to `/oversight`, `/settings/audit`,
  `/settings/works-council/*` downloads.
- `nav.ts`: one item for the role.
- `viewer-log.ts`: the role gets an empty log (no case events at all).
- `oversight/page.tsx`: fetch `ziKpis`, the ledger counts and the last 50 audit rows; render with existing
  components only (Sam designs it later, DO5).
- Tests: `tests/unit/pack/oversight-role.test.ts`, `tests/db/pack-oversight.test.ts`.

## Not

- No new members page (assigning the role uses the existing app-role field), no design work.

## Constraints

- Edit only the paths in `owns`. Kevin approves the start.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/pack/oversight-role.test.ts -t 'PACK oversight role'` (≥ 1 passed)
- `npm test -w @nextup/app -- tests/unit/access.test.ts`

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
