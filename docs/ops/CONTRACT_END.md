# The end of a contract: runbook and deletion statement

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #668 (Q10.19,
> Q10.20, Q10.21). For NextUp's operator and Kevin. The data processing agreement says the same in sections 7 and 10
> ([`docs/compliance/DPA_TEMPLATE.md`](../compliance/DPA_TEMPLATE.md)).

No admin deletes a company in the app, and no platform job does it. At the end, the whole stack goes: its database,
its volumes, its server and its backups, on one day.

## The days

| When | What | Who |
|---|---|---|
| End date | Invitations and mails stop: a company admin presses "Switch back to sandbox" on Settings → Go-live. Only company admins keep signing in: customer IT removes everyone else from the NextUp app in Entra; without Microsoft, a company admin deactivates them in Members. | customer, NextUp on the call |
| End date to day 30 | Company admins export what they want to keep (Settings → Data and privacy; an export is kept 7 days). | customer |
| Day 30 | Destroy everything below, on one day. | NextUp; on the customer's server, customer IT |
| Within 5 working days of day 30 | The deletion statement to the customer's data protection officer, signed by Kevin. | Kevin |

Mail the company admins and the IT contact on the end date with day 30's date, and again 5 working days before it.

## Day 30: destroy

On a server NextUp hosts, NextUp does all of it. On the customer's own server, customer IT does the first three and
confirms in writing; NextUp does the rest.

1. **The stack and its volumes:** `stack/ctl.sh <slug> down -v --remove-orphans` (type the slug), then delete
   `~/nextup/instances/<slug>`. That removes the database and the `.env`.
2. **The server:** delete the VM in the provider's console.
3. **The backup bucket with every snapshot:** delete the bucket, not only the repository. The nightly snapshots are
   pruned only while the stack runs, and the pre-migrate snapshots are never pruned by age. Delete the bucket's access
   key as well.
4. **The release key:** remove NextUp's deploy key (the `release` / `status` line) from the server, if it still exists,
   and from NextUp's own key store.
5. **The GitHub environment** `customer-<slug>` (Kevin; `.github/` and repo settings are his).
6. **The stack on admin.sellux.ch,** with its tickets and their screenshots.
7. **The outside heartbeat** and the HTTP check of the stack in the monitor; NextUp's recipient in `health.env` if the
   server still exists.
8. **The vault entries:** the stack's secrets in NextUp's password manager and in nextup-infra (sops, `secrets.list`).

Write down for each item the date and who did it. That list is the deletion statement.

## The deletion statement

> **Deletion statement: NextUp for [company]**
>
> To: [data protection officer, company, address]
>
> The contract of [date] ended on [end date]. Under section 10 of the data processing agreement of [date], NextUp
> deleted the following on the dates named:
>
> | Item | Date | By |
> |---|---|---|
> | The NextUp stack of [company] with its database and volumes | [ ] | [ ] |
> | The server [name or id] | [ ] | [ ] |
> | The backup bucket with every snapshot, and its access key | [ ] | [ ] |
> | NextUp's release key for the server | [ ] | [ ] |
> | The release environment `customer-[slug]` | [ ] | [ ] |
> | The support tickets and screenshots on NextUp's admin server | [ ] | [ ] |
> | The outside monitor of the stack | [ ] | [ ] |
> | The stack's secrets in NextUp's password manager and secrets store | [ ] | [ ] |
>
> [On the customer's own server:] Items 1 to 3 were deleted by [company]'s IT, confirmed in writing on [date].
>
> NextUp keeps no copy of [company]'s data. Not covered: copies that [company]'s people made outside NextUp (exports,
> mails, screenshots).
>
> [Place, date] — Kevin [surname], [role], NextUp — signature
