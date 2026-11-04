#!/usr/bin/env bash
# Rotate one secret of an installed stack, on the host (docs/plans SEC, D9).
#
#   stack/rotate-keys.sh acme auth [--yes]     new AUTH_SECRET; every session ends
#   stack/rotate-keys.sh acme vault [--yes]    new CONNECTOR_VAULT_KEY; the app re-seals what it holds
#   stack/rotate-keys.sh acme restic [--yes]   new RESTIC_PASSWORD, old repository key removed
#
# Every change to the instance .env is atomic (temp file beside it, mode 0600, mv). Each step appends
# one line to $NEXTUP_INSTANCES/<slug>/rotations.log: time, key name, by - never a value.
# Docker (and restic, which runs in its image) is called through $ROTATE_DOCKER (default docker).
# ROTATE_WAIT_SECONDS (default 180) is how long vault waits for the app's re-seal line.
# Exit codes: 0 done, 1 stopped safely (nothing lost, see the message), 2 bad input.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
instances="${NEXTUP_INSTANCES:-$here/instances}"
docker_cmd="${ROTATE_DOCKER:-docker}"
wait_seconds="${ROTATE_WAIT_SECONDS:-180}"
poll_seconds="${ROTATE_POLL_SECONDS:-3}"
restic_image="restic/restic:0.19.1"
usage="usage: stack/rotate-keys.sh SLUG auth|vault|restic [--yes]"

bad() { echo "rotate-keys: $*" >&2; exit 2; }
stop() { echo "rotate-keys: $*" >&2; exit 1; }

slug="${1:-}"; kind="${2:-}"; yes=0
[ -n "$slug" ] && [ -n "$kind" ] || bad "$usage"
shift 2
for a in "$@"; do
  case "$a" in --yes) yes=1 ;; *) bad "unknown option '$a'. $usage" ;; esac
done
[[ "$slug" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || bad "bad slug '$slug'"
case "$kind" in auth|vault|restic) ;; *) bad "unknown key '$kind'. $usage" ;; esac
inst="$instances/$slug"
env_file="$inst/.env"
[ -f "$env_file" ] || bad "no stack '$slug' ($env_file missing)"

get() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2- || true; }
by="${SUDO_USER:-$(id -un 2>/dev/null || echo unknown)}"
note() { printf '%s %s by %s%s\n' "$(date -u +%FT%TZ)" "$1" "$by" "${2:+ ($2)}" >> "$inst/rotations.log"; }

# set_env NAME VALUE [NAME VALUE ...]: an empty VALUE removes the line. One atomic replace of .env.
# Values travel through the environment, never through a command line.
set_env() {
  local tmp names="" i=1
  tmp="$(umask 077; mktemp "$inst/.env.XXXXXX")"
  chmod 0600 "$tmp"
  while [ "$i" -le "$#" ]; do
    local n="${!i}" v=$((i + 1))
    names="$names $n"
    export "ROTATE_V_$((i / 2))=${!v}"
    i=$((i + 2))
  done
  awk -v names="$names" '
    BEGIN { c = split(names, nm, " "); for (k = 1; k <= c; k++) val[nm[k]] = ENVIRON["ROTATE_V_" (k - 1)] }
    { key = $0; sub(/=.*/, "", key)
      if (key in val) { if (!(key in done)) { if (val[key] != "") print key "=" val[key]; done[key] = 1 }; next }
      print }
    END { for (k = 1; k <= c; k++) if (!(nm[k] in done) && val[nm[k]] != "") print nm[k] "=" val[nm[k]] }
  ' "$env_file" > "$tmp" || stop "could not write the new .env; nothing changed"
  mv "$tmp" "$env_file"
}

