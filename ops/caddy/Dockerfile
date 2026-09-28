# Caddy with the hosttech DNS plugin built in.
#
# Why the plugin: serviweb.ch's DNS is at hosttech, and Let's Encrypt will not issue a WILDCARD
# certificate over HTTP-01 - wildcards require the DNS-01 challenge. One wildcard cert for
# *.nextup.serviweb.ch means a company created in /admin is reachable over HTTPS immediately,
# with no per-host issuance.
#
# Company stacks (stack/) don't use this image: each has plain caddy:2, and on the shared box
# nginx + certbot do TLS (stack/nginx/RUNBOOK.md).
FROM caddy:2-builder AS build
RUN xcaddy build --with github.com/caddy-dns/hosttech

FROM caddy:2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
