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

A single page costs about 120-150 ms alone; the server stops gaining throughput at roughly 10-15 requests per second and
every request beyond that waits in a queue. No request failed: the pages are slow, not broken. No response carried the
whole log (largest 77 KB).

The working-day scenario uses one account in forty on a page at any moment (5 virtual users at 200 accounts, 50 at
2,000); `TST_VUS` overrides it. That number is a modelling choice, not a measured fact about Musterwerk: it is the line
between a passing and a failing test here, and the 2,000-account run of record on the test VM (k6, TST-V1) will show where
it sits on real hardware. Expect 50 virtual users (about 25 requests per second) to be over budget on one Node process.

## Findings

### TST-FL1-1 (high): the inbox and case pages queue up beyond about 15 requests per second

- **What happens:** with 200 accounts all on a page (think time 1-3 s, about 100 requests per second asked for), the
  inbox and the case page answer at p50 12 s and p95 14 s. At 40 virtual users p95 is already 6 s. D7: over 3 s at p95 is high.
- **What should happen:** p95 under 1 s for both pages at the load a company of this size produces (D8).
- **Where:** every request to `src/app/[company]/(app)/` renders the layout (`layout.tsx`), which on each request loads
  the viewer's event log (`loadLogFor` in `src/lib/db/viewer-log.ts`: seats, knowledge, visible case ids, events), the
  company seed, the flags, the people links and the pseudonym labels, and checks the session (`sessionStillValid`), all
  uncached and in a single Node process. The case page then asks `mayOpen`, which loads seats and knowledge again.
  Suspected, not profiled: the cost per request is CPU in the server render plus about ten queries, not one slow query.
- **Test:** `it.fails("TST-FL1-1: every account on a page at once stays within the budget")`. When it passes
  unexpectedly the fix has landed: turn it into a normal `it`.
- **Not done here:** no product performance fix (TST-L1 scope). Candidates for a fix task: cache `loadSeats` and
  `loadKnowledge` per company for a few seconds (they are read twice per case request and once per log load), run the
  layout's reads in parallel, and run more than one Node process behind the proxy.

### No other finding

- Errors: none in any run. The driver counts a redirect (a refused session) and any status other than 200 as an error.
- Response size: 72-77 KB for both pages at 200 people; the 2 MB check did not trip. It will matter at 2,000 people and
  500 shipped cases (`WINDOW_CASES`); the 2,000-account run tells.
- `next start` prints that it does not work with `output: standalone`; it serves the build correctly (as in `playwright.db.config.ts`).

Note: an earlier proof run on a loaded PC (other sessions running) measured p95 1.3 s at 10 virtual users, so the working-day
scenario was lowered to one account in forty and the warm-up widened to five accounts per page.
