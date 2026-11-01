#!/usr/bin/env bash
# Proof for OPS-B1: every literal image in the stack is pinned by digest, CI publishes the brain,
# and install.sh --images switches a brain stack to the registry's brain image.
#   bash stack/tests/images-pinned.test.sh
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
export MSYS_NO_PATHCONV=1
source stack/tests/lib/assert.sh
source stack/tests/lib/host.sh

t_init "OPS images pinned and brain from CI"
trap host_down EXIT

# --- text checks (any checkout) -------------------------------------------------------------

# Every `image:` value is a ${...} variable or <name>:<version>@sha256:<64 hex>.
unpinned() {
  local f="$1" bad=0 v
  while IFS= read -r v; do
    v="${v#*image:}"; v="${v# }"
    case "$v" in '${'*) continue ;; esac
    [[ "$v" =~ :[^@]+@sha256:[0-9a-f]{64}$ ]] || { echo "$f: $v"; bad=1; }
  done < <(tr -d '\r' < "$f" | grep -E '^[[:space:]]*image:')
  return "$bad"
}
for f in stack/compose.yml stack/brain-server/compose.yml; do
  t_ok "$f: every image is a variable or pinned by digest" unpinned "$f"
  t_ok "$f: no :latest" bash -c '! tr -d "\r" < "$1" | grep -q ":latest"' _ "$f"
done

wf=.github/workflows/images.yml
t_ok "images.yml builds context services/brain" bash -c 'tr -d "\r" < "$1" | grep -qE "^[[:space:]]*context: services/brain$"' _ "$wf"
t_ok "images.yml tags nextup-brain:main" bash -c 'tr -d "\r" < "$1" | grep -qE "steps\.tags\.outputs\.brain \}\}:main$"' _ "$wf"
t_ok "images.yml tags nextup-brain:<short>" bash -c 'tr -d "\r" < "$1" | grep -qF "steps.tags.outputs.brain }}:\${{ steps.tags.outputs.short }}"' _ "$wf"
t_ok "images.yml: the brain output is ghcr.io/<owner>/nextup-brain" bash -c 'tr -d "\r" < "$1" | grep -q "echo \"brain=ghcr.io/.*/nextup-brain\""' _ "$wf"
t_ok "images.yml: pull_request paths include services/brain/**" bash -c 'tr -d "\r" < "$1" | grep -E "^[[:space:]]*paths:" | grep -qF "services/brain/**"' _ "$wf"

# --- install.sh in the host, with a stub docker ----------------------------------------------

host_up || { echo "host_up failed" >&2; exit 1; }

host_exec 'mkdir -p ~/stub && cat > ~/stub/docker <<"EOS"
#!/bin/sh
echo "$*" >> "$HOME/stub/docker.log"
case "$*" in
  *"ps app --format"*) echo healthy ;;
esac
exit 0
EOS
chmod +x ~/stub/docker' || exit 1

reg=localhost:5000/nextup
inst='~/nextup/instances'
run_install() { # <extra args...>
  host_exec "PATH=\$HOME/stub:\$PATH NEXTUP_REGISTRY=$reg stack/install.sh --origin http://localhost:8080 --stage demo $*"
}
env_of() { host_exec "grep -E '^$2=' $inst/$1/.env | cut -d= -f2-"; }
pulls() { host_exec "grep -c '^pull -q ' ~/stub/docker.log"; }

t_ok "new brain instance with --images aaaaaaa installs" run_install --slug opsimg --brain --images aaaaaaa
t_eq "brain image is the registry's sha-aaaaaaa" "$reg/nextup-brain:sha-aaaaaaa" "$(env_of opsimg NEXTUP_BRAIN_IMAGE)"
t_eq "app image is the registry's sha-aaaaaaa" "$reg/nextup-app:sha-aaaaaaa" "$(env_of opsimg NEXTUP_APP_IMAGE)"

host_exec ': > ~/stub/docker.log'
t_ok "--images bbbbbbb on the existing instance" run_install --slug opsimg --images bbbbbbb
t_eq "app switched" "$reg/nextup-app:sha-bbbbbbb" "$(env_of opsimg NEXTUP_APP_IMAGE)"
t_eq "migrate switched" "$reg/nextup-migrate:sha-bbbbbbb" "$(env_of opsimg NEXTUP_MIGRATE_IMAGE)"
t_eq "brain switched" "$reg/nextup-brain:sha-bbbbbbb" "$(env_of opsimg NEXTUP_BRAIN_IMAGE)"
t_eq "one NEXTUP_BRAIN_IMAGE line" 1 "$(host_exec "grep -c '^NEXTUP_BRAIN_IMAGE=' $inst/opsimg/.env")"
t_eq "the stub saw a pull -q for each of the three images" 3 \
  "$(host_exec "grep '^pull -q ' ~/stub/docker.log | grep -cE 'nextup-(app|migrate|brain):sha-bbbbbbb'")"

t_ok "an instance without the brain installs with --images aaaaaaa" run_install --slug opsplain --images aaaaaaa
t_eq "no NEXTUP_BRAIN_IMAGE line without the brain" 0 "$(host_exec "grep -c 'BRAIN' $inst/opsplain/.env")"
host_exec ': > ~/stub/docker.log'
t_ok "--images bbbbbbb on it" run_install --slug opsplain --images bbbbbbb
t_eq "still no brain line" 0 "$(host_exec "grep -c 'BRAIN' $inst/opsplain/.env")"
t_eq "only app and migrate were pulled" 2 "$(pulls)"

t_ok "--images local on the brain instance" run_install --slug opsimg --images local
t_eq "brain is nextup-brain:local again" "nextup-brain:local" "$(env_of opsimg NEXTUP_BRAIN_IMAGE)"
t_eq "app is nextup-app:local again" "nextup-app:local" "$(env_of opsimg NEXTUP_APP_IMAGE)"

t_done
