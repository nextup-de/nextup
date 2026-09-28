#!/usr/bin/env bash
# Add (or restart) one company stack on the shared box behind nginx. Run on the server as the
# deploy user - no sudo needed; it prints the three sudo lines for nginx + certbot at the end.
#
#   ~/nextup/stack/nginx/add-stack.sh acme 3101 demo
#   ~/nextup/stack/nginx/add-stack.sh globex 3111 demo
#
# PORT must be the stack's row in stack/nginx/ports.md, or - for a stack started from admin.sellux.ch
# by the box agent (stack/provision/agent.sh) - the PORT line of its $NEXTUP_INSTANCES/SLUG/stack.conf,
# which lives outside ~/nextup/stack (every deploy replaces that). Extra args go to install.sh.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
slug="${1:?usage: add-stack.sh SLUG PORT demo|real [install.sh args]}"
port="${2:?usage: add-stack.sh SLUG PORT demo|real [install.sh args]}"
stage="${3:?usage: add-stack.sh SLUG PORT demo|real [install.sh args]}"
shift 3
domain="${NEXTUP_DOMAIN:-sellux.ch}"
host="$slug.$domain"
export NEXTUP_INSTANCES="${NEXTUP_INSTANCES:-$HOME/nextup/instances}"
sites="${NEXTUP_SITES:-$HOME/nextup/nginx}"

conf="$NEXTUP_INSTANCES/$slug/stack.conf"
grep -qE "^\| *$slug *\| *$port *\|" "$here/ports.md" || { [ -f "$conf" ] && grep -qx "PORT=$port" "$conf"; } \
  || { echo "add-stack: '$slug $port' is neither in stack/nginx/ports.md nor in $conf - add the row first." >&2; exit 1; }

"$here/../install.sh" --slug "$slug" --origin "https://$host" --stage "$stage" --behind-proxy "$port" "$@"

mkdir -p "$sites"
"$here/site.sh" "$host" "$port" > "$sites/nextup-$slug"
if [ -e "/etc/nginx/sites-enabled/nextup-$slug" ]; then
  echo "nginx already serves $host."
else
  cat <<CMD

nginx does not serve $host yet. Run once, as a sudoer:

  sudo cp $sites/nextup-$slug /etc/nginx/sites-available/ && sudo ln -sf /etc/nginx/sites-available/nextup-$slug /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d $host
CMD
fi
