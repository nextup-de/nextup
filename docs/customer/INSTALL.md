# Installing NextUp on your server (for your IT team)

> **Updated 2026-11-04.** For the people who run the server. About half a day for the install itself, plus the time your
> DNS and firewall changes take. Scripts and options are described once, in the stack docs; this guide says who does what
> and in which order, and links there instead of copying them.

## What you run

One company is one **stack** on one Linux VM: the app, a Postgres database and a Caddy web server that holds the
certificate. Nothing is shared with another customer. What a stack contains: [`stack/README.md`](../../stack/README.md).

| Who | Does | Where | Time |
|---|---|---|---|
| Your IT (root on the VM) | VM, Docker, firewall, DNS name, deploy user | the VM | 1 to 2 hours |
| Your IT (deploy user) | first install, backup bucket, cron | the VM | 1 hour |
| NextUp | builds the images, tells you the commit to install | NextUp's CI | none on your side |
| Your Entra or identity admin | sign-in setup | your identity portal | 20 minutes |

## Hosted or on your own server

- **Hosted by NextUp:** NextUp runs the VM and the stack for you. You skip sections 1 to 4 and start at section 5.
- **On your own server (on-prem or your cloud account):** you own the VM and the stack's data. NextUp reaches it only
  through the release key you hand out ([`OPERATIONS.md`](OPERATIONS.md), "Releases") and, if you choose, a time-limited
  break-glass window ([`SECURITY_GUIDE.md`](SECURITY_GUIDE.md)).

## 1. Server requirements

- A plain Linux VM, one stack per VM, Docker Engine with the compose plugin, 2 vCPU and 4 GB memory as a start
  (8 GB or more if you also run the optional routing AI), and enough disk for the database and its local backup.
- A host name that people use, for example `nextup.example.com`, with a DNS `A` (or `AAAA`) record pointing at the VM.
- Ports: 80 and 443 open to the people who use NextUp (80 is needed for the certificate). Port 22 only from your VPN or
  admin addresses. Nothing else.
- Outgoing access to the image registry and, for sign-in, to `login.microsoftonline.com`.
- An S3-compatible bucket for off-box backups. A backup on the VM's own disk does not survive losing the VM.
- Keeping the VM itself patched (OS updates, sshd settings, disk encryption) is your IT's job.

The VM, the `deploy` user, its key and `host.conf` are laid out step by step in
[`stack/remote/README.md`](../../stack/remote/README.md), sections 1 to 5.

## 2. Install

As the `deploy` user, with the stack scripts in `~/nextup/stack` and NextUp's image tag (a 7-character commit id) in hand:

```bash
export BACKUP_S3_ACCESS_KEY_ID=... BACKUP_S3_SECRET_ACCESS_KEY=...
~/nextup/stack/tests/install-clean.sh --slug acme --origin https://nextup.example.com \
  --images <tag> --backup-repo s3:https://<endpoint>/<bucket>
```

This runs the real-stage install for you and then checks health, a backup and a restore test. Without the rehearsal
script the call is:

```bash
~/nextup/stack/install.sh --slug acme --origin https://nextup.example.com --stage real --images <tag>
```

`--stage real` starts with an empty database: no demo people, no demo logins. Options are listed at the top of
`stack/install.sh` and in [`stack/README.md`](../../stack/README.md).

## 3. DNS and TLS

1. Create the DNS record before the install. Caddy asks Let's Encrypt for a certificate for the host name in `--origin`
   as soon as the stack starts, and needs ports 80 and 443 reachable to do so.
2. Check that `https://nextup.example.com/api/health` answers 200 with a valid certificate.
3. Prefer your own certificate? Mount it and change the site block as described under "On a customer server" in
   [`stack/README.md`](../../stack/README.md).
4. The monitor in [`docs/ops/monitoring.md`](../ops/monitoring.md) warns 14 days before a certificate expires.

## 4. Secrets and backups

The install writes `~/nextup/instances/<slug>/.env` with freshly generated secrets (database password, `AUTH_SECRET`,
`CONNECTOR_VAULT_KEY`, `RESTIC_PASSWORD`). The file never leaves the VM.

- Copy `RESTIC_PASSWORD` and `CONNECTOR_VAULT_KEY` into your password manager now. Without the restic password no backup
  can be read; without the vault key everyone's Microsoft 365 connection has to be made again.
- Set up the nightly backup and the weekly restore test with the cron lines in
  [`stack/remote/README.md`](../../stack/remote/README.md), section 5, and the health checks with
  `~/nextup/stack/health.sh install`. Details: [`OPERATIONS.md`](OPERATIONS.md).

## 5. The first admin

NextUp does not print a standing admin password. Your first administrator gets in through your own identity provider:

1. NextUp (hosted) or you (own server) creates the company in the admin console with the same slug as the stack.
2. Set up sign-in in the next section and assign the Entra app role `NextUp.Admin` to your administrator.
3. Until sign-in works, the only way into the admin console is the break-glass window your operator opens on the host
   ([`OPERATIONS.md`](OPERATIONS.md), "Break-glass window").

## 6. Then: sign-in for your people

- **Microsoft Entra ID:** [`ENTRA_SETUP.md`](ENTRA_SETUP.md), about twenty minutes. You decide in Entra who gets in and in
  which role.
- **SAML 2.0 or SCIM provisioning:** ask NextUp for the SSO setup guide (`SSO_SETUP.md`) for your identity provider.
- **Employee directory from SuccessFactors:** [`SUCCESSFACTORS_SETUP.md`](SUCCESSFACTORS_SETUP.md).

When a person can sign in and the health URL is green, the install is done. Next, read [`OPERATIONS.md`](OPERATIONS.md)
and [`SECURITY_GUIDE.md`](SECURITY_GUIDE.md).
