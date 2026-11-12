#!/usr/bin/env bash
# Proof for Q8.5 and contradiction 1 of chapter 8 (block S, #655): install.sh --entra-tenant-id writes
# ENTRA_TENANT_ID once and replaces it on a second run, a demo stage leaves it out, a value that is no GUID
# is refused before anything is written, the rendered compose hands it to migrate only, and the closing
# lines print the shared admin code on a demo stage only. Needs docker compose and node.
#   bash stack/tests/entra-tenant-env.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "Q8.5 Entra tenant at install"

tmp="$(mktemp -d)"
# The temp folder holds a known handful of files; remove them one by one.
cleanup() {
  rm -f "$tmp"/*.sh "$tmp"/*.env "$tmp"/*.json "$tmp"/*.out "$tmp/err"
  rmdir "$tmp" 2>/dev/null
  return 0
}
trap cleanup EXIT
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

tenant=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
other=11111111-2222-3333-4444-555555555555

# install.sh's tenant step, between its markers, run in a shell of its own on a bare instance .env.
{
  echo 'set -euo pipefail'
  echo 'env_file="$1"; entra_tenant="$2"'
  sed -n "/^# The company's Entra tenant, new or existing instance/,/^# The Teams bot, new or existing instance/p" stack/install.sh | sed '$d'
} > "$tmp/step.sh"

inst="$tmp/inst.env"
printf 'COMPANY_SLUG=acme\nSEED_DEMO=false\nENTRA_CLIENT_ID=keep-me\n' > "$inst"
t_ok "tenant step runs" bash "$tmp/step.sh" "$inst" "$tenant"
t_eq "ENTRA_TENANT_ID written" "ENTRA_TENANT_ID=$tenant" "$(grep '^ENTRA_TENANT_ID=' "$inst")"
t_ok "second run with another tenant runs" bash "$tmp/step.sh" "$inst" "$other"
t_eq "ENTRA_TENANT_ID replaced, not doubled" "ENTRA_TENANT_ID=$other" "$(grep '^ENTRA_TENANT_ID=' "$inst")"
t_eq "other lines stay" 1 "$(grep -c '^ENTRA_CLIENT_ID=keep-me$' "$inst")"

demo="$tmp/demo.env"
printf 'COMPANY_SLUG=acme\nSEED_DEMO=true\n' > "$demo"
t_ok "tenant step on a demo stage runs" bash "$tmp/step.sh" "$demo" "$tenant"
t_eq "a demo stage gets no ENTRA_TENANT_ID" 0 "$(grep -c '^ENTRA_TENANT_ID=' "$demo")"
t_ok "and says where to set it" bash -c 'bash "$1" "$2" "$3" | grep -qF "/admin"' _ "$tmp/step.sh" "$demo" "$tenant"

# Refused before anything is written (the checks run before docker is looked for).
out="$(bash stack/install.sh --slug acme --origin https://acme.example.com --stage real --dir "$tmp/refused" --entra-tenant-id nope 2>&1)"; rc=$?
t_eq "a tenant that is no GUID: exits non-zero" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
t_ok "a tenant that is no GUID: says why" grep -qF -- "--entra-tenant-id must be" <<<"$out"
t_eq "a tenant that is no GUID: writes nothing" 0 "$([ -e "$tmp/refused" ] && echo 1 || echo 0)"
t_ok "--help names --entra-tenant-id" bash -c 'bash stack/install.sh --help | grep -qF -- "--entra-tenant-id"'
t_ok "--help says the stack creates the company" bash -c 'bash stack/install.sh --help | grep -qF "the stack creates it at its first start"'
t_ok "--help no longer says to create it in /admin" bash -c '! bash stack/install.sh --help | grep -qF "create the company in /admin"'

# The closing lines (from `get()` to the end), with compose replaced by a no-op.
{
  echo 'set -euo pipefail'
  echo 'env_file="$1"; slug=acme; compose=(true)'
  sed -n '/^get() {/,$p' stack/install.sh
} > "$tmp/tail.sh"
printf 'APP_ORIGIN=https://acme.example.com\nSEED_DEMO=false\nADMIN_ACCESS_CODE=deadbeefcafe0001\nCOMPOSE_PROFILES=\n' > "$tmp/real.env"
printf 'APP_ORIGIN=http://localhost:8080\nSEED_DEMO=true\nADMIN_ACCESS_CODE=deadbeefcafe0002\nCOMPOSE_PROFILES=demo\nMAILPIT_PORT=8025\n' > "$tmp/demo2.env"
bash "$tmp/tail.sh" "$tmp/real.env" > "$tmp/real.out" 2>&1
bash "$tmp/tail.sh" "$tmp/demo2.env" > "$tmp/demo.out" 2>&1
t_eq "a real stage prints no admin code" 0 "$(grep -c 'deadbeefcafe0001' "$tmp/real.out")"
t_ok "a real stage says how to open a window" grep -qF "stack/break-glass.sh acme open" "$tmp/real.out"
t_eq "a demo stage prints the admin code" 1 "$(grep -c 'code: deadbeefcafe0002' "$tmp/demo.out")"

# Rendered compose: migrate copies the tenant in; the app reads it from the company row, not the env.
cat > "$tmp/base.env" <<ENV
INSTANCE_DIR=/srv/nextup/acme
POSTGRES_PASSWORD=p
AUTH_SECRET=s
ADMIN_ACCESS_CODE=c
COMPANY_SLUG=acme
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=:80
N8N_ENCRYPTION_KEY=k
ENV
{ cat "$tmp/base.env"; echo "ENTRA_TENANT_ID=$tenant"; } > "$tmp/with.env"
render() { docker compose -f stack/compose.yml --env-file "$(wp "$1")" config --format json > "$2" 2>"$tmp/err"; }
svc() { node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).services;
  const [name, key] = process.argv.slice(2);
  console.log((s[name] && s[name].environment && s[name].environment[key]) ?? "<absent>");
' "$(wp "$1")" "$2" "$3"; }

if render "$tmp/with.env" "$tmp/w.json"; then
  t_eq "migrate gets ENTRA_TENANT_ID" "$tenant" "$(svc "$tmp/w.json" migrate ENTRA_TENANT_ID)"
  t_eq "app has no ENTRA_TENANT_ID" "<absent>" "$(svc "$tmp/w.json" app ENTRA_TENANT_ID)"
else
  t_ok "compose renders with the tenant" false; sed 's/^/    /' "$tmp/err"
fi
if render "$tmp/base.env" "$tmp/n.json"; then
  t_eq "without the line: migrate's ENTRA_TENANT_ID empty" "" "$(svc "$tmp/n.json" migrate ENTRA_TENANT_ID)"
else
  t_ok "compose renders without the tenant" false; sed 's/^/    /' "$tmp/err"
fi

t_done
