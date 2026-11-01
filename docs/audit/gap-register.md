# Gap register

> **Updated 2026-11-01.** The gap register lists every gap between `main` and the pilot target of
> `docs/plans/2026-11-01_pilot-readiness.md`, one row per gap with severity, fixing phase and owner. Format:
> [README.md](README.md).

## Gaps per phase

| phase | high | medium | low | total |
|---|---|---|---|---|
| AUD | 0 | 2 | 0 | 2 |
| ARC | 0 | 0 | 0 | 0 |
| OPS | 7 | 13 | 1 | 21 |
| STR | 3 | 2 | 0 | 5 |
| LNG | 1 | 0 | 0 | 1 |
| CON | 0 | 3 | 0 | 3 |
| IDN | 4 | 0 | 0 | 4 |
| CLK | 2 | 0 | 0 | 2 |
| DIR | 3 | 0 | 0 | 3 |
| AIP | 0 | 6 | 0 | 6 |
| ADM | 2 | 3 | 0 | 5 |
| VIS | 1 | 3 | 0 | 4 |
| NTF | 0 | 3 | 0 | 3 |
| GDP | 4 | 1 | 0 | 5 |
| LOOP | 0 | 2 | 0 | 2 |
| MET | 0 | 3 | 0 | 3 |
| TMS | 0 | 1 | 0 | 1 |
| FLR | 0 | 2 | 0 | 2 |
| API | 0 | 4 | 0 | 4 |
| EID | 0 | 0 | 2 | 2 |
| SEC | 8 | 2 | 0 | 10 |
| TST | 2 | 1 | 0 | 3 |
| PIL | 0 | 0 | 0 | 0 |
| INF | 3 | 1 | 0 | 4 |
| LATER | 0 | 0 | 6 | 6 |
| **total** | 40 | 52 | 9 | 101 |

## Files

- [gaps/product.md](gaps/product.md): product and integration gaps, ids `G-001` to `G-199`.
- [gaps/platform.md](gaps/platform.md): platform, security and operations gaps, ids `G-200` to `G-399`.
- [ci-baseline.md](ci-baseline.md): the two suites no CI job ran before (db-tests, brain-tests) are both green on
  `main`, so they add no gap rows.
