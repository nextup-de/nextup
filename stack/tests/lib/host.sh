# The container host every stack test runs on (stack/tests/README.md).
#
# One privileged Docker-in-Docker container is the "customer machine": every script under test
# runs inside it, never on the machine that runs the test. Source it from a test that has
# cd'ed to the repo root:   source stack/tests/lib/host.sh
#
# Why not plain `docker run -v /tmp/...`: from Git Bash on Windows that mounts a folder of
# Docker Desktop's VM, not yours, and Git Bash rewrites paths. So paths given to docker.exe below
# are relative to the repo root, and everything else is a string for a shell inside the host.
# Nothing here ever connects to a real server.

export MSYS_NO_PATHCONV=1

OPSTEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
_opstest_id="$(printf %s "$OPSTEST_ROOT" | sha1sum | cut -c1-8)"
OPSTEST_VOLUME="nextup-opstest-cache-$_opstest_id"
OPSTEST_HOST=""
OPSTEST_S3=""
OPSTEST_IMAGE="nextup-opstest-host:1"

_host_run() { # <user> <workdir> <command...>
  local user="$1" dir="$2"
  shift 2
  docker exec -i -u "$user" -w "$dir" \
    -e NEXTUP_HOME=/home/deploy/nextup -e NEXTUP_INSTANCES=/home/deploy/nextup/instances \
    "$OPSTEST_HOST" bash -lc "$*"
}

# Run <command> as deploy in /home/deploy/nextup; returns its exit code.
host_exec() { _host_run deploy /home/deploy/nextup "$@"; }
# The same as root, and as ci (in its own home).
host_root() { _host_run root /home/deploy/nextup "$@"; }
host_ci() { _host_run ci /home/ci "$@"; }

# Remove everything a previous run left in the cached daemon; images stay.
_host_clean() {
  docker exec "$OPSTEST_HOST" sh -c \
    'docker ps -aq | xargs -r docker rm -f >/dev/null 2>&1; docker volume ls -q | xargs -r docker volume rm >/dev/null 2>&1; docker network prune -f >/dev/null 2>&1; true'
}

host_up() {
  OPSTEST_HOST="nextup-opstest-$_opstest_id-$$"
  export OPSTEST_HOST
  (cd "$OPSTEST_ROOT" && docker build -q -t "$OPSTEST_IMAGE" stack/tests/host >/dev/null) || {
    echo "host_up: could not build $OPSTEST_IMAGE" >&2; return 1; }
  docker run -d --privileged --name "$OPSTEST_HOST" -v "$OPSTEST_VOLUME:/var/lib/docker" \
    "$OPSTEST_IMAGE" >/dev/null || { echo "host_up: could not start $OPSTEST_HOST" >&2; return 1; }

  local i ready=""
  for i in $(seq 1 60); do
    if docker exec "$OPSTEST_HOST" docker info >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  [ -n "$ready" ] || { echo "host_up: dockerd in $OPSTEST_HOST not ready after 60 s" >&2; return 1; }
  _host_clean

  # The working tree's stack/ (never a local instances/ folder: it holds real secrets).
  docker exec "$OPSTEST_HOST" mkdir -p /opt/nextup-src /home/deploy/nextup || return 1
  (cd "$OPSTEST_ROOT" && tar --exclude=stack/instances -cf - stack) \
    | docker exec -i "$OPSTEST_HOST" tar -xf - -o -C /opt/nextup-src || return 1
  (cd "$OPSTEST_ROOT" && tar --exclude=stack/instances -cf - stack) \
    | docker exec -i "$OPSTEST_HOST" tar -xf - -o -C /home/deploy/nextup || return 1
  docker exec "$OPSTEST_HOST" sh -c '
    set -e
    for d in /opt/nextup-src/stack /home/deploy/nextup/stack; do
      grep -rIl . "$d" | xargs -r sed -i "s/\r\$//"
      find "$d" -name "*.sh" -exec chmod +x {} +
    done
    chmod -R a+rX /opt/nextup-src
    chown -R deploy:docker /home/deploy/nextup' || return 1
}

host_down() {
  [ -n "$OPSTEST_HOST" ] || return 0
  _host_clean >/dev/null 2>&1
  docker rm -f "$OPSTEST_HOST" >/dev/null 2>&1
  OPSTEST_HOST=""
  return 0
}

