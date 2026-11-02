# Monitoring and alerts

`stack/health.sh` runs from cron every 5 minutes on every customer host. It can only alert while
the host is alive, so an **external monitor** watches the host from outside.

## What health.sh checks

| Check | Fails when |
|---|---|
| web | a stack's `APP_ORIGIN/api/health`, automation's login page or a `HEALTH_URLS` entry isn't 200 |
| cert | an https certificate has 14 days or less left (checked hourly) |
| backup | no `<name>: backup done` in `backup.log` for 26 h, for each stack, automation and `BACKUP_NAMES` |
| restore-test | the latest weekly restore test of a name logged a failure |
| disk / memory | `/` is 85% full or more / less than 400 MB available |

A check must fail twice in a row (10 minutes) before it alerts. A recovery sends one `Recovered`
message. On Mondays at 08:00 UTC a summary arrives. `health.sh --list` prints the state and sends
nothing.

## Who gets alerts

Every alert, recovery and summary goes to **every** recipient in `~/nextup/health.env` (mode 600).
One recipient failing never stops the others; it is written to `health.log` as
`could not reach <host or address>`, never with the full topic URL (the topic is the secret).
All keys are optional.

| Key | Meaning |
|---|---|
| `NTFY_URLS` | ntfy topic URLs, space separated |
| `NTFY_URL` | the single topic of older installs; still read and joins the list (no duplicates) |
| `ALERT_EMAILS` | addresses that get each alert as a plain-text mail, space separated |
| `ALERT_SMTP_URL` | `smtp://` or `smtps://` URL of the mail server, with credentials |
| `ALERT_MAIL_FROM` | sender address of the mails |
| `HEARTBEAT_URL` | requested with GET at the end of every run (see below) |

Mails need `ALERT_EMAILS`, `ALERT_SMTP_URL` and `ALERT_MAIL_FROM` together. `health.sh install`
writes these keys as commented examples into a new `health.env` and keeps an existing one.

## External monitor

Run it on a machine **other than the customer host**: hosted healthchecks.io, or a self-hosted
healthchecks-compatible service. No service is named in code.

1. **Heartbeat.** Create a check expecting a ping every **5 minutes** with a grace time of
   **15 minutes**, and give it its own alert list (not only the people on the host's lists). Put
   its ping URL in `HEARTBEAT_URL`. When the host, cron or the network stops, the pings stop and
   the monitor alerts. A failed ping is only logged and never changes the exit code of health.sh.
2. **HTTP monitor.** Next to it, an HTTP check on `<origin>/api/health` (the stack's
   `APP_ORIGIN`) catches an app that is down while the host still runs.

The ping URL is a secret like the ntfy topic: keep it in `health.env` and the password manager.

## No secret in an alert

Alert titles and messages name the check and what was seen (HTTP code, days left, percent used).
They never contain passwords, keys, tokens or topic URLs, and neither does `health.log`.
