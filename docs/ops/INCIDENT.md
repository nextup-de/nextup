# An incident: who does what, and the mails

> **Draft for Marc, 2026-11-11.** Not sent to a customer before Marc has read it. Plan S, issue #666 (Q10.4, Q10.5,
> Q10.7, Q10.8). For NextUp's support owner and incident lead. Severity levels, channels and response targets:
> [`docs/pilot/SUPPORT.md`](../pilot/SUPPORT.md). Restore steps: [`RPO_RTO.md`](RPO_RTO.md).

## Who

| Role | Person | Deputy |
|---|---|---|
| Support owner: owns the ticket, decides the severity, writes the mails | **`<named by Kevin>`** | **`<named by Kevin>`** |
| Incident lead: has host access, stops the harm, restores, writes the note. Not the support owner. | **`<named by Kevin>`** | **`<named by Kevin>`** |
| Escalation | Kevin, then Marc | – |

Hours: 09:00 to 17:00 Europe/Berlin on the company's working days. Phone for severity 1 only:
**`<named by Kevin>`**. The first pilot does not start before the people above are named.

## Restore time we name to customers

> **Until Kevin decides** (Q10.4, nextup-context `decisions/2026-11-09_restore-time.md`), the texts use the
> recommendation: the weekly restore test must finish within **1 hour** (our test limit); customers are told a whole
> restore takes up to **4 hours in business hours**. The first reply to severity 1 stays 1 hour in working hours.
> At most 24 hours of data can be lost.

## The steps

1. **Severity.** The support owner sets it (`SUPPORT.md`). If the customer says higher, the higher one holds.
2. **First mail** within the first-reply time (severity 1: 1 hour, severity 2: 4 hours) to the pilot lead, the IT
   contact and the company admin from the order form. For severity 1, call the pilot lead as well.
3. **Stop the harm.** Switch the company back to sandbox if mails or data are the problem; the customer's admin can do
   it too.
4. **Before a real restore**, if the database still answers: save the audit rows newer than the snapshot (people
   pseudonymised or deleted, exports). Then restore (`RPO_RTO.md`), and mail the snapshot time and what is lost.
5. **After a restore**, a company admin repeats each erasure on that list the same day. A restore brings back people
   who were deleted after the snapshot.
6. **Updates** at the time the last mail promised, until it is solved.
7. **Personal data involved:** tell the customer's data protection officer the same day. The customer decides about a
   report to the supervisory authority; the DPA's limit for telling the customer is 72 hours after NextUp learned of it.
8. **The note**, the same week: what happened, who was affected, what changes.

## The first mail

> **Subject: NextUp [company]: [short description], severity [1–4]**
>
> Hello [names],
>
> since [time] [what people see, in plain words]. Affected: [everyone / a part, which].
>
> What we know: [facts].
> What we do not know yet: [open points].
> What we do now: [step].
> [If switched back to sandbox:] We switched [company] back to sandbox at [time]: no mails go out until we switch back.
>
> Next update by [time], or earlier if it is solved.
>
> [Support owner], NextUp support, [mailbox], [phone for severity 1]

## The restore mail

> **Subject: NextUp [company]: restored to [snapshot date and time]**
>
> Hello [names],
>
> we restored NextUp for [company] from the backup of [snapshot date and time]. It runs again since [time].
>
> What is lost: everything entered between [snapshot time] and [time of the failure]. People will need to enter it again.
>
> [If the list is not empty:] These people were pseudonymised or deleted after the backup, and the restore brought them
> back. A company admin, please repeat each of these today in Settings → Members, and reply when done:
> - [person, action, date]
>
> [Support owner]

## The closing note

> **Subject: NextUp [company]: closed, what happened on [date]**
>
> Hello [names],
>
> What happened: [one paragraph].
> Who was affected: [who, how long].
> Personal data: [none / what; your data protection officer was told on [date]].
> What we change: [step, owner, date].
>
> [Incident lead]
