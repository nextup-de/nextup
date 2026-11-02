# 06 · Notifications, emails and Teams

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> One settings page (Notifications), two new emails (deadline reminder with its three sister reminders, daily digest)
> and the Teams surfaces: the app icon and five adaptive cards (new case, deadline reminder, answer and hand-over,
> raise a case from Teams, confirmation). Everything NextUp sends goes through NTF's outbox; Teams is one more channel
> on it.

Context for this file:

- **Bauplan NTF** (plans repo `projects/nextup/NTF/PLAN.md`, approved 2026-11-02): D5 tables `OutboxMessage`,
  `WebhookSubscription`, `NotifyPreference`, `NotifyCursor`; D7 what becomes a message and for whom (templates
  `raised`, `loop.*`, `reminder.deadline`, `reminder.checkin`, `reminder.start`, `reminder.measure`, `digest`,
  `webhook`); D8 gating (`gateOf`): a sandbox company writes every row as `skipped` "sandbox"; `raised` and `loop.*`
  go out in demo, pilot and live; `reminder.*` and `digest` only when `CompanyConfig.notifications` is on; webhooks
  only when `CompanyConfig.n8n` is on; a person's opt-out skips their mail; `digest` is off until the person turns it
  on; D9 delivery with retries (1 min, 5 min, 30 min, 2 h, 12 h, then `failed`); D12 digest at 07:00 Europe/Berlin
  on the company's working days, only with a case on the desk, never for demo companies. Tasks: NTF-G1 (tables,
  `listOutbox`), NTF-A1 (planner, gate, mail texts in `i18n/messages/mail.ts`), NTF-B1 (channels, `registerChannel`),
  NTF-C1 (dispatcher, old senders off), NTF-D1 (digest, opt-in on the profile page), NTF-Z1 (acceptance).
- **NTF builds no admin page.** Its "Not in scope" names "an editor for subscriptions or a failed-messages view
  (ADM, Q1)", and NTF-D1 says "No settings page for admins (ADM)". The ADM Bauplan has no task for it either. So the
  Notifications page below has **no task yet** (open question N1). The data it reads all exists after NTF.
- **The per-person choices** (which mails a person gets, the digest switch) are on the profile page, NTF-D1's
  `NotifySettings.tsx`, specified in [04 · Profile](04-everyday-app.md#profile). Not repeated here.
- **TMS has no Bauplan yet.** The Teams part follows the PILOT brief `### TMS`: a Teams app manifest in `ops/teams/`,
  a bot endpoint under `app/api/[company]/teams/` that verifies Bot Framework tokens, a `NotifyChannel` adapter
  `teams` registered with NTF's `registerChannel("teams", …)`, raise as a message extension, answer and hand-over
  from adaptive cards, cards in German and English, a local fake Bot Framework for tests; no new SDK (HD2, HD9,
  HQ6: the live app goes into the test tenant). **The Teams part may change when the TMS Bauplan is written.** The
  Teams connector block on the Connectors page is spec [03](03-connectors.md).
- Today on `main` (f05fc56): the raise notice (`server/case-notice.ts`, text from `features/cases/notice.ts`) and the
  loop mails (`server/loop-notice.ts`, text from `features/loop/notice.ts`) are plain-text mails sent after the
  append, strings in `i18n/messages/mail.ts`. No reminder, no digest, no Teams.
- Text namespaces: `mail` (NTF-A1 owns it; the new keys below are proposals for NTF-A1), `settingsNotify`
  *(proposal)* for the page, `teams` *(proposal, TMS)* for the cards.

---

## Notifications

- **Route:** `/[company]/settings/notifications` (new)
- **Who:** company admins (ADM/D6)
- **Phase:** none yet (N1). NTF provides every piece of data; the page needs a task in ADM or a follow-up. Retry is
  *(proposal, not in any plan)*.
- **Data:** `Company.stage`; `CompanyConfig.notifications` (reminders and digest) and `CompanyConfig.n8n`
  (webhooks; called "Automations" in the UI) in `integrations.prisma`; `mailStatus()` and `mailFrom()` in
  `server/mail.ts` (configured, reachable; the relay's host is not shown here); `listOutbox(companyId, { status?,
  template? })` from NTF-G1 (`lib/db/outbox.ts`) for the last 7 days; `subscriptionsOf(companyId)` for the webhook
  count; the Teams channel's state *(later TMS)*. Who opted in or out (`NotifyPreference`) is **not** shown per
  person.
- **Today:** nothing; the switches exist as columns and are not edited anywhere in the app.

**Purpose:** see what NextUp sends for the company, switch reminders and the digest on, and spot messages that
did not arrive.

### Layout (desktop)

```
Notifications
What NextUp sends at Acme Automotive, to whom and when.

