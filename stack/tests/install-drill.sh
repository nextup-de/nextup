#!/usr/bin/env bash
# G4 criterion 6, the install drill (docs/test-phase/G4_DRILLS.md): install one stack on a FRESH VM by following the
# documented steps (stack/remote/README.md sections 1-5), and record how long each step took, whether its check
# passed and any manual fix the documents did not mention. The install itself is stack/tests/install-clean.sh.
#
# Start it as soon as the VM exists, as root, from a copy of this one file (the rest of stack/ comes in step 6):
#   scp stack/tests/install-drill.sh root@<vm>:   then on the VM:
#   BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=... ./install-drill.sh \
#       --slug drill --origin https://drill.example --images <sha7> --backup-repo s3:https://<endpoint>/<bucket>/drill
#
# For each step it shows what the document says, then waits. Answer with
#   Enter        done now (the step's time runs from when it was shown)
#   m <minutes>  it was done before, it took <minutes>
#   s            skipped (say why in the fix line)
# Then it runs the step's check, and asks for a manual fix or deviation (Enter: none). Step 7 runs install-clean.sh
# itself, as deploy. The record goes to ./install-drill-<slug>-<utc>.md (no secret in it); exit 0 when every check
# passed and install-clean.sh says "0 failed".
set -uo pipefail
umask 077

slug="" origin="" images="" backup_repo="" registry=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) slug="${2:?}"; shift 2 ;;
    --origin) origin="${2%/}"; shift 2 ;;
    --images) images="${2:?}"; shift 2 ;;
    --backup-repo) backup_repo="${2:?}"; shift 2 ;;
    --registry) registry="${2:?}"; shift 2 ;;   # for the test host's fake registry only
    -h|--help) sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed -E 's/^# ?//'; exit 0 ;;
    *) echo "install-drill: unknown option '$1' (see --help)" >&2; exit 2 ;;
  esac
