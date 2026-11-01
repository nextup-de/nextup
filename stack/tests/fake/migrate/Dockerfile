# Stand-in for nextup-migrate: runs the migrate command of stack/compose.yml with psql.
# v1 carries migration 001, v2 carries 001 and 002.
FROM postgres:17.2-alpine3.20
ENTRYPOINT []
ARG FAKE_VERSION=v1
COPY npx.sh /usr/local/bin/npx
COPY migrations/ /all/
RUN chmod +x /usr/local/bin/npx \
 && mkdir /migrations \
 && cp /all/001_init.sql /migrations/ \
 && if [ "$FAKE_VERSION" != v1 ]; then cp /all/002_case.sql /migrations/; fi \
 && rm -rf /all