┌ InfoPanel ────────────────────────────────────────────────────────────┐
│ [Pilot]  Messages go out. Each person chooses on their profile which  │
│          mails they get; you do not see who chose what.               │
└───────────────────────────────────────────────────────────────────────┘
┌ Always sent ──────────────────────────────────────────────────────────┐
│ These go out in demo, pilot and live, unless a person turned them off.│
│ ┌ InfoPanel ────────────────────────────────────────────────────────┐ │
│ │ New case on your desk   to the people in the seat it lands on     │ │
│ │ Discussions             to those asked for their view, and the    │ │
│ │                         person who raised it, at every check-in   │ │
│ │ What your idea became   to its authors: accepted, started, done,  │ │
│ │                         measured, recognised                      │ │
│ │ Project lead and team   to the lead and new team members          │ │
│ └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
┌ Reminders and daily digest ───────────────────────────── [on ] ───────┐
│ Deadline        to the desk and to the desk it escalates to, on the   │
│                 first working day after the promise ran out           │
│ Check-in        to the desk, when a discussion's check-in is late     │
│ Start           to the project lead, when a project has not started   │
│ Measure         to the project lead, when a measure is late           │
│ Daily digest    07:00 on working days, to people who turned it on,    │
│                 only when something is on their desk                  │
│                                                            [ Save ]   │
└───────────────────────────────────────────────────────────────────────┘
┌ Channels ─────────────────────────────────────────────────────────────┐
│ Mail        (On)     from NextUp <hello@nextup.app>                   │
│ Teams       (Off)    later: set up in Connectors →                    │
│ Webhooks    (On)     2 subscriptions · Automations on   Webhooks →    │
└───────────────────────────────────────────────────────────────────────┘
┌ Last 7 days ──────────────────────────────────────────────────────────┐
│ 1,284 sent · 3 waiting · 2 failed · 0 skipped                          │
│ [Failed and waiting ▾] [All messages ▾]                               │
│ When         Message            To                  Tries  Status      │
│ 2 Nov 09:14  Deadline reminder  H. Sander · mail     6    (Failed)     │
│              mailbox full (552)                             [Retry]   │
│ 2 Nov 08:40  Webhook case.raised hooks.acme.de       2    (Waiting)    │
│              next try 09:10 · HTTP 503                                │
│ 1 Nov 17:02  New case           L. Brandt · mail     1    (Failed)     │
│              address rejected (550)                         [Retry]   │
└───────────────────────────────────────────────────────────────────────┘
```

- The stage line is an `InfoPanel` with the stage `StatusBadge` (Sandbox amber, Pilot and Live "On" style, Demo
  grey).
- The switch of "Reminders and daily digest" sits in the card header; the rows under it are a read-only grid
  (label column 160 px). While the switch is off, the rows are `--nh-mute` and the card shows the hint "Off: no
  reminders and no digest. Always-sent mails still go out." / "Aus: keine Erinnerungen und kein Tagesüberblick.
  Immer verschickte Mails gehen weiter raus."
- Channels: one row each, name, `StatusBadge`, one meta line, a link on the right.
- "Last 7 days": a meta line with the company totals, two filter chips (status: *Failed and waiting* default,
  *All*; message kind), then a `DataTable` (10 rows, paging). The second line of a row is the last error in
  `--nh-fs-sm` `--nh-mute`, or "next try {time}" for waiting rows. *Retry* only on failed rows.
- The table never shows a subject or a case title: a private case's title would leak (VIS). The message kind and
  the recipient are enough to act on.

### Phone

Cards stack. The always-sent and reminder grids put the label above its line. The outbox table becomes stacked
cards: message and status on line 1, recipient on line 2, time and tries on line 3, *Retry* full width.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | | What NextUp sends at {company}, to whom and when. | Was NextUp bei {company} verschickt, an wen und wann. |
| Stage: pilot, live | `InfoPanel` | | Messages go out. Each person chooses on their profile which mails they get; you do not see who chose what. | Nachrichten gehen raus. Jede Person wählt in ihrem Profil, welche Mails sie bekommt; wer was gewählt hat, siehst du nicht. |
| Stage: sandbox | `InfoPanel`, amber badge | D8 | Sandbox: nothing is sent. Every message is written as skipped, so you can check below what would have gone out. | Sandbox: Es wird nichts verschickt. Jede Nachricht wird als übersprungen vermerkt, damit du unten prüfen kannst, was rausgegangen wäre. |
| Stage: demo | `InfoPanel`, grey badge | D8, D12 | Demo: new-case and discussion mails go out; there is no digest. | Demo: Mails zu neuen Fällen und Diskussionen gehen raus; einen Tagesüberblick gibt es nicht. |
| Always sent | card + `InfoPanel` | templates `raised`, `loop.*` | Always sent · These go out in demo, pilot and live, unless a person turned them off. · New case on your desk · Discussions · What your idea became · Project lead and team | Immer verschickt · Diese gehen in Demo, Pilot und Live raus, außer eine Person hat sie abgeschaltet. · Neuer Fall auf deinem Tisch · Diskussionen · Was aus deiner Idee wurde · Projektleitung und Team |
| Always-sent recipients | text | D7 | to the people in the seat it lands on · to those asked for their view, and the person who raised it, at every check-in · to its authors: accepted, started, done, measured, recognised · to the lead and new team members | an die Personen auf dem Platz, auf dem er landet · an alle, deren Sicht gefragt ist, und an die einreichende Person, bei jedem Check-in · an die Autorinnen und Autoren: angenommen, gestartet, erledigt, gemessen, gewürdigt · an die Leitung und neue Teammitglieder |
| Reminders switch | switch in the card header | `CompanyConfig.notifications`; writes an audit event (05) | Reminders and daily digest | Erinnerungen und Tagesüberblick |
| Deadline | row | `reminder.deadline` | Deadline · to the desk and to the desk it escalates to, on the first working day after the promise ran out | Frist · an den Tisch und an den Tisch, an den eskaliert wird, am ersten Arbeitstag nach Ablauf des Versprechens |
| Check-in | row | `reminder.checkin` | Check-in · to the desk, when a discussion's check-in is late | Check-in · an den Tisch, wenn der Check-in einer Diskussion überfällig ist |
| Start | row | `reminder.start` | Start · to the project lead, when a project has not started | Start · an die Projektleitung, wenn ein Projekt nicht gestartet ist |
| Measure | row | `reminder.measure` | Measure · to the project lead, when a measure is late | Messung · an die Projektleitung, wenn eine Messung überfällig ist |
| Digest | row | `digest`, NTF/Q2 | Daily digest · 07:00 on working days, to people who turned it on, only when something is on their desk | Tagesüberblick · 07:00 an Arbeitstagen, an Personen, die ihn eingeschaltet haben, nur wenn etwas auf ihrem Tisch liegt |
| Channels | rows | | Channels · Mail · Teams · Webhooks | Kanäle · Mail · Teams · Webhooks |
| Mail line | badge + meta | `mailStatus()`: On = configured and reachable; Error = not reachable; Off = not set up | from {from} · The mail server does not answer. Mails wait and are sent when it is back. · Not set up. Ask the NextUp team. | von {from} · Der Mailserver antwortet nicht. Mails warten und gehen raus, sobald er wieder da ist. · Nicht eingerichtet. Frag das NextUp-Team. |
| Teams line *(later TMS)* | badge + link | | later: set up in Connectors → · On · {n} people reachable in Teams | später: unter Anbindungen einrichten → · An · {n} Personen in Teams erreichbar |
| Webhooks line | badge + link | `subscriptionsOf`, `n8n` | {n} subscriptions · Automations on · Automations off: webhooks are not sent. · Webhooks → | {n} Abos · Automationen an · Automationen aus: Webhooks werden nicht verschickt. · Webhooks → |
| Totals | meta | company totals from `listOutbox` | {sent} sent · {pending} waiting · {failed} failed · {skipped} skipped | {sent} verschickt · {pending} wartend · {failed} fehlgeschlagen · {skipped} übersprungen |
| Filters | chips | | Failed and waiting · All · Message | Fehlgeschlagen und wartend · Alle · Nachricht |
| Columns | | | When · Message · To · Tries · Status | Wann · Nachricht · An · Versuche · Status |
| Message kinds | text | template → label | New case · Discussion · Idea update · Deadline reminder · Check-in reminder · Start reminder · Measure reminder · Daily digest · Webhook {type} | Neuer Fall · Diskussion · Ideen-Update · Fristerinnerung · Check-in-Erinnerung · Starterinnerung · Messerinnerung · Tagesüberblick · Webhook {type} |
| To | text | mail: person + channel; webhook: host of the URL | {name} · mail · {host} | {name} · Mail · {host} |
| Status | `StatusBadge` | sent = On, pending = amber, failed = Error, skipped = Off | Sent · Waiting · Failed · Skipped | Verschickt · Wartend · Fehlgeschlagen · Übersprungen |
| Waiting line | meta | `nextAt`, `lastError` | next try {time} · {error} | nächster Versuch {time} · {error} |
| Skipped reasons | meta | `lastError` of skipped rows | sandbox · switched off · opted out | Sandbox · abgeschaltet · abbestellt |
| Retry *(proposal)* | grey small pill | failed rows only | Retry | Erneut senden |

### Actions

- *Save* (reminders switch): turning it on asks first (`ConfirmDialog`): "Switch on reminders and the daily digest?
  From the next working day, people whose deadlines pass get a reminder, and those who turned on the digest get it
  at 07:00." / "Erinnerungen und Tagesüberblick einschalten? Ab dem nächsten Arbeitstag bekommen Personen mit
  abgelaufener Frist eine Erinnerung, und wer den Tagesüberblick eingeschaltet hat, bekommt ihn um 07:00." Then
  toast "Saved" / "Gespeichert".
- *Retry* *(proposal)*: puts the row back to waiting with the next try now; toast "Sent again to H. Sander." /
  "Erneut an H. Sander gesendet." or the new error under the row. No retry for skipped rows.

### States

- Loading: skeleton bars in each card, 5 skeleton rows in the table.
- No message in 7 days: `EmptyState` "Nothing sent in the last 7 days." / "In den letzten 7 Tagen wurde nichts
  verschickt."
- Nothing failed: with the default filter, `EmptyState` "Every message of the last 7 days arrived." / "Jede
  Nachricht der letzten 7 Tage ist angekommen." with *Show all*.
- Sandbox: the table's default filter is *All* and shows the skipped rows with reason "sandbox".
- Mail not set up: the Mail row is "Off" and the always-sent card adds "Mails wait until the mail server is set up."
  / "Mails warten, bis der Mailserver eingerichtet ist." (D9: rows stay pending).

### Done when

- [ ] Desktop and phone frames in German for pilot and sandbox; demo stage line.
- [ ] Reminders on and off, the switch-on dialog; mail on, error and off; Teams *later*; webhooks with automations
      off.
- [ ] Outbox table with failed, waiting and skipped rows; both empty states; loading.

---

## Email: reminders

- **Templates:** `reminder.deadline`, `reminder.checkin`, `reminder.start`, `reminder.measure` (NTF/D7, texts in
  `features/notify/templates.ts`, strings in `i18n/messages/mail.ts`, NTF-A1). Key `rem:<eventId>:<userId>`, so a
  person gets each reminder once. Sent only when `CompanyConfig.notifications` is on (D8) and the person has not
  turned reminders off on their profile.
- **Trigger:** CLK's `clock.due` facts (CLK/D10): `deadline` when an open case passed its promise, with
  `toRoleHolderId` = the seat it escalates to; `checkin` for a late check-in; `start` for a project past its start
  day; `measure` for a late measure check.
- **Layout:** exactly today's notice mails (`composeNoticeMail`, `loopMails`): plain text, "{name}," and a blank
  line, one intro line, the case title indented by two spaces, the facts, the next step as one sentence, then the
  links each on its own line with a label padded to line up. No HTML, no logo, no footer except the opt-out line.
  Dates are real working-day dates from CLK, written "Mon 2 Nov" / "Mo. 2. Nov.".

### Deadline, to the desk it sits on

```
Subject: Past the promise: Kühlmittel-Leck an Linie 3

