# First live reminder on Musterwerk: checklist for Mon 16 Nov 2026

The first reminder that can reach a real inbox (MAIL_LIVE_2026-11-08.md, "Not done"). Stack `musterwerk`, stage
`pilot`, relay Brevo, sender `nextup@sellux.ch`. Checking it takes about ten minutes. All times are **Berlin time**
(CET, UTC+1) unless they say UTC.

## When it fires

The answer date is the last day to answer. A reminder is written on the **first working day after** it, by the clock's
first run that day (every minute), so just after **00:00 Berlin**: `dueDay < today` in `features/clock/due.ts`, on the
company's working-day calendar (Mon-Fri, German holidays). The proof is in `tests/db/outbox.test.ts`, "the working-day
clock: …": no reminder on the answer date or over the weekend, the first one at 00:01 on Monday.

| Case | Answer date | Reminder (`reminder.deadline`) | Escalation (`reminder.escalation`), if still open |
|---|---|---|---|
| `c_mw74jgi20` "And an Linie A steht still" (raised Sun 8 Nov) | **Fri 13 Nov** | **Mon 16 Nov, ~00:01** (Sun 15 Nov 23:01 UTC). Nothing on Fri 13, Sat 14 or Sun 15 | Thu 19 Nov ~00:01, with the default `escalation_days` = 3 |
| `c_mw8g98n60` "Band A an Linie A steht wieder" (raised Mon 9 Nov 00:13) | Mon 16 Nov | Tue 17 Nov ~00:01 | Fri 20 Nov ~00:01 |

If a case is answered (or decided) before that run, it gets no reminder. Every generated Musterwerk case whose answer
date is 13 Nov fires at the same moment: expect many `reminder.deadline` rows at 00:01, not only these two.

## Who gets it, how, in which language

`reminder.deadline` goes to the people of the seat the case escalates to and of the seat it sits at now (all holders of
those roles), never to anyone else. For `c_mw74jgi20` that is:

| Person | Why | Channel | Language |
|---|---|---|---|
| Julia Rossi (Schichtleiter Produktion Linie A Werk Nord) | the case sits at her seat | **Teams card** when Microsoft Teams is on for Musterwerk and she has a chat with the bot (it was on after the 8 Nov re-check); otherwise mail to her Outlook | German (her profile language is `de`) |
| Ute Braun (the route's deputy) | the seat the deadline escalates to | Teams if she has a bot chat, otherwise mail | her profile language, else the company default (Settings → Company; on 8 Nov it was empty, which means **English**) |

Then, a minute later, the case is handed over to the deputy's seat (`deadline_handover` is on by default). That hand-over
sends no mail of its own.

What the mail says (subject, then the first line):

- German: **"Antwort überfällig: And an Linie A steht still"**, "Dieser Fall hat sein Antwortdatum (13. Nov. 2026)
  überschritten und liegt jetzt bei Ihnen oder Ihrer Vertretung:", with the case link
  `https://musterwerk.sellux.ch/cases/c_mw74jgi20`.
- English: **"Answer overdue: And an Linie A steht still"**, "This case passed its answer date (…) and is now with you or
  your deputy:".

## The ten-minute check, Mon 16 Nov after 00:05

- [ ] **Julia's Teams** (or Outlook Inbox, else Junk): one reminder for "And an Linie A steht still", German, date
  13 Nov 2026, the link opens the case (signed out: the login page, then the case). Exactly one, not one per minute.
- [ ] **Ute Braun's** mailbox or Teams, if she has one: one reminder, language as in the table. If she has no mailbox,
  see "Bounces" below.
- [ ] **The case page** of `c_mw74jgi20`: the case shows as overdue and, after the hand-over, sits with the deputy.
- [ ] **Settings → Notifications** (Musterwerk, as company admin): no failed `reminder.deadline` row for these two people.
  A row "no mail address for <name>" means that person has no mail address in NextUp (after `fix/mail-bounces-no-address`;
  before it such a person got no row at all).
- [ ] **Operator, outbox rows** (read-only, on the box):

  ```sql
  SELECT o.template, o."recipientUserId", o.channel, o.address, o.locale, o.status, o.attempt, o."sentAt", o."lastError", o.subject
  FROM "OutboxMessage" o JOIN "Company" c ON c.id = o."companyId"
  WHERE c.slug = 'musterwerk' AND o.template LIKE 'reminder.%'
    AND o.data->>'subjectId' IN ('c_mw74jgi20', 'c_mw8g98n60')
  ORDER BY o."createdAt";
  ```

  Expected on Mon 16 Nov: one row per person above, `status = sent`, `attempt = 1`, `sentAt` a minute or so after 00:00
  Berlin, `locale` as in the table, key `rem:<clock.due event id>:<userId>`. A `pending` row with "SMTP_URL is not set"
  means the relay is missing; `skipped` with "sandbox" or "switched off" means the stage or the reminder switch
  (`CompanyConfig.notifications`) is off.

## Bounces

Brevo accepts every address and bounces later, by mail, to its own log; the app never hears about that, so the row stays
`sent`. Every route owner on Musterwerk is a generated person without a mailbox (MAIL_LIVE finding 4), so most of the
00:01 reminders will bounce at Brevo. Check the Brevo log for hard bounces after 00:05. A relay that refuses the
recipient during the SMTP conversation (5xx on RCPT TO, as Exchange does for an unknown user) is now recorded on the row
as "Hard bounce: …" and not retried; a 4xx there follows the 1 min / 5 min / 30 min / 2 h / 12 h ladder.

## If nothing arrived

1. No row at all: the clock did not run or the case was answered. Check the case history for a `clock.due` fact by
   `system:clock` (deadline, dueDay of 13 Nov).
2. A row `skipped`: the reason is in `lastError`.
3. A row `sent` but nothing in the mailbox: Junk folder, then the Brevo log.
4. A row `failed`: `lastError` says why; Settings → Notifications lists it with **Retry**.
