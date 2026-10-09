#!/usr/bin/env bash
# The ONLY thing the box agent may run as root: put one company stack into nginx (with a Let's
# Encrypt certificate) or take it out again.
#
#   sudo /usr/local/sbin/nextup-site add SLUG PORT      # SLUG.sellux.ch -> 127.0.0.1:PORT, + TLS
#   sudo /usr/local/sbin/nextup-site remove SLUG        # site out of nginx, certificate deleted
#   sudo /usr/local/sbin/nextup-site check SLUG         # exit 0 if nginx serves SLUG.sellux.ch
#
# Install once, as Kevin (a ROOT-OWNED copy outside the home directory - never point sudoers at
# ~/nextup/stack, which kschmid owns and every deploy replaces):
#
#   sudo install -o root -g root -m 755 ~/nextup/stack/provision/nextup-site.sh /usr/local/sbin/nextup-site
#   echo 'kschmid ALL=(root) NOPASSWD: /usr/local/sbin/nextup-site' | sudo tee /etc/sudoers.d/nextup-site
#   sudo chmod 440 /etc/sudoers.d/nextup-site && sudo visudo -cf /etc/sudoers.d/nextup-site
#
# After a change to this file in git, install it again the same way - the box keeps running the
# old copy until then, on purpose.
#
# Everything here is fixed: paths, domain, template. It reads nothing from ~/nextup and takes no
# option but the three words above, each checked against a pattern.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 022

DOMAIN=sellux.ch
AVAILABLE=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled
RESERVED=" www admin api n8n mail automation ops status app static assets _next login signup pricing contact imprint privacy forgot-password invite demo landing "

die() { echo "nextup-site: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die "run it with sudo"

action="${1:-}" slug="${2:-}" port="${3:-}"
[[ "$slug" =~ ^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$ ]] || die "SLUG must be 2-32 of a-z, 0-9, '-'"
case "$RESERVED" in *" $slug "*) die "'$slug' is reserved" ;; esac
host="$slug.$DOMAIN"
name="nextup-$slug"

case "$action" in
  add)
    [[ "$port" =~ ^3[1-9][0-9][0-9]$ ]] || die "PORT must be 3100-3999"
    # Another site on the box must not already answer for this host name.
    if grep -rlsw -- "server_name $host;" "$AVAILABLE" "$ENABLED" 2>/dev/null | grep -vqx -e "$AVAILABLE/$name" -e "$ENABLED/$name"; then
      die "another nginx site already serves $host"
    fi
    new="$(mktemp)"
    cat > "$new" <<CONF
# NextUp stack at $host -> its Caddy on 127.0.0.1:$port. Written by /usr/local/sbin/nextup-site
# (stack/provision/nextup-site.sh in nextup-de/nextup); certbot adds the TLS part.
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
    if [ -f "$AVAILABLE/$name" ] && grep -q "proxy_pass http://127.0.0.1:$port;" "$AVAILABLE/$name"; then
      rm -f "$new"   # already there (maybe with certbot's TLS part): keep it as it is
    else
      prev=""
      [ -f "$AVAILABLE/$name" ] && { prev="$(mktemp)"; cp -p "$AVAILABLE/$name" "$prev"; }
      install -o root -g root -m 644 "$new" "$AVAILABLE/$name"; rm -f "$new"
      ln -sfn "$AVAILABLE/$name" "$ENABLED/$name"
      if ! nginx -t -q 2>/dev/null; then
        # Never leave nginx unable to reload: put back what was there.
        if [ -n "$prev" ]; then install -o root -g root -m 644 "$prev" "$AVAILABLE/$name"; else rm -f "$AVAILABLE/$name" "$ENABLED/$name"; fi
        die "nginx -t failed - site not added"
      fi
      [ -n "$prev" ] && rm -f "$prev"
    fi
    ln -sfn "$AVAILABLE/$name" "$ENABLED/$name"
    systemctl reload nginx
    # The box's certbot account exists already; --keep-until-expiring makes a re-run a no-op.
    certbot --nginx -d "$host" --non-interactive --agree-tos --keep-until-expiring --redirect -q \
      || die "certbot failed for $host (nginx serves it on http only; DNS for *.$DOMAIN must point here)"
    nginx -t -q && systemctl reload nginx
    echo "nginx serves https://$host -> 127.0.0.1:$port"
    ;;
  remove)
    [ -z "$port" ] || die "remove takes only SLUG"
    rm -f "$ENABLED/$name" "$AVAILABLE/$name"
    nginx -t -q && systemctl reload nginx
    # Only a certificate for this one name: acme's certificate also covers globex, for example.
    domains="$(certbot certificates --cert-name "$host" 2>/dev/null | sed -n 's/^ *Domains: //p')"
    if [ "$domains" = "$host" ]; then
      certbot delete --cert-name "$host" --non-interactive -q
    elif [ -n "$domains" ]; then
      echo "kept certificate $host: it also covers $domains"
    fi
    echo "nginx no longer serves $host"
    ;;
  check)
    [ -L "$ENABLED/$name" ] && [ -f "$AVAILABLE/$name" ]
    ;;
  *) die "usage: nextup-site add SLUG PORT | remove SLUG | check SLUG" ;;
esac