done
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] && [[ "$origin" =~ ^https?://[^/[:space:]]+$ ]] && [ -n "$images" ] \
  || { echo "install-drill: --slug, --origin and --images are required (see --help)" >&2; exit 2; }
host="${origin#*://}"; host="${host%%:*}"

# As deploy: checks that need the deploy user, and the install. Root switches with sudo and keeps the S3 keys only.
as_deploy() {
  if [ "$(id -u)" = 0 ]; then
    sudo -u deploy -H --preserve-env=BACKUP_S3_ACCESS_KEY_ID,BACKUP_S3_SECRET_ACCESS_KEY bash -lc "cd ~ && $1"
  else
    bash -lc "cd ~ && $1"
  fi
}
nextup='$HOME/nextup'

# The steps: "<title>|<document>|<what to do>|<check, run as deploy unless it starts with 'root:'>"
steps=(
  "VM created, firewall attached|plan 2026-11-08_test-server-setup.md part 1|Ubuntu 24.04, 4 vCPU / 8 GB; firewall: 22 from your address, 80 and 443 from anywhere|root:test -r /etc/os-release"
  "DNS name points at this VM|plan part 1, row 5|$host A -> this VM's address (its own record, not the wildcard)|root:getent hosts $host"
  "Docker Engine with the compose plugin|stack/remote/README.md 1.2|docs.docker.com, \"Install using the apt repository\"|root:docker compose version"
  "User deploy in group docker|stack/remote/README.md 1.1|adduser --disabled-password --gecos \"\" deploy && usermod -aG docker deploy; copy root's authorized_keys|docker info >/dev/null && id -nG | grep -qw docker"
  "Harden the VM|plan part 2|nextup-infra servers/harden.sh apply --public-port 80 --public-port 443|root:true"
  "Registry login and stack/ of the commit|plan part 2|as deploy: token piped into docker login ghcr.io; clone, checkout $images, copy stack/ to ~/nextup/stack|test -x $nextup/stack/install.sh && test -x $nextup/stack/tests/install-clean.sh"
  "Install: install-clean.sh|stack/remote/README.md 2|run by this drill|install"
  "Passwords into the password manager|stack/remote/README.md 2, RPO_RTO.md|RESTIC_PASSWORD and CONNECTOR_VAULT_KEY of instances/$slug/.env|grep -q '^RESTIC_PASSWORD=.' $nextup/instances/$slug/.env"
  "host.conf|stack/remote/README.md 3|~/nextup/host.conf, mode 600: SLUG=$slug|grep -qx 'SLUG=$slug' $nextup/host.conf"
  "Cron: backups and health|stack/remote/README.md 5|crontab -e: the two backup.sh lines; then ~/nextup/stack/health.sh install|[ \"\$(crontab -l 2>/dev/null | grep -c 'backup.sh all')\" -ge 2 ] && crontab -l | grep -q health.sh"
  "Reachable from outside|-|from your own machine: curl -fsS $origin/api/health (Let's Encrypt certificate)|curl -fsS -o /dev/null --max-time 10 $origin/api/health"
)

record="$PWD/install-drill-$slug-$(date -u +%Y%m%dT%H%M%SZ).md"
rows=() fixes=0 checks_failed=0 install_line="not run" started="$(date -u +%FT%TZ)" total=0
echo "Install drill for $slug ($origin, images $images). Record: $record"
n=0
for s in "${steps[@]}"; do
  n=$((n + 1))
  IFS='|' read -r title doc todo check <<< "$s"
  echo; echo "[$n/${#steps[@]}] $title   ($doc)"; echo "    $todo"
  t0=$(date +%s) mins="" state=done
  if [ "$check" = install ]; then
    args="--slug $slug --origin $origin --images $images"
    [ -z "$backup_repo" ] || args="$args --backup-repo $backup_repo"
    [ -z "$registry" ] || args="$args --registry $registry"
    out="$(as_deploy "$nextup/stack/tests/install-clean.sh $args" 2>&1 < /dev/null)"; rc=$?
    printf '%s\n' "$out" | sed 's/^/    | /'
    install_line="$(printf '%s\n' "$out" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -n 1)"
    [ -n "$install_line" ] || install_line="no summary line (exit $rc)"
    check_res=ok; [ "$rc" -eq 0 ] && [[ "$install_line" == *", 0 failed" ]] || check_res=FAILED
  else
    read -r -p "    Enter when done, 'm <minutes>' if done before, 's' to skip: " ans || ans=""
    case "$ans" in
      m\ *) mins="${ans#m }"; [[ "$mins" =~ ^[0-9]+([.][0-9]+)?$ ]] || mins=0 ;;
      s) state=skipped ;;
    esac
    if [ "$state" = skipped ]; then check_res=skipped
    else
      if [[ "$check" == root:* ]]; then c="${check#root:}"; bash -c "$c" >/dev/null 2>&1 < /dev/null; rc=$?
      else as_deploy "$check" >/dev/null 2>&1 < /dev/null; rc=$?; fi
      check_res=ok; [ "$rc" -eq 0 ] || check_res=FAILED
    fi
  fi
  secs=$(( $(date +%s) - t0 ))
  [ -z "$mins" ] || secs="$(awk -v m="$mins" 'BEGIN { printf "%d", m * 60 }')"
  total=$((total + secs))
  echo "    check: $check_res"
  read -r -p "    Manual fix or deviation from the document (Enter: none): " fix || fix=""
  fix="${fix//|//}"
  [ -z "$fix" ] || fixes=$((fixes + 1))
  [ "$check_res" != FAILED ] || checks_failed=$((checks_failed + 1))
  rows+=("| $n | $title | $doc | $(awk -v s="$secs" 'BEGIN { printf "%.1f", s / 60 }') | $check_res | ${fix:--} |")
done

ok=yes; [ "$checks_failed" -eq 0 ] && [[ "$install_line" == *", 0 failed" ]] || ok=no
{
  echo "# Install drill: $slug, $started"
  echo
  echo "- Origin $origin, images \`$images\`, backups ${backup_repo:-on this machine}"
  echo "- $(sed -n 's/^PRETTY_NAME=//p' /etc/os-release 2>/dev/null | tr -d '"'), $(uname -sr), $(docker --version 2>/dev/null || echo 'no docker')"
  echo "- install-clean.sh: $install_line"
  echo "- Total: $(awk -v s="$total" 'BEGIN { printf "%.0f", s / 60 }') min; checks failed: $checks_failed; manual fixes: $fixes"
  echo "- Result: $([ "$ok" = yes ] && echo PASS || echo FAIL)$([ "$fixes" -eq 0 ] || echo " - each manual fix is a finding: the documents must say it")"
  echo
  echo "| # | Step | Document | Minutes | Check | Manual fix |"
  echo "|---|---|---|---|---|---|"
  printf '%s\n' "${rows[@]}"
} > "$record"
echo; cat "$record"; echo; echo "record: $record"
[ "$ok" = yes ]
