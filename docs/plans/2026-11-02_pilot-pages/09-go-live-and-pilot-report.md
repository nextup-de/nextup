# 09 · Go-live and pilot report

> **Plan · 2026-11-02 · open: page specs for Sam. Part of [the pilot pages plan](../2026-11-02_pilot-pages.md); read its
> ground rules and shared building blocks first.**
> Two pages and one email: Go-live (the stage, the checklist and the switch-stage dialog), the Pilot report, and the
> weekly report email. They are the last group to design: PIL is the last phase of PILOT, and the report needs MET's
> numbers.

Context for this file:

- **No Bauplan yet for PIL and MET.** Both pages follow the PILOT briefs (plans repo
  `projects/nextup/hauptplaene/PILOT.md`, `### PIL` and `### MET`) and may change when their Bauplan is written.
  PIL: "stage switch sandbox → pilot with a checklist test; weekly pilot report from `pilotReport`"; the bootstrap
  "reports every missing setting instead of failing silently". MET: time to first answer and share answered on time
  per unit and role, with a baseline, minimum group size 5, hands PIL `pilotReport(companyId, from, to)`.
  Everything else here is marked *(proposal, not in any plan)*.
- **Stages** (`apps/app/src/features/admin/stages.ts`, `docs/SECURITY.md`, `docs/INTEGRATIONS.md` "Stages"): `demo`,
  `sandbox`, `pilot`, `live`. `policyFor(stage)` gives the demo policy to `demo` only; every other stage gets the
  real-people policy (no demo login, no switching person, no rewriting history, no shared demo codes).
  `canMoveStage`: forward always, back to `demo` never from a real stage, between real stages both ways. Today every stage
  move bumps `Company.sessionEpoch`, which signs everyone of the company out (`server/actions/admin.ts`). **Decided
  for PIL (PILOT, 2026-11-02):** only leaving `demo` or moving back to a lower stage does that; sandbox → pilot →
  live keep everyone signed in. `STAGE_MEANING` reads the company's `promise_days`.
  `STAGE_MEANING` holds today's one-line meanings.
- **What a stage changes in sending** (Bauplan NTF/D8): `sandbox` writes every message as `skipped` (reason
  "sandbox") and sends nothing; raise and discussion mails go out from `pilot` on; reminders and the digest only
  when `CompanyConfig.notifications` is on; webhooks only when `CompanyConfig.n8n` is on.
- **Today:** the stage is moved only in `/admin` (`CompanyList.tsx`: one button "sandbox → pilot", no checks). No
  report exists; the dashboard runs on `dashboardPreview` (MET replaces it).
- Text namespaces *(proposal)*: `settingsGoLive` (both pages); the email's subject and text in `mail` (NTF/D3).

---

## Go-live

- **Route:** `/[company]/settings/go-live` (new)
- **Who:** company admins. Switching to `live` is NextUp's *(Q-09-1)*.
- **Phase:** PIL (no Bauplan yet)
- **Data:** `Company.stage`, `canMoveStage`, `STAGE_MEANING`; the checklist results *(proposal: a pure
  `goLiveChecks(company, target)` in `features/pilot/`, each check reading the tables named below)*; the stage
  history *(proposal: stage moves as audit events, GDP; INTEGRATIONS says a promotion is "logged as an event")*.
- **Today:** nothing in Settings. The Company page (spec 01) shows the stage with a link here; the sandbox banner
  says "Switch to pilot in Go-live."

**Purpose:** show where the company stands, check that it is ready for real people, and switch the stage.

### Layout (desktop)

