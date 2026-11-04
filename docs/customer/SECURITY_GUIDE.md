# NextUp security guide (for your IT and security team)

> **Updated 2026-11-04.** How NextUp is built, where your data goes, who can get at it and how, and a checklist for the
> server. It describes what runs on the main branch for a real (non-demo) company. The developer-facing detail is in
> [`docs/SECURITY.md`](../SECURITY.md); this guide is the customer-facing summary and links there.

## Architecture and data flows

- **One stack per company**, on its own VM: app, Postgres, Caddy. Two stacks share no network, volume or secret.
  Postgres is not published; only the stack's own network reaches it. Details: [`stack/README.md`](../../stack/README.md).
- The app runs with a read-only filesystem and no extra Linux capabilities. Caddy is the only service with open ports.
- **Outgoing connections** are few and named:
  - `login.microsoftonline.com` for Microsoft sign-in and token refresh;
  - `graph.microsoft.com` for live Microsoft 365 search, as the signed-in person, only if your admin turns it on;
  - your S3 backup bucket;
  - the AI model service of the raise-page assistant, if you enable it (server side only).

  No analytics and no third-party scripts in the browser.
- NextUp reads from Microsoft only what [`ENTRA_SETUP.md`](ENTRA_SETUP.md) lists. It does not read mail, calendars or chats.

## Encryption

- **In transit:** TLS at Caddy (Let's Encrypt or your own certificate), HSTS and a strict content security policy. Between
  Caddy and the app, and the app and the database, traffic stays on the stack's private network.
- **At rest:**
  - Backups are encrypted by restic with the stack's `RESTIC_PASSWORD`.
  - People's Microsoft 365 connections are sealed in the database with AES-256-GCM and `CONNECTOR_VAULT_KEY`, bound to company
    and person, so a database dump alone opens nothing.
  - Login codes and API tokens are stored as hashes.
  - The database volume itself is protected by your VM's disk encryption, which your IT provides.
- **Keys** live in the stack's `.env` on your host and are rotated on the host ([`OPERATIONS.md`](OPERATIONS.md), "Key rotation").

## Access model

- **People:** a role (Manager, Leader, Member) decides which pages a person sees; the server checks it on every page and action,
  not only the menu. With Microsoft sign-in the role comes from the Entra app roles you assign.
- **Companies are separate:** every query is scoped to the company, and sessions are checked against the database on each
  request. Removing a person, or issuing a new login code, ends their sessions.
- **Admins** of your company manage settings, members, audit and support access. Admin actions are named in the audit log.

## No standing access for NextUp

- NextUp staff have no permanent login to your VM, database or backups, and hold no permanent admin code for your stack.
- **Release access** is a deploy key that your host restricts to `release <sha>` and `status`; with the customer release job,
  each run needs an approval from the reviewers you name.
- **Admin console access** exists only inside a break-glass window your operator opens and that closes by itself.
- **In-app support access** exists only as a time-limited grant (at most 72 hours) by one of your company admins, and every
  use is audited.

## SSO and SCIM

- **Microsoft Entra ID:** OpenID Connect with code flow and PKCE. The token signature is checked against the tenant's keys and
  its tenant must match yours. Setup: [`ENTRA_SETUP.md`](ENTRA_SETUP.md).
- **SAML 2.0:** assertions are checked for signature, audience, the request they answer and replay. Ask NextUp for the setup
  guide for your identity provider.
- **SCIM and directory sync:** provisioning and deactivation of people from your directory; for SuccessFactors see
  [`SUCCESSFACTORS_SETUP.md`](SUCCESSFACTORS_SETUP.md). Leavers are deactivated on sync, not by hand.
- Sign-in has brakes against guessing: limits per address and company.

## Audit

Every change by an admin, NextUp staff or the system is appended to an audit log in the same database transaction as the change.
The log is append-only, readable by your company admins in Settings → Audit log, exportable as CSV, and kept 24 months.
Support grants, extensions, endings and support sign-ins are in it. Host-side actions are in files on the host:
`break-glass/log` and `rotations.log` in the instance folder, and `deploy.log` for releases. What is recorded and for how long:
[`docs/PRIVACY.md`](../PRIVACY.md).

## Hardening checklist

Tick these before go-live and once a year.

- [ ] VM patched, disk encrypted, sshd allows keys only and root login is off.
- [ ] Firewall: 22 from VPN or admin addresses only; 80 and 443 open; nothing else.
- [ ] `deploy` user key restricted to the forced command (`stack/remote/README.md`, section 4); no shell for the key.
- [ ] Off-box backup bucket in use with `BACKUP_OFFBOX=required`; restore drill done and timed ([`OPERATIONS.md`](OPERATIONS.md)).
- [ ] `RESTIC_PASSWORD` and `CONNECTOR_VAULT_KEY` in the password manager, not only on the host.
- [ ] Health alerts reach at least two people, and the external heartbeat monitor is on ([`docs/ops/monitoring.md`](../ops/monitoring.md)).
- [ ] Sign-in through your identity provider works; roles are assigned in your directory; the admin group is small.
- [ ] No break-glass window left open: `stack/break-glass.sh <slug> status` says `closed`.
- [ ] Environment `customer-<slug>` has required reviewers if you use the release job.
- [ ] Keys rotated in the last 12 months (`rotations.log` shows when).
- [ ] Someone reads the audit log on a schedule you set.