H. Sander,

this case passed the 5-day promise and is still open:

  Kühlmittel-Leck an Linie 3

Raised Mon 26 Oct · was due Mon 2 Nov.
From today Werkleitung Süd sees it too.

Answer now - yes, no with a reason, hand it over, or ask a question.

This case:      https://nextup.app/acme/cases/c_41k2
Open the inbox: https://nextup.app/acme/leader

You get reminders because your company switched them on. Turn them off
in your profile: https://nextup.app/acme/profile
```

### Deadline, to the desk it escalates to

```
Subject: Escalated to you: Kühlmittel-Leck an Linie 3

M. Keller,

Qualitätsleitung Werk Süd did not answer within the 5-day promise, so
this case is on your desk too:

  Kühlmittel-Leck an Linie 3

Raised Mon 26 Oct · was due Mon 2 Nov · from Montage · Werk Süd.

Answer it, or make sure Qualitätsleitung Werk Süd does.

This case:      https://nextup.app/acme/cases/c_41k2
Open the inbox: https://nextup.app/acme/leader

(opt-out line as above)
```

The role comes first, never the person in it (HD5). "From" is the raiser's department, as in today's notice; the
raiser's name is not in the mail.

### Check-in, start and measure

Same frame; only subject, intro and next step change:

| Kind | Subject EN | Subject DE | Intro and next step EN | Intro and next step DE |
|---|---|---|---|---|
| checkin | Check-in late: {title} | Check-in überfällig: {title} | The check-in of round {round} was due {date}. · Close the round on the case: decide, or start another round. | Der Check-in von Runde {round} war am {date} fällig. · Schließ die Runde am Fall ab: entscheide oder starte eine weitere Runde. |
| start | Not started yet: {label} {title} | Noch nicht gestartet: {label} {title} | This project was due to start on {date}. · Take the number it will be measured against, then start it. | Dieses Projekt sollte am {date} starten. · Nimm die Zahl auf, an der es gemessen wird, und starte es dann. |
| measure | Measure due: {label} {title} | Messung fällig: {label} {title} | The {days}-day measure was due {date}. · Enter the number on the project. | Die Messung nach {days} Tagen war am {date} fällig. · Trag die Zahl am Projekt ein. |

### Content (deadline)

| Line | EN | DE |
|---|---|---|
| Subject, desk | Past the promise: {title} | Frist überschritten: {title} |
| Intro, desk | this case passed the {days}-day promise and is still open: | dieser Fall hat das Versprechen von {days} Tagen überschritten und ist noch offen: |
| Facts | Raised {date} · was due {date}. | Eingereicht am {date} · fällig am {date}. |
| Escalation line | From today {role} sees it too. | Ab heute sieht ihn auch {role}. |
| Next step, desk | Answer now - yes, no with a reason, hand it over, or ask a question. | Antworte jetzt - Ja, Nein mit Begründung, weitergeben oder eine Frage stellen. |
| Subject, escalation | Escalated to you: {title} | An dich eskaliert: {title} |
| Intro, escalation | {role} did not answer within the {days}-day promise, so this case is on your desk too: | {role} hat nicht innerhalb des Versprechens von {days} Tagen geantwortet, darum liegt dieser Fall jetzt auch auf deinem Tisch: |
| Facts, escalation | Raised {date} · was due {date} · from {dept}. | Eingereicht am {date} · fällig am {date} · aus {dept}. |
| Next step, escalation | Answer it, or make sure {role} does. | Beantworte ihn oder sorg dafür, dass {role} es tut. |
| Links | This case: {url} · Open the inbox: {url} | Dieser Fall: {url} · Posteingang öffnen: {url} |
| Opt-out *(proposal)* | You get reminders because your company switched them on. Turn them off in your profile: {url} | Du bekommst Erinnerungen, weil deine Firma sie eingeschaltet hat. Abschalten kannst du sie in deinem Profil: {url} |

### Done when

- [ ] Deadline to the desk and to the escalation desk, and one of check-in, start, measure, as text frames in German
      and English, at 72 characters a line.

---

## Email: daily digest

- **Template:** `digest` (NTF/D12, content from `digestFor(userId, state, seats, locale, baseUrl)` in
  `features/notify/digest.ts`, NTF-D1): the open cases on the person's desk (`inboxOf(state, meFor(userId, seats))`),
  grouped by seat and role, with title, age and link. Key `digest:<userId>:<workday>`: one a working day.
- **When:** 07:00 Europe/Berlin on the company's working days (CLK `isWorkday`), only when the desk is not empty,
  only for people who turned the digest on in their profile ([04](04-everyday-app.md#profile)), never for demo
  companies, only with `CompanyConfig.notifications` on.
- **Layout:** the notice-mail frame. Cases are numbered; late ones first, then by days left.

```
Subject: Your desk today: 3 open cases

