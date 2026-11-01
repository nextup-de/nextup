# The throwaway "customer machine" every stack test runs on (stack/tests/README.md): Docker
# inside Docker, plus the tools install.sh, backup.sh and ssh deploys need. Keep the image's own
# entrypoint: it starts dockerd.
FROM docker:27.5.1-dind

RUN apk add --no-cache bash coreutils util-linux openssl curl jq tar gzip openssh-server openssh-client \
 # dockerd gives its socket to the group docker (this image already has it)
 && (getent group docker >/dev/null || addgroup -S docker) \
 && adduser -D -s /bin/bash -G docker deploy \
 && adduser -D -s /bin/bash -G docker ci \
 # unlocked for sshd, but no password: the field is "*", not "!"
 && sed -i -E 's/^(deploy|ci):[^:]*:/\1:*:/' /etc/shadow \
 && ssh-keygen -A \
 && mkdir -p /home/deploy/nextup \
 && chown deploy:docker /home/deploy/nextup
