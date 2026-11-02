# A customer host: one VM, one stack, released over ssh

A customer runs on a plain Linux VM with Docker Engine. The stack's own Caddy terminates TLS on 80
and 443: no nginx, no `ports.md`, no box agent (`stack/provision`). A release moves the host's one
stack to a commit with `stack/deploy-remote.sh` from Kevin's machine; on the host a forced command,
`stack/remote/host.sh`, does the work. (There is no CI job for it yet.)

Hardening the VM itself (updates, sshd settings, disk encryption, monitoring) belongs to INF, not here.

Layout on the host, user `deploy`: `~/nextup/stack` (the scripts), `~/nextup/instances/<slug>` (the
stack's `.env` and data), `~/nextup/host.conf`, `deploy.log`, `backup.log`, `released` (one `<sha> <time>` per release).

## 1. The VM

1. Create user `deploy` in group `docker`: `adduser deploy && usermod -aG docker deploy`.
2. Install Docker Engine with the compose plugin (docs.docker.com, "Install using the apt repository").
   Check `docker compose version` as `deploy`.
3. Firewall: 22 from the VPN or Kevin's addresses only; 80 and 443 from anywhere. Nothing else.

## 2. The first install

As `deploy`, with a copy of `stack/` in `~/nextup/stack` (clone or unpack the release tarball), the
registry reachable and an S3-compatible bucket for the backups (Q1: Hetzner Object Storage, one bucket
per customer):

```bash
export BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...
~/nextup/stack/tests/install-clean.sh --slug acme --origin https://acme.example.de \
  --images <sha> --backup-repo s3:https://<endpoint>/<bucket>
```

See `install-clean.sh --help` for the exact options. It installs a real-stage stack, checks health,
backup and restore-test. Copy the `RESTIC_PASSWORD` from `instances/acme/.env` into the password manager.

## 3. host.conf

`~/nextup/host.conf` (mode 600), read line by line, never sourced:

```
SLUG=acme
NEXTUP_REGISTRY=ghcr.io/nextup-de
NEXTUP_STACK_URL=https://codeload.github.com/nextup-de/nextup/tar.gz/{sha}
```

`SLUG` is required. The other two show their defaults. `NEXTUP_STACK_URL` must start with `https://`
(or `file://`) and contain `{sha}`. A private repository needs another URL; do not put a token in this file.

## 4. The deploy key

On Kevin's machine: `ssh-keygen -t ed25519 -f ~/.ssh/nextup-deploy -C nextup-deploy-acme`. On the host,
one line in `~deploy/.ssh/authorized_keys` (mode 600):

```
command="~/nextup/stack/remote/host.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... nextup-deploy-acme
```

The key gets no shell: the forced command accepts only `release <sha>` and `status`. Add the host's
key to Kevin's `~/.ssh/known_hosts` once, after checking the fingerprint against the VM console
(`ssh-keyscan -t ed25519 <host>`). The client never accepts an unknown host key.

## 5. Cron

`crontab -e` as `deploy` (paths for `~/nextup`; same lines as `stack/nginx/RUNBOOK.md`):

```
17 3 * * * NEXTUP_INSTANCES=$HOME/nextup/instances $HOME/nextup/stack/backup.sh all backup >> $HOME/nextup/backup.log 2>&1
47 4 * * 0 NEXTUP_INSTANCES=$HOME/nextup/instances $HOME/nextup/stack/backup.sh all restore-test >> $HOME/nextup/backup.log 2>&1
```

For the health checks run `~/nextup/stack/health.sh install` once: it writes `health.env` and the two cron lines
(every 5 minutes, and the Monday summary).

## 6. Releasing

Wait until CI has published the images of the commit (`images.yml`), then from Kevin's machine:

```bash
stack/deploy-remote.sh deploy@<host> <sha>      # 7-char lowercase sha
stack/deploy-remote.sh deploy@<host> status
```

The host, in this order, under a lock: refuses without the stack's `.env`; pulls the app and migrate
images (brain too when the `.env` has `BRAIN_API_KEY`); fetches `stack/` at the sha into `~/nextup/stack.new`;
takes a backup tagged `pre-migrate`; only then moves the old `stack` to `stack.prev`, puts the new one in
place and runs `install.sh`. A failure up to the backup ends with `nothing changed` and exit 1. Admin and
login codes never appear in the output. Every step is in `~/nextup/deploy.log`.

## 7. Going back

```bash
stack/deploy-remote.sh deploy@<host> <older sha>
```

The failure line `!! <slug> did not come up at <sha> - to go back: release <previous sha>` names it. If a
migration ran in between, the database must go back too, on the host, before or with the old release:

```bash
NEXTUP_INSTANCES=~/nextup/instances ~/nextup/stack/backup.sh <slug> snapshots
NEXTUP_INSTANCES=~/nextup/instances ~/nextup/stack/backup.sh <slug> restore <pre-migrate snapshot id>
```