H. Sander,

on your desk this morning, Mon 2 Nov:

Qualitätsleitung Werk Süd
  1. Kühlmittel-Leck an Linie 3
     1 day past the promise · https://nextup.app/acme/cases/c_41k2
  2. Prüfplan für Zulieferteil ändern
     2 days left · https://nextup.app/acme/cases/c_39f0

Werkleitung Süd (escalated to you)
  3. Gabelstapler-Route kreuzt Fußweg
     raised 3 days ago · https://nextup.app/acme/cases/c_40a7

Open the inbox: https://nextup.app/acme/leader

You get this because you turned on the daily digest. Turn it off in
your profile: https://nextup.app/acme/profile
```

### Content

| Line | EN | DE |
|---|---|---|
| Subject | Your desk today: {count} open case · {count} open cases | Dein Tisch heute: {count} offener Fall · {count} offene Fälle |
| Intro | on your desk this morning, {date}: | auf deinem Tisch an diesem Morgen, {date}: |
| Seat heading | {role} · {role} (escalated to you) | {role} · {role} (an dich eskaliert) |
| Age, late | {n} day past the promise · {n} days past the promise | {n} Tag über dem Versprechen · {n} Tage über dem Versprechen |
| Age, open | {n} day left · {n} days left · due today | noch {n} Tag · noch {n} Tage · heute fällig |
| Age, no promise | raised {n} days ago | vor {n} Tagen eingereicht |
| Link | Open the inbox: {url} | Posteingang öffnen: {url} |
| Footer | You get this because you turned on the daily digest. Turn it off in your profile: {url} | Du bekommst das, weil du den Tagesüberblick eingeschaltet hast. Abschalten kannst du ihn in deinem Profil: {url} |

More than 20 cases: the first 20, then "and {n} more in your inbox" / "und {n} weitere in deinem Posteingang".

### Done when

- [ ] The digest with two seats, a late case and an escalated seat, in German and English; the variant with more than
      20 cases.

---

## Teams: what applies to every card

- **Format:** Adaptive Cards, schema version 1.5 (what Teams renders for bot messages and message extensions on
  desktop, web and mobile). Draft and check every card in the designer at https://adaptivecards.io/designer/ with
  the host app set to "Microsoft Teams" in light and dark.
- **Limits Sam designs within:**
  - A card is at most 28 KB of JSON. Lists (roles to hand over to) stay under 150 choices; above that the card
    offers *Open in NextUp* instead.
  - Text is `TextBlock` with `wrap: true`, sizes `small` / `default` / `medium` / `large`, weights `default` /
    `bolder`, colours only `default`, `accent`, `good`, `warning`, `attention`. No custom font, no hex colour, no
    HTML; Markdown only for bold and links.
  - At most 3 actions in one `ActionSet`. The main action gets `style: "positive"` (Teams draws it as its primary
    button; NextUp's black is not available in Teams). Destructive actions do not exist on cards.
  - Inputs: `Input.Text` (with `maxLength`, `isMultiline`, `isRequired`, `errorMessage`), `Input.ChoiceSet`
    (`compact` dropdown, `expanded` radio, `filtered` searchable), `Input.Toggle`. Labels via the input's `label`.
  - Width: Teams shows a card about 450 px wide on desktop and about 320 px on phones. Draw both. Titles at most two
    lines; `FactSet` labels short (one word where possible).
  - Colour use: `attention` (red) only for a late number, `warning` (amber) for "needs you", `accent` (blue) for
    the current state. Same meaning as in the app.
- **Language:** each card in the recipient's language (`User.locale`), from the `teams` namespace.
- **Roles first (HD5):** "On the desk of Qualitätsleitung Werk Süd". The raiser is shown by department, as in the
  mails. No avatars, no images of people. The only image is NextUp's mark in the header (24 px).
- **AI off (HD7, HD8):** wherever a card shows a routing proposal, the AI-off line replaces the sparkle line.
- **After a click:** the bot replaces the card in place with its result state (the inputs disappear, one line says
  what happened). When a seat has two people, both get the card; once one answers, the other's card shows "Answered
  by H. Sander · 14:20". *(TMS decides between `Action.Submit` with a message update and `Action.Execute` with
  refresh; this spec draws the result either way.)*
- **Header of every card:** a `ColumnSet`: NextUp mark (Image 24 px) | `TextBlock` small, subtle: the card's kind
  ("New case on your desk"). Then the title. In the wireframes `✦` stands for an image (the mark, or the AI
  sparkle), never for a typed character.

---

## Teams: app icon

- **Files:** `ops/teams/color.png` and `ops/teams/outline.png`, referenced from the Teams app manifest
  (`ops/teams/manifest.json`, TMS). Source: `design-system/assets/brand/` (the four-point star:
  `nextup-icon-white.svg`, `nextup-icon-blue.svg`, `app-icon.png`).
- **Colour icon, 192 × 192 px PNG:** a full square of logo blue `#1286fc` (logo use only, design-system README),
  the white star (`nextup-icon-white.svg`) centred at 96 × 96 px, 48 px clear on every side. No rounded corners in
  the file: Teams rounds them. No text.