_host_wait() { # <seconds> <command in the host>
  local i
  for i in $(seq 1 "$1"); do
    host_root "$2" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

host_registry_up() {
  host_root 'docker rm -f registry >/dev/null 2>&1; docker run -d --name registry -p 127.0.0.1:5000:5000 registry:2.8.3 >/dev/null' || return 1
  _host_wait 30 'curl -fs http://127.0.0.1:5000/v2/' || { echo "host_registry_up: registry not answering" >&2; return 1; }
}

# localhost:5000/nextup/nextup-{app,migrate}: sha-aaaaaaa is v1, sha-bbbbbbb is v2.
host_fake_images() {
  host_root '
    set -e
    cd /opt/nextup-src/stack/tests/fake
    for pair in v1:aaaaaaa v2:bbbbbbb; do
      v="${pair%%:*}"; tag="sha-${pair##*:}"
      for img in app migrate; do
        ref="localhost:5000/nextup/nextup-$img:$tag"
        docker build -q --build-arg FAKE_VERSION="$v" -t "$ref" "$img" >/dev/null
        docker push -q "$ref" >/dev/null
      done
    done' || { echo "host_fake_images: build or push failed" >&2; return 1; }
}

host_minio_up() {
  host_root 'docker rm -f minio >/dev/null 2>&1
    docker run -d --name minio -p 9000:9000 -e MINIO_ROOT_USER=opstest -e MINIO_ROOT_PASSWORD=opstest-secret-123 \
      cgr.dev/chainguard/minio@sha256:0a01100085e30fb08d2f39e39c9f5c9d83a95707f220b007d813b690cd41622d server /data >/dev/null' || return 1
  _host_wait 60 'curl -fs http://127.0.0.1:9000/minio/health/live' || { echo "host_minio_up: MinIO not healthy" >&2; return 1; }
  local gw
  gw="$(host_root "docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}'")" || return 1
  OPSTEST_S3="s3:http://$gw:9000"
  export OPSTEST_S3
}

# <forced command path in the host>: deploy accepts ci's key and runs only that command.
host_sshd_up() {
  local cmd="${1:?host_sshd_up needs the forced command path}"
  host_root 'pgrep -x sshd >/dev/null || /usr/sbin/sshd' || return 1
  host_ci 'set -e
    mkdir -p ~/.ssh; chmod 700 ~/.ssh
    rm -f ~/.ssh/nextup-deploy ~/.ssh/nextup-deploy.pub
    ssh-keygen -q -t ed25519 -N "" -C ci-opstest -f ~/.ssh/nextup-deploy
    chmod 600 ~/.ssh/nextup-deploy
    ssh-keyscan -t ed25519 127.0.0.1 > ~/.ssh/known_hosts 2>/dev/null
    test -s ~/.ssh/known_hosts' || return 1
  {
    printf 'command="%s",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ' "$cmd"
    host_ci 'cat ~/.ssh/nextup-deploy.pub'
  } | host_root 'set -e
    install -d -m 700 -o deploy -g docker /home/deploy/.ssh
    cat > /home/deploy/.ssh/authorized_keys
    chown deploy:docker /home/deploy/.ssh/authorized_keys
    chmod 600 /home/deploy/.ssh/authorized_keys'
}

# <sha> [<dir in host>]: /srv/mirror/<sha>.tar.gz holding nextup-<sha>/stack/.
host_mirror() {
  local sha="${1:?host_mirror needs a sha}" dir="${2:-/opt/nextup-src/stack}"
  host_root "set -e
    rm -rf /tmp/mirror-build; mkdir -p /tmp/mirror-build/nextup-$sha /srv/mirror
    cp -a '$dir' /tmp/mirror-build/nextup-$sha/stack
    tar -czf /srv/mirror/$sha.tar.gz -C /tmp/mirror-build nextup-$sha
    chmod a+rx /srv /srv/mirror; chmod 644 /srv/mirror/$sha.tar.gz
    rm -rf /tmp/mirror-build"
}

# <slug> <sha> [more install-clean options]: returns install-clean's exit code.
host_stack_up() {
  local slug="${1:?host_stack_up needs a slug}" sha="${2:?host_stack_up needs a sha}" cmd arg envs=()
  shift 2
  cmd="/home/deploy/nextup/stack/tests/install-clean.sh --slug $slug --origin http://localhost:8080 --registry localhost:5000/nextup --images $sha"
  for arg in "$@"; do cmd="$cmd $(printf '%q' "$arg")"; done
  [ -z "${BACKUP_S3_ACCESS_KEY_ID:-}" ] || envs+=(-e BACKUP_S3_ACCESS_KEY_ID)
  [ -z "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ] || envs+=(-e BACKUP_S3_SECRET_ACCESS_KEY)
  docker exec -i -u deploy -w /home/deploy/nextup \
    -e NEXTUP_HOME=/home/deploy/nextup -e NEXTUP_INSTANCES=/home/deploy/nextup/instances \
    "${envs[@]}" "$OPSTEST_HOST" bash -lc "$cmd"
}
