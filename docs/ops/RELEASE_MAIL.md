# Release mails: before and after a release

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #665 (Q10.1, Q10.2,
> Q10.3). For NextUp's support owner. How a release runs: [`stack/remote/README.md`](../../stack/remote/README.md) and
> [`docs/customer/OPERATIONS.md`](../customer/OPERATIONS.md), "Releases".

## The rules

- **Two working days before**, the support owner mails what changes, the day and the commit to the company admins and
  the IT contact named on the order form. Working days are the company's.
- **After the release**, a short live mail. The running version also shows on `/admin` Overview.
- **On the customer's own server**, Kevin approves the `release-customer` job only after the customer's IT contact
  agreed to the window in a reply. No reply, no release. The customer may also ask for a pin instead.
- **A pin** is agreed with an end date of at most 30 days and noted on the stack in admin. A security fix ends a pin
  early. NextUp announces the unpin with this same mail, two working days before.
- A release that fails its health check is rolled back to the commit before; the live mail then says so.

## The mail before

> **Subject: NextUp release on [weekday, date]: [one line, what changes]**
>
> Hello [names],
>
> on [weekday, date] between [time] and [time] (Europe/Berlin) we move NextUp for [company] to commit [sha, 7 characters].
> The app is away for a few minutes while the database is backed up and updated.
>
> What changes for your people:
> - [change, in plain words]
>
> What changes for admins:
> - [change, or "nothing"]
>
> Fixed:
> - [fix, or "nothing"]
>
> [Only on your own server:] Please reply to agree to this window. Without your reply we do not release.
> [Only when a pin ends:] Your pin ends with this release.
>
> If the day does not suit you, reply and we agree another one, or a pin of at most 30 days.
>
> [Support owner], NextUp support, [mailbox]

## The live mail

> **Subject: NextUp is updated: [sha]**
>
> Hello [names],
>
> NextUp for [company] runs commit [sha] since [time]. The health check is green. Nothing to do for you.
>
> [Support owner]

If it was rolled back:

> NextUp for [company] is back on commit [old sha] since [time]: the new version did not pass its health check. We write
> before we try again.
