#!/usr/bin/env bash
# Stop one company stack on the shared box. Data stays unless --purge (asks for the slug).
#
#   ~/nextup/stack/nginx/remove-stack.sh globex            # stop, keep database + secrets
#   ~/nextup/stack/nginx/remove-stack.sh globex --purge    # also delete database, volumes, .env
#
# Prints the sudo lines that take the site out of nginx and delete its certificate.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
slug="${1:?usage: remove-stack.sh SLUG [--purge]}"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
host="$slug.${NEXTUP_DOMAIN:-sellux.ch}"

if [ "${2:-}" = --purge ]; then
  "$here/../ctl.sh" "$slug" down -v --remove-orphans   # ctl.sh asks for the slug
  rm -rf "${NEXTUP_INSTANCES:?}/$slug"
  echo "Deleted the stack, its volumes and $NEXTUP_INSTANCES/$slug."
else
  "$here/../ctl.sh" "$slug" down --remove-orphans
  echo "Stopped. Database and secrets are kept; add-stack.sh starts it again."
fi
cat <<CMD

To take $host out of nginx, as a sudoer:

  sudo rm -f /etc/nginx/sites-enabled/nextup-$slug /etc/nginx/sites-available/nextup-$slug
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot delete --cert-name $host      # only if it has its own certificate
CMD