```
Go-live                                                   [Switch to pilot]
Acme Automotive is in Sandbox since 14 Oct 2026.

┌ Stage ───────────────────────────────────────────────────────────────────┐
│   (●)━━━━━━━━━━━━━━━━━━━━━( )━━━━━━━━━━━━━━━━━━━━━( )                   │
│   Sandbox                  Pilot                   Live                  │
│   since 14 Oct             next                    after the pilot       │
│                                                                          │
│ ┌ InfoPanel ───────────────────────────────────────────────────────────┐ │
│ │              Sandbox            Pilot               Live             │ │
│ │ People       real               real                real             │ │
│ │ Messages     none leave         case mails go out   everything       │ │
│ │ Reminders    none               if switched on      if switched on   │ │
│ │ Report       not counted        counted weekly      counted weekly   │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

┌ Ready for pilot? ─────────────────── Checked today 14:20  [Check again] ─┐
│ Needed                                                    7 of 9 done    │
│ ✓  Units and roles        12 units, 41 roles, every role has a seat      │
│ ▲  Routes                 2 routes have nobody in the owner role:        │
│                           Goods in, Safety                  Routing →    │
│ ✓  Calendar               Bavaria, Mon-Fri                               │
│ ✓  People can sign in     1,470 of 1,470 active people                   │
│ ▲  Managers' second factor  3 of 4 managers who use a code    Members →  │
│ ✓  Mail can leave         Test mail accepted 14:20                       │
│ ✓  AI                     Off (routing by keywords)                      │
│ ✓  Backups                Last off-server backup today 03:10             │
│ ✓  Support access         No access open                                 │
│                                                                          │
│ Recommended                                                              │
│ ✓  Reminders and digest   On                                             │
│ –  Directory sync         Not connected               Connectors →       │
│ ✓  Report recipients      2 people                    Pilot report →     │
└──────────────────────────────────────────────────────────────────────────┘

┌ History ─────────────────────────────────────────────────────────────────┐
│ 14 Oct 2026   Company created in Sandbox             NextUp              │
│ (later stage moves: date · from → to · by)                               │
└──────────────────────────────────────────────────────────────────────────┘
```

- The stage track: three circles on a line; the current stage is a filled blue circle with its name in ink 600; past
  stages a small blue check; future stages grey. Demo is never on the track.
- Checklist rows (40 px): a status mark, the check's name (`--nh-fs-md` 600, 200 px column), one result line that
  names the gap with numbers or names of units and roles, never of people (HD5), and a link to the page that fixes it.
- Status marks: ✓ blue check (done) · ▲ amber triangle (needs you, blocks) · ✕ red circle (could not check, blocks) ·
  – grey dash (not set up, a recommendation only).
- *Switch to pilot* is the page's one black action. It is disabled while any "Needed" check is not done; the reason
  sits under it on hover and on phones as a line: "2 checks need you first."
- In pilot the header action becomes *Switch back to sandbox* (grey) and the checklist title "Still ready?"; live is
  shown as the next step with the line "NextUp switches to live after the pilot."

Checks *(proposal; the PIL Bauplan fixes the list)*:

| Check | Done when | Reads | Link |
|---|---|---|---|
| Units and roles | at least one unit; every role has at least one seat | `OrgUnit`, `OrgRole`, `OrgRoleHolder` | Org |
| Routes | at least one route; every route's owner role has someone in a seat | routing table, `OrgRoleHolder.userId` | Routing |
| Calendar | the company saved its calendar (a `CompanyCalendar` row exists) | CLK | Calendar |
| People can sign in | every active member has a login code or Microsoft | `User.loginCodeAt`, `entraOid`, Microsoft on | Members |
| Managers' second factor | every manager who signs in by code has `totpEnabledAt` | ADM-E1 fields | Members |
| Mail can leave | a test mail through the server's relay is accepted | `SMTP_URL`, `sendMail` | Notifications |
| AI | provider off, or on with a data-processing agreement date | AIP settings, `CompanyConfig.dpaSignedAt` | Connectors |
| Backups | the last off-server backup is less than 26 hours old | OPS backup status | – (NextUp) |
| Support access | no grant open | SEC | Support access |
| Reminders and digest *(recommended)* | `CompanyConfig.notifications` on | NTF | Notifications |
| Directory sync *(recommended)* | the last run under 24 h ago and without error | DIR `loadDirectoryStatus` | Connectors |
| Report recipients *(recommended)* | at least one recipient of the weekly email | this file, Pilot report | Pilot report |

