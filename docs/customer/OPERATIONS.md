# Running NextUp (for your IT team)

> **Updated 2026-11-04.** What your operator does after the install: releases, backups, monitoring, key rotation, and the
> two ways NextUp staff can get access. Everything runs on the VM, as the `deploy` user unless it says root.
> Commands are explained once in the stack and ops docs; this guide links there.

## Who does what

| Task | Who | How often | Time |
|---|---|---|---|
| Release a new version | your operator, or NextUp through the release job you approve | when NextUp announces one | 10 minutes |
| Check backups and the weekly restore test | your operator (alerts tell you) | weekly glance | 5 minutes |
| Restore drill | your operator | once a year, and after changes to the backup setup | 1 hour |
| Rotate keys | your operator | yearly, and whenever a key may have leaked | 15 minutes each |
| Open a break-glass window | your operator, on request | rarely | 2 minutes |
| Grant support access | a company admin in the app | rarely | 2 minutes |
| Audit export | a company admin in the app | on request | 2 minutes |

## Releases

NextUp publishes images per commit. A release moves your one stack to a commit. It backs up first (a snapshot tagged
`pre-migrate`), then migrates and restarts. Two ways to run it, both described in
[`stack/remote/README.md`](../../stack/remote/README.md):

- **The customer release job** (section 8 there): the GitHub workflow `release-customer` runs against your environment
  `customer-<slug>`. The environment holds your host, the deploy key and the host key. The environment's required reviewer is Kevin (NextUp):
  nothing is released without his approval.
- **By hand:** `stack/deploy-remote.sh deploy@<host> <sha>` and `stack/deploy-remote.sh deploy@<host> status`
  (sections 6 and 7 there).

The deploy key has no shell. The host accepts only `release <sha>` and `status`. Going back is the same release with an
older commit; if a migration ran in between, restore the `pre-migrate` snapshot as well (section 7 there).

## Backups and the restore drill

The numbers: at most **24 hours** of data lost (RPO); the weekly restore test must finish within **1 hour** (RTO, the
test limit). For a whole restore NextUp names **4 hours in business hours** (until Kevin decides,
[`docs/pilot/SUPPORT.md`](../pilot/SUPPORT.md)). Snapshots are encrypted with restic and hold the database, the
stack's `.env` and, if used, n8n's data. Full detail and the restore steps: [`docs/ops/RPO_RTO.md`](../ops/RPO_RTO.md).

- Nightly backup and a weekly restore test run from cron (setup in `stack/remote/README.md`, section 5). A backup older
  than 26 hours raises an alert.
- Set `BACKUP_OFFBOX=required` so the script refuses a repository on the VM's own disk.
- Keep `RESTIC_PASSWORD` in your password manager. A VM that dies takes its `.env` with it.

The drill, once a year, is a real `restore` on a **spare VM**. On the live VM run only `restore-test`, which restores the latest snapshot into a
throwaway database and checks it:

```bash
stack/backup.sh <slug> snapshots
stack/backup.sh <slug> restore-test <id>     # live VM: a throwaway database, nothing is replaced
```

Write down how many seconds the test logged; it fails over one hour. On the spare VM put the stack's `.env` back first, then
`stack/backup.sh <slug> restore <id>`. `restore` replaces the live database after you type the slug, so never run it on the VM that serves people
unless you mean to restore it.

## Monitoring

`stack/health.sh` runs every five minutes and checks the web health URL, the certificate, backups, restore tests, disk and
memory. A check must fail twice (ten minutes) before it alerts. Alerts go to every recipient you put in `health.env`: ntfy
topics, mail, and an external heartbeat monitor that notices when the whole host is down. Setup and keys:
[`docs/ops/monitoring.md`](../ops/monitoring.md). Alerts never contain a password, key or topic URL.

## Key rotation

On the host, one key at a time. Every step edits the `.env` atomically and appends a line (time, key name, who) to
`rotations.log`; a value is never written.

```bash
stack/rotate-keys.sh <slug> auth     # new AUTH_SECRET: every session ends, everyone signs in again
stack/rotate-keys.sh <slug> vault    # new connector vault key; the app re-seals what it holds, then drops the old key
stack/rotate-keys.sh <slug> restic   # new backup password; the old one keeps working until the new one is proven
```

Each asks for `--yes` after telling you what will happen. If the vault rotation times out or fails, it stops and keeps both
keys (exit 1): nothing is lost, run it again. Update the password manager afterwards.

## Renewing the Entra client secret

The Entra client secret lasts at most 24 months; when it expires, Microsoft sign-in stops. Make a new secret in the
NextUp app registration ([`ENTRA_SETUP.md`](ENTRA_SETUP.md), step 3) before the old one runs out. On a stack NextUp
hosts, send it to NextUp by a one-time link and NextUp installs it. On your own server your operator re-runs the install
with it, as the deploy user:

```bash
read -rs NEXTUP_ENTRA_CLIENT_SECRET && export NEXTUP_ENTRA_CLIENT_SECRET
stack/install.sh --slug <slug> --origin https://<host> --entra-client-id <Application (client) ID>
```

It replaces the old values in the `.env` and restarts the app. Sign in with Microsoft once to check.

## Break-glass window

If sign-in does not work (for example the identity provider is down), your operator opens a time-limited way into the admin
console. There is no standing code.

```bash
stack/break-glass.sh <slug> open --hours 2 --reason "Entra outage, ticket 1234"
stack/break-glass.sh <slug> status
stack/break-glass.sh <slug> close
```

`open` prints a one-time code (1 to 24 hours, then it stops working by itself). The host stores only its hash, and every
open, close and expiry goes into `break-glass/log` (never the code). Hand the code to whoever needs it over a channel you trust.

## Support access

For help inside the app, a **company admin** grants NextUp support access under Settings → Support access: a duration of 1,
4, 24 or 72 hours, a reason, and a short support code shown once for the admin to pass to NextUp. The admin can extend
the grant (never beyond 72 hours from now) or end it at any moment. Each grant, extension, end and support sign-in is
written to the audit log and listed on that page. The page also shows whether the host's break-glass window is open.

## Audit export

Settings → Audit log lists every change an admin, NextUp staff or the system made to your company. Company admins can download
it as CSV; the export is itself logged. Entries are kept 24 months. What else is recorded and how long: [`docs/PRIVACY.md`](../PRIVACY.md).

## What NextUp can and cannot see

- **Cannot, by default:** log in to your VM (the release key runs only `release` and `status`), read your database or
  backups, sign in to the app as one of your people, or see your keys. NextUp keeps no standing password for your stack.
- **Only while you allow it:** the app as support staff during a support grant you gave; the admin console during a
  break-glass window you opened.
- **Always:** that the release job ran and which commit it moved to, and the health URL's answer if you share it with the monitor.

Read the data flows and the reasoning in [`SECURITY_GUIDE.md`](SECURITY_GUIDE.md).
