#!/usr/bin/env bash
# Install (or start again) one company's NextUp stack.
#
#   stack/install.sh --slug acme --origin http://localhost:8080 --stage demo --build
#   stack/install.sh --slug globex --origin https://globex.sellux.ch --stage real
#   stack/install.sh --slug acme --origin https://acme.sellux.ch --stage demo --behind-proxy 3101
#
# First run: creates the instance folder with a .env holding freshly generated secrets.
# Later runs: keep that .env as it is (secrets are never regenerated) and start the stack again.
# Nothing here leaves the machine: secrets come from openssl, images are local or pulled.
#
# Options
#   --slug SLUG        the company, e.g. acme (lowercase, digits, dashes; 2-32 chars)
#   --origin URL       where people reach it: http://localhost:8080, https://acme.sellux.ch
#   --stage demo|real  demo seeds the demo company, turns on the demo login list and mailpit;
#                      real starts empty - create the company in /admin with the same slug
#   --landing URL      the public site, linked from /admin (optional)
#   --n8n              also run n8n inside this stack (editor on 127.0.0.1)
#   --build            build the images from this repo first (until CI publishes them)
#   --dir DIR          instance folder (default: stack/instances/SLUG, or $NEXTUP_INSTANCES/SLUG)
#   --images TAG       run the images CI publishes to GHCR (docs: .github/workflows/images.yml):
#                      main, or a commit's short sha. 'local' goes back to local builds. Also
#                      works on an existing instance: only the two image lines change.
#   --behind-proxy PORT  a server whose 80/443 already belong to a reverse proxy (nginx) that
#                      terminates TLS: Caddy serves plain http on 127.0.0.1:PORT, mailpit on
#                      PORT+1, n8n on PORT+2. Point the proxy at PORT (stack/nginx/site.sh).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"

slug="" origin="" stage="demo" landing="" n8n=false build=false dir="" proxy_port="" images=""
while [ $# -gt 0 ]; do
  case "$1" in
    --slug) slug="$2"; shift 2 ;;
    --origin) origin="${2%/}"; shift 2 ;;
    --stage) stage="$2"; shift 2 ;;
    --landing) landing="$2"; shift 2 ;;
    --n8n) n8n=true; shift ;;
    --build) build=true; shift ;;
    --dir) dir="$2"; shift 2 ;;
    --behind-proxy) proxy_port="$2"; shift 2 ;;
    --images) images="$2"; shift 2 ;;
    -h|--help) sed -n '2,31p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

die() { echo "install: $*" >&2; exit 1; }

# Same rules as isValidSlug() in apps/app/src/features/auth/request.ts.
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || die "--slug must be 2-32 of a-z, 0-9, '-' (got '$slug')"
case " www admin api n8n mail automation ops status app static assets _next login signup pricing contact imprint privacy forgot-password invite " in
  *" $slug "*) die "'$slug' is reserved by the app" ;;
esac
[[ "$origin" =~ ^(https?)://([a-zA-Z0-9.-]+)(:([0-9]+))?$ ]] || die "--origin must look like http://host[:port] or https://host[:port]"
scheme="${BASH_REMATCH[1]}" host="${BASH_REMATCH[2]}" port="${BASH_REMATCH[4]}"
[ "$stage" = demo ] || [ "$stage" = real ] || die "--stage is demo or real"
if [ -n "$proxy_port" ]; then
  [[ "$proxy_port" =~ ^[0-9]{4,5}$ ]] && [ "$proxy_port" -le 65000 ] || die "--behind-proxy takes a port, e.g. 3101"
  [ "$scheme" = https ] || die "--behind-proxy expects an https --origin (the proxy terminates TLS)"
fi
registry="${NEXTUP_REGISTRY:-ghcr.io/selluxhenner}"
case "$images" in
  ""|local) app_image=nextup-app:local; migrate_image=nextup-migrate:local ;;
  *) [[ "$images" =~ ^(main|[0-9a-f]{7,40})$ ]] || die "--images is main, a short commit sha or local"
     $build && die "--images and --build exclude each other"
     app_image="$registry/nextup-app:$images"; migrate_image="$registry/nextup-migrate:$images" ;;
esac
command -v docker >/dev/null || die "docker is not installed"
command -v openssl >/dev/null || die "openssl is not installed"

dir="${dir:-${NEXTUP_INSTANCES:-$here/instances}/$slug}"
env_file="$dir/.env"
compose=(docker compose -f "$here/compose.yml" --env-file "$env_file")

if [ -f "$env_file" ]; then
  echo "Keeping $env_file (secrets are never regenerated)."
  if [ -n "$images" ]; then
    # Only the image lines change; sed -i keeps the file's owner and mode.
    sed -i -e "s|^NEXTUP_APP_IMAGE=.*|NEXTUP_APP_IMAGE=$app_image|"            -e "s|^NEXTUP_MIGRATE_IMAGE=.*|NEXTUP_MIGRATE_IMAGE=$migrate_image|" "$env_file"
    echo "Images: $app_image, $migrate_image"
  fi
