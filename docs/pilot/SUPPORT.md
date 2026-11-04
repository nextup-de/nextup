# Pilot support: channels, severity, response times

> **Updated 2026-11-04.** What a pilot customer can expect, and what the NextUp team does, in a team of three people with
> no night shift. Anything marked **KEVIN: fill in** is not decided. **There is no SLA and no price yet**; the response
> targets below are what the team believes it can keep, not a promise in a contract.

## Who owns what

| Role | Person | Does |
|---|---|---|
| Support owner | **KEVIN: fill in — name and a deputy** | owns every ticket until closed; decides severity; reports to the customer |
| Incident lead | **KEVIN: fill in — name and a deputy** | runs an incident (severity 1 and 2): stops the harm, restores service, writes the note |
| Escalation | Kevin (head engineer); then Marc | decides on a stop, a rollback, an exception, anything legal |
| Customer contacts | named at the joint setup session | the pilot lead (product questions), the IT contact (server, sign-in, mail), the admin (settings, support access) |

A person who is not yet decided stays marked until Kevin fills them in. Until then nothing in this file promises that a
named person answers. The first pilot does not start until the support owner and the incident lead are filled in.

**Escalation.** Support owner, after 1 hour without progress on severity 1 or after half a working day on severity 2, calls
the incident lead; the incident lead, after another hour without a path to a fix, calls Kevin; Kevin decides about a
rollback to sandbox or a stop of the pilot and tells the customer's pilot lead the same day.

## Channels

| Channel | For | Notes |
|---|---|---|
| The problem button in the app | a person who finds something broken | opens a ticket with NextUp; the person gets a mail with the answer |
| Support mailbox: **KEVIN: fill in — address** | the pilot lead, IT and admin | the main channel for the pilot; read on working days |
| Phone: **KEVIN: fill in — number, or say none** | severity 1 only | during the hours below; no night or weekend cover |
| Weekly call | pilot lead and NextUp, once a week during the pilot | the report, open tickets, what changes |
| Customer's own helpdesk | their people's first-line questions | the pilot lead trains their first line with `TRAINING.en.md` |

People in the company ask their pilot lead first. The pilot lead and IT contact are the only ones who contact NextUp
directly; it keeps the line short.

## Severity

| Level | Means | Example |
|---|---|---|
| 1 Critical | the service is down for everybody, or data may be lost or shown to the wrong people | the stack does not answer; someone sees a case they must not; backups fail with no fix |
| 2 High | an important part does not work and there is no workaround | nobody can sign in with Microsoft; case mails do not leave in pilot; a restore is needed |
| 3 Normal | something does not work but people can carry on, or one person is affected | a wrong unit in the Org page; a mail in the wrong language; the directory sync fails once |
| 4 Question | how to, or a wish | how to add a route; a report definition; an idea |

If the customer and NextUp disagree about the level, the higher one holds until the support owner and the pilot lead have
talked.

## Response targets

Working hours, Monday to Friday, **KEVIN: fill in — hours and time zone, for example 09:00 to 17:00 Europe/Berlin**, on
working days of the company's calendar. There is no night, weekend or holiday cover and no high availability.

| Level | First reply | Aim to resolve or work around | When it is outside hours |
|---|---|---|---|
| 1 Critical | 1 hour | same working day, a rollback to sandbox if needed | the next working day opens with it |
| 2 High | 4 hours | 2 working days | next working day |
| 3 Normal | 1 working day | 5 working days | next working day |
| 4 Question | 2 working days | in the weekly call | next working day |

These are targets. The first pilot tells whether the team can keep them; they are reviewed at the end of the pilot. Nothing
here is a service level agreement. **SLA: undecided. Price: undecided.**

Data restore targets are separate and written down: at most 24 hours of data lost, a restore within 1 hour
(`docs/ops/RPO_RTO.md`). They hold for a restore on working days; they are not a promise of 24-hour cover.

## Support access: through the customer's grant

NextUp staff have no standing access to a pilot company. To help inside the app:

1. The customer's admin opens Settings, Support access and grants access for 1, 4, 24 or 72 hours, with a reason.
2. The page shows a short support code once. The admin passes it to NextUp through the channel they trust.
3. NextUp signs in only for that time. Every grant, extension, end and sign-in is in the audit log and on the page.
4. The admin can extend (never beyond 72 hours from now) or end it at any moment. Anyone from NextUp who is signed in is
   signed out.

The Go-live page blocks the switch to pilot while a grant is open, and the check shows again as *needs you* if one is open
later. Without a grant NextUp works only from what the customer sends: screenshots without personal data, the time, the
page, the text of an error, the audit export.

On the host, the operator can open a break-glass window for the admin console if sign-in is down. The customer's IT can
open it too. Details: `docs/customer/OPERATIONS.md`.

## What NextUp does for an incident

1. Say so within the first-reply time: what is known, what is not, when the next update comes.
2. Stop the harm: switch the company back to sandbox if mails or data are the problem; the customer's admin can do it too.
3. Restore: the release job and the backup routines in `docs/customer/OPERATIONS.md`.
4. Write a short note the same week: what happened, who was affected, what changes. Where personal data was involved, tell
   the customer's data protection officer the same day; the customer decides about any report to a supervisory authority.
5. A new finding goes into `docs/test-phase/findings/` style, with an owner and a date.

## What we do not offer in the pilot

24/7 cover, high availability, a named account manager on call, response by chat, a contractual SLA, custom features. Ask
Kevin if the customer needs one; it is a decision, not a default.
