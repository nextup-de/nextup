#!/usr/bin/env bash
# Copy the locally built stack images to a server over SSH (stage 1 bridge until CI publishes
# them to GHCR in step 4). Builds them first with --build.
#
#   stack/push-images.sh hetzner            # ssh host alias from ~/.ssh/config
#   stack/push-images.sh hetzner --build
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
host="${1:?usage: stack/push-images.sh SSH_HOST [--build]}"
if [ "${2:-}" = --build ]; then
  docker build -q -f "$repo/ops/Dockerfile" --target build -t nextup-migrate:local "$repo" >/dev/null
  docker build -q -f "$repo/ops/Dockerfile" --target run -t nextup-app:local "$repo" >/dev/null
fi
docker save nextup-app:local nextup-migrate:local | gzip -1 | ssh "$host" 'gunzip | docker load'
