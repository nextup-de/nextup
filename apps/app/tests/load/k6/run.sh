#!/usr/bin/env bash
# Runs the Musterwerk k6 script in the pinned Grafana k6 image (TST-L1, D9). No k6 binary or package in the repo.
#
#   tests/load/k6/run.sh <cookies.json> [extra k6 args]
#   BASE_URL=http://host:3103 VUS=2000 DURATION=10m tests/load/k6/run.sh cookies.json
#
# <cookies.json> comes from `npx tsx tests/load/driver.ts --slug <slug> --write-cookies <file>` (mode 600). The
# container runs as your user so it can read that file. K6_NETWORK (default host) lets it reach a server on this machine.
set -euo pipefail

# Newest k6 release at least two weeks old when this was written (2.2.0, 10 Aug 2026), pinned by version and digest.
K6_IMAGE="grafana/k6:2.2.0@sha256:9bd01d6941fca969cb61bb57d2da5ee9b385fe2aa8881df3798c196564d6ace6"

cookies="${1:?usage: run.sh <cookies.json> [k6 args]}"
shift
here="$(cd "$(dirname "$0")" && pwd)"
data="$(cd "$(dirname "$cookies")" && pwd)"
me="$(id -u):$(id -g)"

exec docker run --rm --user "$me" --network "${K6_NETWORK:-host}" \
  -v "$here:/scripts:ro" -v "$data:/data:ro" \
  -e "COOKIES_FILE=/data/$(basename "$cookies")" \
  -e BASE_URL -e VUS -e DURATION \
  "$K6_IMAGE" run "$@" /scripts/musterwerk.js