- **Outline icon, 32 × 32 px PNG:** the star alone, white `#ffffff` on a fully transparent background, filling the
  square with no padding, no other colour, no anti-aliased grey halo on transparent pixels (Teams rejects it
  otherwise).
- **Manifest text:** short name "NextUp" (≤ 30 characters), full name "NextUp - raise it, get an answer"
  (≤ 100), short description "Raise a case, answer from a card, get reminders." (≤ 80), `accentColor` `#1286fc`.
  German: full name "NextUp - einreichen, Antwort bekommen", short description "Fall einreichen, auf Karten
  antworten, Erinnerungen bekommen."

```
 Colour 192 × 192                    Outline 32 × 32
┌────────────────────────┐          ┌────┐
│████████████████████████│          │ ✦  │  white star,
│████████████████████████│          └────┘  transparent ground
│██████████  ✦  █████████│  ← white star 96 × 96, centred
│████████████████████████│
│████████████████████████│  ← #1286fc full square
└────────────────────────┘
```

### Done when

- [ ] Both PNGs exported at their exact size; a frame showing them in the Teams app bar (light and dark) and in the
      app details dialog.

---

## Teams: new case card

- **Sent:** for template `raised` (NTF/D7) through the `teams` channel, to each person in the seat the case lands on,
  in their 1:1 chat with the NextUp bot.
