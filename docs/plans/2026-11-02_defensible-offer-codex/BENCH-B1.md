---
id: BENCH-B1
title: A company opts in, exports its contribution and imports the published benchmark
phase: BENCH
needs: [ BENCH-A1 ]
owns:
  - apps/app/src/lib/db/bench.ts                                  # new: CompanyRule keys bench_classes, benchmark_published
  - apps/app/src/server/actions/bench.ts                          # new
  - apps/app/src/app/[company]/(app)/settings/benchmark/contribution/route.ts   # new: GET download
  - apps/app/tests/db/bench-optin.test.ts
risk: normal
budget: { minutes: 150 }
executor: codex-local
uses: [ DO1, DO3, HD4 ]
proofs:
  - id: B1
    says: a company admin maps routes to decision classes, opts in, downloads a contribution with no id, name or slug in it, imports a published benchmark file that is validated and stored, and benchmarkView compares the company with suppressed cells hidden; without consent the download is refused; every step writes an audit event
    run: DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh tests/db/bench-optin.test.ts -t 'BENCH opt-in'
    expect: '[1-9]\d* passed'
pr_title: "feat(bench): opt-in, contribution and published benchmark"
---

# BENCH-B1 A company opts in, exports its contribution and imports the published benchmark

## Goal

Stacks are separate per company (HD6), so no stack sees another's data. After this task a company admin opts in,
maps routes to decision classes, downloads the company's anonymised contribution, and later imports the benchmark
NextUp publishes; the company then sees its position. Collecting and publishing happens outside this repo (DQ6).

## Context (read first)

- `AGENTS.md`; BENCH-A1 `contributionFrom`, `aggregate`, `compare`; PROOF-D1 `loadOutcomeConsent`,
  `rebuildOutcomes`; TRUTH-F1 `recordAudit`; `CompanyRule`.
- Spec: [11, "Benchmark"](../2026-11-02_pilot-pages/11-defensible-offer-pages.md#benchmark).

## What

- `lib/db/bench.ts`: route-to-class map (`bench_classes`), the stored published file (`benchmark_published`, ≤ 200 KB,
  validated: version, period, cells only).
- `server/actions/bench.ts`: `saveBenchClasses`, `importBenchmark(slug, text)`, `benchmarkView(slug)`; audit
  `audit.privacy.bench.*`. Consent itself is PROOF-D1's action.
- Route `settings/benchmark/contribution/route.ts`: `GET` → JSON attachment; refused without consent; runs
  `rebuildOutcomes` first.
- Test `tests/db/bench-optin.test.ts`, `describe("BENCH opt-in", …)`.

## Not

- No page (Sam), no network call to NextUp (the admin sends the file), no central aggregation.

## Constraints

- Edit only the paths in `owns`. No `git commit`, no installs, no network; do not run the DB proof.

## Verify before you finish

- `npm run lint && npm run typecheck && npm test -w @nextup/app`

## Done when

- B1 red on `main`, green on the branch; lint, typecheck, test, build green.

## Final report

End with JSON matching `docs/plans/2026-11-02_defensible-offer-codex/task-result.schema.json`.
