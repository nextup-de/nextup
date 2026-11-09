#!/usr/bin/env bash
# G4 criterion 2 in one command, against a server you name (docs/test-phase/G4_DRILLS.md): optionally generate the
# Musterwerk, sign a session cookie per account, then the three k6 stages of k6/g4-stages.sh with a verdict each.
# Run from apps/app. DATABASE_URL (the server's database) and AUTH_SECRET (the server's) come from the environment.
#
#   tests/load/g4-load.sh --base-url https://tst.example --slug tst --single --generate          # the run of record
#   tests/load/g4-load.sh --base-url http://127.0.0.1:3103 --slug g4dry --generate --people 150 --duration 30s
#
#   --base-url URL     the server (required)                 --slug SLUG   the company (required)
#   --single           the server runs TENANT_MODE=single, as every stack does (no slug in addresses)
#   --generate         run the Musterwerk generator first (--replace-generated: it replaces only an empty company or
#                      an earlier Musterwerk and refuses any other)
#   --people N (2000)  --weeks W (8)  --seed S (1)           the generator's options; --people also sets the stages
#   --duration D       per stage (5m)                        --stages "workday peak all"   (see k6/g4-stages.sh)
# K6_BASE_URL: the address k6's container uses, when it differs from --base-url (a local server on a Mac with
# Docker Desktop: http://host.docker.internal:3103). The cookies live in a private temp dir and are removed on exit.
set -uo pipefail
umask 077

usage() { sed -n '2,/^set -uo/p' "$0" | sed '$d' | sed -E 's/^# ?//' >&2; }
die2() { echo "g4-load: $*" >&2; exit 2; }
here="$(cd "$(dirname "$0")" && pwd)"
app="$(cd "$here/../.." && pwd)"

base="" slug="" single=false generate=false people=2000 weeks=8 seed=1 duration=5m stages="workday peak all"
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --single) single=true; shift ;;
    --generate) generate=true; shift ;;
    --base-url|--slug|--people|--weeks|--seed|--duration|--stages)
      [ $# -ge 2 ] || die2 "$1 needs a value"
      case "$1" in
        --base-url) base="${2%/}" ;; --slug) slug="$2" ;; --people) people="$2" ;; --weeks) weeks="$2" ;;
        --seed) seed="$2" ;; --duration) duration="$2" ;; --stages) stages="$2" ;;
      esac
      shift 2 ;;
    *) die2 "unknown option '$1' (see --help)" ;;
  esac
done
[[ "$base" =~ ^https?://[^[:space:]]+$ ]] || die2 "--base-url is an http(s) address"
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || die2 "--slug is a company slug"
[[ "$people" =~ ^[1-9][0-9]{1,5}$ ]] || die2 "--people is a number (at least 40 for the generator)"
[[ "$weeks" =~ ^[1-9][0-9]{0,2}$ ]] || die2 "--weeks is a number"
[[ "$seed" =~ ^[0-9]+$ ]] || die2 "--seed is a number"
[ -n "${DATABASE_URL:-}" ] || die2 "DATABASE_URL is not set (the server's database, e.g. through an ssh tunnel)"
[ -n "${AUTH_SECRET:-}" ] || die2 "AUTH_SECRET is not set (it must be the server's)"
command -v jq >/dev/null || die2 "needs jq"
command -v docker >/dev/null || die2 "needs docker (k6 runs in the pinned grafana/k6 image)"

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cd "$app" || exit 2
t0=$(date +%s)

if $generate; then
  echo "== generate Musterwerk: $people people, $weeks weeks, seed $seed"
  # The login codes are not needed (the cookies are signed), so they are not kept.
  npx tsx prisma/generators/musterwerk/run.ts --slug "$slug" --people "$people" --weeks "$weeks" --seed "$seed" --replace-generated \
    || { echo "g4-load: the generator failed" >&2; exit 1; }
fi

echo "== sign session cookies"
single_arg=(); ! $single || single_arg=(--single)
npx tsx tests/load/driver.ts --slug "$slug" --base-url "$base" ${single_arg[@]+"${single_arg[@]}"} --accounts "$people" --write-cookies "$work/cookies.json" \
  || { echo "g4-load: the driver could not write the cookies" >&2; exit 1; }

echo "== health of $base"
curl -fsS -o /dev/null --max-time 10 "$base/api/health" || { echo "g4-load: $base/api/health does not answer 200" >&2; exit 1; }

BASE_URL="${K6_BASE_URL:-$base}" G4_PEOPLE="$people" DURATION="$duration" G4_STAGES="$stages" \
  "$here/k6/g4-stages.sh" "$work/cookies.json"; rc=$?
echo "g4-load: $(( $(date +%s) - t0 )) s in all"
exit "$rc"