- **Data:** the same as the raise notice (`buildRaisedNotice`): title, body, the raiser's department, the route's
  label, the answer-by date, the deputy role.

```
┌──────────────────────────────────────────────────────────────┐
│ ✦ New case on your desk                                      │
│                                                              │
│ Kühlmittel-Leck an Linie 3                                   │
│ Seit Schichtbeginn tropft Kühlmittel an Station 4. Die       │
│ Auffangwanne ist voll, der Boden ist rutschig.               │
│                                                              │
│ From       Montage · Werk Süd                                │
│ Route      Qualität, Leckagen                                │
│ Answer by  Mon 2 Nov (5 working days)                        │
│ Deputy     Werkleitung Süd                                   │
│                                                              │
│ [ Answer ]  [ Hand over ]  [ Open in NextUp ]                │
└──────────────────────────────────────────────────────────────┘
```

**Card structure in words:** `AdaptiveCard` 1.5 → header `ColumnSet` (Image mark | TextBlock small subtle "New case on
your desk") → `TextBlock` large bolder wrap (title) → `TextBlock` default wrap, `maxLines: 5` (body) → `FactSet`
(From, Route, Answer by, Deputy) → `ActionSet`: `Action.ShowCard` "Answer" (positive; its card is the answer form
below), `Action.ShowCard` "Hand over" (its card is the hand-over form below), `Action.OpenUrl` "Open in NextUp" (the
case link).

| Element | EN | DE |
|---|---|---|
| Kind line | New case on your desk | Neuer Fall auf deinem Tisch |
| Facts | From · Route · Answer by · Deputy | Von · Zuständigkeit · Antwort bis · Vertretung |
| Answer by value | {date} ({n} working days) | {date} ({n} Arbeitstage) |
| Actions | Answer · Hand over · Open in NextUp | Antworten · Weitergeben · In NextUp öffnen |
| Result line | You answered yes · {time} · You said no · {time} · You asked a question · {time} · You handed it to {role} · {time} · Answered by {name} · {time} | Du hast mit Ja geantwortet · {time} · Du hast Nein gesagt · {time} · Du hast eine Frage gestellt · {time} · Du hast ihn an {role} weitergegeben · {time} · Beantwortet von {name} · {time} |

### Done when

- [ ] Card at 450 and 320 px, light and dark; the result state for each outcome and "Answered by" for the second seat.

---

## Teams: deadline reminder card

- **Sent:** for `reminder.deadline` through the `teams` channel, to the same people as the mail (the desk, and the
  desk it escalates to), as a new message (not an update of the first card, so it shows as unread).
- **Variants:** to the desk ("Past the promise") and to the escalation desk ("Escalated to you"). Check-in, start
  and measure reminders use the same card with their texts from the reminder table above and only *Open in NextUp*.

```
┌──────────────────────────────────────────────────────────────┐
│ ✦ Escalated to you                                           │
│                                                              │
│ Kühlmittel-Leck an Linie 3                                   │
│ Qualitätsleitung Werk Süd did not answer within the 5-day    │
│ promise. It is on your desk too.                             │
│                                                              │
│ Raised     Mon 26 Oct                                        │
│ Was due    Mon 2 Nov · 1 day late           (attention)      │
│ From       Montage · Werk Süd                                │
│                                                              │
│ [ Answer ]  [ Hand over ]  [ Open in NextUp ]                │
└──────────────────────────────────────────────────────────────┘
```

**Card structure in words:** like the new case card; the kind line is "Past the promise" or "Escalated to you"; a
`TextBlock` wrap with the escalation sentence; a `FactSet` (Raised, Was due, From); the "1 day late" part as a
separate `TextBlock` with `color: "attention"` in a `ColumnSet` next to the due date (a `FactSet` value cannot be
coloured); the same `ActionSet`.

| Element | EN | DE |
|---|---|---|
| Kind, desk | Past the promise | Frist überschritten |
| Sentence, desk | This case passed the {days}-day promise. From today {role} sees it too. | Dieser Fall hat das Versprechen von {days} Tagen überschritten. Ab heute sieht ihn auch {role}. |
| Kind, escalation | Escalated to you | An dich eskaliert |
| Sentence, escalation | {role} did not answer within the {days}-day promise. It is on your desk too. | {role} hat nicht innerhalb des Versprechens von {days} Tagen geantwortet. Er liegt jetzt auch auf deinem Tisch. |
| Facts | Raised · Was due · From | Eingereicht · Fällig am · Von |
| Late | {n} day late · {n} days late | {n} Tag überfällig · {n} Tage überfällig |

### Done when

- [ ] Both variants at 450 and 320 px; one of the check-in, start, measure variants; the result state.

---

## Teams: answer and hand-over card

The two forms that open inside the new case and reminder cards (`Action.ShowCard`). Each submits to the bot
endpoint, which appends the event as the person by user id (HD10), with the same rules as the case page.

```
Answer                                         Hand over
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ Your answer                          │      │ Hand over to                         │
│ ( ) Yes                              │      │ [ Search a role…                  ▾] │
│ ( ) No                               │      │   Werkleitung Süd                    │
│ ( ) Ask a question                   │      │   Instandhaltung Werk Süd            │
│                                      │      │   Logistikleitung Süd                │
│ Reason or question                   │      │ Why (the next desk reads it)         │
│ [                                  ] │      │ [                                  ] │
│ [                                  ] │      │                                      │
│ Needed for no and for a question.    │      │ The clock keeps running.             │
│                                      │      │                                      │
│ [ Send answer ]                      │      │ [ Hand over ]                        │
└──────────────────────────────────────┘      └──────────────────────────────────────┘
```

**Card structure in words:**

- *Answer:* `Input.ChoiceSet` id `answer`, style `expanded`, `isRequired`, choices `yes` / `no` / `ask` →
  `Input.Text` id `text`, `isMultiline`, `maxLength: 1000`, label "Reason or question" → `TextBlock` small subtle hint
  → `ActionSet` with `Action.Submit` "Send answer" (positive), data `{ kind: "answer", caseId, cardId }`. The server
  refuses *No* and *Ask* without text and the card shows the input's `errorMessage`. *Yes* → `case.decided { answer:
  "yes" }`; *No* → `case.decided { answer: "no", reason }`; *Ask* → `case.asked { text }`.
- *For an idea* (`kind: "idea"`): *Yes* is not a choice, because a yes opens a project with a lead and steps. The
  form shows *No* and *Ask a question*, and an `Action.OpenUrl` "Say yes in NextUp".
- *Hand over:* `Input.ChoiceSet` id `toRole`, style `filtered`, `isRequired`, choices = the company's roles with at
  least one linked seat, title "{role}" with the unit when two roles share a title, value = the role id (TMS
  resolves the seat as the case page does) → `Input.Text` id `why`, `maxLength: 500` → hint → `Action.Submit` "Hand
  over" (positive), data `{ kind: "handover", caseId, cardId }` → `case.handed { to, toRoleHolderId, why }`.

| Element | EN | DE |
|---|---|---|
| Answer label | Your answer | Deine Antwort |
| Choices | Yes · No · Ask a question | Ja · Nein · Frage stellen |
| Text label | Reason or question | Begründung oder Frage |
| Hint | Needed for no and for a question. | Nötig bei Nein und bei einer Frage. |
| Error, no text | Say why, so the person who raised it understands. · Write your question. | Sag, warum - damit die einreichende Person es versteht. · Schreib deine Frage. |
| Idea line | A yes starts a project with a lead and steps. Say yes in NextUp. | Ein Ja startet ein Projekt mit Leitung und Schritten. Sag Ja in NextUp. |
| Send | Send answer | Antwort senden |
| Hand-over label | Hand over to | Weitergeben an |
| Search placeholder | Search a role… | Rolle suchen… |
| Why label | Why (the next desk reads it) | Warum (der nächste Tisch liest es) |
| Hand-over hint | The clock keeps running. | Die Uhr läuft weiter. |
| Hand-over button | Hand over | Weitergeben |
| Too many roles | More than 150 roles: hand it over in NextUp. | Mehr als 150 Rollen: Gib ihn in NextUp weiter. |
| Refused | This case was already answered by {name} at {time}. · You no longer sit in this case's seat. | Dieser Fall wurde schon von {name} um {time} beantwortet. · Du sitzt nicht mehr auf dem Platz dieses Falls. |

### Done when

- [ ] Both forms open inside the new case card, with an input error; the idea variant; the refused states; at 320 px.

---

## Teams: raise a case (message extension)

- **Where:** an action-based message extension (manifest `composeExtensions`, command `raise`, contexts `compose`,
  `commandBox` and `message`). From the compose box: *⋯ › NextUp › Raise a case*. From a message: *⋯ › More actions ›
  Raise as a case in NextUp*; the message text is put into "What happened".
- **Flow:** a Teams dialog (task module, 2 steps). Step 1 the form; step 2 where it goes; then the dialog closes and
  the confirmation card arrives in the person's 1:1 chat with the bot (never in the channel the extension was opened
  in: the case may be private).
- **Data:** the raise as on `/raise`: kind, title, body, visibility (`everyone` or `private`; *custom* stays in the
  app), the routing proposal from the server (AIP), the company's routes for a change.

```
Step 1                                        Step 2
┌──────────────────────────────────────┐      ┌──────────────────────────────────────┐
│ Raise a case                     ×   │      │ Where it goes                    ×   │
│                                      │      │                                      │
│ What is it?                          │      │ Kühlmittel-Leck an Linie 3           │
│ (•) A problem   ( ) An idea          │      │                                      │
│                                      │      │ ✦ The AI suggests                    │
│ In a few words                       │      │ Qualität, Leckagen                   │
│ [ Kühlmittel-Leck an Linie 3       ] │      │ → Qualitätsleitung Werk Süd          │
│                                      │      │                                      │
│ What happened                        │      │ Change it                            │
│ [ Seit Schichtbeginn tropft …      ] │      │ [ Qualität, Leckagen            ▾ ] │
│ [                                  ] │      │                                      │
│                                      │      │ Answer by Mon 9 Nov                  │
│ Who may see it                       │      │ (5 working days)                     │
│ [ Everyone at Acme Automotive    ▾ ] │      │                                      │
│                                      │      │                                      │
│               [ Next ]               │      │ [ Back ]              [ Raise it ]   │
└──────────────────────────────────────┘      └──────────────────────────────────────┘
```

**Card structure in words:**

- *Step 1:* `TextBlock` medium bolder "Raise a case" → `Input.ChoiceSet` id `kind`, `expanded`, choices `problem` /
  `idea`, default `problem` → `Input.Text` id `title`, `isRequired`, `maxLength: 120` → `Input.Text` id `body`,
  `isMultiline`, `maxLength: 2000`, prefilled from the message → `Input.ChoiceSet` id `visibility`, `compact`,
  choices `everyone` / `private` → `Action.Submit` "Next" (positive), data `{ step: 1 }`.
- *Step 2:* `TextBlock` bolder (the title) → a `ColumnSet` with the proposal: `Image` (the app's AI sparkle as a
  16 px PNG, blue) and `TextBlock` small `accent` "The AI suggests" (AI off: no image and `TextBlock` small subtle "Routed by keywords - the AI is off for this company.") and the route
  label with "→ {role}" → `Input.ChoiceSet` id `route`, `compact`, default = the proposal, choices = the company's
  routes → `TextBlock` small (answer-by date) → `ActionSet`: `Action.Submit` "Back" (data `{ step: "back" }`),
  `Action.Submit` "Raise it" (positive, data `{ step: 2 }`).
- No proposal (nothing matched): the line "No route fits. Pick one." with the choice set required.

| Element | EN | DE |
|---|---|---|
| Dialog title | Raise a case | Fall einreichen |
| Message action title | Raise as a case in NextUp | Als Fall in NextUp einreichen |
| Kind | What is it? · A problem · An idea | Was ist es? · Ein Problem · Eine Idee |
| Title | In a few words | In wenigen Worten |
| Body | What happened · What could be better | Was ist passiert · Was könnte besser sein |
| Visibility | Who may see it · Everyone at {company} · Only me and the desk it lands on | Wer es sehen darf · Alle bei {company} · Nur ich und der Tisch, auf dem er landet |
| Next | Next | Weiter |
| Step 2 title | Where it goes | Wohin er geht |
| Proposal | The AI suggests · Routed by keywords - the AI is off for this company. · No route fits. Pick one. | Die KI schlägt vor · Nach Stichwörtern zugeordnet - die KI ist für diese Firma aus. · Keine Zuständigkeit passt. Wähl eine. |
| Change | Change it | Ändern |
| Answer by | Answer by {date} ({n} working days) | Antwort bis {date} ({n} Arbeitstage) |
| Buttons | Back · Raise it | Zurück · Einreichen |
| Errors | Write a few words. · Not signed in to NextUp at {company}. Open NextUp once to connect Teams. | Schreib ein paar Worte. · Nicht bei NextUp von {company} angemeldet. Öffne NextUp einmal, um Teams zu verbinden. |

### Done when

- [ ] Both steps at desktop dialog size and on phone; AI-off and no-match variants of step 2; the error states; the
      entry points in the compose box and the message menu.

---

## Teams: confirmation card

- **Sent:** by the bot into the person's 1:1 chat right after a raise from Teams.

```
┌──────────────────────────────────────────────────────────────┐
│ ✦ Raised                                                     │
│                                                              │
│ Kühlmittel-Leck an Linie 3                                   │
│ It is on the desk of Qualitätsleitung Werk Süd. You get the  │
│ answer here and by mail.                                     │
│                                                              │
│ Answer by  Mon 9 Nov                                         │
│ Seen by    Everyone at Acme Automotive                       │
│                                                              │
│ [ Open in NextUp ]                                           │
└──────────────────────────────────────────────────────────────┘
```

**Card structure in words:** header `ColumnSet` → `TextBlock` large bolder (title) → `TextBlock` wrap (where it is)
→ `FactSet` (Answer by, Seen by) → `ActionSet` with `Action.OpenUrl` "Open in NextUp" (positive).

| Element | EN | DE |
|---|---|---|
| Kind line | Raised | Eingereicht |
| Sentence | It is on the desk of {role}. You get the answer here and by mail. | Er liegt auf dem Tisch von {role}. Die Antwort bekommst du hier und per Mail. |
| Facts | Answer by · Seen by | Antwort bis · Sichtbar für |
| Seen-by values | Everyone at {company} · Only you and the desk | Alle bei {company} · Nur du und der Tisch |
| Action | Open in NextUp | In NextUp öffnen |
| Sandbox line | Sandbox: the case is saved, but nobody is told yet. | Sandbox: Der Fall ist gespeichert, aber noch wird niemand benachrichtigt. |

### Done when

- [ ] The card at 450 and 320 px, light and dark; the sandbox variant.

---

## Open questions added by this file

| # | Question | Default here |
|---|---|---|
| N1 | NTF hands the failed-messages view and the subscription editor to ADM, but ADM's Bauplan has no task for them. Who builds `/settings/notifications`? | A follow-up task after NTF-Z1 (ADM-H1 or NTF-E1); Webhooks (spec 08) stays with API. |
| N2 | Retry of a failed message: NTF has no function for it. Add one? | Yes, `retryOutbox(id)` that resets `attempt` and `nextAt`; admin only, audited. |
| N3 | Teams cards: `Action.Submit` with message updates, or `Action.Execute` (universal actions) with refresh? | TMS decides; the result states drawn here apply to both. |
| N4 | Reminders and the digest: an opt-out line at the bottom of the mail (not in NTF-A1's texts)? | Yes, one line linking to the profile. |
