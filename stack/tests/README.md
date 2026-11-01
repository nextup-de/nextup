# stack/tests — the container host and the install rehearsal

Scripts in `stack/` (install, backup, deploy, ctl) change real machines, so they are never run
directly on a developer PC. The harness starts **one privileged Docker-in-Docker container, the
"host"**, copies `stack/` into it and runs everything there, as the same users a customer VM has
(`deploy`, `ci`). From Git Bash on Windows a plain `docker run -v /tmp/...` would mount a folder of
Docker Desktop's VM and Git Bash rewrites paths, so the tests never pass host paths to Docker.

**No test ever touches a real server**: not the shared demo box, not a customer VM, not a registry
account or a cloud bucket. The registry, S3 (MinIO), sshd and the app images are all fakes that live
inside the host and disappear with it.

## Run a test

From the repo root, in Git Bash, with Docker Desktop running:

```bash
bash stack/tests/install-clean.test.sh
```

The first run pulls base images into the lane's cache volume (minutes); later runs reuse them.
A test is `stack/tests/<name>.test.sh`. It does `cd` to the repo root, exports `MSYS_NO_PATHCONV=1`,
sources `lib/assert.sh` and `lib/host.sh`, calls `trap host_down EXIT`, and ends with `t_done`.
A test of script logic alone can put stub commands first on `PATH` inside the host instead of
starting stacks.

## lib/assert.sh

| Function | Does |
|---|---|
| `t_init <title>` | starts a run |
| `t_ok <name> <command...>` | passes when the command exits 0; on failure prints the last 20 lines of its output |
| `t_eq <name> <expected> <actual>` | passes when equal |
| `t_done` | prints `<title>: <n> passed, <m> failed` as the last line; returns 1 when m > 0 or n = 0 |

## lib/host.sh

| Function | Does |
|---|---|
| `host_up` | builds `nextup-opstest-host:1` (`host/Dockerfile`), starts it as `$OPSTEST_HOST` (`nextup-opstest-<8 hex>-<pid>`), waits for dockerd, copies the working tree's `stack/` (not `stack/instances`) to `/opt/nextup-src/stack` and `/home/deploy/nextup/stack` with CR stripped |
| `host_down` | removes the container; keeps the cache volume |
| `host_exec <cmd>` | `bash -lc <cmd>` as `deploy` in `/home/deploy/nextup`, stdin attached, `NEXTUP_HOME` and `NEXTUP_INSTANCES` set; returns the exit code |
| `host_root <cmd>`, `host_ci <cmd>` | the same as root / as `ci` |
| `host_registry_up` | `registry:2.8.3` on `127.0.0.1:5000` inside the host |
| `host_fake_images` | builds and pushes `localhost:5000/nextup/nextup-{app,migrate}` as `sha-aaaaaaa` (v1: migration 001) and `sha-bbbbbbb` (v2: adds 002) from `fake/` |
| `host_minio_up` | MinIO with user `opstest` / `opstest-secret-123`; sets and exports `OPSTEST_S3` (`s3:http://<bridge gateway>:9000`) |
| `host_sshd_up <forced command path>` | starts sshd; `ci` gets key `~/.ssh/nextup-deploy` and a `known_hosts` entry; `deploy` accepts it only with that forced command |
| `host_mirror <sha> [<dir>]` | `/srv/mirror/<sha>.tar.gz` holding `nextup-<sha>/stack/` |
| `host_stack_up <slug> <sha> [options]` | runs `install-clean.sh` as `deploy` against the fake registry; forwards `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` when set; returns its exit code |

## install-clean.sh

`stack/tests/install-clean.sh` is the on-prem install rehearsal. Unlike the helpers it runs **on
the target machine** (a clean VM, or the test host) as the deploy user, from any copy of `stack/`:
it installs a real-stage stack from registry images, checks health, published ports, backup and
restore-test, and prints `<n> passed, <m> failed`. See `--help`. It never runs `down -v` and never
touches another slug.

## Lanes and the cache volume

Each checkout (worktree) has its own lane: the container name and the volume
`nextup-opstest-cache-<8 hex of sha1 of the repo path>` hold the inner daemon's images, so two
lanes never share a daemon's data. Each `host_up` removes the containers, volumes and networks a
previous run left inside, but keeps the images. To start a lane from scratch:

```bash
docker volume ls --filter name=nextup-opstest-cache
docker volume rm nextup-opstest-cache-<8 hex>      # no host of that lane may be running
```

Leftover hosts: `docker ps -a --filter name=nextup-opstest` and `docker rm -f` them.
