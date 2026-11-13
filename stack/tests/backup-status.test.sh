#!/usr/bin/env bash
# Proof for PIL-O1 (D10): stack/backup.sh writes backup-status/last.json after a good backup, and the
# rendered compose mounts the folder read-only for the app. restic (docker run) is faked.
#   bash stack/tests/backup-status.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "PIL backup status"
tmp="$(mktemp -d)"
trap 'chmod -R u+w "$tmp" 2>/dev/null; rm -rf "$tmp"' EXIT

# A fake docker: compose exec prints a dump, volume inspect fails, run (restic) fails on backup when told to.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/docker" <<'F'
#!/usr/bin/env bash
case "$1" in
  compose) echo "fake-dump" ;;
  volume) exit 1 ;;
  run) for a in "$@"; do
         if [ "$a" = backup ]; then
           [ -z "${FAKE_RESTIC_FAIL:-}" ] || exit 1
           echo '{"message_type":"summary","snapshot_id":"0123456789abcdef"}'
         fi
       done ;;
esac
exit 0
F
chmod +x "$tmp/bin/docker"
real_path="$PATH"; real_home="$HOME"
export PATH="$tmp/bin:$PATH"
export NEXTUP_INSTANCES="$tmp/instances" HOME="$tmp/home"

mk() { # <slug> <repo> [extra env line]
  mkdir -p "$NEXTUP_INSTANCES/$1"
  printf 'COMPANY_SLUG=%s\nRESTIC_PASSWORD=pw\nRESTIC_REPOSITORY=%s\n%s\n' "$1" "$2" "${3:-}" > "$NEXTUP_INSTANCES/$1/.env"
}
run() { bash stack/backup.sh "$@"; }

# Off-box repository.
inst="$tmp/inst-a"; mkdir -p "$inst/backup-status"
mk a "s3:example.invalid/bucket" "INSTANCE_DIR=$inst"
run a backup >/dev/null 2>&1; rc=$?
t_eq "backup exits 0" 0 "$rc"
f="$inst/backup-status/last.json"
t_ok "last.json exists" test -s "$f"
t_ok "it holds a UTC time and offbox true" grep -Eq '^\{"at": "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z", "offbox": true\}$' "$f"
t_eq "no temp file is left" 1 "$(ls -A "$inst/backup-status" | wc -l | tr -d ' ')"

# Local repository.
inst_b="$tmp/inst-b"; mkdir -p "$inst_b/backup-status"
mk b "$tmp/repo-b" "INSTANCE_DIR=$inst_b"
run b backup >/dev/null 2>&1
t_ok "a local repository gives offbox false" grep -q '"offbox": false' "$inst_b/backup-status/last.json"

# A failed backup leaves the old file.
printf '{"at": "2020-01-01T00:00:00Z", "offbox": true}\n' > "$f"
FAKE_RESTIC_FAIL=1 run a backup >/dev/null 2>&1; rc=$?
t_ok "a failed backup exits non-zero" test "$rc" -ne 0
t_eq "and leaves the old file" '{"at": "2020-01-01T00:00:00Z", "offbox": true}' "$(cat "$f")"

# pre-migrate writes nothing.
rm -f "$f"
run a pre-migrate abcdef0 >/dev/null 2>&1; rc=$?
t_eq "pre-migrate exits 0" 0 "$rc"
t_ok "pre-migrate writes no last.json" test ! -e "$f"

# INSTANCE_DIR unset: nothing is written, the backup still succeeds.
mk c "s3:example.invalid/bucket"
run c backup >/dev/null 2>&1; rc=$?
t_eq "without INSTANCE_DIR the backup exits 0" 0 "$rc"

# A folder that cannot be written (a file is in the way): a warning, exit 0.
inst_d="$tmp/inst-d"; mkdir -p "$inst_d"; : > "$inst_d/backup-status"
mk d "s3:example.invalid/bucket" "INSTANCE_DIR=$inst_d"
out="$(run d backup 2>&1)"; rc=$?
t_eq "an unwritable folder does not fail the backup" 0 "$rc"
t_ok "it logs a warning" bash -c '[[ "$1" == *warning* ]]' _ "$out"

# restore-test.json (REM-O3): written like last.json by write_restore_status, which restore-test calls once it passed. The restore itself needs a real docker, so the function is
# run on its own: it takes the seconds, writes a UTC time with them, leaves no temp file, and an unwritable folder is a warning, not a failure.
eval "$(sed -n '/^write_restore_status() {/,/^}/p' stack/backup.sh)"
inst_r="$tmp/inst-r"; mkdir -p "$inst_r"
get() { [ "$1" = INSTANCE_DIR ] && echo "$inst_r"; }
log() { echo "$*"; }
write_restore_status 412
rf="$inst_r/backup-status/restore-test.json"
t_ok "restore-test.json holds a UTC time and the seconds" grep -Eq '^\{"at": "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}Z", "seconds": 412\}$' "$rf"
t_eq "no temp file is left next to it" 1 "$(ls -A "$inst_r/backup-status" | wc -l | tr -d ' ')"
t_ok "backup.sh calls it after restore-test OK" bash -c 'grep -A1 "restore-test OK" stack/backup.sh | grep -q "write_restore_status \"\$seconds\""'
inst_u="$tmp/inst-u"; mkdir -p "$inst_u"; : > "$inst_u/backup-status"
get() { [ "$1" = INSTANCE_DIR ] && echo "$inst_u"; }
out="$(write_restore_status 3 2>&1)"; rc=$?
t_eq "an unwritable folder does not fail" 0 "$rc"
t_ok "it logs a warning" bash -c '[[ "$1" == *warning* ]]' _ "$out"
get() { return 0; }
t_eq "without INSTANCE_DIR nothing is written" 0 "$(write_restore_status 3 >/dev/null 2>&1; echo $?)"

# Rendered compose, with the real docker.
export PATH="$real_path"
wp() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
cat > "$tmp/render.env" <<ENV
INSTANCE_DIR=/srv/nextup/acme
POSTGRES_PASSWORD=p
AUTH_SECRET=s
ADMIN_ACCESS_CODE=c
COMPANY_SLUG=acme
APP_ORIGIN=http://localhost:8080
SITE_ADDRESS=:80
N8N_ENCRYPTION_KEY=k
ENV
# The real HOME, so the docker CLI finds its compose plugin (~/.docker/cli-plugins on macOS).
if HOME="$real_home" docker compose -f stack/compose.yml --env-file "$(wp "$tmp/render.env")" config --format json > "$tmp/c.json" 2>"$tmp/err"; then
  got="$(node -e '
    const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).services.app;
    const v = (c.volumes || []).find((x) => x.target === "/run/nextup/backup-status");
    console.log(v ? v.source + (v.read_only ? ":ro" : ":rw") : "none", c.environment.BACKUP_STATUS_DIR ?? "");
  ' "$(wp "$tmp/c.json")")"
  t_eq "backup-status mounted read-only, BACKUP_STATUS_DIR set" "/srv/nextup/acme/backup-status:ro /run/nextup/backup-status" "$got"
else
  t_ok "compose renders" false
  sed 's/^/    /' "$tmp/err"
fi

t_done