# Run ctl.sh with the stub (or real) docker first in PATH.
ctl() {
  local p="$PATH"
  case "$docker_cmd" in */*) p="$(dirname "$docker_cmd"):$PATH" ;; esac
  PATH="$p" "$here/ctl.sh" "$slug" "$@"
}
recreate_app() { ctl up -d --force-recreate app >/dev/null || stop "the app did not restart; check '$here/ctl.sh $slug ps'"; }

confirm() {
  echo "$1"
  [ "$yes" -eq 1 ] && return 0
  local answer; read -r -p "Type the slug to continue: " answer || answer=""
  [ "$answer" = "$slug" ] || { echo "Not confirmed - nothing changed."; exit 1; }
}

case "$kind" in
auth)
  confirm "Rotating AUTH_SECRET of '$slug': every session ends and everyone must sign in again."
  set_env AUTH_SECRET "$(openssl rand -hex 32)"
  note AUTH_SECRET rotated
  recreate_app
  echo "AUTH_SECRET rotated; the app was recreated. All sessions ended."
  ;;

vault)
  old="$(get CONNECTOR_VAULT_KEY)"
  [ -n "$old" ] || stop "$slug has no CONNECTOR_VAULT_KEY"
  [ -z "$(get CONNECTOR_VAULT_KEY_PREVIOUS)" ] || stop "CONNECTOR_VAULT_KEY_PREVIOUS is still set: an earlier rotation did not finish. Check the app log for '[vault] re-sealed' first."
  confirm "Rotating CONNECTOR_VAULT_KEY of '$slug': the app re-seals every connection secret with the new key (waits up to ${wait_seconds}s)."
  set_env CONNECTOR_VAULT_KEY_PREVIOUS "$old" CONNECTOR_VAULT_KEY "$(openssl rand -hex 32)"
  note CONNECTOR_VAULT_KEY "new key set, previous kept"
  recreate_app
  deadline=$((SECONDS + wait_seconds)); result=""
  while :; do
    line="$(ctl logs --no-color app 2>/dev/null | grep -F '[vault] re-sealed' | tail -n 1 || true)"
    if [ -n "$line" ]; then
      case "$line" in
        *"left 0, failed 0"*) result=ok; break ;;
        *) if [[ "$line" =~ failed\ ([0-9]+) ]] && [ "${BASH_REMATCH[1]}" -gt 0 ]; then result=failed; break; fi ;;
      esac
    fi
    [ "$SECONDS" -lt "$deadline" ] || { result=timeout; break; }
    sleep "$poll_seconds"
  done
  if [ "$result" != ok ]; then
    note CONNECTOR_VAULT_KEY "stopped: $result, both keys kept"
    stop "vault re-seal did not finish cleanly ($result). Both keys are kept in $env_file; read the app log ('$here/ctl.sh $slug logs app') before doing anything else."
  fi
  set_env CONNECTOR_VAULT_KEY_PREVIOUS ""
  note CONNECTOR_VAULT_KEY "re-sealed, previous key removed"
  recreate_app
  echo "CONNECTOR_VAULT_KEY rotated; everything is sealed with the new key. Copy the new key off this machine."
  ;;

restic)
  old_pw="$(get RESTIC_PASSWORD)"; repo="$(get RESTIC_REPOSITORY)"
  [ -n "$old_pw" ] && [ -n "$repo" ] || stop "$slug has no RESTIC_REPOSITORY / RESTIC_PASSWORD (run stack/backup.sh $slug backup first)"
  confirm "Rotating RESTIC_PASSWORD of '$slug': a new repository key is added and checked, then the old one is removed."
  s3_env=()
  if [ -n "$(get BACKUP_S3_ACCESS_KEY_ID)" ] && [ -n "$(get BACKUP_S3_SECRET_ACCESS_KEY)" ]; then
    export AWS_ACCESS_KEY_ID="$(get BACKUP_S3_ACCESS_KEY_ID)" AWS_SECRET_ACCESS_KEY="$(get BACKUP_S3_SECRET_ACCESS_KEY)"
    s3_env=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY)
  fi
  newpw_file="$(umask 077; mktemp)"
  trap 'rm -f "$newpw_file"' EXIT
  new_pw="$(openssl rand -hex 32)"
  printf '%s' "$new_pw" > "$newpw_file"
  # rrestic PASSWORD ARGS...: restic in its image, as the calling user.
  rrestic() {
    local pw="$1"; shift
    local mounts=() target="$repo"
    if [[ "$repo" = /* ]]; then mounts=(-v "$repo:/repo"); target=/repo; fi
    RESTIC_PASSWORD="$pw" "$docker_cmd" run --rm --user "$(id -u):$(id -g)" -e RESTIC_CACHE_DIR=/tmp/restic-cache \
      -e RESTIC_PASSWORD -e RESTIC_REPOSITORY="$target" ${s3_env[@]+"${s3_env[@]}"} \
      -v "$newpw_file:/newpw:ro" ${mounts[@]+"${mounts[@]}"} "$restic_image" "$@"
  }
  old_id="$(rrestic "$old_pw" key list 2>/dev/null | awk '/^\*/ { sub(/^\*/, "", $1); print $1; exit }')" || old_id=""
  [ -n "$old_id" ] || stop "could not find the id of the current repository key; nothing changed"
  rrestic "$old_pw" key add --new-password-file /newpw >/dev/null 2>&1 \
    || { note RESTIC_PASSWORD "stopped: key add failed, old password kept"; stop "restic key add failed; the old password still works and is kept"; }
  rrestic "$new_pw" snapshots >/dev/null 2>&1 \
    || { note RESTIC_PASSWORD "stopped: new key did not open the repository, old password kept"; stop "the new key does not open the repository; the old password still works and is kept"; }
  rrestic "$new_pw" key remove "$old_id" >/dev/null 2>&1 \
    || { note RESTIC_PASSWORD "stopped: old key not removed, old password kept"; stop "restic key remove failed; the old password still works and is kept in .env"; }
  set_env RESTIC_PASSWORD "$new_pw"
  note RESTIC_PASSWORD "rotated, old key removed"
  echo "RESTIC_PASSWORD rotated. Copy the new password from $env_file off this machine now."
  ;;
esac