*Later (PIL):* a "Ready for live?" list (for example: the pilot ran at least 4 weeks; the signed agreements; the
external pentest), shown when the company is in pilot. Draw one frame with two example rows only.

### Switch-stage dialog (`ConfirmDialog`)

```
Switch Acme Automotive to pilot?
────────────────────────────────────────────────────
From now on:
• Mails about a case go to the people it concerns.
• Reminders and the daily digest go out (they are on).
• The pilot report counts from week 46 (from 9 Nov).
You can switch back to sandbox at any time.
                           [Cancel]  [Switch to pilot]
```

Back to sandbox:

```
Switch Acme Automotive back to sandbox?
────────────────────────────────────────────────────
• Messages stop at once; waiting ones are skipped.
• The pilot report pauses after week 47.
• Everyone is signed out once and signs in again.
                     [Cancel]  [Switch to sandbox]  (red text)
```

The reminder bullet follows `CompanyConfig.notifications`: "Reminders and the daily digest stay off. Switch them on
in Notifications." when it is off.

### Phone

The stage track becomes a vertical list of three rows; the meaning panel turns into one block per stage under the
track (only the current and the next stage shown, a "Show all" link for the third); checklist rows put the result
line under the name and the link on its own line. The switch button sits full width under the lead.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | stage and the date of the last move | {company} is in {stage} since {date}. | {company} ist seit {date} in {stage}. |
| Stage names | track | | Sandbox · Pilot · Live · since {date} · next · after the pilot | Sandbox · Pilot · Live · seit {date} · als Nächstes · nach dem Pilot |
| Meaning rows | `InfoPanel` | from `policyFor` and NTF/D8 | People · Messages · Reminders · Report · real · none leave · case mails go out · everything · none · if switched on · not counted · counted weekly | Personen · Nachrichten · Erinnerungen · Bericht · echt · es geht nichts raus · Fallmails gehen raus · alles · keine · wenn eingeschaltet · wird nicht gezählt · wird wöchentlich gezählt |
| Checklist head | title + meta + button | | Ready for pilot? · Still ready? · Checked {time} · Check again · Needed · Recommended · {n} of {m} done | Bereit für den Pilot? · Noch bereit? · Geprüft um {time} · Erneut prüfen · Nötig · Empfohlen · {n} von {m} erledigt |
| Check names | text | | Units and roles · Routes · Calendar · People can sign in · Managers' second factor · Mail can leave · AI · Backups · Support access · Reminders and digest · Directory sync · Report recipients | Einheiten und Rollen · Routen · Kalender · Alle können sich anmelden · Zweiter Faktor der Führungskräfte · Mails kommen raus · KI · Datensicherung · Support-Zugang · Erinnerungen und Zusammenfassung · Verzeichnis-Synchronisierung · Empfänger des Berichts |
| Example results | line | numbers and names of units and roles only | {n} routes have nobody in the owner role: {routes} · {n} of {m} managers who use a code · Test mail accepted {time} · The mail relay refused the test: {error} · Off (routing by keywords) · Last off-server backup {time} | {n} Routen haben niemanden in der zuständigen Rolle: {routes} · {n} von {m} Führungskräften mit Code · Testmail um {time} angenommen · Der Mailserver hat die Testmail abgelehnt: {error} · Aus (Zuordnung nach Stichwörtern) · Letzte Sicherung außerhalb des Servers {time} |
| Blocked hint | under the button | | {n} checks need you first. | Zuerst brauchen {n} Prüfungen dich. |
| Switch to pilot | black pill | all "Needed" done | Switch to pilot | Auf Pilot umstellen |
| Switch back | grey pill | in pilot | Switch back to sandbox | Zurück auf Sandbox |
| Live line | text | in pilot | NextUp switches to live after the pilot. | NextUp stellt nach dem Pilot auf Live um. |
| Dialog (to pilot) | `ConfirmDialog` | week from `pilotReport`'s calendar | Switch {company} to pilot? · From now on: · Mails about a case go to the people it concerns. · Reminders and the daily digest go out (they are on). · Reminders and the daily digest stay off. Switch them on in Notifications. · The pilot report counts from week {week} (from {date}). · You can switch back to sandbox at any time. | {company} auf Pilot umstellen? · Ab jetzt: · Mails zu einem Fall gehen an die Personen, die er betrifft. · Erinnerungen und die tägliche Zusammenfassung gehen raus (sie sind an). · Erinnerungen und die tägliche Zusammenfassung bleiben aus. Schalte sie unter Benachrichtigungen ein. · Der Pilotbericht zählt ab KW {week} (ab {date}). · Du kannst jederzeit zurück auf Sandbox. |
| Dialog (to sandbox) | `ConfirmDialog` | | Switch {company} back to sandbox? · Messages stop at once; waiting ones are skipped. · The pilot report pauses after week {week}. · Everyone is signed out once and signs in again. | {company} zurück auf Sandbox stellen? · Nachrichten stoppen sofort; wartende werden übersprungen. · Der Pilotbericht pausiert nach KW {week}. · Alle werden einmal abgemeldet und melden sich neu an. |
| History | list | newest first | History · {from} → {to} · by {name} | Verlauf · {from} → {to} · von {name} |

