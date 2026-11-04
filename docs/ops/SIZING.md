# Sizing: how many people one stack carries

One stack is one company (`stack/compose.yml`). This page says what a stack is sized for, on which VM, and
when to move up. Gaps G-239 (no users-per-stack figure) and G-241 (Postgres on defaults); decision TST/D11.

## Users per stack

**Up to 2,000 people in one company per stack.** More than that is a second conversation, not a bigger
default. The figure is what the design is sized to, not yet a measured result on the VM (see the VM row below).

## VM size

**4 vCPU, 16 GB RAM, 160 GB SSD**, one plain Linux VM with Docker Engine (`stack/remote/README.md`). The
database gets about a third of the RAM; the app, Caddy and the OS keep the rest. This is an assumption: the
question TST/Q1 was not in the repository when this was written. If Kevin sets another VM, change the numbers
below together.

## Postgres settings

Set in `stack/compose.yml`, service `db` (`command`). Image and volumes are unchanged.

| Setting | Value | Why |
|---|---|---|
| `shared_buffers` | 4GB | About 25 % of RAM, the usual starting point; the OS cache holds the rest of the hot data. |
| `effective_cache_size` | 10GB | The planner's estimate of all cache (buffers plus OS cache). Allocates nothing; a low value pushes it off indexes. |
| `work_mem` | 16MB | Per sort or hash node and connection. The inbox and case reads sort small sets; 16 MB times the busy connections stays well under 1 GB. |
| `maintenance_work_mem` | 512MB | Index builds, VACUUM and the backup restore-test run one at a time. |
| `max_connections` | 100 | The app pool (`DATABASE_POOL_MAX`, default 10) plus migrate, backup and 10 spare, with room for a second app instance. Instances times pool size must stay under this. |
| `random_page_cost` | 1.1 | SSD: random reads cost almost what sequential ones do. |

There is no connection pooler (G-240, VIS). `stack/tests/postgres-settings.test.sh` checks the values in a running
container and that `max_connections` covers the pool.

## Load figures

CI database, one Node process, `TST_ACCOUNTS=200` (TST-L1, `docs/test-phase/findings/TST-L1.md`):

| Accounts | Virtual users | inbox p95 | case p95 | Errors |
|---|---|---|---|---|
| 200 | 10 | 534 ms | 575 ms | 0 |
| 200 | 40 | 6,030 ms | 6,231 ms | 0 |
| 200 | 200 | 14,098 ms | 13,593 ms | 0 |

A single page costs about 120-150 ms alone; one Node process stops gaining throughput at roughly 10-15 requests per
second. The cost is CPU in the server render, not Postgres settings (TST-FL1-1). Budget (D8): p95 < 1,000 ms, errors < 1 %.

Test VM (4 vCPU / 16 GB), 2,000 accounts:

| Accounts | Virtual users | inbox p95 | case p95 | Errors |
|---|---|---|---|---|
| 2,000 | | | | filled from docs/test-phase/results after Kevin's run |

## App processes

`APP_REPLICAS` in the stack's `.env` (default 1; `install.sh` writes one per CPU core, at most 4, or `--app-replicas N`) sets how many
app containers run; Caddy spreads requests over them. Each has its own pool of `DATABASE_POOL_MAX` connections, so replicas times pool
plus 12 must stay under `max_connections`. Change it with `ctl.sh <slug> up -d` after editing the `.env`.
`COMPANY_CACHE_MS` (default 3000 in `compose.yml`; 0 = off) keeps the company's structure, seats, rules and tenant row in each process for that
many milliseconds instead of reading them on every page: about 30 queries per page became a handful. A change made on another process
shows within that time; the process that took the write sees it at once.
200 accounts all at once on a shared PC (TST-L1): 4 processes without the cache p95 5.1 s; 8 processes with it p95 0.56 s (inbox) and 0.54 s (case).
Processes beyond the cores still help, because half of a page is waiting for Postgres.

## When to size up

- Pages are over budget (p95 > 1,000 ms) and Postgres is not the cause: add app processes first, not RAM.
- Active connections stay near `max_connections` (`SELECT count(*) FROM pg_stat_activity`): add a pooler (G-240) before raising it.
- Cache hit ratio below 99 % on a steady day, or the database larger than `shared_buffers` plus about half the free RAM: move to 32 GB and set `shared_buffers` 8GB, `effective_cache_size` 20GB.
- More than 2,000 people, or a second app instance: recompute `max_connections` as instances times pool plus 20.
