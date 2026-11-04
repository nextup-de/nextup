#!/usr/bin/env bash
# Proof TST-P1 B1: the rendered compose starts Postgres with the sized settings (docs/ops/SIZING.md),
# max_connections covers the app's pool, the settings apply in a running container, and SIZING.md
# names users per stack, the VM size and the CI load figure. Needs Docker.
#   bash stack/tests/postgres-settings.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "TST postgres settings"

tmp="$(mktemp -d)"
slug="tstpg$$"
env="$tmp/render.env"
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
dc() { docker compose --env-file "$(wp "$env")" -f stack/compose.yml "$@"; }
cleanup() {
  dc down -v --remove-orphans >/dev/null 2>&1
  rm -f "$tmp"/*.json "$tmp"/*.env "$tmp/err" "$tmp/up" "$tmp/want"
  rmdir "$tmp" 2>/dev/null
  return 0
}
trap cleanup EXIT

cat > "$env" <<ENV
INSTANCE_DIR=/srv/nextup/$slug
POSTGRES_PASSWORD=p
AUTH_SECRET=s
ADMIN_ACCESS_CODE=c
COMPANY_SLUG=$slug
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=:80
N8N_ENCRYPTION_KEY=k
ENV

rendered="$tmp/compose.json"
t_ok "compose renders" bash -c 'docker compose --env-file "$1" -f stack/compose.yml config --format json > "$2"' _ "$(wp "$env")" "$rendered"
rj="$(wp "$rendered")"
js() { node -e 'const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).services;'"$1" "$rj"; }

# The db command's name=value pairs, one per line.
js 'for (const a of c.db.command) if (/^[a-z_]+=/.test(a)) console.log(a)' | tr -d '\r' > "$tmp/want"
want() { sed -n "s/^$1=//p" "$tmp/want"; }

settings="shared_buffers effective_cache_size work_mem maintenance_work_mem max_connections random_page_cost"
for s in $settings; do
  t_ok "compose sets $s" test -n "$(want $s)"
done

pool="$(js 'console.log(String(c.app.environment.DATABASE_POOL_MAX || 10))' | tr -d '\r')"
replicas="$(js 'console.log(String((c.app.deploy || {}).replicas || 1))' | tr -d '\r')"
need=$((pool * replicas + 1 + 1 + 10))
t_ok "max_connections $(want max_connections) covers $replicas app processes x pool $pool + migrate + backup + 10 ($need)" \
  test "$(want max_connections)" -ge "$need"

t_ok "db image is still pinned by digest" bash -c '[[ "$1" == postgres:*@sha256:* ]]' _ "$(js 'console.log(c.db.image)' | tr -d '\r')"

t_ok "db starts alone and becomes healthy" bash -c 'docker compose --env-file "$1" -f stack/compose.yml up -d --wait db' _ "$(wp "$env")"
show() { dc exec -T db psql -U nextup -d nextup -Atc "SHOW $1" 2>/dev/null | tr -d '\r'; }
for s in $settings; do
  t_eq "running db: SHOW $s" "$(want $s)" "$(show $s)"
done

doc=docs/ops/SIZING.md
t_ok "SIZING.md exists" test -f "$doc"
t_ok "SIZING.md names users per stack (up to 2,000)" grep -qi 'up to 2,000' "$doc"
t_ok "SIZING.md names the VM size" grep -Eq '4 vCPU.*16 GB' "$doc"
t_ok "SIZING.md names the CI load figure" grep -q '14,098 ms' "$doc"
t_ok "SIZING.md has the empty VM row" grep -q "filled from docs/test-phase/results after Kevin's run" "$doc"

t_done