### Actions

- *Check again*: runs every check; the rows show a spinner in place of the mark while running; meta "Checked
  {time}". The page also checks on load.
- *Switch to pilot*: the server runs the checks again and refuses if one "Needed" check fails ("Routes changed since
  the last check. Check again." / "Die Routen haben sich seit der letzten Prüfung geändert. Erneut prüfen."). On
  success the admin stays signed in and gets a toast on Go-live: "{company} is in pilot." / "{company} ist im
  Pilot."
- *Switch back to sandbox*: no checks; a move back to a lower stage signs everyone out once (the dialog says so), so
  the admin lands on the login afterwards.

### States

- Loading: the track and skeleton rows.
- Demo company: no track, no checklist; one `InfoPanel`: "Demo company: made-up people and cases. It never goes to
  pilot. NextUp creates a separate company for real people." / "Demo-Firma: erfundene Personen und Fälle. Sie geht
  nie in den Pilot. NextUp legt für echte Personen eine eigene Firma an."
- Live: the track with Live current; the checklist titled "Still ready?"; no switch button for company admins
  *(Q-09-1)*.
- A check that cannot run (the relay does not answer): ✕ with the error, and it blocks.

### Done when

- [ ] Desktop and phone in English: sandbox with two blocking checks, sandbox all green, pilot ("Still ready?", switch
      back), live, demo; both dialogs (reminders on and off variants); the refused switch; the *later* live list in its
      own frame.

---

## Pilot report

- **Route:** `/[company]/settings/pilot-report` (new)
- **Who:** company admins; the weekly email also goes to the recipients picked here
- **Phase:** PIL (page, downloads, email) on MET's `pilotReport(companyId, from, to)` (no Bauplan for either)
- **Data:** `pilotReport` per week *(proposal for its shape: cases raised; median time to first answer in working
  days; share answered within `promise_days`; share of people who raised, answered or decided at least once; the same
  per unit, with units of fewer than 5 people withheld; the baseline's numbers)*; the company's units in tree order;
  `CompanyRule.promise_days`; the stage history (week 1 = the first week in pilot). Recipients and the email switch
  *(proposal: a `NotifyPreference` template `pilot.report` per recipient, NTF's table)*.
- **Today:** nothing. The login page's side panel and the dashboard show fixed or preview numbers.

**Purpose:** one page, one PDF and one email a week that tell the company and NextUp whether the pilot works, in
numbers against the time before.

### Layout (desktop)

```
Pilot report                                      [Download CSV] [Download PDF]
Week 46 · 9-15 Nov 2026 · pilot week 2 of 8           ( ‹ )  Week 46  ( › )

┌ Cases raised ────┐ ┌ First answer ────┐ ┌ Answered on time ┐ ┌ Using NextUp ───┐
│ 42               │ │ 1.6 working days │ │ 84 %             │ │ 61 %            │
│ baseline 18 a    │ │ median           │ │ within 5 working │ │ 904 of 1,482    │
│ week             │ │ baseline 6.5     │ │ days             │ │ people          │
│ ▁▃▅▆             │ │ ▇▅▃▂             │ │ baseline 41 %    │ │ ▂▄▅▆            │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └─────────────────┘

┌ Week by week ────────────────────────────────────────────────────────────┐
│ Week               Cases raised  First answer  On time   Using NextUp    │
│ Baseline 26 Oct-8 Nov    18          6.5         41 %        –           │
│ 45 · 2-8 Nov             35          2.1         77 %       54 %         │
│ 46 · 9-15 Nov            42          1.6         84 %       61 %         │
└──────────────────────────────────────────────────────────────────────────┘

┌ By unit ─────────────────────────────────────────────────────────────────┐
│ Units of fewer than 5 people are hidden to protect individuals.          │
│ Unit                         People   Using NextUp   Cases raised        │
│ Werk Süd                       640       58 %            21              │
│   Assembly                     410       55 %            12              │
│   Quality                       86       71 %             6              │
│   Plant safety                   3    Too few to show                    │
│ Werk Nord                      790       63 %            19              │
│ Board                            4    Too few to show                    │
└──────────────────────────────────────────────────────────────────────────┘

┌ Baseline ────────────────────────────────────────────────────────────────┐
│ Compared with   ( The two weeks before the pilot | Numbers you enter )   │
│ 26 Oct - 8 Nov 2026 · sandbox weeks with real people                     │
│                                                            [ Save ]      │
└──────────────────────────────────────────────────────────────────────────┘

┌ Weekly email ──────────────────────────────────────────── [on ] ─────────┐
│ Every Monday at 07:00 to                                                 │
│ (HS) H. Sander  ×   (LB) L. Brandt  ×   [ Add a person…          ▾]      │
│ [Send me this week's email]                                [ Save ]      │
└──────────────────────────────────────────────────────────────────────────┘
```

- Tiles: four equal white cards in one row, `--nh-pad-card-sm`. Label `--nh-fs-sm` 600 `--nh-mute`; value
  `--nh-fs-2xl` 600 with tabular figures; the baseline line `--nh-fs-sm` `--nh-ink-2`; a sparkline of the pilot weeks
  so far (40 px tall, ink line, the baseline as a dashed grey line). No green or red for better or worse: the words
  carry it.
- The delta is written, not coloured: under the value "4.9 days faster than the baseline" / "24 more than the
  baseline" *(only when a baseline exists)*.
- Week by week: a `DataTable`, the baseline row first on a grey fill, then the pilot weeks oldest first. A running
  week is marked "so far" in `--nh-mute`.
- By unit: the units in their tree order (indent 16 px a level), **never sorted by a number** and no sort control
  (HD5: no rankings). A unit with fewer than 5 people shows the inline `TooFewToShow` ("Too few to show") across its
  number cells, with the block's full sentence once in the card's hint line.
- Baseline: segmented choice. "Numbers you enter" opens three fields: cases raised a week, days to a first answer,
  share answered within the promise, each with a "Where from" text (for example "works council survey, Sept 2026").
- Weekly email: the people picker of the company's active members (by id, HD10); company admins are added by
  default when the company enters pilot.

### Phone

The header actions move under the lead as two grey buttons side by side; the week switch below them. Tiles stack
2 × 2. Week by week shows Week, Cases raised and On time; the rest in a row tap. By unit becomes a list: unit name,
"58 % using · 21 cases", or "Too few to show". Baseline and Weekly email stack.

### Content

| Element | Control | Rules | EN | DE |
|---|---|---|---|---|
| Lead | text | ISO weeks, Mon-Sun | Week {week} · {from}-{to} · pilot week {n} of {total} | KW {week} · {from}-{to} · Pilotwoche {n} von {total} |
| Week switch | prev / next | from pilot week 1 to the current week | Previous week · Next week | Vorherige Woche · Nächste Woche |
| Tile: cases | number | count of `case.raised` in the week | Cases raised · baseline {n} a week · {n} more than the baseline · {n} fewer than the baseline | Eingebrachte Fälle · Ausgangswert {n} pro Woche · {n} mehr als der Ausgangswert · {n} weniger als der Ausgangswert |
| Tile: first answer | number | median, working days, 1 decimal | First answer · {n} working days · median · baseline {n} · {n} days faster than the baseline · {n} days slower than the baseline | Erste Antwort · {n} Arbeitstage · Median · Ausgangswert {n} · {n} Tage schneller als der Ausgangswert · {n} Tage langsamer als der Ausgangswert |
| Tile: on time | percent | first answer within `promise_days` | Answered on time · within {days} working days · baseline {n} % | Rechtzeitig beantwortet · innerhalb von {days} Arbeitstagen · Ausgangswert {n} % |
| Tile: using | percent + count | people who raised, answered or decided at least once in the week / active members | Using NextUp · {n} of {m} people | Nutzen NextUp · {n} von {m} Personen |
| Week table | `DataTable` | | Week by week · Week · Cases raised · First answer · On time · Using NextUp · Baseline · so far | Woche für Woche · Woche · Eingebrachte Fälle · Erste Antwort · Rechtzeitig · Nutzen NextUp · Ausgangswert · bisher |
| Unit table | tree list | < 5 people → `TooFewToShow` | By unit · Units of fewer than 5 people are hidden to protect individuals. · Unit · People · Using NextUp · Cases raised | Nach Einheit · Einheiten mit weniger als 5 Personen sind ausgeblendet, um Einzelne zu schützen. · Einheit · Personen · Nutzen NextUp · Eingebrachte Fälle |
| Baseline | segmented + fields | MET: a period; entered numbers *(proposal)* | Baseline · Compared with · The two weeks before the pilot · Numbers you enter · Cases raised a week · Days to a first answer · Answered within the promise · Where from | Ausgangswert · Verglichen mit · Den zwei Wochen vor dem Pilot · Selbst eingetragenen Zahlen · Eingebrachte Fälle pro Woche · Tage bis zur ersten Antwort · Innerhalb des Versprechens beantwortet · Quelle |
| Weekly email | switch + picker | active members by id | Weekly email · Every Monday at 07:00 to · Add a person… · Send me this week's email | Wöchentliche E-Mail · Jeden Montag um 07:00 an · Person hinzufügen… · Mir die E-Mail dieser Woche senden |
| Downloads | buttons | | Download CSV · Download PDF | CSV herunterladen · PDF herunterladen |

### Actions

- *Download PDF*: opens the print view `/[company]/settings/pilot-report/print?week={week}` *(proposal: the browser
  saves it as PDF, so no PDF package is needed, HD12)*. A4 portrait: NextUp mark and the company's mark, the lead, the
  four tiles, Week by week, By unit, the baseline source, a footer "Units of fewer than 5 people are hidden. Made by
  NextUp on {date}." / "Einheiten mit weniger als 5 Personen sind ausgeblendet. Erstellt von NextUp am {date}."
- *Download CSV*: `{slug}-pilot-report-{from}-{to}.csv`, UTF-8, one row per week and one per unit and week; a hidden
  unit's numbers are empty and its column `hidden` says "fewer than 5 people".
- *Save* (Baseline, Weekly email): toast "Saved" / "Gespeichert".
- *Send me this week's email*: toast "Sent to {email}." / "An {email} gesendet." In sandbox: "Sandbox: nothing is
  sent. Switch to pilot in Go-live." / "Sandbox: Es wird nichts verschickt. Wechsel auf Pilot unter Start."

### States

- Before the pilot (sandbox): `EmptyState` "The report starts when {company} switches to pilot." / "Der Bericht
  beginnt, wenn {company} auf Pilot umstellt." + *Go to Go-live →*. The Baseline and Weekly email cards are shown
  under it, so they can be set up first.
- Demo company: the page with the demo's made-up numbers and a grey line "Demo company: made-up numbers." /
  "Demo-Firma: erfundene Zahlen."
- No baseline yet: tiles show "No baseline yet" / "Noch kein Ausgangswert" in place of the baseline line; the
  Baseline card gets an amber hint "Pick a baseline so the report can compare." / "Wähle einen Ausgangswert, damit
  der Bericht vergleichen kann."
- A week without cases: 0, "–" for first answer and on time, with the line "No cases this week." / "Keine Fälle in
  dieser Woche."
- The running week: "so far" / "bisher" next to the week and the time of the numbers: "Numbers until today 14:00." /
  "Zahlen bis heute 14:00."
- Back in sandbox after a pilot: the pilot weeks stay; a grey line "Paused since {date}: {company} is in sandbox." /
  "Pausiert seit {date}: {company} ist in der Sandbox."
- Loading: skeleton tiles and rows.

### The weekly report email

Sent Monday 07:00 Europe/Berlin for the week before; when Monday is not a working day (CLK `isWorkday`), on the next
working day *(proposal)*. Through NTF's outbox, template `pilot.report`, key `pilot:<week>:<userId>` *(proposal)*; in
sandbox it is written as skipped like every message (NTF/D8). Same layout as today's notice mails (the invitation
email in spec 01 follows it too).

```
Subject: NextUp pilot report, week 46: Acme Automotive

Week 46 · 9-15 Nov 2026 · pilot week 2 of 8

                     This week     Baseline
Cases raised              42       18 a week
First answer (median)    1.6 d     6.5 d
Answered on time          84 %     41 %
Using NextUp              61 %     –

By unit: 12 units shown, 2 hidden (fewer than 5 people).

[ Open the report ]

You get this as a recipient of Acme Automotive's pilot report.
Stop these emails →
```

| Element | Rules | EN | DE |
|---|---|---|---|
| Subject | | NextUp pilot report, week {week}: {company} | NextUp-Pilotbericht, KW {week}: {company} |
| Lead line | | Week {week} · {from}-{to} · pilot week {n} of {total} | KW {week} · {from}-{to} · Pilotwoche {n} von {total} |
| Table | the four numbers and the baseline; no per-unit numbers in the mail | This week · Baseline · Cases raised · First answer (median) · Answered on time · Using NextUp | Diese Woche · Ausgangswert · Eingebrachte Fälle · Erste Antwort (Median) · Rechtzeitig beantwortet · Nutzen NextUp |
| Units line | counts only | By unit: {shown} units shown, {hidden} hidden (fewer than 5 people). | Nach Einheit: {shown} Einheiten gezeigt, {hidden} ausgeblendet (weniger als 5 Personen). |
| Button | link to the page, nothing else in the URL | Open the report | Bericht öffnen |
| Foot | link to the page's Weekly email card | You get this as a recipient of {company}'s pilot report. · Stop these emails → | Du bekommst diese E-Mail, weil du den Pilotbericht von {company} erhältst. · Diese E-Mails abbestellen → |

### Done when

- [ ] Desktop and phone in English: a pilot week with a baseline, the unit table with two hidden units, the running
      week, no baseline yet, a week without cases, before the pilot, paused, demo; the Baseline card with entered
      numbers; the print view (A4); the email in German and English.

---

## Open questions added by this file

| # | Question | Default |
|---|---|---|
| Q-09-1 | Who switches the stage? `live` means a paying customer. | Company admins switch sandbox ⇄ pilot on Go-live; pilot → live stays NextUp's in `/admin`, after the contract. |
| Q-09-2 | Every stage move signs the whole company out (`sessionEpoch`). Keep that for moves between real stages? | Decided (PILOT, PIL): only leaving `demo` or moving back signs everyone out; sandbox → pilot → live keep sessions. |
| Q-09-3 | What is the baseline: a period of NextUp data (MET brief) or numbers from before NextUp (the demo seed's "baseline survey")? | The two weeks before the pilot by default; entered numbers with a source as the alternative. |
| Q-09-4 | Is the PDF a print view saved by the browser, or a server-made file (needs a package, HD12)? | Print view. |
