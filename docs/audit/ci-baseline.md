# CI baseline: the suites no job ran before AUD-A1

Local runs on 2026-11-01 against `main` at `984f3b0`, with the commands the new CI jobs use:

- `db-tests`: `DATABASE_URL=postgresql://nextup:nextup@127.0.0.1:5442/nextup_test bash ops/test-db.sh`
  (postgres:17), 11 files, 67 tests.
- `brain-tests`: `docker run --rm -v "$PWD/services/brain:/w" -w /w ghcr.io/astral-sh/uv:python3.12-bookworm-slim sh -c "uv sync --frozen && uv run --frozen pytest"`,
  4 files, 46 tests.

Both are green, so neither job has `continue-on-error` (D5).

| suite | result on main | failing tests | phase |
|---|---|---|---|
| db-tests | green | – | – |
| brain-tests | green | – | – |
