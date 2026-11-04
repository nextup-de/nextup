#!/usr/bin/env bash
# Proof for PIL-F1: stack/backup.sh writes offbox true only for a restic remote that is not this machine.
# restic (docker run) is faked.
#   bash stack/tests/backup-offbox.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh

t_init "PIL backup offbox"
tmp="$(mktemp -d)"
trap 'chmod -R u+w "$tmp" 2>/dev/null' EXIT

mkdir -p "$tmp/bin"
cat > "$tmp/bin/docker" <<'F'
#!/usr/bin/env bash
case "$1" in
  compose) echo "fake-dump" ;;
  volume) exit 1 ;;
  run) for a in "$@"; do
         [ "$a" != backup ] || echo '{"message_type":"summary","snapshot_id":"0123456789abcdef"}'
       done ;;
esac
exit 0
F
chmod +x "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH"
export NEXTUP_INSTANCES="$tmp/instances" HOME="$tmp/home"

# <name> <repo> <expected offbox>
check() {
  local n="$1" repo="$2" want="$3" inst="$tmp/inst-$1"
  mkdir -p "$inst/backup-status" "$NEXTUP_INSTANCES/$n"
  printf 'COMPANY_SLUG=%s\nRESTIC_PASSWORD=pw\nRESTIC_REPOSITORY=%s\nINSTANCE_DIR=%s\n' "$n" "$repo" "$inst" > "$NEXTUP_INSTANCES/$n/.env"
  bash stack/backup.sh "$n" backup >/dev/null 2>&1
  t_ok "$repo gives offbox $want" grep -q "\"offbox\": $want}" "$inst/backup-status/last.json"
}

check abs "$tmp/abs-repo" false
check rel "backups/repo" false
check dot "./repo" false
check loc1 "s3:http://localhost:9000/bucket" false
check loc2 "s3:http://127.0.0.1:9000/bucket" false
check loc3 "rest:http://[::1]:8000/repo" false
check loc4 "sftp:backup@localhost:/repo" false
check loc5 "S3:http://LocalHost:9000/bucket" false
check s3 "s3:s3.amazonaws.com/bucket" true
check b2 "b2:bucket:path" true
check sftp "sftp:user@backup.example.net:/repo" true
check rest "rest:https://backup.example.net/repo" true
check azure "azure:container:/path" true
check gs "gs:bucket:/path" true
check swift "swift:container:/path" true
check rclone "rclone:remote:path" true

t_done
