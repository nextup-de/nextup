# Hand-over sheet: the stack is yours (for your IT team)

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #660 (Q8.3, Q8.6,
> Q8.7, Q8.11). One page. NextUp fills in the blanks and hands it over when the stack runs and your IT can sign in to
> the console.

| | |
|---|---|
| Company | **[ ]** |
| Address | `https://`**[ ]** |
| Commit running | **[7 characters]** |
| Where it runs | NextUp hosts it / your own server (see the order form) |
| AI | off / your own provider / a model on your stack / NextUp's cloud |

## What each side keeps

| | NextUp hosts it | Your own server |
|---|---|---|
| Root on the server, patches | NextUp | your IT |
| The stack's `.env` with its secrets | NextUp, on the server and an encrypted copy in NextUp's secrets store | your IT, in your password manager; NextUp gets none |
| `RESTIC_PASSWORD`, `CONNECTOR_VAULT_KEY` | NextUp | your IT |
| The backup bucket | NextUp's account | your account |
| The release key (`release`, `status` only) | NextUp | NextUp; you put it on the server |
| The Entra app, its client secret and its expiry date | your IT | your IT |
| Company admins, support access, the audit log | your company admins in the app | the same |

When NextUp hosts it, NextUp can reach the server and its database. It uses that only as below.

## Who gets the alerts

The health checks alert when the app, a backup, the certificate, the disk or the memory fails. By default the alerts
go to **both**: your IT list and NextUp's support topic. NextUp also runs the outside heartbeat, which notices when
the whole server is down. Alerts carry no personal data, no password and no key.

- Your IT list: **[addresses]**
- NextUp: [ ] yes / [ ] **struck out** by the customer. On your own server you may strike NextUp out. Then nobody at
  NextUp hears that your stack is down, and the incident times in `docs/pilot/SUPPORT.md` start when you tell us.

## How secrets travel

- The Entra client secret, the Teams bot secret and any other secret go by a **one-time link** from a password manager.
  Never by mail, chat or phone.
- NextUp reads the value on the server with `read -rs` into the install. It is not typed on a command line and not
  stored anywhere else.
- On your own server nothing travels: your IT enters the values itself.

## Break-glass on a server NextUp hosts

> **Kevin decides; this is the recommendation** (Q8.7). It becomes annex 4 of the data processing agreement.

On your own server only your IT can open a break-glass window. On a server NextUp hosts, NextUp could open one for
itself. NextUp opens it only:

- for a ticket: a written request from your company admin or IT contact;
- with the ticket number as the reason (`stack/break-glass.sh <slug> open --reason "ticket <n>"`), for at most 4 hours;
- after telling your IT contact before it opens;
- and sends your IT contact the lines of `break-glass/log` afterwards.

## Confirm the hand-over

1. Your IT signs in to the console (`https://<address>/admin`) with Microsoft. The sign-in is written to the audit log.
2. On **`/admin/setup`**, check the server phase: health, backup off the server, restore test, no break-glass window
   open, no support access open.
3. If something is wrong, tell NextUp; NextUp fixes it and you check again.
4. If all is right, press **Confirm hand-over**. It is written to the audit log with your name and the time. From here
   on your company admins run the company setup.

The confirm button comes with issue #660; until then your IT confirms by mail to NextUp's support mailbox.

| Handed over by NextUp | Confirmed by your IT |
|---|---|
| Name, date **[ ]** | Name, date **[ ]** |
