#!/usr/bin/env bash
# The database-backed suite. Kept out of `npm test` on purpose: CI runs that one with no Postgres.
#
#   ops/test-db.sh                 - against a local Postgres on :5432
#   DATABASE_URL=... ops/test-db.sh - against anything else, as long as it names a *_test database
set -euo pipefail
cd "$(dirname "$0")/../apps/app"

export DATABASE_URL="${DATABASE_URL:-postgresql://nextup:nextup@127.0.0.1:5432/nextup_test}"

case "$DATABASE_URL" in
  *_test*) ;;
  *) echo "Refusing to run against a database that is not named *_test: $DATABASE_URL" >&2; exit 1 ;;
esac

npx prisma migrate deploy
npx vitest run --config vitest.db.config.ts "$@"