else
  mkdir -p "$dir"
  rand() { openssl rand -hex "$1"; }

  # Only the laptop and proxy cases trust X-Forwarded-For from a private address; a public Caddy
  # sees clients directly and must not believe what they send.
  trusted="127.0.0.1/32" mail_port=8025 n8n_port=5678
  if [ -n "$proxy_port" ]; then
    # Everything on the loopback: only the proxy on this machine reaches Caddy. 443 stays unused
    # but needs a valid mapping, so it gets a loopback port of its own.
    site=":80"; http_port="127.0.0.1:$proxy_port"; https_port="127.0.0.1:$((proxy_port + 9))"
    secure=true; trusted="private_ranges"; mail_port=$((proxy_port + 1)); n8n_port=$((proxy_port + 2))
  elif [ "$scheme" = http ]; then
    site=":80"; http_port="${port:-80}"; https_port="8443"; secure=false
  else
    # Let's Encrypt needs the real 80/443; a different https port only makes sense behind NAT.
    site="$host"; http_port="80"; https_port="${port:-443}"; secure=true
  fi

  profiles=""; seed=false; demo_login=false; smtp=""
  if [ "$stage" = demo ]; then
    profiles="demo"; demo_login=true; smtp="smtp://mailpit:1025"
    if [ "$slug" = acme ]; then seed=true
    else echo "Note: only 'acme' has demo data to seed. Create '$slug' in /admin after the start."
    fi
  fi
  if $n8n; then profiles="${profiles:+$profiles,}n8n"; fi

  (
    umask 077
    cat > "$env_file" <<ENV
# NextUp stack for "$slug" - written by stack/install.sh on $(date -u +%Y-%m-%dT%H:%MZ).
# Holds this stack's secrets. Never commit it, never copy it to another stack.
COMPANY_SLUG=$slug
APP_ORIGIN=$origin
LANDING_URL=$landing
SITE_ADDRESS=$site
HTTP_PORT=$http_port
HTTPS_PORT=$https_port
COOKIE_SECURE=$secure
TRUSTED_PROXIES=$trusted
MAILPIT_PORT=$mail_port
N8N_PORT=$n8n_port
COMPOSE_PROFILES=$profiles
SEED_DEMO=$seed
LOGIN_DEMO_FILL=$demo_login
SMTP_URL=$smtp

POSTGRES_PASSWORD=$(rand 24)
AUTH_SECRET=$(rand 32)
ADMIN_ACCESS_CODE=$(rand 16)
N8N_ENCRYPTION_KEY=$(rand 32)

# Images: local builds, or GHCR with --images (change them with install.sh --images TAG).
NEXTUP_APP_IMAGE=$app_image
NEXTUP_MIGRATE_IMAGE=$migrate_image
ENV
  )
  echo "Wrote $env_file with new secrets."
fi

if $build; then
  echo "Building images from $repo ..."
  docker build -q -f "$repo/ops/Dockerfile" --target build -t nextup-migrate:local "$repo" >/dev/null
  docker build -q -f "$repo/ops/Dockerfile" --target run -t nextup-app:local "$repo" >/dev/null
fi

if grep -q '^NEXTUP_APP_IMAGE=nextup-app:local$' "$env_file"; then
  :   # local images: nothing to pull
else
  "${compose[@]}" pull --quiet app migrate
fi
"${compose[@]}" up -d --remove-orphans

echo -n "Waiting for the app to be healthy "
for _ in $(seq 1 60); do
  state="$("${compose[@]}" ps app --format '{{.Health}}' 2>/dev/null || true)"
  [ "$state" = healthy ] && break
  echo -n "."; sleep 3
done
echo
[ "$state" = healthy ] || { "${compose[@]}" logs --tail 40 migrate app >&2; die "the app did not become healthy"; }

get() { grep -E "^$1=" "$env_file" | cut -d= -f2-; }
echo
echo "NextUp for '$slug' is up:  $(get APP_ORIGIN)"
echo "  Admin:        $(get APP_ORIGIN)/admin   code: $(get ADMIN_ACCESS_CODE)"
if [ "$(get SEED_DEMO)" = true ]; then
  "${compose[@]}" logs --no-log-prefix migrate 2>/dev/null | sed -n '/^login codes/,$p' | sed 's/^/  /' || true
fi
case "$(get COMPOSE_PROFILES)" in *demo*) echo "  Mail inbox:   http://127.0.0.1:$(get MAILPIT_PORT || echo 8025)" ;; esac
echo "  Manage:       stack/ctl.sh $slug ps | logs -f app | down"
