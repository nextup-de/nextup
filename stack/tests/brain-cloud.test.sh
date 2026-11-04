#!/usr/bin/env bash
# Proof for AIB-D1 (D11): with --brain-cloud the rendered compose has the brain with the AWS values
# and no ollama, the instance file has the brain's key once and no BRAIN_MODEL, --brain still gives
# both services, and both flags together are refused. Needs docker compose and node.
#   bash stack/tests/brain-cloud.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "AIB brain cloud"

tmp="$(mktemp -d)"
# The temp folder holds a known handful of files; remove them one by one.
cleanup() {
  rm -f "$tmp"/*.sh "$tmp"/*.env "$tmp"/*.json "$tmp/err"
  rmdir "$tmp" 2>/dev/null
  return 0
}
trap cleanup EXIT
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }

# install.sh's brain step, between its markers, run in a shell of its own on a bare instance .env.
{
  echo 'set -euo pipefail'
  echo 'env_file="$1"; brain=false; brain_cloud=false; brain_image=nextup-brain:local'
  echo 'case "$2" in brain) brain=true ;; cloud) brain_cloud=true ;; esac'
  sed -n '/^# The brain, new or existing instance/,/^# Microsoft sign-in/p' stack/install.sh | sed '$d'
} > "$tmp/step.sh"
base() { printf 'COMPANY_SLUG=acme\nCOMPOSE_PROFILES=demo\n' > "$1"; }

cloud="$tmp/cloud.env"; base "$cloud"
t_ok "--brain-cloud step runs" bash "$tmp/step.sh" "$cloud" cloud
t_ok "second run runs" bash "$tmp/step.sh" "$cloud" cloud
t_eq "BRAIN_API_KEY once" 1 "$(grep -c '^BRAIN_API_KEY=' "$cloud")"
t_eq "BRAIN_URL once" 1 "$(grep -c '^BRAIN_URL=' "$cloud")"
t_eq "NEXTUP_BRAIN_IMAGE once" 1 "$(grep -c '^NEXTUP_BRAIN_IMAGE=' "$cloud")"
t_eq "no BRAIN_MODEL" 0 "$(grep -c '^BRAIN_MODEL=' "$cloud")"
t_eq "profile brain-cloud added once" "COMPOSE_PROFILES=demo,brain-cloud" "$(grep '^COMPOSE_PROFILES=' "$cloud")"

local_env="$tmp/local.env"; base "$local_env"
t_ok "--brain step runs" bash "$tmp/step.sh" "$local_env" brain
t_eq "--brain still writes BRAIN_MODEL" 1 "$(grep -c '^BRAIN_MODEL=mistral-nemo' "$local_env")"
t_eq "--brain profile is brain" "COMPOSE_PROFILES=demo,brain" "$(grep '^COMPOSE_PROFILES=' "$local_env")"

# Both flags together are refused before anything is written.
refused="$(bash stack/install.sh --slug acme --brain --brain-cloud --dir "$tmp/refused" 2>&1)"; rc=$?
t_eq "both flags exit non-zero" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
t_ok "refusal names --brain-cloud" grep -q -- '--brain-cloud' <<<"$refused"
t_eq "refusal writes nothing" 0 "$([ -e "$tmp/refused" ] && echo 1 || echo 0)"

# Rendered compose.
env="$tmp/render.env"
cat > "$env" <<ENV
INSTANCE_DIR=/srv/nextup/acme
POSTGRES_PASSWORD=p
AUTH_SECRET=s
ADMIN_ACCESS_CODE=c
COMPANY_SLUG=acme
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=:80
N8N_ENCRYPTION_KEY=k
BRAIN_API_KEY=b
AWS_ACCESS_KEY_ID=AKIATESTONLY
AWS_SECRET_ACCESS_KEY=testsecret
ENV
render() {
  COMPOSE_PROFILES="$1" docker compose -f stack/compose.yml --env-file "$(wp "$env")" config --format json > "$2" 2>"$tmp/err"
}
svc() { node -e '
  const s = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).services;
  const [name, key] = process.argv.slice(2);
  if (key === "has") console.log(name in s ? "yes" : "no");
  else console.log((s[name] && s[name].environment[key]) ?? "");
' "$(wp "$1")" "$2" "$3"; }

if render brain-cloud "$tmp/c.json"; then
  t_eq "cloud: brain present" yes "$(svc "$tmp/c.json" brain has)"
  t_eq "cloud: no ollama" no "$(svc "$tmp/c.json" ollama has)"
  t_eq "cloud: brain AWS_ACCESS_KEY_ID" AKIATESTONLY "$(svc "$tmp/c.json" brain AWS_ACCESS_KEY_ID)"
  t_eq "cloud: brain AWS_SECRET_ACCESS_KEY" testsecret "$(svc "$tmp/c.json" brain AWS_SECRET_ACCESS_KEY)"
else
  t_ok "cloud compose renders" false; sed 's/^/    /' "$tmp/err"
fi
if render brain "$tmp/l.json"; then
  t_eq "brain: brain present" yes "$(svc "$tmp/l.json" brain has)"
  t_eq "brain: ollama present" yes "$(svc "$tmp/l.json" ollama has)"
else
  t_ok "brain compose renders" false; sed 's/^/    /' "$tmp/err"
fi

t_done
