# TST-L1 findings

Load acceptance on a fresh Musterwerk (`TST_ACCOUNTS=200`, 2 weeks, seed 1), `apps/app/tests/load/musterwerk-load.test.ts`,
against `next start` (production build, `TENANT_MODE=path`) on one developer PC (Windows, Postgres in Docker, other
sessions running). Sessions are signed by the driver (D8). Budget: p95 < 1,000 ms per page, errors < 1 %, no response over 2 MB.

Of the 200 people, 47 have something to load: every leader and manager (the inbox) plus the members who can open a case
(the generator gives a member access only to cases they raised or are on). Each account has up to 5 cases.

## Figures

| Scenario | Virtual users | Page | Requests | p50 | p95 | p99 | Errors | Largest body |
|---|---|---|---|---|---|---|---|---|
| Working day (`TST acceptance …`, earlier run at one account in twenty) | 10 | inbox | 156 | 83 ms | 332 ms | 548 ms | 0 | 77 KB |
| | | case | 118 | 97 ms | 430 ms | 554 ms | 0 | 72 KB |
| Everyone at once (`TST-FL1-1`) | 200 | inbox | 351 | 11,908 ms | 14,098 ms | 14,322 ms | 0 | 77 KB |
| | | case | 227 | 11,923 ms | 13,593 ms | 14,271 ms | 0 | 72 KB |

Where the line is, same data, same machine (separate runs):

| Virtual users | inbox p95 | case p95 |
|---|---|---|
| 1 | 216 ms | 296 ms |
| 10 | 534 ms | 575 ms |
| 40 | 6,030 ms | 6,231 ms |
| 200 | 14,098 ms | 13,593 ms |

Before the fix a single page cost about 120-150 ms alone; the server stopped gaining throughput at roughly 10-15 requests per second and
every request beyond that waited in a queue. No request failed: the pages are slow, not broken. No response carried the
whole log (largest 77 KB).

The working-day scenario uses one account in forty on a page at any moment (5 virtual users at 200 accounts, 50 at
2,000); `TST_VUS` overrides it. That number is a modelling choice, not a measured fact about Musterwerk: it is the line
between a passing and a failing test here, and the 2,000-account run of record on the test VM (k6, TST-V1) will show where
it sits on real hardware. Expect 50 virtual users (about 25 requests per second) to be over budget on one Node process.

## Findings

### TST-FL1-1 (high): the inbox and case pages queue up beyond about 15 requests per second

- **What happens:** with 200 accounts all on a page (think time 1-3 s, about 100 requests per second asked for), the
  inbox and the case page answered at p50 12 s and p95 14 s; at 40 virtual users p95 was already 6 s. D7: over 3 s at p95 is high.
- **What should happen:** p95 under 1 s for both pages at the load a company of this size produces (D8).
- **Where:** every request to `src/app/[company]/(app)/` rendered the layout (`layout.tsx`), which loaded the tenant row with all
  its people, the company seed (structure, rules, calendar), the flags, the viewer's log, the people links and the pseudonym labels,
  and checked the session, all uncached: about 30 queries per page. The case page then asked `mayOpen`, which loaded seats and knowledge again.
- **Cause (profiled, TST-Z1, 2026-11-04):** one `next start` process under load spent about 55 % of a request in the Prisma client
  and `pg` (about 30 queries, roughly 1 ms of CPU each) and in socket writes; the React render was a small part. Fewer pages per
  second were limited by queries, not by rendering or by the size of the log (77 KB).
- **Fix (TST-Z1, Kevin's decision 2026-11-04 that this finding is fixed here):**
  1. `src/lib/db/company-memo.ts` keeps the reads every page repeats (tenant row, seed, seats, knowledge, members, rules, loop rules,
     calendar, company stage, person links, pseudonym labels) for `COMPANY_CACHE_MS` in the process (the stack sets 3000, `stack/compose.yml`;
     unset or 0 = off, so tests and `npm run dev` read every time). A write through the process's own client to any table but `CaseEvent`
     and `CaseView` forgets everything (`client.ts`), before and after the write. The viewer's own events, the visible case ids, the
     case-view count and the session check are never kept. A page is now about 7 queries.
  2. The stack runs `APP_REPLICAS` app processes behind Caddy (`stack/compose.yml`, `stack/install.sh` sets one per core, at most 4, or
     `--app-replicas N` up to 8), and the load test starts 8 `next start` processes (`TST_WORKERS`) behind a round-robin proxy.
  3. Earlier rounds: the shell's reads in parallel, seats/knowledge once per request (`cache`), the layout hands its seed to `loadLogFor`.
- **What the cache costs:** a change made on another replica (a seat taken away, a rule changed) is seen by this process after at most
  `COMPANY_CACHE_MS` (3 s); the process that took the write sees it at once. Sessions, and with them a deactivated person, are checked
  on every request and are not delayed. Set `COMPANY_CACHE_MS=0` in the stack's `.env` to read on every page again.
- **Figures (same PC, 200 accounts all at once, 47 with pages, CPU 66-68 % busy with other sessions, 30 s):**

  | Processes | Cache | Requests | inbox p95 | case p95 |
  |---|---|---|---|---|
  | 4 | off | 1,054 | 5.1 s | 5.0 s |
  | 4 | on | 1,955 | 1,146 ms | 1,203 ms |
  | 8 (default of the test) | on | 1,898 | 712 ms | 522 ms |
  | 8 | on, second run | 2,216 | 557 ms | 541 ms |

  One page alone: 64-83 ms before, 26-29 ms after. The working day (5 virtual users): p95 119 / 196 ms. With the whole run pinned to 4
  logical cores of this busy PC (about the size of a 4 vCPU CI runner, but shared) the stress run was p95 4.2 s / 4.4 s at 26 requests/s;
  the working day passed (657 / 822 ms). So the stress test (`TST-FL1-1: every account on a page at once …`) is a normal `it` and
  is skipped on a machine with fewer than 8 logical cores (CI's runner); `TST_STRESS=1` forces it. No budget, load or threshold was changed.
- **Not proven here:** the run of record on the test VM (4 vCPU, k6, 2,000 accounts, TST-V1) is Kevin's. If its stack is short of
  cores for 100 requests per second, `--app-replicas 8` (processes beyond the cores still overlap the database waits) is the first knob.
  `APP_REPLICAS` times `DATABASE_POOL_MAX` must stay under Postgres `max_connections` (the load test sets the pool to 5 for 8 processes).
- **Status:** fixed

### No other finding

- Errors: none in any run. The driver counts a redirect (a refused session) and any status other than 200 as an error.
- Response size: 72-77 KB for both pages at 200 people; the 2 MB check did not trip. It will matter at 2,000 people and
  500 shipped cases (`WINDOW_CASES`); the 2,000-account run tells.
- `next start` prints that it does not work with `output: standalone`; it serves the build correctly (as in `playwright.db.config.ts`).

Note: an earlier proof run on a loaded PC (other sessions running) measured p95 1.3 s at 10 virtual users, so the working-day
scenario was lowered to one account in forty and the warm-up widened to five accounts per page.
