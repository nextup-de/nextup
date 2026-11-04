#!/usr/bin/env bash
# Proof for SEC-G1 (D5): install.sh writes INSTANCE_DIR once and creates break-glass/ and logs/,
# and the rendered compose gives the app the read-only break-glass mount, the logs mount and the
# three environment values. Runs on any checkout; the owner check needs root (skipped otherwise).
#   bash stack/tests/stack-mounts.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "SEC stack mounts"

tmp="$(mktemp -d)"
export NEXTUP_INSTANCES="$tmp/instances"
inst="$NEXTUP_INSTANCES/acme"
# The temp folder holds a known handful of entries; remove them one by one.
cleanup() {
  rmdir "$inst/break-glass" "$inst/backup-status" "$inst/logs" 2>/dev/null
  rm -f "$inst/.env" "$tmp"/*.sh "$tmp"/*.env "$tmp"/*.json "$tmp/err"
  rmdir "$inst" "$NEXTUP_INSTANCES" "$tmp" 2>/dev/null
  return 0
}
trap cleanup EXIT
mkdir -p "$inst"
printf 'COMPANY_SLUG=acme\n' > "$inst/.env"

# install.sh's directory step, between its markers, run in a shell of its own.
step="$tmp/step.sh"
{
  echo 'set -euo pipefail'
  echo 'dir="$1"; env_file="$dir/.env"'
  sed -n '/^# >>> instance-dirs$/,/^# <<< instance-dirs$/p' stack/install.sh
} > "$step"
t_ok "install.sh has the instance-dirs step" grep -q 'mkdir -p "\$dir/break-glass" "\$dir/logs"' "$step"

t_ok "directory step runs" bash "$step" "$inst"
want="INSTANCE_DIR=$(cd "$inst" && pwd)"
t_eq "INSTANCE_DIR is the absolute instance path" "$want" "$(grep '^INSTANCE_DIR=' "$inst/.env")"

mode() { stat -c %a "$1" 2>/dev/null || stat -f %Lp "$1"; }
owner() { stat -c %u:%g "$1" 2>/dev/null || stat -f %u:%g "$1"; }
case "$(uname -s)" in
  MINGW*|CYGWIN*|MSYS*)
    echo "skip - modes and owner (this file system has no unix modes)" ;;
  *)
    t_eq "break-glass is 0755" 755 "$(mode "$inst/break-glass")"
    t_eq "logs is 0750" 750 "$(mode "$inst/logs")"
    if [ "$(id -u)" = 0 ]; then
      t_eq "logs belongs to 1001:1001" 1001:1001 "$(owner "$inst/logs")"
    else
      echo "skip - logs owner (not root; install.sh chowns only as root)"
    fi ;;
esac

# Second run: INSTANCE_DIR is not written again or changed.
sed -i 's|^INSTANCE_DIR=.*|INSTANCE_DIR=/somewhere/else|' "$inst/.env"
t_ok "second run keeps INSTANCE_DIR" bash "$step" "$inst"
t_eq "INSTANCE_DIR written once" "INSTANCE_DIR=/somewhere/else" "$(grep '^INSTANCE_DIR=' "$inst/.env")"
t_eq "INSTANCE_DIR appears once" 1 "$(grep -c '^INSTANCE_DIR=' "$inst/.env")"

# Rendered compose.
# Docker and node on Windows want Windows paths.
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
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
ENV
rendered="$tmp/compose.json"
q() { node -e '
  const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).services.app;
  if (process.argv[2] === "vol") {
    const v = (c.volumes || []).find((x) => x.target === process.argv[3]);
    if (!v) process.exit(1);
    console.log(v.source + (v.read_only ? ":ro" : ":rw"));
  } else console.log(c.environment[process.argv[3]] ?? "");
' "$(wp "$rendered")" "$@"; }
if docker compose -f stack/compose.yml --env-file "$(wp "$env")" config --format json > "$rendered" 2>"$tmp/err"; then
  t_ok "compose renders" test -s "$rendered"
  t_eq "break-glass mounted read-only" "/srv/nextup/acme/break-glass:ro" "$(q vol /run/nextup/break-glass)"
  t_eq "logs mounted read-write" "/srv/nextup/acme/logs:rw" "$(q vol /var/log/nextup)"
  t_eq "BREAK_GLASS_DIR" /run/nextup/break-glass "$(q env BREAK_GLASS_DIR)"
  t_eq "LOG_EXPORT_DIR" /var/log/nextup "$(q env LOG_EXPORT_DIR)"
  t_eq "CONNECTOR_VAULT_KEY_PREVIOUS defaults to empty" "" "$(q env CONNECTOR_VAULT_KEY_PREVIOUS)"
else
  t_ok "compose renders" false
  sed 's/^/    /' "$tmp/err"
fi

# INSTANCE_DIR is required.
grep -v '^INSTANCE_DIR=' "$env" > "$tmp/noinst.env"
refusal="$(docker compose -f stack/compose.yml --env-file "$(wp "$tmp/noinst.env")" config 2>&1 >/dev/null)"
t_ok "compose refuses a missing INSTANCE_DIR" grep -q INSTANCE_DIR <<<"$refusal"

t_done
