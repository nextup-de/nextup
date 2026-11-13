# Test phase (plan TST): where the exit criteria stand

The exit criteria of gate G4 are in `docs/plans/2026-11-01_pilot-readiness.md` (§ Test phase exit criteria). This page lists
each with the test or drill that proves it and its result (D12). Medium and low findings and wishes are in `LATER.md` (D2).
Findings: `findings/<task>.md`. A high finding is open until its section says `- **Status:** fixed`.

**Status 13 Nov 2026: 0 of 8 signed off.** Criteria 1, 3 and 5 hold on their proofs and wait for Kevin's signature.
Criteria 2 and 6 wait for the test server (`tst.sellux.ch` is not set up), 4 for a live re-run, 7 for a pentest or
ZAP cycle, 8 for two weeks of internal use. The overview of all three pilot tracks is in
`docs/plans/2026-11-01_pilot-readiness.md` § "Where it stands".

## Exit criteria

| # | Criterion | Proof | Result |
|---|---|---|---|
| 1 | All suites green in CI, including DB tests and the brain eval | CI jobs `ci`, `db-tests`, brain eval; locally `npm run lint && npm run typecheck && npm test && npm run build` and `DATABASE_URL=…_test bash ops/test-db.sh` | green on this branch's base |
| 2 | 2,000 accounts: p95 below 1 s for inbox and case pages; no page loads the whole log | `tests/load/musterwerk-load.test.ts` (Node driver, CI) and k6 on the test VM (TST-V1) | holds on a developer PC for 200 accounts all at once: inbox p95 557 ms, case p95 541 ms (8 processes, `COMPANY_CACHE_MS=3000`); working day p95 119 / 196 ms; no response over 79 KB. TST-FL1-1 fixed, see `findings/TST-L1.md`. The all-at-once run is skipped on a machine with fewer than 8 logical cores (CI). The 2,000-account k6 run of record on the VM is Kevin's |
| 3 | Every deadline, deputy hand-over, check-in and measure fires on the real clock | `tests/db/tst-core.test.ts` (`TST core loop`), including weekend and Bavarian holiday | holds (TST-S1: 12/12) |
| 4 | 21/21 ground-truth questions in the M365 test tenant; no document visible without access | `tests/db/tst-integrations.test.ts` (recorded Graph, 21 questions, `canRead` cross-check) | holds in the recorded run (TST-I1). Live on Musterwerk (9 Nov, `findings/TST-M365-LIVE.md`): 12 of 21, 0 leaks, 5 not run because Ben's and Fiona's accounts need MFA |
| 5 | A member sees only what their role may see, tested on the server | `tst-core.test.ts` (access and decision log), `tests/e2e/db/visibility.spec.ts`, and `musterwerk.spec.ts` (`TST acceptance`, other unit gets no case) | holds |
| 6 | Restore from the off-box backup within the written RTO; one on-prem install from scratch | `backup.sh <slug> restore-test` against `RTO_SECONDS` of `docs/ops/RPO_RTO.md`, and `stack/tests/install-clean.sh`, both by `ops/tst/vm-run.sh` / `RUNBOOK.md` (TST-V1) | not yet run: Kevin runs the script; `results/` is empty |
| 7 | No open finding rated high from the pentest or ZAP cycle | Kevin (pentest, ZAP); in-repo findings: `tests/unit/tst/findings.test.ts` | in-repo: green, no high finding open; pentest: Kevin's |
| 8 | Two weeks of internal real-time use without a data-loss or access bug | Kevin | Kevin's item, not started |

## The proofs

- `apps/app/tests/e2e/db/musterwerk.spec.ts`, `TST acceptance: Musterwerk scenario suite`: a small Musterwerk (80 people) is
  generated, then through the browser a member raises a case, the owner desk asks and decides, the member answers, a deputy
  sees a handed-over case, a manager sees the dashboard with small units hidden ("Too few to show"), a member of another unit
  cannot open the case.
- `apps/app/tests/unit/tst/findings.test.ts`, `TST findings`: reads the findings files and the `it.fails` scenarios (D7).
  It is red while a high finding is open or a high finding's scenario is still `it.fails`.

Run the spec locally with the database suite's environment (`DATABASE_URL` of a `*_test` database, `AUTH_SECRET`,
`ADMIN_ACCESS_CODE`, `CONNECTOR_VAULT_KEY`) and `npx playwright test -c playwright.db.config.ts tests/e2e/db/musterwerk.spec.ts -g 'TST acceptance'`.

### Remote mode

The same flows run against a stack with `TST_BASE_URL`, on a company the generator already made:

| Variable | Meaning |
|---|---|
| `TST_BASE_URL` | the stack's URL, no trailing slash |
| `TST_SLUG` | the company's slug. A stack runs `TENANT_MODE=single`, so its paths carry no slug; `TST_TENANT_MODE=path` is for a path-mode server |
| `TST_CODES_FILE` | the generator's `--codes` file (`email<TAB>code`) |
| `DATABASE_URL` | the SSH tunnel to the stack's Postgres: the spec reads who holds which seat; it writes nothing there |

The generator must have run for at least 40 people, with the default `maintenance` route. A remote run leaves the company and
adds one case. With `TST_BASE_URL` set, Playwright's config starts no local server.
The VM runbook is `RUNBOOK.md`; set these variables from it.

## Latest VM results

None yet: `ops/tst/vm-run.sh` writes `results/<date>.md` when Kevin runs it.

## Kevin's items

- Pentest and ZAP cycle: no open high finding.
- Two weeks of internal real-time use without a data-loss or access bug.
- The VM run of record (2,000 accounts with k6, restore test against the RTO, on-prem install drill) and the live M365 tenant.
- TST-FL1-1 is fixed on a developer PC. On the VM, run the 2,000-account k6 as in `RUNBOOK.md`; if the 4 vCPU stack falls short of 100 requests per second, install with `--app-replicas 8`.
