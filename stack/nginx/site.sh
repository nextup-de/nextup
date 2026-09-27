#!/usr/bin/env bash
# Print the nginx site for a stack installed with install.sh --behind-proxy PORT.
# For a server whose 80/443 already belong to nginx + certbot (stage 1: the shared Hetzner box).
#
#   stack/nginx/site.sh acme.sellux.ch 3101 | sudo tee /etc/nginx/sites-available/nextup-acme
#   sudo ln -s /etc/nginx/sites-available/nextup-acme /etc/nginx/sites-enabled/
#   sudo nginx -t && sudo systemctl reload nginx
#   sudo certbot --nginx -d acme.sellux.ch        # adds TLS + the http->https redirect
set -euo pipefail
host="${1:?usage: stack/nginx/site.sh HOST PORT}" port="${2:?usage: stack/nginx/site.sh HOST PORT}"
[[ "$host" =~ ^[a-z0-9.-]+$ ]] || { echo "bad host: $host" >&2; exit 2; }
[[ "$port" =~ ^[0-9]{4,5}$ ]] || { echo "bad port: $port" >&2; exit 2; }
cat <<CONF
# NextUp stack at $host -> its Caddy on 127.0.0.1:$port (stack/install.sh --behind-proxy $port).
# Written by stack/nginx/site.sh; certbot --nginx adds the TLS part.
server {
    listen 80;
    listen [::]:80;
    server_name $host;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:$port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # Overwrite, never append: the app rate-limits on the first X-Forwarded-For entry.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }
}
CONF
