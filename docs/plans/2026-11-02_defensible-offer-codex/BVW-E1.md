---
id: BVW-E1
title: Premium rules are stored per company and a reward's amount comes from the formula
phase: BVW
needs: [ BVW-D1, AIP-C1 ]
owns:
  - apps/app/src/lib/db/premium.ts                                # new
  - apps/app/src/server/actions/premium.ts                        # new
  - apps/app/src/features/premium/stamp.ts                        # new, pure
  - apps/app/src/server/actions/events.ts                         # one call: stamp project.rewarded
  - apps/app/tests/unit/bvw/premium-stamp.test.ts
  - apps/app/tests/db/bvw-premium.test.ts
risk: normal
budget: { minutes: 120 }
executor: codex-local
uses: [ DO1, DO2, HD4 ]
proofs:
  - id: B1
    says: stampReward replaces any amount the client sent with premiumFor over the project's verdict, saving and authors, and adds the rule and its parts to the payload
    run: npm test -w @nextup/app -- tests/unit/bvw/premium-stamp.test.ts -t 'BVW premium stamp'
    expect: '[1-9]\d* passed'
  - id: B2
    says: savePremiumRule stores a valid rule under CompanyRule premium with an audit event, refuses an invalid one, and a project.rewarded appended through the action carries the computed amount
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bvw-premium.test.ts -t 'BVW premium stored'
    expect: '[1-9]\d* passed'
pr_title: "feat(premium): store the rule and compute the reward on the server"
---

# BVW-E1 Premium rules are stored per company and a reward's amount comes from the formula

## Goal

Each company sets its works agreement's premium rule once; when a manager records a reward, the server computes the
amount with BVW-D1's formula, whatever the browser sent. The money number never comes from a person's typing or from
a model (DO2).

## Context (read first)

- `AGENTS.md`; BVW-D1 `features/premium/formula.ts`; `apps/app/src/server/actions/events.ts` (after AIP-C1: the
  permission check and `stampEvent` before append), `apps/app/src/features/cases/stamp.ts` (the pattern);
  `apps/app/src/features/projects/reduce.ts` (`reward`, `measures`, `verdict`, authors by id).
- `CompanyRule` (key `premium`, JSON); TRUTH-F1 `recordAudit`.

## What

- `lib/db/premium.ts`: `loadPremiumRule(companyId)` (falls back to `fromRewardRule` of the company's loop rules) and
  `savePremiumRule(companyId, rule, by)`.
- `server/actions/premium.ts`: `savePremiumRuleAction(slug, rule)` for company admins, audit
  `audit.settings.premium`.
- `features/premium/stamp.ts`: `stampReward(payload, project, rule)` → `{ rule: rule.kind, amount, lines, parts }`;
  the first-year saving comes from the project's measured change in euros when its metric unit is €, else from the
  committee's `savingEur` (BVW-C1) when present, else null.
- `events.ts`: for `project.rewarded`, call `stampReward` after the permission check (one call, nothing else).
- Tests: `tests/unit/bvw/premium-stamp.test.ts`, `tests/db/bvw-premium.test.ts`.

## Not

- No page (Sam, spec 11), no premium letter text (Sam renders it from the payload), no payroll file (BVW-F1).

## Constraints

- Edit only the paths in `owns`. If `events.ts` changed since AIP-C1, rebase and keep every existing call.
- No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck`
- `npm test -w @nextup/app -- tests/unit/bvw/premium-stamp.test.ts -t 'BVW premium stamp'` (≥ 1 passed)

## Done when

- B1, B2 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
