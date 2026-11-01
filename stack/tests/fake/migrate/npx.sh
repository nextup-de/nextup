#!/bin/sh
# Fake npx: only what the migrate command of stack/compose.yml calls.
set -eu

psql_() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

company() {
  # $1: also add the demo user
  psql_ -v slug="$COMPANY_SLUG" -q <<'SQL'
INSERT INTO "Company" (slug) VALUES (:'slug') ON CONFLICT (slug) DO NOTHING;
SQL
  if [ "${1:-}" = demo ]; then
    psql_ -q -c "INSERT INTO \"User\" (name) SELECT 'demo' WHERE NOT EXISTS (SELECT 1 FROM \"User\" WHERE name = 'demo')"
  fi
}

case "$*" in
  "prisma migrate deploy")
    psql_ -q -c 'CREATE TABLE IF NOT EXISTS _prisma_migrations (id serial PRIMARY KEY, migration_name text UNIQUE, finished_at timestamptz)'
    for f in /migrations/*.sql; do
      name="$(basename "$f" .sql)"
      [ "$(psql_ -tAc "SELECT count(*) FROM _prisma_migrations WHERE migration_name = '$name'")" = 0 ] || continue
      # The migration and its record succeed or fail together.
      { cat "$f"; echo; echo "INSERT INTO _prisma_migrations (migration_name, finished_at) VALUES ('$name', clock_timestamp());"; } \
        | psql_ -q -1
      echo "applied $name"
    done
    ;;
  "tsx prisma/bootstrap-company.ts") company ;;
  "tsx prisma/seed.ts") company demo ;;
  *) echo "fake npx: not supported: $*" >&2; exit 1 ;;
esac
