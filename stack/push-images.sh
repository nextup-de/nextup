#!/usr/bin/env bash
# Copy the locally built stack images to a server over SSH (stage 1 bridge until CI publishes
# them to GHCR in step 4). Builds them first with --build.
#
#   stack/push-images.sh hetzner            # ssh host alias from ~/.ssh/config
#   stack/push-images.sh hetzner --build
#   stack/push-images.sh hetzner --build --brain   # also the brain (services/brain)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
host="${1:?usage: stack/push-images.sh SSH_HOST [--build] [--brain]}"
build=false brain=false
for a in "${@:2}"; do
  case "$a" in --build) build=true ;; --brain) brain=true ;; *) echo "unknown option: $a" >&2; exit 2 ;; esac
done
images=(nextup-app:local nextup-migrate:local)
if $brain; then images+=(nextup-brain:local); fi
if $build; then
  docker build -q -f "$repo/ops/Dockerfile" --target build -t nextup-migrate:local "$repo" >/dev/null
  docker build -q -f "$repo/ops/Dockerfile" --target run -t nextup-app:local "$repo" >/dev/null
  if $brain; then docker build -q -t nextup-brain:local "$repo/services/brain" >/dev/null; fi
fi
docker save "${images[@]}" | gzip -1 | ssh "$host" 'gunzip | docker load'
