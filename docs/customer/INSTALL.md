# Installing NextUp on your server (for your IT team)

> **Updated 2026-11-11.** For the people who run the server. About half a day for the install itself, plus the time your
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

- A plain Linux VM, one stack per VM, Docker Engine with the compose plugin: **4 vCPU, 16 GB memory and 160 GB SSD**
  (the Postgres settings for this size and the reasons are in [`docs/ops/SIZING.md`](../ops/SIZING.md); the optional
  routing AI on the same VM needs about 8 GB more).
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
  --images <tag> --backup-repo s3:https://<endpoint>/<bucket> --entra-tenant-id <your Directory (tenant) ID>
```

This runs the real-stage install for you and then checks health, a backup and a restore test. Without the rehearsal
script the call is:

```bash
~/nextup/stack/install.sh --slug acme --origin https://nextup.example.com --stage real --images <tag>
```

`--stage real` starts with the company alone: no demo people, no demo logins. **The stack creates the company at its
first start** (under `--slug` and `--name`, empty, in the sandbox stage and closed until "Open NextUp"); nobody creates it
in the admin console. Options are listed at the top of `stack/install.sh` (`install.sh --help`) and in
[`stack/README.md`](../../stack/README.md).

`--entra-tenant-id` (optional, with Microsoft sign-in) puts your tenant into the new company, so the admin console opens
with Microsoft from the first day and nobody needs a break-glass window for it. It is copied in once, at the first start
(the audit log shows it with the actor "Installation"), and never over a tenant your IT set or removed in the console
later. The client ID and secret of the app registration go in with `install.sh --entra-client-id`
([`ENTRA_SETUP.md`](ENTRA_SETUP.md)).

At the end the install prints the console's address. A real stage prints no admin code: the shared code works only on a
demo stage. If nobody can get in yet, the host's operator opens a time-limited window with
`stack/break-glass.sh <slug> open --hours 2 --reason "<why>"` ([`OPERATIONS.md`](OPERATIONS.md), "Break-glass window").

## 3. DNS and TLS

1. Create the DNS record before the install. Caddy asks Let's Encrypt for a certificate for the host name in `--origin`
   as soon as the stack starts, and needs ports 80 and 443 reachable to do so.
2. Check that `https://nextup.example.com/api/health` answers 200 with a valid certificate.
3. Prefer your own certificate? Mount it and change the site block as described under "On a customer server" in
   [`stack/README.md`](../../stack/README.md).
4. The monitor in [`docs/ops/monitoring.md`](../ops/monitoring.md) warns 14 days before a certificate expires.

## 4. Secrets and backups

The install writes `~/nextup/instances/<slug>/.env` with freshly generated secrets (the database password, `AUTH_SECRET` and
`CONNECTOR_VAULT_KEY`). The file never leaves the VM. The restic settings are not part of it: `RESTIC_REPOSITORY` and `RESTIC_PASSWORD` are added to
`.env` by the first `stack/backup.sh <slug> backup` run (or by `stack/tests/install-clean.sh --backup-repo` for an off-box repository), and never
changed after that.

- Copy `CONNECTOR_VAULT_KEY` into your password manager now, and `RESTIC_PASSWORD` as soon as the first backup has run and written it. Without the
  restic password no backup can be read; without the vault key everyone's Microsoft 365 connection has to be made again.
- Set up the nightly backup and the weekly restore test with the cron lines in
  [`stack/remote/README.md`](../../stack/remote/README.md), section 5, and the health checks with
  `~/nextup/stack/health.sh install`. Details: [`OPERATIONS.md`](OPERATIONS.md).

## 5. The first people

The stack starts with the company and nobody in it. NextUp does not print a standing admin password. There are two ways
to the first people, and NextUp builds nothing else for it:

- **With Microsoft sign-in** (the usual way): the Entra app roles create the people. Install with `--entra-tenant-id`
  (or set the tenant once in the console's **Access** page), then:
  1. Assign the app role `NextUp.Admin` to your IT administrator: they open the admin console with **Continue with
     Microsoft** on `/admin/login`. Each such sign-in is in the audit log ("Signed in to the IT console with Microsoft").
  2. Assign `NextUp.Manager` to the pilot lead: at their first Microsoft sign-in NextUp **creates them as a manager, even
     though the company is still closed**, and they land in the setup. Managers are the setup people.
  3. Everyone else (`NextUp.Leader`, `NextUp.Member`) is refused with "not open yet" until a manager presses **Open
     NextUp**, and is created at their first sign-in after that.
- **Without Microsoft:** the bootstrap is required. It reads a config file (an admin alone is enough) and, if you like,
  the people as CSV files, and gives them login codes ([`docs/pilot/RUNBOOK.md`](../pilot/RUNBOOK.md), section 4). The
  console needs one break-glass window to mark that manager as console admin.

Until one of the two works, the only way into the admin console is the break-glass window your operator opens on the
host ([`OPERATIONS.md`](OPERATIONS.md), "Break-glass window").

## The hand-over

Once the server phase on the console's **Setup** page (`/admin/setup`) is checked (the app answers, mail works, the first
off-server backup is reported), your IT confirms the hand-over there with **Confirm the hand-over**. It is a person signed
in with Microsoft or as a console admin; NextUp's ways in (break-glass, support) cannot confirm it. Afterwards the page
says "Handed over on <date> by <role>", and the audit log has the entry "Hand-over to the customer's IT confirmed".

## 6. Then: sign-in for your people

- **Microsoft Entra ID:** [`ENTRA_SETUP.md`](ENTRA_SETUP.md), about twenty minutes. You decide in Entra who gets in and in
  which role.
- **SAML 2.0 or SCIM provisioning:** ask NextUp for the SSO setup guide (`SSO_SETUP.md`) for your identity provider.
- **Employee directory from SuccessFactors:** [`SUCCESSFACTORS_SETUP.md`](SUCCESSFACTORS_SETUP.md).

When a person can sign in and the health URL is green, the install is done. Next, read [`OPERATIONS.md`](OPERATIONS.md)
and [`SECURITY_GUIDE.md`](SECURITY_GUIDE.md).
