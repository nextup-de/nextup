#!/usr/bin/env bash
# Proof for FX9a (PILOT_CHECK A2): the three Teams values of the instance .env reach the app - the
# rendered compose carries them, install.sh --teams-app-id writes them once and replaces them on a
# second run, half a set of flags or a missing secret is refused before anything is written, and the
# package files of ops/teams stay in the image's build context. Needs docker compose and node.
#   bash stack/tests/teams-env.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "FX9a Teams env on a stack"

tmp="$(mktemp -d)"
# The temp folder holds a known handful of files; remove them one by one.
cleanup() {
  rm -f "$tmp"/*.sh "$tmp"/*.env "$tmp"/*.json "$tmp/err"
  rmdir "$tmp" 2>/dev/null
  return 0
}
trap cleanup EXIT
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

app_id=11111111-2222-3333-4444-555555555555
tenant=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

# install.sh's Teams step, between its markers, run in a shell of its own on a bare instance .env.
{
  echo 'set -euo pipefail'
  echo 'env_file="$1"; teams_id="$2"; teams_tenant="$3"; teams_password="$4"'
  echo 'origin=https://acme.example.com; slug=acme'
  sed -n '/^# The Teams bot, new or existing instance/,/^if \$build; then/p' stack/install.sh | sed '$d'
} > "$tmp/step.sh"

inst="$tmp/inst.env"
printf 'COMPANY_SLUG=acme\nENTRA_CLIENT_ID=keep-me\n' > "$inst"
t_ok "Teams step runs" bash "$tmp/step.sh" "$inst" "$app_id" "$tenant" first-secret
t_eq "TEAMS_APP_ID written" "TEAMS_APP_ID=$app_id" "$(grep '^TEAMS_APP_ID=' "$inst")"
t_eq "TEAMS_TENANT_ID written" "TEAMS_TENANT_ID=$tenant" "$(grep '^TEAMS_TENANT_ID=' "$inst")"
t_eq "TEAMS_APP_PASSWORD written" "TEAMS_APP_PASSWORD=first-secret" "$(grep '^TEAMS_APP_PASSWORD=' "$inst")"
t_ok "second run with a new secret runs" bash "$tmp/step.sh" "$inst" "$app_id" "$tenant" second-secret
t_eq "TEAMS_APP_ID once" 1 "$(grep -c '^TEAMS_APP_ID=' "$inst")"
t_eq "TEAMS_TENANT_ID once" 1 "$(grep -c '^TEAMS_TENANT_ID=' "$inst")"
t_eq "TEAMS_APP_PASSWORD replaced, not doubled" "TEAMS_APP_PASSWORD=second-secret" "$(grep '^TEAMS_APP_PASSWORD=' "$inst")"
t_eq "other lines stay" 1 "$(grep -c '^ENTRA_CLIENT_ID=keep-me$' "$inst")"
t_ok "the step names the messaging endpoint" bash -c 'bash "$1" "$2" "$3" "$4" second-secret | grep -qF "https://acme.example.com/api/acme/teams/messages"' _ "$tmp/step.sh" "$inst" "$app_id" "$tenant"

# Refused before anything is written (the checks run before docker is looked for).
refuse() { # <name> <text the refusal must hold> <env password> <install.sh options...>
  local name="$1" want="$2" pw="$3" out rc
  shift 3
  out="$(NEXTUP_TEAMS_APP_PASSWORD="$pw" bash stack/install.sh --slug acme --origin https://acme.example.com --dir "$tmp/refused" "$@" 2>&1)"; rc=$?
  t_eq "$name: exits non-zero" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
  t_ok "$name: says why" grep -qF -- "$want" <<<"$out"
  t_eq "$name: writes nothing" 0 "$([ -e "$tmp/refused" ] && echo 1 || echo 0)"
}
refuse "app id without tenant" "--teams-tenant-id" secret --teams-app-id "$app_id"
refuse "tenant without app id" "--teams-app-id" secret --teams-tenant-id "$tenant"
refuse "app id that is no GUID" "--teams-app-id must be" secret --teams-app-id nope --teams-tenant-id "$tenant"
refuse "tenant that is no GUID" "--teams-tenant-id must be" secret --teams-app-id "$app_id" --teams-tenant-id nope
refuse "no secret in the environment" "NEXTUP_TEAMS_APP_PASSWORD" "" --teams-app-id "$app_id" --teams-tenant-id "$tenant"
refuse "a secret compose would mangle" "must not contain" 'a$b' --teams-app-id "$app_id" --teams-tenant-id "$tenant"

# Rendered compose.
base="$tmp/base.env"
cat > "$base" <<ENV
INSTANCE_DIR=/srv/nextup/acme
POSTGRES_PASSWORD=p
AUTH_SECRET=s
ADMIN_ACCESS_CODE=c
COMPANY_SLUG=acme
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=:80
N8N_ENCRYPTION_KEY=k
ENV
with="$tmp/with.env"
{ cat "$base"; grep '^TEAMS_' "$inst"; } > "$with"
render() { docker compose -f stack/compose.yml --env-file "$(wp "$1")" config --format json > "$2" 2>"$tmp/err"; }
svc() { node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).services;
  const [name, key] = process.argv.slice(2);
  console.log((s[name] && s[name].environment && s[name].environment[key]) ?? "<absent>");
' "$(wp "$1")" "$2" "$3"; }

if render "$with" "$tmp/w.json"; then
  t_eq "app gets TEAMS_APP_ID" "$app_id" "$(svc "$tmp/w.json" app TEAMS_APP_ID)"
  t_eq "app gets TEAMS_APP_PASSWORD" second-secret "$(svc "$tmp/w.json" app TEAMS_APP_PASSWORD)"
  t_eq "app gets TEAMS_TENANT_ID" "$tenant" "$(svc "$tmp/w.json" app TEAMS_TENANT_ID)"
  # The bot's secret is the app's alone.
  for other in db migrate caddy; do
    t_eq "$other has no TEAMS_APP_PASSWORD" "<absent>" "$(svc "$tmp/w.json" "$other" TEAMS_APP_PASSWORD)"
  done
else
  t_ok "compose renders with the Teams values" false; sed 's/^/    /' "$tmp/err"
fi
# An instance without the three lines still renders; the app sees them empty and Teams stays off.
if render "$base" "$tmp/n.json"; then
  t_eq "without the lines: TEAMS_APP_ID empty" "" "$(svc "$tmp/n.json" app TEAMS_APP_ID)"
  t_eq "without the lines: TEAMS_APP_PASSWORD empty" "" "$(svc "$tmp/n.json" app TEAMS_APP_PASSWORD)"
else
  t_ok "compose renders without the Teams values" false; sed 's/^/    /' "$tmp/err"
fi

# The package download (apps/app/src/server/teams/package.ts) reads ops/teams/; Next's file tracing
# carries the folder into the runtime image, which it can only do while the build sees it.
t_ok ".dockerignore keeps ops/teams in the build context" bash -c '! tr -d "\r" < .dockerignore | grep -qE "^/?ops(/teams)?(/|/\*{1,2})?$"'
for f in manifest.json de.json color.png outline.png; do
  t_ok "ops/teams/$f is there" test -s "ops/teams/$f"
done

t_done
