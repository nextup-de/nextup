# Stand-in for nextup-app in stack tests: answers like the real one on /api/health and /.
FROM node:22.12.0-alpine3.20
ARG FAKE_VERSION=v1
ENV FAKE_VERSION=$FAKE_VERSION
# compose.yml mounts a tmpfs here; the directory exists so a read-only root can mount over it.
RUN mkdir -p /app/apps/app/.next/cache
COPY server.js /app/server.js
USER 1001:1001
CMD ["node", "/app/server.js"]
